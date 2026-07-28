import { getDb } from "@/lib/mongodb";
import type {
  Game,
  RoleConfig,
  ModeratorView,
  ParticipantView,
  Team,
  NightRole,
  NightSummary,
  TurnInfo,
  Announcement,
  Player,
  RoundEvent,
  RoundDeath,
  RoomSummary,
  SessionSummary,
  SpecialKey,
} from "@/lib/types";
import { NIGHT_ORDER, SURVIVOR_SHIELDS } from "@/lib/roles";

// Sabit rol meta verisiyle birlikte durur; motor kullanıcıları için buradan da açılır.
export { SURVIVOR_SHIELDS };

// Bir oyun odasının benzersiz 6 haneli kodu. Birden fazla oda aynı anda oynanabilir.
const CODE_MIN = 100000;
const CODE_SPAN = 900000;

// Oda ömrü: son gerçek işlemden (saveGame) sonra bu süre boyunca hiçbir hamle
// olmazsa oda otomatik kapanır (silinir). Yalnızca izleme/poll (GET) zamanı
// tazelemez; katılım, oy, gece aksiyonu gibi işlemler tazeler. Böylece biri
// katılmaz ya da oyun başlamazsa lobi 1 saat sonra kendiliğinden kapanır.
export const ROOM_TTL_MS = 60 * 60 * 1000; // 1 saat

/** Oda son işlemden bu yana çok mu bekledi (kapanmalı mı)? */
function isStale(updatedAt: number | undefined): boolean {
  return !!updatedAt && Date.now() - updatedAt > ROOM_TTL_MS;
}

// Yeni odalara verilen rastgele isimler — herkesin bildiği ünlü film/dizi/kültür
// göndermeleri (basit kelimeler değil, tatlı ve tanıdık şeyler).
// Yeni odalara verilen rastgele isimler — yabancı + yerli karışık, 1-3 kelime,
// görünce güldüren esprili göndermeler.
const ROOM_NAMES = [
  // Temaya uygun (vampir/köy) espriler
  "Vejetaryen Vampir", "Sarımsak Alerjisi", "Kansız Vampir", "Uykusuz Köylü",
  "Köyün Delisi", "Güneş Kremi Lazım", "Dişçi Korkusu", "Sinsi Köylü",
  // Yabancı pop-kültür (komik twist)
  "Vader Baba", "Yoda Düzgün Konuş", "Gollum Diyette", "Voldemort Nezle",
  "Hulk Kızgın", "Titanik Batmaz", "Rambo Emekli", "Matrix Lag Yedi",
  "John Wick Kızgın", "Thanos Çıtlattı", "Şirinler Grevde", "Ejderha Yumurtladı",
  // Yerli meme / laflar
  "Oha Falan Oldum", "Helal Olsun Reis", "Kaçın Kurbağalar", "Vay Be Panpa",
  "Gaza Gelme", "Yandık Hoca", "Olur Bu İş", "Full Sisli",
  "Recep İvedik Diyette", "Kurtlar Vadisi Piknik", "Kombi Bozuk", "İnternet Yok",
  // Kısa & vurucu komik nickler
  "Gıcık Kedi", "Zıpır Dayı", "Karizma Kral", "Efsane Manyak",
  "Salak Dahi", "Obur Şövalye", "Pili Bitik", "Kafası Güzel",
  "Korkak Kahraman", "Şapşal Cadı",
];

/** Rastgele tanıdık bir oda adı üretir (ör. "Kıymetlim", "Kış Geliyor"). */
export function randomRoomName(): string {
  return ROOM_NAMES[Math.floor(Math.random() * ROOM_NAMES.length)];
}

export function defaultRoles(): RoleConfig[] {
  return [
    { key: "vampir", name: "Vampir", team: "vampir", enabled: true, count: 2, builtin: true },
    { key: "doktor", name: "Doktor", team: "koy", enabled: true, count: 1, builtin: true, special: "doktor" },
    { key: "medyum", name: "Medyum", team: "koy", enabled: true, count: 1, builtin: true, special: "medyum" },
    { key: "avci", name: "Avcı", team: "koy", enabled: true, count: 1, builtin: true, special: "avci" },
    // Tarafsız Soytarı — varsayılan kapalı (count 0). Moderatör adedini artırınca oyuna girer.
    // team "koy": köylü gibi görünür (medyum/ölüm duyurusunda masum çıkar) ama kendi kazanma
    // koşulu vardır: gündüz oylamasında astırılırsa tek başına kazanır.
    { key: "soytari", name: "Soytarı", team: "koy", enabled: true, count: 0, builtin: true, special: "soytari" },
    // Tarafsız Survivor — varsayılan kapalı (count 0). Köylü gibi görünür (medyum/ölüm
    // duyurusunda masum çıkar) ama takımı yoktur: tek amacı oyun sonunda hayatta olmak.
    // Gece 2 kez kalkanını açıp o gece kendisine gelen saldırıları savuşturabilir.
    { key: "survivor", name: "Survivor", team: "koy", enabled: true, count: 0, builtin: true, special: "survivor" },
    { key: "koylu", name: "Köylü", team: "koy", enabled: true, count: 0, builtin: true, fill: true },
  ];
}

function freshNight() {
  return {
    active: false,
    order: [] as NightRole[],
    step: 0,
    vampireVotes: {} as Record<string, string>,
    doctorTarget: null,
    mediumTarget: null,
    survivorShields: [] as string[],
    survivorDecided: [] as string[],
  };
}

function freshGame(code: string): Game {
  return {
    _id: code,
    name: randomRoomName(),
    password: null,
    status: "lobby",
    mode: "phone",
    assignMode: "random",
    phase: "night",
    dayNumber: 0,
    startedAt: null,
    roles: defaultRoles(),
    loversEnabled: false,
    lovers: null,
    players: [],
    vote: { active: false, votes: {} },
    night: freshNight(),
    mediumLog: [],
    doctorSelfUsed: [],
    survivorShieldsUsed: {},
    announcement: null,
    pendingHunterId: null,
    hangedThisDay: false,
    winner: null,
    log: [],
    roundLog: [],
    version: 1,
    updatedAt: Date.now(),
  };
}

