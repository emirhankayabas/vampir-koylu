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
} from "@/lib/types";
import { NIGHT_ORDER } from "@/lib/roles";

// Bir oyun odasının benzersiz 6 haneli kodu. Birden fazla oda aynı anda oynanabilir.
const CODE_MIN = 100000;
const CODE_SPAN = 900000;

export function defaultRoles(): RoleConfig[] {
  return [
    { key: "vampir", name: "Vampir", team: "vampir", enabled: true, count: 2, builtin: true },
    { key: "doktor", name: "Doktor", team: "koy", enabled: true, count: 1, builtin: true, special: "doktor" },
    { key: "medyum", name: "Medyum", team: "koy", enabled: true, count: 1, builtin: true, special: "medyum" },
    { key: "avci", name: "Avcı", team: "koy", enabled: true, count: 1, builtin: true, special: "avci" },
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
  };
}

function freshGame(code: string): Game {
  return {
    _id: code,
    status: "lobby",
    mode: "phone",
    assignMode: "random",
    phase: "night",
    dayNumber: 0,
    roles: defaultRoles(),
    players: [],
    vote: { active: false, votes: {} },
    night: freshNight(),
    mediumLog: [],
    doctorSelfUsed: [],
    announcement: null,
    pendingHunterId: null,
    hangedThisDay: false,
    winner: null,
    log: [],
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
  // Eski kayıtlarla geriye dönük uyum
  game.night ??= freshNight();
  game.mediumLog ??= [];
  game.doctorSelfUsed ??= [];
  game.announcement ??= null;
  game.hangedThisDay ??= false;
  game.assignMode ??= "random";
  return game;
}

export async function saveGame(game: Game): Promise<Game> {
  const db = await getDb();
  const col = db.collection<Game>("state");
  game.version += 1;
  game.updatedAt = Date.now();
  await col.replaceOne({ _id: game._id }, game, { upsert: true });
  return game;
}

/** Sadece version alanını okur — SSE değişiklik tespiti için hafif sorgu. */
export async function getVersion(code: string): Promise<number> {
  const id = normalizeCode(code);
  if (id.length !== 6) return 0;
  const db = await getDb();
  const doc = await db
    .collection<Game>("state")
    .findOne({ _id: id }, { projection: { version: 1 } });
  return doc?.version ?? 0;
}

export function makeFreshGame(code: string): Game {
  return freshGame(code);
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

function specialOf(game: Game, p: Player): "avci" | "doktor" | "medyum" | undefined {
  return roleOf(game, p.role)?.special;
}

function alivePlayers(game: Game): Player[] {
  return game.players.filter((p) => p.alive);
}

function playerName(game: Game, id: string): string {
  return game.players.find((p) => p.id === id)?.name ?? "?";
}

function killPlayer(game: Game, targetId: string): Player | null {
  const p = game.players.find((x) => x.id === targetId);
  if (!p || !p.alive) return null;
  p.alive = false;
  return p;
}

// --- Rol dağıtımı ---

export interface AssignResult {
  ok: boolean;
  error?: string;
}

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

// --- Gece motoru (telefon modu) ---

/** Bu gece hangi rol gruplarının oynayacağını canlı oyunculara göre hesaplar. */
export function computeNightOrder(game: Game): NightRole[] {
  const alive = alivePlayers(game);
  const roles: NightRole[] = [];
  if (alive.some((p) => roleTeam(game, p.role) === "vampir")) roles.push("vampir");
  if (alive.some((p) => specialOf(game, p) === "doktor")) roles.push("doktor");
  if (alive.some((p) => specialOf(game, p) === "medyum")) roles.push("medyum");
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
  const saved = !!target && game.night.doctorTarget === target;

  const lines: string[] = [];
  let dead: Announcement["dead"] = null;

  if (target && !saved) {
    const victim = killPlayer(game, target);
    if (victim) {
      const role = roleOf(game, victim.role);
      const shown = maskedRoleName(game, victim.role);
      lines.push(`${victim.name} bu gece öldürüldü.`);
      lines.push(`Rolü: ${shown}`);
      dead = { name: victim.name, roleName: shown, team: role?.team ?? "koy" };
      log(game, `Gece ${victim.name} öldü (${role?.name ?? "?"}).`);
    } else {
      lines.push("Bu gece kimse ölmedi.");
    }
  } else if (saved) {
    // İsim verilmez — sadece korumanın gerçekleştiği söylenir
    lines.push("Doktor bu gece bir oyuncuyu korudu.");
    lines.push("Kimse ölmedi.");
    log(game, "Doktor gece bir saldırıyı engelledi.");
  } else {
    lines.push("Bu gece kimse ölmedi.");
    log(game, "Sakin bir geceydi.");
  }

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

  const victim = killPlayer(game, hangedId);
  const role = victim ? roleOf(game, victim.role) : null;
  const shown = victim ? maskedRoleName(game, victim.role) : "";
  const lines = victim
    ? [`${victim.name} oy çokluğuyla asıldı.`, `Rolü: ${shown}`]
    : ["Asma gerçekleşmedi."];

  game.announcement = {
    kind: "hang",
    title: "İnfaz",
    lines,
    dead: victim ? { name: victim.name, roleName: shown, team: role?.team ?? "koy" } : null,
    at: Date.now(),
  };
  if (victim) {
    log(game, `${victim.name} asıldı (${role?.name ?? "?"}).`);
    game.hangedThisDay = true;
  }

  // Avcı asıldıysa atış hakkı kazanır (yalnızca oyla asılınca).
  // Rolü yine "Köylü" görünür; avcı olduğu ancak ateş edince ortaya çıkar.
  if (victim && role?.special === "avci") {
    game.pendingHunterId = victim.id;
    log(game, `${victim.name} (Avcı) atış hakkı kazandı.`);
  }

  finalizeWinner(game);
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
      game.announcement = {
        kind: "hunter",
        title: "Avcının Kurşunu",
        lines: [`Avcı ${hunterName}, son nefesinde ${victim.name}'i vurdu.`, `Rolü: ${shown}`],
        dead: { name: victim.name, roleName: shown, team: role?.team ?? "koy" },
        at: Date.now(),
      };
      log(game, `Avcı ${victim.name}'i vurdu (${role?.name ?? "?"}).`);
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
  game.winner = checkWinner(game);
  if (game.winner && !game.pendingHunterId && game.status === "in_progress") {
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
    return {
      kind: "vampir",
      candidates: alivePlayers(game)
        .filter((p) => roleTeam(game, p.role) !== "vampir")
        .map((p) => ({ id: p.id, name: p.name })),
      myPick: game.night.vampireVotes[self.id] ?? null,
      teamPicks: [...counts.entries()].map(([id, count]) => ({ id, name: playerName(game, id), count })),
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
    status: game.status,
    mode: game.mode,
    phase: game.phase,
    dayNumber: game.dayNumber,
    self: self
      ? {
          id: self.id,
          name: self.name,
          role: self.role ? roleOf(game, self.role) : null,
          alive: self.alive,
          teammates,
          readings,
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
    reveal: revealed
      ? game.players.map((p) => ({
          id: p.id,
          name: p.name,
          roleName: p.role ? roleOf(game, p.role)?.name ?? null : null,
          team: roleTeam(game, p.role),
          alive: p.alive,
        }))
      : null,
    version: game.version,
  };
}
