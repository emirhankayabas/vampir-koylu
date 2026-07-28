import { NextRequest, NextResponse } from "next/server";
import {
  getGame,
  createGame,
  deleteGame,
  saveGame,
  makeFreshGame,
  assignRolesFor,
  assignLovers,
  applyHeartbreak,
  checkWinner,
  finalizeWinner,
  beginNight,
  resolveNight,
  submitNightAction,
  skipNightStep,
  resolveVote,
  hangPlayer,
  hunterShoot,
  killPlayer,
  leaveGame,
  uniqueName,
  MAX_NAME_LEN,
  roleOf,
  log,
  recordRound,
  VersionConflictError,
} from "@/lib/game";
import { SESSION_COOKIE, userFromToken } from "@/lib/auth";
import { recordMatchStart, recordMatchEnd } from "@/lib/matches";
import type { Game, RoleConfig, NightRole, RoundDeath, UserDoc } from "@/lib/types";

export const dynamic = "force-dynamic";

// Yazma çakışmasında (aynı anda iki hamle) aksiyon taze durumla kaç kez tekrarlanır.
// Kalabalık bir lobide herkes aynı anda katılabilir/oy verebilir; yazmalar
// sıraya girdiği için en şanssız istemcinin oyuncu sayısı kadar denemesi
// gerekebilir. 10, pratikteki en büyük masalar için fazlasıyla yeterli.
const MAX_ATTEMPTS = 10;

/**
 * Yeniden denemeden önceki bekleme. Artan + rastgele (jitter): aynı anda
 * çakışan istemciler böylece dağılır. Sabit/beklemesiz tekrar denemede hepsi
 * yine aynı anda vurur ve bir kısmı denemelerini boşa harcar.
 */
function backoffMs(attempt: number): number {
  return 20 * attempt + Math.floor(Math.random() * 25);
}

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}
function ok(extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...extra });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Geçersiz istek gövdesi.");
  }
  const action = String(body.action ?? "");

  // Oda oluşturma tek başına — henüz kod yok.
  if (action === "createRoom") {
    try {
      const created = await createGame();
      return ok({ code: created._id });
    } catch {
      return bad("Oda oluşturulamadı, tekrar deneyin.", 500);
    }
  }

  // Odaya katılırken oturumdaki hesabı çözüyoruz: kayıtlı oyuncunun maç geçmişi
  // ancak böyle birikir. Hesap yoksa (ziyaretçi) sessizce null kalır ve oyun
  // eskisi gibi çalışır.
  let account: UserDoc | null = null;
  if (action === "join") {
    try {
      account = await userFromToken(request.cookies.get(SESSION_COOKIE)?.value);
    } catch {
      account = null; // hesap katmanı çökse bile ziyaretçi olarak oynanabilmeli
    }
  }

  // Diğer tüm aksiyonlar bir oda kodu gerektirir.
  //
  // İki oyuncu aynı anda hamle yaparsa (iki vampir hedef seçer, herkes aynı
  // saniyede oy verir…) ikinci yazma sürüm çakışmasına düşer. Bu durumda
  // aksiyonu TAZE durumla baştan uyguluyoruz — hiçbir hamle sessizce kaybolmaz.
  const code = String(body.code ?? "");
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let game: Game | null;
    try {
      game = await getGame(code);
    } catch {
      return bad("Veritabanına ulaşılamadı.", 503);
    }
    if (!game) return bad("Oda bulunamadı. Kodu kontrol edin.", 404);

    try {
      return await handleAction(game, action, body, account);
    } catch (err) {
      if (!(err instanceof VersionConflictError)) {
        return bad("İşlem tamamlanamadı, tekrar deneyin.", 500);
      }
      // Araya başka bir hamle girdi: biraz bekle, taze durumla baştan uygula.
      await new Promise((r) => setTimeout(r, backoffMs(attempt)));
    }
  }
  return bad("Oda şu an çok yoğun, tekrar deneyin.", 409);
}