function normalizeCode(code: string | null | undefined): string {
  return String(code ?? "").replace(/\D/g, "").slice(0, 6);
}

/** Yeni bir oda oluşturur, benzersiz 6 haneli kodla kaydeder ve döndürür. */
export async function createGame(): Promise<Game> {
  const db = await getDb();
  const col = db.collection<Game>("state");
  for (let i = 0; i < 12; i++) {
    const code = String(CODE_MIN + Math.floor(Math.random() * CODE_SPAN));
    const clash = await col.findOne({ _id: code }, { projection: { _id: 1 } });
    if (!clash) {
      const game = freshGame(code);
      await col.insertOne(game);
      return game;
    }
  }
  throw new Error("Oda kodu üretilemedi, tekrar deneyin.");
}

/** Koda göre oyunu getirir; oda yoksa null. */
export async function getGame(code: string): Promise<Game | null> {
  const id = normalizeCode(code);
  if (id.length !== 6) return null;
  const db = await getDb();
  const game = await db.collection<Game>("state").findOne({ _id: id });
  if (!game) return null;
  // Bayat oda: son işlemin üzerinden 1 saat geçtiyse odayı kapat (sil) ve yok say.
  if (isStale(game.updatedAt)) {
    await db.collection<Game>("state").deleteOne({ _id: id });
    return null;
  }
  // Eski kayıtlarla geriye dönük uyum
  game.name ??= "";
  game.password ??= null;
  game.loversEnabled ??= false;
  game.lovers ??= null;
  game.night ??= freshNight();
  game.night.survivorShields ??= [];
  game.night.survivorDecided ??= [];
  game.mediumLog ??= [];
  game.doctorSelfUsed ??= [];
  game.survivorShieldsUsed ??= {};
  game.announcement ??= null;
  game.hangedThisDay ??= false;
  game.assignMode ??= "random";
  game.roundLog ??= [];
  return game;
}

/**
 * Aynı odaya aynı anda yazılmaya çalışıldığında atılır (örn. iki vampir aynı
 * saniyede hedef seçti). Çağıran taraf odayı yeniden okuyup aksiyonu tekrar
 * uygular; böylece hiçbir hamle sessizce kaybolmaz.
 */
export class VersionConflictError extends Error {
  constructor() {
    super("Oda durumu değişti, tekrar deneyin.");
    this.name = "VersionConflictError";
  }
}

/**
 * Oyunu kaydeder. İyimser kilitleme: yazma yalnızca odanın sürümü okunduğu
 * andakiyle aynıysa geçer. Aksi halde araya başka bir hamle girmiştir ve
 * VersionConflictError atılır (üstteki katman tazeleyip tekrar dener).
 */
export async function saveGame(game: Game): Promise<Game> {
  const db = await getDb();
  const expected = game.version;
  game.version = expected + 1;
  game.updatedAt = Date.now();
  const res = await db
    .collection<Game>("state")
    .replaceOne({ _id: game._id, version: expected }, game);
  if (res.matchedCount === 0) {
    game.version = expected; // yazılmadı — nesneyi okunduğu hâline geri al
    throw new VersionConflictError();
  }
  return game;
}

/** Sadece version alanını okur — SSE değişiklik tespiti için hafif sorgu. */
export async function getVersion(code: string): Promise<number> {
  const id = normalizeCode(code);
  if (id.length !== 6) return 0;
  const db = await getDb();
  const doc = await db
    .collection<Game>("state")
    .findOne({ _id: id }, { projection: { version: 1, updatedAt: 1 } });
  if (!doc) return 0;
  // Bayat oda "yok" gibi davranır — istemci "oda kapandı" görür. Silme işini
  // getGame/listRooms üstlenir (bu yol hafif kalsın diye burada silmiyoruz).
  if (isStale(doc.updatedAt)) return 0;
  return doc.version ?? 0;
}

export function makeFreshGame(code: string): Game {
  return freshGame(code);
}

/** Tüm odaların özetini döndürür (Mevcut Oyunlar sayfası). Şifreyi ASLA sızdırmaz. */
export async function listRooms(): Promise<RoomSummary[]> {
  const db = await getDb();
  // Önce bayat odaları kapat (1 saattir işlem görmeyenler), sonra kalanları listele.
  await db.collection<Game>("state").deleteMany({ updatedAt: { $lt: Date.now() - ROOM_TTL_MS } });
  const docs = await db
    .collection<Game>("state")
    .find(
      {},
      { projection: { _id: 1, name: 1, status: 1, phase: 1, mode: 1, players: 1, password: 1, updatedAt: 1 } }
    )
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray();
  return docs.map((g) => ({
    code: g._id,
    name: g.name ?? "",
    status: g.status,
    phase: g.phase,
    mode: g.mode,
    playerCount: g.players?.length ?? 0,
    hasPassword: !!g.password,
    updatedAt: g.updatedAt ?? 0,
  }));
}

// Ana sayfada aynı anda gösterilebilecek en fazla kayıtlı oturum.
const MAX_SESSIONS = 8;

/**
 * İstemcinin hatırladığı odaların güncel durumunu döndürür ("devam eden
 * odalarım" kartı). Kapanmış ya da bayatlamış odalar yanıtta YER ALMAZ —
 * istemci böylece o kayıtları siler ve oyuncu otomatik olarak odadan düşer.
 * Şifre asla sızdırılmaz, yalnızca var/yok bilgisi döner.
 */
