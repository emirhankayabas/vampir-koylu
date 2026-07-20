import { getDb } from "@/lib/mongodb";
import type {
  Game,
  RoleConfig,
  ModeratorView,
  ParticipantView,
  Team,
} from "@/lib/types";

const GAME_ID = "active";

export function defaultRoles(): RoleConfig[] {
  return [
    { key: "vampir", name: "Vampir", team: "vampir", enabled: true, count: 2, builtin: true },
    { key: "doktor", name: "Doktor", team: "koy", enabled: true, count: 1, builtin: true, special: "doktor" },
    { key: "medyum", name: "Medyum", team: "koy", enabled: true, count: 1, builtin: true, special: "medyum" },
    { key: "avci", name: "Avcı", team: "koy", enabled: true, count: 1, builtin: true, special: "avci" },
    { key: "koylu", name: "Köylü", team: "koy", enabled: true, count: 0, builtin: true, fill: true },
  ];
}

function freshGame(): Game {
  return {
    _id: GAME_ID,
    status: "lobby",
    mode: "verbal",
    phase: "night",
    dayNumber: 0,
    roles: defaultRoles(),
    players: [],
    vote: { active: false, votes: {} },
    pendingHunterId: null,
    winner: null,
    log: [],
    version: 1,
    updatedAt: Date.now(),
  };
}

export async function getGame(): Promise<Game> {
  const db = await getDb();
  const col = db.collection<Game>("state");
  let game = await col.findOne({ _id: GAME_ID });
  if (!game) {
    game = freshGame();
    await col.insertOne(game);
  }
  return game;
}

export async function saveGame(game: Game): Promise<Game> {
  const db = await getDb();
  const col = db.collection<Game>("state");
  game.version += 1;
  game.updatedAt = Date.now();
  await col.replaceOne({ _id: GAME_ID }, game, { upsert: true });
  return game;
}

/** Sadece version alanını okur — SSE değişiklik tespiti için hafif sorgu. */
export async function getVersion(): Promise<number> {
  const db = await getDb();
  const doc = await db
    .collection<Game>("state")
    .findOne({ _id: GAME_ID }, { projection: { version: 1 } });
  return doc?.version ?? 0;
}

export function makeFreshGame(): Game {
  return freshGame();
}

export function log(game: Game, text: string) {
  game.log.unshift({ text, at: Date.now() });
  game.log = game.log.slice(0, 60);
}

// --- Rol dağıtımı ---

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface AssignResult {
  ok: boolean;
  error?: string;
}

export function assignRoles(game: Game): AssignResult {
  const active = game.roles.filter((r) => r.enabled);
  const fill = active.find((r) => r.fill);
  if (!fill) {
    return { ok: false, error: "Dolgu rolü (Köylü) aktif olmalı." };
  }
  const specials = active.filter((r) => !r.fill && r.count > 0);
  const totalSpecial = specials.reduce((s, r) => s + r.count, 0);

  if (game.players.length === 0) {
    return { ok: false, error: "Hiç oyuncu yok." };
  }
  if (totalSpecial > game.players.length) {
    return {
      ok: false,
      error: `Rol sayısı (${totalSpecial}) oyuncu sayısından (${game.players.length}) fazla.`,
    };
  }

  // Rol havuzunu oluştur
  const pool: string[] = [];
  for (const r of specials) {
    for (let i = 0; i < r.count; i++) pool.push(r.key);
  }
  while (pool.length < game.players.length) pool.push(fill.key);

  const shuffledRoles = shuffle(pool);
  const shuffledPlayers = shuffle(game.players);
  shuffledPlayers.forEach((p, i) => {
    p.role = shuffledRoles[i];
    p.alive = true;
  });

  return { ok: true };
}

// --- Kazanma tespiti ---

export function roleTeam(game: Game, roleKey: string | null): Team | null {
  if (!roleKey) return null;
  return game.roles.find((r) => r.key === roleKey)?.team ?? null;
}

export function checkWinner(game: Game): Team | null {
  const alive = game.players.filter((p) => p.alive);
  const vampires = alive.filter((p) => roleTeam(game, p.role) === "vampir").length;
  const villagers = alive.length - vampires;
  if (vampires === 0) return "koy";
  if (vampires >= villagers) return "vampir";
  return null;
}

// --- Projeksiyonlar ---

export function moderatorView(game: Game): ModeratorView {
  const counts = new Map<string, number>();
  for (const target of Object.values(game.vote.votes)) {
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  const tally = [...counts.entries()]
    .map(([targetId, count]) => ({
      targetId,
      targetName: game.players.find((p) => p.id === targetId)?.name ?? "?",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return { role: "moderator", game, tally, version: game.version };
}

export function participantView(game: Game, playerId: string | null): ParticipantView {
  const self = playerId ? game.players.find((p) => p.id === playerId) : undefined;
  const revealed = game.status === "ended";

  return {
    role: "participant",
    exists: !!self,
    status: game.status,
    mode: game.mode,
    phase: game.phase,
    self: self
      ? {
          id: self.id,
          name: self.name,
          role: self.role ? game.roles.find((r) => r.key === self.role) ?? null : null,
          alive: self.alive,
        }
      : null,
    players: game.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive })),
    vote: {
      active: game.vote.active,
      myVote: playerId ? game.vote.votes[playerId] ?? null : null,
    },
    winner: game.winner,
    reveal: revealed
      ? game.players.map((p) => ({
          id: p.id,
          name: p.name,
          roleName: p.role ? game.roles.find((r) => r.key === p.role)?.name ?? null : null,
          team: roleTeam(game, p.role),
          alive: p.alive,
        }))
      : null,
    version: game.version,
  };
}
