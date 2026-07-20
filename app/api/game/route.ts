import { NextRequest, NextResponse } from "next/server";
import {
  getGame,
  createGame,
  deleteGame,
  saveGame,
  makeFreshGame,
  assignRoles,
  checkWinner,
  beginNight,
  resolveNight,
  submitNightAction,
  skipNightStep,
  resolveVote,
  hunterShoot,
  roleOf,
  log,
} from "@/lib/game";
import type { Game, RoleConfig, NightRole } from "@/lib/types";

export const dynamic = "force-dynamic";

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}
function ok(extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...extra });
}

function killPlayer(game: Game, targetId: string): string | null {
  const p = game.players.find((x) => x.id === targetId);
  if (!p || !p.alive) return null;
  p.alive = false;
  return p.id;
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

  // Diğer tüm aksiyonlar bir oda kodu gerektirir.
  const game = await getGame(String(body.code ?? ""));
  if (!game) return bad("Oda bulunamadı. Kodu kontrol edin.", 404);

  switch (action) {
    // --- Katılımcı aksiyonları ---
    case "join": {
      if (game.status !== "lobby") return bad("Oyun şu an katılıma kapalı.");
      const name = String(body.name ?? "").trim();
      if (!name) return bad("İsim boş olamaz.");
      if (name.length > 24) return bad("İsim çok uzun.");
      if (game.players.some((p) => p.name.toLowerCase() === name.toLowerCase()))
        return bad("Bu isim zaten alınmış.");
      const id = crypto.randomUUID();
      game.players.push({ id, name, role: null, alive: true, joinedAt: Date.now() });
      log(game, `${name} katıldı.`);
      await saveGame(game);
      return ok({ playerId: id });
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
      if (!["vampir", "doktor", "medyum"].includes(kind)) return bad("Geçersiz aksiyon türü.");
      const res = submitNightAction(game, playerId, kind, targetId);
      if (!res.ok) return bad(res.error!);
      await saveGame(game);
      return ok();
    }

    case "playerHunterShoot": {
      // Avcı kendi telefonundan atış yapar
      const playerId = String(body.playerId ?? "");
      if (game.pendingHunterId !== playerId) return bad("Atış hakkınız yok.");
      const targetId = body.targetId ? String(body.targetId) : null;
      const res = hunterShoot(game, targetId);
      if (!res.ok) return bad(res.error!);
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
      const res = assignRoles(game);
      if (!res.ok) return bad(res.error!);
      game.status = "in_progress";
      game.dayNumber = 1;
      game.winner = null;
      game.pendingHunterId = null;
      game.announcement = null;
      game.vote = { active: false, votes: {} };
      game.mediumLog = [];
      game.doctorSelfUsed = [];
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
      game.dayNumber += 1;
      if (game.mode === "phone") {
        beginNight(game);
      } else {
        game.phase = "night";
        game.night.active = false;
        game.vote = { active: false, votes: {} };
        game.announcement = null;
      }
      log(game, `${game.dayNumber}. gece başladı.`);
      await saveGame(game);
      return ok();
    }

    case "nightSkip": {
      skipNightStep(game);
      await saveGame(game);
      return ok();
    }

    case "nightForceResolve": {
      if (game.night.active) resolveNight(game);
      await saveGame(game);
      return ok();
    }

    // Sözlü mod: moderatör gece ölümlerini elle seçer
    case "nightResolve": {
      const deaths = Array.isArray(body.deaths) ? (body.deaths as string[]) : [];
      const names: string[] = [];
      for (const id of deaths) {
        const killed = killPlayer(game, id);
        if (killed) names.push(game.players.find((p) => p.id === killed)!.name);
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
      game.winner = checkWinner(game);
      await saveGame(game);
      return ok();
    }

    case "voteStart": {
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

    // Sözlü mod: moderatör onayıyla asma
    case "hang": {
      const targetId = String(body.targetId ?? "");
      const target = game.players.find((p) => p.id === targetId);
      if (!target) return bad("Oyuncu bulunamadı.");
      killPlayer(game, targetId);
      game.vote = { active: false, votes: {} };
      const role = roleOf(game, target.role);
      const shown = role?.team === "vampir" ? "Vampir" : "Köylü";
      game.announcement = {
        kind: "hang",
        title: "İnfaz",
        lines: [`${target.name} asıldı.`, `Rolü: ${shown}`],
        dead: { name: target.name, roleName: shown, team: role?.team ?? "koy" },
        at: Date.now(),
      };
      log(game, `${target.name} asıldı.`);
      if (role?.special === "avci") {
        game.pendingHunterId = target.id;
        log(game, `${target.name} (Avcı) atış hakkı kazandı.`);
      }
      game.winner = checkWinner(game);
      await saveGame(game);
      return ok();
    }

    case "hunterShoot": {
      const targetId = body.targetId ? String(body.targetId) : null;
      const res = hunterShoot(game, targetId);
      if (!res.ok) return bad(res.error!);
      await saveGame(game);
      return ok();
    }

    case "hunterSkip": {
      const res = hunterShoot(game, null);
      if (!res.ok) return bad(res.error!);
      await saveGame(game);
      return ok();
    }

    case "toggleKill": {
      const targetId = String(body.targetId ?? "");
      const p = game.players.find((x) => x.id === targetId);
      if (!p) return bad("Oyuncu bulunamadı.");
      p.alive = !p.alive;
      log(game, `${p.name} ${p.alive ? "diriltildi" : "öldürüldü"}.`);
      game.winner = checkWinner(game);
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
      game.winner = null;
      game.pendingHunterId = null;
      game.vote = { active: false, votes: {} };
      game.night.active = false;
      game.announcement = null;
      game.mediumLog = [];
      game.doctorSelfUsed = [];
      game.players.forEach((p) => {
        p.role = null;
        p.alive = true;
      });
      log(game, "Lobiye dönüldü.");
      await saveGame(game);
      return ok();
    }

    case "closeRoom": {
      await deleteGame(game._id);
      log(game, "Oda kapatıldı.");
      return ok();
    }

    case "reset": {
      const fresh = makeFreshGame(game._id);
      fresh.roles = game.roles;
      fresh.mode = game.mode;
      fresh.version = game.version;
      log(fresh, "Oyun sıfırlandı.");
      await saveGame(fresh);
      return ok();
    }

    default:
      return bad("Bilinmeyen aksiyon: " + action);
  }
}