export async function listSessions(
  refs: { code: string; playerId?: string | null }[]
): Promise<SessionSummary[]> {
  // Kodları normalize et, tekilleştir ve sınırla.
  const wanted = new Map<string, string | null>();
  for (const ref of refs) {
    const id = normalizeCode(ref.code);
    if (id.length !== 6 || wanted.has(id)) continue;
    wanted.set(id, ref.playerId ?? null);
    if (wanted.size >= MAX_SESSIONS) break;
  }
  if (wanted.size === 0) return [];

  const db = await getDb();
  const docs = await db
    .collection<Game>("state")
    .find(
      { _id: { $in: [...wanted.keys()] } },
      { projection: { _id: 1, name: 1, status: 1, phase: 1, mode: 1, players: 1, password: 1, updatedAt: 1 } }
    )
    .sort({ updatedAt: -1 })
    .toArray();

  return docs
    .filter((g) => !isStale(g.updatedAt)) // bayat oda kapanmış sayılır
    .map((g) => {
      const playerId = wanted.get(g._id) ?? null;
      const me = playerId ? g.players?.find((p) => p.id === playerId) : undefined;
      return {
        code: g._id,
        name: g.name ?? "",
        status: g.status,
        phase: g.phase,
        mode: g.mode,
        playerCount: g.players?.length ?? 0,
        hasPassword: !!g.password,
        updatedAt: g.updatedAt ?? 0,
        exists: !!me,
        playerName: me?.name ?? null,
        alive: me?.alive ?? false,
      };
    });
}

/** Bir oyuncuyu odadan çıkarır. Yalnızca lobide izinlidir — süren bir elde
 *  oyuncuyu listeden silmek rol dengesini ve kazanma hesabını bozar. */
export function leaveGame(game: Game, playerId: string): AssignResult {
  const p = game.players.find((x) => x.id === playerId);
  if (!p) return { ok: true }; // zaten yok — istemci kaydını silsin
  if (game.status !== "lobby") {
    return { ok: false, error: "Oyun sürerken odadan çıkılamaz." };
  }
  game.players = game.players.filter((x) => x.id !== playerId);
  log(game, `${p.name} odadan ayrıldı.`);
  return { ok: true };
}

/** Odayı tamamen siler (moderatör "Odayı Kapat"). */
export async function deleteGame(code: string): Promise<void> {
  const id = normalizeCode(code);
  if (id.length !== 6) return;
  const db = await getDb();
  await db.collection<Game>("state").deleteOne({ _id: id });
}

export function log(game: Game, text: string) {
  game.log.unshift({ text, at: Date.now() });
  game.log = game.log.slice(0, 60);
}

/** Moderatör tur raporuna bir olay ekler (en yeni üstte, en fazla 40 tur). */
export function recordRound(game: Game, ev: RoundEvent) {
  game.roundLog ??= [];
  game.roundLog.unshift(ev);
  game.roundLog = game.roundLog.slice(0, 40);
}

// --- Yardımcılar ---

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function roleOf(game: Game, roleKey: string | null): RoleConfig | null {
  if (!roleKey) return null;
  return game.roles.find((r) => r.key === roleKey) ?? null;
}

export function roleTeam(game: Game, roleKey: string | null): Team | null {
  return roleOf(game, roleKey)?.team ?? null;
}

// Ölüm/asılma duyurularında rol maskelenir: özel roller (doktor, medyum, avcı)
// açığa çıkmaz — yalnızca takım gösterilir. Vampir → "Vampir", köy → "Köylü".
// (Oyun bittiğinde tam roller ayrıca açılır.)
function maskedRoleName(game: Game, roleKey: string | null): string {
  return roleTeam(game, roleKey) === "vampir" ? "Vampir" : "Köylü";
}

function specialOf(game: Game, p: Player): SpecialKey | undefined {
  return roleOf(game, p.role)?.special;
}

/** Bir Survivor'ın kalan kalkan hakkı (oyun boyu SURVIVOR_SHIELDS − harcanan). */
function survivorShieldsLeft(game: Game, playerId: string): number {
  const used = game.survivorShieldsUsed?.[playerId] ?? 0;
  return Math.max(0, SURVIVOR_SHIELDS - used);
}

function alivePlayers(game: Game): Player[] {
  return game.players.filter((p) => p.alive);
}

function playerName(game: Game, id: string): string {
  return game.players.find((p) => p.id === id)?.name ?? "?";
}

/** Bir oyuncuyu öldürür. Zaten ölüyse ya da yoksa null döner (çift ölüm yok). */
export function killPlayer(game: Game, targetId: string): Player | null {
  const p = game.players.find((x) => x.id === targetId);
  if (!p || !p.alive) return null;
  p.alive = false;
  return p;
}

// --- Rol dağıtımı ---

/**
 * Motor işlemlerinin sonucu. Ayrıştırılmış birleşim: başarısızsa `error` ALANI
 * ZORUNLU. Böylece "ok:false ama mesaj yok" durumu derleme zamanında imkânsız
 * olur ve çağıran taraf `res.error!` gibi zorlamalara ihtiyaç duymaz.
 */
export type AssignResult = { ok: true } | { ok: false; error: string };

export function assignRoles(game: Game): AssignResult {
  const active = game.roles.filter((r) => r.enabled);
  const fill = active.find((r) => r.fill);
  if (!fill) return { ok: false, error: "Dolgu rolü (Köylü) aktif olmalı." };
  const specials = active.filter((r) => !r.fill && r.count > 0);
  const totalSpecial = specials.reduce((s, r) => s + r.count, 0);

  if (game.players.length === 0) return { ok: false, error: "Hiç oyuncu yok." };
  if (totalSpecial > game.players.length) {
    return {
      ok: false,
      error: `Rol sayısı (${totalSpecial}) oyuncu sayısından (${game.players.length}) fazla.`,
    };
  }
  if (!active.some((r) => r.team === "vampir" && r.count > 0)) {
    return { ok: false, error: "En az bir vampir olmalı." };
  }

  const pool: string[] = [];
  for (const r of specials) for (let i = 0; i < r.count; i++) pool.push(r.key);
  while (pool.length < game.players.length) pool.push(fill.key);

  const shuffledRoles = shuffle(pool);
  const shuffledPlayers = shuffle(game.players);
  shuffledPlayers.forEach((p, i) => {
    p.role = shuffledRoles[i];
    p.alive = true;
  });
  return { ok: true };
}

/**
 * Moderatörün elle yaptığı atamaları doğrular. Her oyuncunun geçerli (aktif) bir
 * rolü olmalı; özel rollerin atanan sayısı yapılandırmadaki adetle birebir eşleşmeli.
 * Dolgu rolü (Köylü) sayı sınırı olmadan kalan oyunculara verilebilir.
 */