/**
 * Aksiyonu uygular ve maç geçmişini günceller.
 *
 * Geçmiş yazımı motorun DIŞINDA, tek bir yerde duruyor: roller dağıtılıp oyun
 * `in_progress`e geçtiği anda kayıt açılır, sonuç belli olunca kapatılır.
 * Geçmiş yazılamazsa oyun etkilenmez — kayıt tutmak oynamayı engellememeli.
 */
async function handleAction(
  game: Game,
  action: string,
  body: Record<string, unknown>,
  account: UserDoc | null
): Promise<NextResponse> {
  const statusBefore = game.status;
  const winnerBefore = game.winner;
  const res = await applyAction(game, action, body, account);

  try {
    if (statusBefore !== "in_progress" && game.status === "in_progress" && game.startedAt) {
      await recordMatchStart(game);
    } else if (
      statusBefore === "in_progress" &&
      ((!winnerBefore && game.winner) || game.status === "ended")
    ) {
      await recordMatchEnd(game);
    }
  } catch {
    /* geçmiş kaydı yazılamadı — oyun akışı bundan etkilenmez */
  }
  return res;
}

async function applyAction(
  game: Game,
  action: string,
  body: Record<string, unknown>,
  account: UserDoc | null
): Promise<NextResponse> {
  switch (action) {
    // --- Katılımcı aksiyonları ---
    case "join": {
      if (game.status !== "lobby") return bad("Oyun şu an katılıma kapalı.");
      // Şifreli oda ise doğru şifre gerekir (şifresiz odalarda bu alan yok sayılır).
      if (game.password && String(body.password ?? "") !== game.password) {
        return bad("Oda şifresi hatalı.");
      }
      // Girişliyse odadaki ad HESABIN adıdır: istemciden gelen isim dikkate
      // alınmaz. Böylece geçmiş tutarlı kalır ve kimse başka bir hesabın adıyla
      // masaya oturamaz.
      const wanted = (account ? account.name : String(body.name ?? "")).trim();
      if (!wanted) return bad("İsim boş olamaz.");
      if (wanted.length > MAX_NAME_LEN) return bad("İsim çok uzun.");
      // Aynı hesap iki kez katılamaz (iki cihazdan girip iki rol almasın).
      if (account && game.players.some((p) => p.userId === account._id))
        return bad("Bu hesapla zaten odadasın.");
      // İsim doluysa katılımı reddetmek yerine sonek veriyoruz: "Emir (2)".
      const name = uniqueName(game, wanted);
      if (!name) return bad("Bu isimden odada çok fazla var, başka bir isim deneyin.");
      const id = crypto.randomUUID();
      game.players.push({
        id,
        name,
        userId: account?._id ?? null,
        role: null,
        alive: true,
        joinedAt: Date.now(),
      });
      log(game, `${name} katıldı.`);
      await saveGame(game);
      // `name`i geri veriyoruz: sonek eklendiyse istemci bunu kullanıcıya söyler.
      return ok({ playerId: id, name });
    }

    case "vote": {
      const playerId = String(body.playerId ?? "");
      const targetId = String(body.targetId ?? "");
      if (!game.vote.active) return bad("Oylama aktif değil.");
      const voter = game.players.find((p) => p.id === playerId);
      if (!voter || !voter.alive) return bad("Oy veremezsiniz.");
      const target = game.players.find((p) => p.id === targetId);
      if (!target || !target.alive) return bad("Geçersiz aday.");
      game.vote.votes[playerId] = targetId;
      // Telefon modunda herkes oy verince otomatik çöz
      const aliveCount = game.players.filter((p) => p.alive).length;
      if (game.mode === "phone" && Object.keys(game.vote.votes).length >= aliveCount) {
        resolveVote(game);
      }
      await saveGame(game);
      return ok();
    }

    // Oyuncu odadan ayrılır (ana sayfadaki "Odadan çık"). Yalnızca lobide
    // gerçekten listeden silinir; süren elde oyuncu yerinde kalır (bkz. leaveGame).
    case "leave": {
      const res = leaveGame(game, String(body.playerId ?? ""));
      if (!res.ok) return bad(res.error);
      await saveGame(game);
      return ok();
    }

    case "unvote": {
      const playerId = String(body.playerId ?? "");
      if (!game.vote.active) return bad("Oylama aktif değil.");
      delete game.vote.votes[playerId];
      await saveGame(game);
      return ok();
    }

    case "nightAction": {
      const playerId = String(body.playerId ?? "");
      const kind = String(body.kind ?? "") as NightRole;
      const targetId = String(body.targetId ?? "");
      if (!["vampir", "doktor", "medyum", "survivor"].includes(kind)) return bad("Geçersiz aksiyon türü.");
      const res = submitNightAction(game, playerId, kind, targetId);
      if (!res.ok) return bad(res.error);
      await saveGame(game);
      return ok();
    }

    case "playerHunterShoot": {
      // Avcı kendi telefonundan atış yapar
      const playerId = String(body.playerId ?? "");
      if (game.pendingHunterId !== playerId) return bad("Atış hakkınız yok.");
      const targetId = body.targetId ? String(body.targetId) : null;
      const res = hunterShoot(game, targetId);
      if (!res.ok) return bad(res.error);
      await saveGame(game);
      return ok();
    }

    // --- Moderatör: oda ayarları ---
    case "setRoomName": {
      game.name = String(body.name ?? "").trim().slice(0, 40);
      await saveGame(game);
      return ok();
    }

    // Katılım şifresini ayarlar/temizler. Boş gönderilirse şifre kaldırılır.
    case "setRoomPassword": {
      const pw = String(body.password ?? "").trim();
      game.password = pw ? pw.slice(0, 40) : null;
      log(game, pw ? "Oda şifresi ayarlandı." : "Oda şifresi kaldırıldı.");
      await saveGame(game);
      return ok();
    }

    // Âşıklar özelliğini aç/kapat (yalnızca lobide)
    case "setLovers": {
      if (game.status === "in_progress") return bad("Oyun sürerken değiştirilemez.");
      game.loversEnabled = !!body.enabled;
      await saveGame(game);
      return ok();
    }

    // --- Moderatör: lobi ---
    case "setMode": {
      const mode = body.mode === "phone" ? "phone" : "verbal";
      game.mode = mode;
      await saveGame(game);
      return ok();
    }

    // Rol dağıtımı rastgele mi yoksa moderatör elle mi atıyor
    case "setAssignMode": {
      if (game.status === "in_progress") return bad("Oyun sürerken değiştirilemez.");
      game.assignMode = body.assignMode === "manual" ? "manual" : "random";
      // Rastgeleye dönünce elle yapılan atamalar temizlenir
      if (game.assignMode === "random") game.players.forEach((p) => (p.role = null));
      await saveGame(game);
      return ok();
    }

    // Manuel modda moderatör bir oyuncuya rol atar (lobide)
    case "assignRole": {
      if (game.status === "in_progress") return bad("Oyun sürerken rol değiştirilemez.");
      const targetId = String(body.targetId ?? "");
      const roleKey = body.roleKey ? String(body.roleKey) : null;
      const p = game.players.find((x) => x.id === targetId);
      if (!p) return bad("Oyuncu bulunamadı.");
      if (roleKey && !game.roles.some((r) => r.key === roleKey && r.enabled))
        return bad("Geçersiz rol.");
      p.role = roleKey;
      await saveGame(game);
      return ok();
    }

    case "saveRoles": {
      if (game.status === "in_progress") return bad("Oyun sürerken roller değiştirilemez.");
      const roles = body.roles as RoleConfig[];
      if (!Array.isArray(roles) || roles.length === 0) return bad("Rol listesi geçersiz.");
      if (!roles.some((r) => r.fill && r.enabled)) return bad("Aktif bir dolgu rolü (Köylü) olmalı.");
      const keys = new Set<string>();
      for (const r of roles) {
        if (!r.key || keys.has(r.key)) return bad("Rol anahtarları benzersiz olmalı.");
        keys.add(r.key);
      }
      game.roles = roles.map((r) => ({
        key: r.key,
        name: String(r.name).trim() || r.key,
        team: r.team === "vampir" ? "vampir" : "koy",
        enabled: !!r.enabled,
        count: Math.max(0, Math.floor(Number(r.count) || 0)),
        fill: !!r.fill,
        builtin: !!r.builtin,
        special: r.special,
      }));
      await saveGame(game);
      return ok();
    }

    case "kick": {
      if (game.status === "in_progress") return bad("Oyun sürerken oyuncu çıkarılamaz.");
      const targetId = String(body.targetId ?? "");
      const before = game.players.length;
      game.players = game.players.filter((p) => p.id !== targetId);
      if (game.players.length < before) log(game, "Bir oyuncu çıkarıldı.");
      await saveGame(game);
      return ok();
    }

    // --- Moderatör: oyun akışı ---
    case "start":
    case "newRound": {
      // Çift tıklama / geç gelen istek süren bir eli baştan başlatmasın.
      if (game.status === "in_progress") return bad("Oyun zaten sürüyor.");
      const res = assignRolesFor(game);
      if (!res.ok) return bad(res.error);
      assignLovers(game); // Âşıklar açıksa rastgele 2 uygun oyuncuyu eşleştirir
      game.status = "in_progress";
      game.dayNumber = 1;
      // Başlangıç geri sayımının ortak çıpası — herkesin ekranında aynı anda biter.
      game.startedAt = Date.now();
      game.winner = null;
      game.pendingHunterId = null;
      game.hangedThisDay = false;
      game.announcement = null;
      game.vote = { active: false, votes: {} };
      game.mediumLog = [];
      game.doctorSelfUsed = [];
      game.survivorShieldsUsed = {};
      game.roundLog = [];
      log(game, action === "newRound" ? "Yeni el başladı." : "Oyun başladı. Roller dağıtıldı.");
      if (game.mode === "phone") {
        beginNight(game); // 1. gece otomatik başlar
      } else {
        game.phase = "night";
        game.night.active = false;
      }
      await saveGame(game);
      return ok();
    }

    case "nextNight": {
      if (game.status !== "in_progress") return bad("Oyun devam etmiyor.");
      if (game.pendingHunterId) return bad("Önce avcı atışı beklenmeli.");
      // Bir kişi asılmadan yeni geceye geçilemez (oyun bitmediyse).
      if (!game.winner && !game.hangedThisDay) {
        return bad("Yeni geceye geçmeden önce bir kişi asılmalı.");
      }
      game.dayNumber += 1;
      if (game.mode === "phone") {
        beginNight(game);
      } else {
        game.phase = "night";
        game.night.active = false;
        game.vote = { active: false, votes: {} };
        game.announcement = null;
        game.hangedThisDay = false;
      }
      log(game, `${game.dayNumber}. gece başladı.`);
      await saveGame(game);
      return ok();
    }

    case "nightSkip": {
      if (!game.night.active) return bad("Gece akışı çalışmıyor.");
      skipNightStep(game);
      await saveGame(game);
      return ok();
    }

    case "nightForceResolve": {
      if (!game.night.active) return bad("Gece akışı çalışmıyor.");
      resolveNight(game);
      await saveGame(game);
      return ok();
    }

    // Sözlü mod: moderatör gece ölümlerini elle seçer
    case "nightResolve": {
      if (game.status !== "in_progress") return bad("Oyun devam etmiyor.");
      const deaths = Array.isArray(body.deaths) ? (body.deaths as string[]) : [];
      const names: string[] = [];
      const dead: RoundDeath[] = [];
      for (const id of deaths) {
        const p = killPlayer(game, id);
        if (!p) continue;
        const r = roleOf(game, p.role);
        names.push(p.name);
        dead.push({ name: p.name, role: r?.name ?? "?", team: r?.team ?? "koy" });
        // Âşık öldüyse partneri de kahrından ölür.
        const hb = applyHeartbreak(game, p.id);
        if (hb) {
          const hbRole = roleOf(game, hb.role);
          names.push(`${hb.name} 💔`);
          dead.push({ name: hb.name, role: hbRole?.name ?? "?", team: hbRole?.team ?? "koy" });
        }
      }
      game.phase = "day";
      game.announcement = {
        kind: "morning",
        title: `${game.dayNumber}. Sabah`,
        lines: names.length ? [`${names.join(", ")} öldü.`] : ["Bu gece kimse ölmedi."],
        dead: null,
        at: Date.now(),
      };
      log(game, names.length ? `Gece ${names.join(", ")} öldü.` : "Gece kimse ölmedi.");
      recordRound(game, { day: game.dayNumber, kind: "night", at: Date.now(), deaths: dead });
      finalizeWinner(game);
      await saveGame(game);
      return ok();
    }

    case "voteStart": {
      if (game.status !== "in_progress") return bad("Oyun devam etmiyor.");
      if (game.pendingHunterId) return bad("Önce avcı atışı beklenmeli.");
      game.phase = "day";
      game.vote = { active: true, votes: {} };
      log(game, "Oylama başladı.");
      await saveGame(game);
      return ok();
    }

    case "voteEnd": {
      if (!game.vote.active) return bad("Oylama aktif değil.");
      resolveVote(game);
      await saveGame(game);
      return ok();
    }

    case "voteCancel": {
      game.vote = { active: false, votes: {} };
      await saveGame(game);
      return ok();
    }

    // Sözlü mod: moderatör onayıyla asma. Kural işleyişi (Soytarı zaferi, âşık
    // bağı, avcı hakkı, duyuru) oylamayla birebir aynı — motordaki hangPlayer.
    case "hang": {
      if (game.status !== "in_progress") return bad("Oyun devam etmiyor.");
      const targetId = String(body.targetId ?? "");
      const target = game.players.find((p) => p.id === targetId);
      if (!target) return bad("Oyuncu bulunamadı.");
      if (!target.alive) return bad("Bu oyuncu zaten ölü.");
      hangPlayer(game, targetId);
      await saveGame(game);
      return ok();
    }

    case "hunterShoot": {
      const targetId = body.targetId ? String(body.targetId) : null;
      const res = hunterShoot(game, targetId);
      if (!res.ok) return bad(res.error);
      await saveGame(game);
      return ok();
    }

    case "hunterSkip": {
      const res = hunterShoot(game, null);
      if (!res.ok) return bad(res.error);
      await saveGame(game);
      return ok();
    }

    case "toggleKill": {
      const targetId = String(body.targetId ?? "");
      const p = game.players.find((x) => x.id === targetId);
      if (!p) return bad("Oyuncu bulunamadı.");
      p.alive = !p.alive;
      log(game, `${p.name} ${p.alive ? "diriltildi" : "öldürüldü"}.`);
      finalizeWinner(game);
      await saveGame(game);
      return ok();
    }

    case "end": {
      game.status = "ended";
      game.vote = { active: false, votes: {} };
      game.night.active = false;
      game.pendingHunterId = null;
      if (!game.winner) game.winner = checkWinner(game);
      log(game, "Oyun bitti.");
      await saveGame(game);
      return ok();
    }

    case "backToLobby": {
      game.status = "lobby";
      game.startedAt = null; // bayat damga yeni elde geri sayımı tetiklemesin
      game.winner = null;
      game.pendingHunterId = null;
      game.hangedThisDay = false;
      game.vote = { active: false, votes: {} };
      game.night.active = false;
      game.announcement = null;
      game.mediumLog = [];
      game.doctorSelfUsed = [];
      game.survivorShieldsUsed = {};
      game.lovers = null;
      game.roundLog = [];
      game.players.forEach((p) => {
        p.role = null;
        p.alive = true;
      });
      log(game, "Lobiye dönüldü.");
      await saveGame(game);
      return ok();
    }

    // Oda silinir; kayıt gittiği için ayrıca log tutmanın anlamı yok.
    case "closeRoom": {
      await deleteGame(game._id);
      return ok();
    }

    case "reset": {
      const fresh = makeFreshGame(game._id);
      fresh.roles = game.roles;
      fresh.mode = game.mode;
      fresh.name = game.name;
      fresh.password = game.password;
      fresh.loversEnabled = game.loversEnabled;
      fresh.version = game.version;
      log(fresh, "Oyun sıfırlandı.");
      await saveGame(fresh);
      return ok();
    }

    default:
      return bad("Bilinmeyen aksiyon: " + action);
  }
}