export function assignRolesManual(game: Game): AssignResult {
  const active = game.roles.filter((r) => r.enabled);
  const fill = active.find((r) => r.fill);
  if (!fill) return { ok: false, error: "Dolgu rolü (Köylü) aktif olmalı." };
  if (game.players.length === 0) return { ok: false, error: "Hiç oyuncu yok." };

  // Seçili roller aktif olmalı (boş bırakılanlar sonradan köylüye düşer)
  for (const p of game.players) {
    if (p.role && !active.some((x) => x.key === p.role)) {
      return { ok: false, error: `${p.name} için geçersiz bir rol seçili.` };
    }
  }
  // Özel rollerin atanan sayısı yapılandırmadaki adetle birebir eşleşmeli
  for (const r of active.filter((x) => !x.fill && x.count > 0)) {
    const assigned = game.players.filter((p) => p.role === r.key).length;
    if (assigned !== r.count) {
      return { ok: false, error: `${r.name}: ${assigned}/${r.count} atandı — sayılar eşleşmeli.` };
    }
  }
  // Adedi 0 olan özel role oyuncu atanmamalı
  for (const r of active.filter((x) => !x.fill && x.count === 0)) {
    if (game.players.some((p) => p.role === r.key)) {
      return { ok: false, error: `${r.name} adedi 0 — bu role oyuncu atanamaz.` };
    }
  }
  if (!game.players.some((p) => roleTeam(game, p.role) === "vampir")) {
    return { ok: false, error: "En az bir vampir atanmalı." };
  }

  // Boş bırakılanlar dolgu rolüne (Köylü) düşer
  game.players.forEach((p) => {
    if (!p.role) p.role = fill.key;
    p.alive = true;
  });
  return { ok: true };
}

/** Aktif dağıtım yöntemine göre rolleri atar. */
export function assignRolesFor(game: Game): AssignResult {
  return game.assignMode === "manual" ? assignRolesManual(game) : assignRoles(game);
}

// --- Âşıklar ---

/**
 * Âşıklar özelliği açıksa oyun başında rastgele 2 uygun oyuncuyu âşık yapar.
 * Uygun = tarafsız OLMAYAN herkes (yani KÖY veya VAMPİR etiketli; Soytarı ve
 * Survivor hariç). Rolleri fark etmez — Âşık Vampir, Âşık Doktor vs. olabilir.
 * Yeterli aday yoksa (2'den az) âşık oluşmaz.
 */
export function assignLovers(game: Game) {
  game.lovers = null;
  if (!game.loversEnabled) return;
  const eligible = game.players.filter((p) => {
    const sp = roleOf(game, p.role)?.special;
    return sp !== "soytari" && sp !== "survivor";
  });
  if (eligible.length < 2) return;
  const pair = shuffle(eligible).slice(0, 2);
  game.lovers = [pair[0].id, pair[1].id];
  log(game, `Âşıklar belirlendi: ${pair[0].name} 💘 ${pair[1].name}.`);
}

/** Bir oyuncunun âşık partnerinin id'si (yoksa null). */
export function loverPartnerId(game: Game, id: string): string | null {
  if (!game.lovers) return null;
  const [a, b] = game.lovers;
  if (id === a) return b;
  if (id === b) return a;
  return null;
}

/**
 * Bir ölümün ardından âşık partnerini de öldürür ("kahrından"). Partner zaten
 * ölüyse ya da âşık yoksa bir şey yapmaz. Ölen partneri döndürür (duyuru için).
 * Ölüm bağı yalnızca tek yönde zincirlenir (iki âşık olduğu için sonsuz döngü yok).
 */
export function applyHeartbreak(game: Game, deadId: string): Player | null {
  const partnerId = loverPartnerId(game, deadId);
  if (!partnerId) return null;
  const partner = game.players.find((p) => p.id === partnerId);
  if (!partner || !partner.alive) return null;
  partner.alive = false;
  log(game, `${partner.name} âşığının ardından kahrından öldü.`);
  return partner;
}

// --- Gece motoru (telefon modu) ---

/** Bu gece hangi rol gruplarının oynayacağını canlı oyunculara göre hesaplar. */
export function computeNightOrder(game: Game): NightRole[] {
  const alive = alivePlayers(game);
  const roles: NightRole[] = [];
  if (alive.some((p) => roleTeam(game, p.role) === "vampir")) roles.push("vampir");
  if (alive.some((p) => specialOf(game, p) === "doktor")) roles.push("doktor");
  if (alive.some((p) => specialOf(game, p) === "medyum")) roles.push("medyum");
  // Survivor yalnızca hâlâ kalkan hakkı varsa geceye katılır.
  if (alive.some((p) => specialOf(game, p) === "survivor" && survivorShieldsLeft(game, p.id) > 0))
    roles.push("survivor");
  roles.sort((a, b) => (NIGHT_ORDER[a] ?? 99) - (NIGHT_ORDER[b] ?? 99));
  return roles;
}

/** Yeni bir gece başlatır: sıra hesaplanır, seçimler sıfırlanır, duyuru temizlenir. */
export function beginNight(game: Game) {
  game.phase = "night";
  game.vote = { active: false, votes: {} };
  game.announcement = null;
  game.hangedThisDay = false;
  game.night = {
    active: true,
    order: computeNightOrder(game),
    step: 0,
    vampireVotes: {},
    doctorTarget: null,
    mediumTarget: null,
    survivorShields: [],
    survivorDecided: [],
  };
  // Hiç aktif rol yoksa (imkânsıza yakın) doğrudan çöz
  if (game.night.order.length === 0) resolveNight(game);
}

/** Geçerli gece grubunun görevini tamamlayıp tamamlamadığını söyler. */
function groupComplete(game: Game): boolean {
  const cur = game.night.order[game.night.step];
  if (!cur) return true;
  if (cur === "vampir") {
    const vamps = alivePlayers(game).filter((p) => roleTeam(game, p.role) === "vampir");
    return vamps.length > 0 && vamps.every((v) => game.night.vampireVotes[v.id]);
  }
  if (cur === "doktor") return game.night.doctorTarget !== null;
  if (cur === "medyum") return game.night.mediumTarget !== null;
  if (cur === "survivor") {
    // Kalkan hakkı olup henüz karar vermemiş (kullan/geç) canlı Survivor kalmasın.
    // Son kalkanını harcayan da survivorDecided'a girer, dolayısıyla adım kilitlenmez.
    const pending = alivePlayers(game).filter(
      (p) =>
        specialOf(game, p) === "survivor" &&
        survivorShieldsLeft(game, p.id) > 0 &&
        !game.night.survivorDecided.includes(p.id)
    );
    return pending.length === 0;
  }
  return true;
}

/** Tamamlanan grupları geçerek ilerler; son gruptan sonra geceyi çözer. */
function advanceNight(game: Game) {
  while (game.night.active && game.night.step < game.night.order.length && groupComplete(game)) {
    game.night.step += 1;
  }
  if (game.night.active && game.night.step >= game.night.order.length) {
    resolveNight(game);
  }
}

/** Vampir oylarından hedefi belirler (çoğunluk; eşitlikte rastgele). */
function vampireTarget(game: Game): string | null {
  const counts = new Map<string, number>();
  for (const t of Object.values(game.night.vampireVotes)) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const max = Math.max(...counts.values());
  const top = [...counts.entries()].filter(([, c]) => c === max).map(([id]) => id);
  return top[Math.floor(Math.random() * top.length)];
}

/** Geceyi çözer: ölüm/koruma hesaplanır, sabah duyurusu üretilir. */
export function resolveNight(game: Game) {
  const target = vampireTarget(game);
  const savedByDoctor = !!target && game.night.doctorTarget === target;
  // Kalkanını açan bir Survivor hedeflendiyse saldırı boşa gider.
  const savedByShield = !!target && game.night.survivorShields.includes(target);
  const saved = savedByDoctor || savedByShield;

  const lines: string[] = [];
  let dead: Announcement["dead"] = null;
  const deaths: RoundDeath[] = [];

  if (target && !saved) {
    const victim = killPlayer(game, target);
    if (victim) {
      const role = roleOf(game, victim.role);
      const shown = maskedRoleName(game, victim.role);
      lines.push(`${victim.name} bu gece öldürüldü.`);
      lines.push(`Rolü: ${shown}`);
      dead = { name: victim.name, roleName: shown, team: role?.team ?? "koy" };
      deaths.push({ name: victim.name, role: role?.name ?? "?", team: role?.team ?? "koy" });
      log(game, `Gece ${victim.name} öldü (${role?.name ?? "?"}).`);
      // Âşık öldüyse partneri de kahrından ölür.
      const hb = applyHeartbreak(game, victim.id);
      if (hb) {
        const hbRole = roleOf(game, hb.role);
        lines.push(`💔 ${hb.name} âşığının ardından dayanamadı.`);
        lines.push(`Rolü: ${maskedRoleName(game, hb.role)}`);
        deaths.push({ name: hb.name, role: hbRole?.name ?? "?", team: hbRole?.team ?? "koy" });
      }
    } else {
      lines.push("Bu gece kimse ölmedi.");
    }
  } else if (savedByDoctor) {
    // İsim verilmez — sadece korumanın gerçekleştiği söylenir
    lines.push("Doktor bu gece bir oyuncuyu korudu.");
    lines.push("Kimse ölmedi.");
    log(game, "Doktor gece bir saldırıyı engelledi.");
  } else if (savedByShield) {
    // Survivor gizli kalır — kalkanı açığa vurmadan sessiz bir gece gibi anlatılır.
    lines.push("Bu gece kimse ölmedi.");
    log(game, "Survivor kalkanıyla bir saldırıyı savuşturdu.");
  } else {
    lines.push("Bu gece kimse ölmedi.");
    log(game, "Sakin bir geceydi.");
  }

  // Moderatör tur raporu: gecenin gizli detayları (hedef, koruma, medyum sonucu)
  const medId = game.night.mediumTarget;
  const medPlayer = medId ? game.players.find((p) => p.id === medId) : null;
  recordRound(game, {
    day: game.dayNumber,
    kind: "night",
    at: Date.now(),
    vampTarget: target ? playerName(game, target) : null,
    doctorTarget: game.night.doctorTarget ? playerName(game, game.night.doctorTarget) : null,
    saved,
    survivorShielded: savedByShield,
    mediumTarget: medPlayer ? medPlayer.name : null,
    mediumResult: medPlayer ? roleTeam(game, medPlayer.role) : null,
    deaths,
  });

  game.announcement = {
    kind: "morning",
    title: `${game.dayNumber}. Sabah`,
    lines,
    dead,
    at: Date.now(),
  };
  game.night.active = false;
  game.phase = "day";
  game.vote = { active: false, votes: {} };
  finalizeWinner(game);
}

/** Bir gece aksiyonunu işler (oyuncu telefonundan). Geçerliyse ilerletir. */
export function submitNightAction(
  game: Game,
  playerId: string,
  kind: NightRole,
  targetId: string
): AssignResult {
  if (game.mode !== "phone") return { ok: false, error: "Gece motoru yalnızca telefon modunda." };
  if (game.phase !== "night" || !game.night.active) return { ok: false, error: "Şu an gece aksiyonu yok." };
  const cur = game.night.order[game.night.step];
  if (cur !== kind) return { ok: false, error: "Sıra sizde değil." };

  const actor = game.players.find((p) => p.id === playerId);
  if (!actor || !actor.alive) return { ok: false, error: "Bu aksiyonu yapamazsınız." };

  // Survivor kararı hedefsiz olabilir ("geç"), bu yüzden genel hedef kontrolünden önce.
  if (kind === "survivor") {
    if (specialOf(game, actor) !== "survivor") return { ok: false, error: "Survivor değilsiniz." };
    if (game.night.survivorDecided.includes(playerId)) return { ok: false, error: "Bu gece kararını verdin." };
    // targetId === kendisi → kalkanı aç; aksi halde (boş) bu geceyi es geç.
    if (targetId === playerId) {
      if (survivorShieldsLeft(game, playerId) <= 0) return { ok: false, error: "Kalkan hakkın kalmadı." };
      game.survivorShieldsUsed[playerId] = (game.survivorShieldsUsed[playerId] ?? 0) + 1;
      if (!game.night.survivorShields.includes(playerId)) game.night.survivorShields.push(playerId);
      log(game, `${actor.name} (Survivor) kalkanını açtı.`);
    }
    game.night.survivorDecided.push(playerId);
    advanceNight(game);
    return { ok: true };
  }

  const target = game.players.find((p) => p.id === targetId);
  if (!target || !target.alive) return { ok: false, error: "Geçersiz hedef." };

  if (kind === "vampir") {
    if (roleTeam(game, actor.role) !== "vampir") return { ok: false, error: "Vampir değilsiniz." };
    if (roleTeam(game, target.role) === "vampir") return { ok: false, error: "Vampir öldürülemez." };
    game.night.vampireVotes[playerId] = targetId;
  } else if (kind === "doktor") {
    if (specialOf(game, actor) !== "doktor") return { ok: false, error: "Doktor değilsiniz." };
    if (targetId === playerId) {
      // Kendini koruma yalnızca oyun boyunca bir kez
      if (game.doctorSelfUsed.includes(playerId)) {
        return { ok: false, error: "Kendini yalnızca bir kez koruyabilirsin." };
      }
      game.doctorSelfUsed.push(playerId);
    }
    game.night.doctorTarget = targetId;
  } else if (kind === "medyum") {
    if (specialOf(game, actor) !== "medyum") return { ok: false, error: "Medyum değilsiniz." };
    if (targetId === playerId) return { ok: false, error: "Kendinizi inceleyemezsiniz." };
    game.night.mediumTarget = targetId;
    game.mediumLog.push({
      mediumId: playerId,
      targetId,
      targetName: target.name,
      team: roleTeam(game, target.role) ?? "koy",
      day: game.dayNumber,
    });
  }

  advanceNight(game);
  return { ok: true };
}

/** Moderatör geçerli grubu atlar (AFK oyuncu vb.). */
export function skipNightStep(game: Game) {
  if (!game.night.active) return;
  game.night.step += 1;
  advanceNight(game);
}

// --- Gündüz / oylama ---

/**
 * Bir oyuncuyu asar. Oylama sonucu (telefon modu) ile moderatörün elle asması
 * (sözlü mod) aynı kuralları paylaşsın diye tek yerde toplanmıştır: duyuru,
 * tur raporu, Soytarı zaferi, âşık bağı ve avcının atış hakkı.
 * Hedef zaten ölüyse hiçbir şey yapmaz ve null döner.
 */
export function hangPlayer(game: Game, targetId: string, byVote = false): Player | null {
  const victim = killPlayer(game, targetId);
  if (!victim) return null;

  game.vote = { active: false, votes: {} };
  game.hangedThisDay = true;
  const role = roleOf(game, victim.role);
  const at = Date.now();

  // Soytarı astırıldıysa: tek başına kazanır ve oyun anında biter.
  if (role?.special === "soytari") {
    game.winner = "soytari";
    game.status = "ended";
    game.night.active = false;
    game.announcement = {
      kind: "hang",
      title: "Soytarının Oyunu",
      lines: [`${victim.name} asıldı… ama o bir Soytarıydı!`, "Soytarı kazandı 🃏"],
      dead: { name: victim.name, roleName: "Soytarı", team: role.team },
      at,
    };
    log(game, `${victim.name} (Soytarı) astırıldı — Soytarı kazandı.`);
    recordRound(game, {
      day: game.dayNumber,
      kind: "hang",
      at,
      deaths: [{ name: victim.name, role: "Soytarı", team: role.team }],
    });
    return victim;
  }

  const shown = maskedRoleName(game, victim.role);
  const lines = [byVote ? `${victim.name} oy çokluğuyla asıldı.` : `${victim.name} asıldı.`, `Rolü: ${shown}`];
  const deaths: RoundDeath[] = [{ name: victim.name, role: role?.name ?? "?", team: role?.team ?? "koy" }];

  // Âşık asıldıysa partneri de kahrından ölür.
  const hb = applyHeartbreak(game, victim.id);
  if (hb) {
    const hbRole = roleOf(game, hb.role);
    lines.push(`💔 ${hb.name} âşığının ardından dayanamadı.`);
    lines.push(`Rolü: ${maskedRoleName(game, hb.role)}`);
    deaths.push({ name: hb.name, role: hbRole?.name ?? "?", team: hbRole?.team ?? "koy" });
  }

  game.announcement = {
    kind: "hang",
    title: "İnfaz",
    lines,
    dead: { name: victim.name, roleName: shown, team: role?.team ?? "koy" },
    at,
  };
  log(game, `${victim.name} asıldı (${role?.name ?? "?"}).`);
  recordRound(game, { day: game.dayNumber, kind: "hang", at, deaths });

  // Avcı asıldıysa atış hakkı kazanır (yalnızca asılınca).
  // Rolü yine "Köylü" görünür; avcı olduğu ancak ateş edince ortaya çıkar.
  if (role?.special === "avci") {
    game.pendingHunterId = victim.id;
    log(game, `${victim.name} (Avcı) atış hakkı kazandı.`);
  }

  finalizeWinner(game);
  return victim;
}

/** Oylamayı çözer: en çok oyu alan asılır (eşitlik → asma yok). */
export function resolveVote(game: Game): { hangedId: string | null } {
  const counts = new Map<string, number>();
  for (const t of Object.values(game.vote.votes)) counts.set(t, (counts.get(t) ?? 0) + 1);

  let hangedId: string | null = null;
  if (counts.size > 0) {
    const max = Math.max(...counts.values());
    const top = [...counts.entries()].filter(([, c]) => c === max).map(([id]) => id);
    if (top.length === 1 && max > 0) hangedId = top[0];
  }

  game.vote = { active: false, votes: {} };

  if (!hangedId) {
    game.announcement = {
      kind: "hang",
      title: "Oylama",
      lines: ["Köy bir karara varamadı.", "Kimse asılmadı."],
      dead: null,
      at: Date.now(),
    };
    log(game, "Oylama sonuçsuz kaldı.");
    return { hangedId: null };
  }

  // Hedef arada ölmüşse (moderatör müdahalesi vb.) asma gerçekleşmez.
  if (!hangPlayer(game, hangedId, true)) {
    game.announcement = {
      kind: "hang",
      title: "Oylama",
      lines: ["Asma gerçekleşmedi."],
      dead: null,
      at: Date.now(),
    };
    finalizeWinner(game);
    return { hangedId: null };
  }
  return { hangedId };
}

/** Avcının atışını işler (avcının kendi telefonundan ya da moderatörden). */
export function hunterShoot(game: Game, targetId: string | null): AssignResult {
  if (!game.pendingHunterId) return { ok: false, error: "Bekleyen avcı yok." };
  const hunterName = playerName(game, game.pendingHunterId);
  if (targetId) {
    const victim = killPlayer(game, targetId);
    if (victim) {
      const role = roleOf(game, victim.role);
      const shown = maskedRoleName(game, victim.role);
      const lines = [`Avcı ${hunterName}, son nefesinde ${victim.name}'i vurdu.`, `Rolü: ${shown}`];
      const roundDeaths: RoundDeath[] = [{ name: victim.name, role: role?.name ?? "?", team: role?.team ?? "koy" }];
      // Vurulan kişi âşıksa partneri de kahrından ölür.
      const hb = applyHeartbreak(game, victim.id);
      if (hb) {
        const hbRole = roleOf(game, hb.role);
        lines.push(`💔 ${hb.name} âşığının ardından dayanamadı.`);
        lines.push(`Rolü: ${maskedRoleName(game, hb.role)}`);
        roundDeaths.push({ name: hb.name, role: hbRole?.name ?? "?", team: hbRole?.team ?? "koy" });
      }
      game.announcement = {
        kind: "hunter",
        title: "Avcının Kurşunu",
        lines,
        dead: { name: victim.name, roleName: shown, team: role?.team ?? "koy" },
        at: Date.now(),
      };
      log(game, `Avcı ${victim.name}'i vurdu (${role?.name ?? "?"}).`);
      recordRound(game, { day: game.dayNumber, kind: "hunter", at: Date.now(), deaths: roundDeaths });
    }
  } else {
    game.announcement = {
      kind: "hunter",
      title: "Avcının Kurşunu",
      lines: [`Avcı ${hunterName} atış yapmadı.`],
      dead: null,
      at: Date.now(),
    };
    log(game, "Avcı atış yapmadı.");
  }
  game.pendingHunterId = null;
  finalizeWinner(game);
  return { ok: true };
}

// --- Kazanma tespiti ---

export function checkWinner(game: Game): Team | null {
  const alive = alivePlayers(game);
  const vampires = alive.filter((p) => roleTeam(game, p.role) === "vampir").length;
  const villagers = alive.length - vampires;
  if (vampires === 0) return "koy";
  if (vampires >= villagers) return "vampir";
  return null;
}

/**
 * Kazananı hesaplar ve varsa oyunu otomatik bitirir. Örn. son vampir de ölünce
 * köylüler kazanır ve oyun anında sona erer. Bekleyen avcı atışı varsa oyun
 * bitirilmez (avcı son kurşunuyla sonucu değiştirebilir).
 */
export function finalizeWinner(game: Game) {
  // Soytarı astırılıp kazandıysa sonuç kilitlidir — köy/vampir hesabıyla ezilemez.
  if (game.winner === "soytari") return;
  // Yalnızca süren oyunda hesap yapılır. Biten oyunda (ör. moderatör birini
  // diriltince) ilan edilmiş kazanan yeniden hesaplanıp değişmemeli; lobide de
  // roller dağıtılmadığı için anlamlı bir sonuç yoktur.
  if (game.status !== "in_progress") return;
  game.winner = checkWinner(game);
  if (game.winner && !game.pendingHunterId) {
    game.status = "ended";
    game.vote = { active: false, votes: {} };
    game.night.active = false;
    log(game, game.winner === "vampir" ? "Vampirler kazandı — oyun bitti." : "Köy kazandı — oyun bitti.");
  }
}

// --- Projeksiyonlar ---

function nightSummary(game: Game): NightSummary | null {
  if (game.mode !== "phone" || game.phase !== "night" || !game.night.active) return null;
  const cur = game.night.order[game.night.step] ?? null;
  const labels: Record<NightRole, string> = {
    vampir: "🧛 Vampirler avını seçiyor",
    doktor: "🩺 Doktor birini koruyor",
    medyum: "🔮 Medyum bir ruhu okuyor",
    survivor: "🛡️ Survivor kalkanına karar veriyor",
  };
  let waiting: string[] = [];
  if (cur === "vampir") {
    waiting = alivePlayers(game)
      .filter((p) => roleTeam(game, p.role) === "vampir" && !game.night.vampireVotes[p.id])
      .map((p) => p.name);
  } else if (cur === "doktor" && !game.night.doctorTarget) {
    waiting = alivePlayers(game).filter((p) => specialOf(game, p) === "doktor").map((p) => p.name);
  } else if (cur === "medyum" && !game.night.mediumTarget) {
    waiting = alivePlayers(game).filter((p) => specialOf(game, p) === "medyum").map((p) => p.name);
  } else if (cur === "survivor") {
    waiting = alivePlayers(game)
      .filter(
        (p) =>
          specialOf(game, p) === "survivor" &&
          survivorShieldsLeft(game, p.id) > 0 &&
          !game.night.survivorDecided.includes(p.id)
      )
      .map((p) => p.name);
  }
  return { role: cur, label: cur ? labels[cur] : "Gece çözülüyor", waiting };
}

export function moderatorView(game: Game): ModeratorView {
  const counts = new Map<string, number>();
  for (const target of Object.values(game.vote.votes)) {
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  const tally = [...counts.entries()]
    .map(([targetId, count]) => ({
      targetId,
      targetName: playerName(game, targetId),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return { role: "moderator", game, tally, night: nightSummary(game), version: game.version };
}

function turnFor(game: Game, self: Player): TurnInfo | null {
  if (game.status !== "in_progress") return null;

  // Avcı atışı her şeyin önünde — avcı asıldığı için artık ölü olsa bile
  // atış hakkını kendi ekranından görür.
  if (game.pendingHunterId === self.id) {
    return {
      kind: "hunter",
      candidates: alivePlayers(game)
        .filter((p) => p.id !== self.id)
        .map((p) => ({ id: p.id, name: p.name })),
      myPick: null,
    };
  }

  if (!self.alive) return null;
  if (game.mode !== "phone" || game.phase !== "night" || !game.night.active) return null;
  const cur = game.night.order[game.night.step];
  const role = roleOf(game, self.role);
  if (!role) return null;

  if (cur === "vampir" && role.team === "vampir") {
    const counts = new Map<string, number>();
    for (const t of Object.values(game.night.vampireVotes)) counts.set(t, (counts.get(t) ?? 0) + 1);
    const mates = alivePlayers(game)
      .filter((p) => roleTeam(game, p.role) === "vampir" && p.id !== self.id)
      .map((v) => ({
        id: v.id,
        name: v.name,
        targetName: game.night.vampireVotes[v.id] ? playerName(game, game.night.vampireVotes[v.id]) : null,
      }));
    return {
      kind: "vampir",
      candidates: alivePlayers(game)
        .filter((p) => roleTeam(game, p.role) !== "vampir")
        .map((p) => ({ id: p.id, name: p.name })),
      myPick: game.night.vampireVotes[self.id] ?? null,
      teamPicks: [...counts.entries()].map(([id, count]) => ({ id, name: playerName(game, id), count })),
      mates,
    };
  }
  if (cur === "doktor" && role.special === "doktor") {
    const selfUsed = game.doctorSelfUsed.includes(self.id);
    return {
      kind: "doktor",
      candidates: alivePlayers(game)
        .filter((p) => p.id !== self.id || !selfUsed) // self-protect bitince kendini gizle
        .map((p) => ({ id: p.id, name: p.name })),
      myPick: game.night.doctorTarget,
      note: selfUsed
        ? "Kendini koruma hakkını kullandın."
        : "Kendini koruma hakkın var (oyun boyu 1 kez).",
    };
  }
  if (cur === "medyum" && role.special === "medyum") {
    return {
      kind: "medyum",
      candidates: alivePlayers(game)
        .filter((p) => p.id !== self.id)
        .map((p) => ({ id: p.id, name: p.name })),
      myPick: game.night.mediumTarget,
    };
  }
  if (cur === "survivor" && role.special === "survivor") {
    // Kararını verdiyse tekrar sorma — diğer Survivor'lar beklenirken uyur.
    if (game.night.survivorDecided.includes(self.id)) return null;
    const left = survivorShieldsLeft(game, self.id);
    return {
      kind: "survivor",
      candidates: [], // hedef listesi yok; ekran "kullan / geç" düğmeleri gösterir
      myPick: null,
      note: `Kalan kalkan: ${left}/${SURVIVOR_SHIELDS}`,
    };
  }
  return null;
}

export function participantView(game: Game, playerId: string | null): ParticipantView {
  const self = playerId ? game.players.find((p) => p.id === playerId) : undefined;
  const revealed = game.status === "ended";

  const teammates =
    self && roleTeam(game, self.role) === "vampir"
      ? game.players
          .filter((p) => p.id !== self.id && roleTeam(game, p.role) === "vampir")
          .map((p) => ({ id: p.id, name: p.name }))
      : [];

  const readings =
    self && roleOf(game, self.role)?.special === "medyum"
      ? game.mediumLog
          .filter((r) => r.mediumId === self.id)
          .map((r) => ({ targetName: r.targetName, team: r.team, day: r.day }))
      : [];

  // Âşık isim(ler)i: oyuncu âşıksa yalnızca partnerinin ADI (rolü değil).
  const loverPartner = self ? loverPartnerId(game, self.id) : null;
  const loverName = loverPartner ? playerName(game, loverPartner) : null;
  // Oyun bitince âşık çift herkese açılır.
  const loverPair =
    revealed && game.lovers
      ? { a: playerName(game, game.lovers[0]), b: playerName(game, game.lovers[1]) }
      : null;

  // Oylama sırasında her adayın aldığı oy sayısı (herkes canlı görür)
  const voteCounts = new Map<string, number>();
  for (const target of Object.values(game.vote.votes)) {
    voteCounts.set(target, (voteCounts.get(target) ?? 0) + 1);
  }
  const voteTally = [...voteCounts.entries()].map(([targetId, count]) => ({ targetId, count }));

  return {
    role: "participant",
    forPlayerId: playerId ?? null,
    exists: !!self,
    roomName: game.name ?? "",
    hasPassword: !!game.password,
    status: game.status,
    mode: game.mode,
    phase: game.phase,
    dayNumber: game.dayNumber,
    startedAt: game.startedAt ?? null,
    self: self
      ? {
          id: self.id,
          name: self.name,
          role: self.role ? roleOf(game, self.role) : null,
          alive: self.alive,
          teammates,
          readings,
          survivorShieldsLeft:
            roleOf(game, self.role)?.special === "survivor" ? survivorShieldsLeft(game, self.id) : null,
          loverName,
        }
      : null,
    players: game.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive })),
    vote: {
      active: game.vote.active,
      myVote: playerId ? game.vote.votes[playerId] ?? null : null,
      count: Object.keys(game.vote.votes).length,
      total: alivePlayers(game).length,
      tally: voteTally,
    },
    turn: self ? turnFor(game, self) : null,
    nightActive: game.mode === "phone" && game.phase === "night" && game.night.active,
    announcement: game.announcement,
    winner: game.winner,
    loverPair,
    reveal: revealed
      ? game.players.map((p) => ({
          id: p.id,
          name: p.name,
          roleName: p.role ? roleOf(game, p.role)?.name ?? null : null,
          roleKey: p.role,
          team: roleTeam(game, p.role),
          special: roleOf(game, p.role)?.special,
          alive: p.alive,
        }))
      : null,
    version: game.version,
  };
}
