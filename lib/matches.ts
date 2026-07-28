// Maç geçmişi — biten (ya da yarıda kalan) ellerin kalıcı kaydı.
//
// Odalar 1 saat işlem görmezse siliniyor, bu yüzden oyun bittikten sonra geriye
// hiçbir şey kalmıyordu. Kayıt iki adımda yazılır:
//   1) `recordMatchStart` — roller DAĞITILDIĞI anda. Sözlü modda moderatör oyunu
//      uygulamadan yürütüp odayı öylece bıraksa bile "kime hangi rol geldi"
//      bilgisi kayda geçer (rol dağıtımı her iki modda da uygulamadan yapılır).
//   2) `recordMatchEnd` — sonuç belli olunca. `finished: true` olur.
//
// Yazma hataları oyunu ASLA bozmamalı: çağıran taraf sonucu yok sayabilir.

import { getDb } from "@/lib/mongodb";
import type { Game, MatchRecord, MatchPlayer, Winner, Player } from "@/lib/types";

/** Geçmişte gösterilecek en fazla maç sayısı. */
export const HISTORY_LIMIT = 50;

/** Bir elin kimliği: oda kodu + başlangıç damgası. Aynı el iki kez yazılmaz. */
function matchId(game: Game): string | null {
  if (!game.startedAt) return null;
  return `${game._id}:${game.startedAt}`;
}

function roleInfo(game: Game, p: Player) {
  const role = game.roles.find((r) => r.key === p.role) ?? null;
  return {
    roleKey: p.role,
    roleName: role?.name ?? null,
    team: role?.team ?? null,
    special: role?.special,
  };
}

/**
 * Oyuncu kazandı mı? Sonuç yoksa null.
 * Kurallar motorla aynı: Soytarı yalnız kendi zaferinde kazanır; Survivor
 * hayattaysa kazanan tarafla birlikte kazanır; diğerleri takımına bakar.
 */
function didWin(winner: Winner | null, team: string | null, special: string | undefined, alive: boolean): boolean | null {
  if (!winner) return null;
  if (special === "soytari") return winner === "soytari";
  if (winner === "soytari") return false;
  if (special === "survivor") return alive;
  return team === winner;
}

function toMatchPlayers(game: Game): MatchPlayer[] {
  const lovers: string[] = game.lovers ? [...game.lovers] : [];
  return game.players.map((p) => {
    const info = roleInfo(game, p);
    return {
      userId: p.userId ?? null,
      name: p.name,
      roleKey: info.roleKey,
      roleName: info.roleName,
      team: info.team,
      special: info.special,
      alive: p.alive,
      won: didWin(game.winner, info.team, info.special, p.alive),
      lover: lovers.includes(p.id),
    };
  });
}

/** Roller dağıtıldığında kaydı açar. Aynı el için tekrar çağrılması zararsızdır. */
export async function recordMatchStart(game: Game): Promise<void> {
  const _id = matchId(game);
  if (!_id) return;
  const players = toMatchPlayers(game);
  const db = await getDb();
  await db.collection<MatchRecord>("matches").updateOne(
    { _id },
    {
      $set: {
        code: game._id,
        roomName: game.name ?? "",
        mode: game.mode,
        assignMode: game.assignMode,
        loversEnabled: !!game.loversEnabled,
        playerCount: players.length,
        userIds: players.map((p) => p.userId).filter((id): id is string => !!id),
        players,
      },
      $setOnInsert: {
        startedAt: game.startedAt!,
        endedAt: null,
        finished: false,
        winner: null,
        dayCount: game.dayNumber,
        rounds: [],
      },
    },
    { upsert: true }
  );
}

/** Sonuç belli olduğunda kaydı tamamlar. */
export async function recordMatchEnd(game: Game): Promise<void> {
  const _id = matchId(game);
  if (!_id) return;
  const players = toMatchPlayers(game);
  const db = await getDb();
  await db.collection<MatchRecord>("matches").updateOne(
    { _id },
    {
      $set: {
        code: game._id,
        roomName: game.name ?? "",
        mode: game.mode,
        assignMode: game.assignMode,
        loversEnabled: !!game.loversEnabled,
        playerCount: players.length,
        userIds: players.map((p) => p.userId).filter((id): id is string => !!id),
        players,
        endedAt: Date.now(),
        // Sonuç yoksa (sözlü modda moderatör eli masada bitirdiyse) el "sonuca
        // bağlanmamış" sayılır; roller yine de kayıtlıdır.
        finished: !!game.winner,
        winner: game.winner,
        dayCount: game.dayNumber,
        rounds: game.roundLog ?? [],
      },
      $setOnInsert: { startedAt: game.startedAt! },
    },
    { upsert: true }
  );
}

/* --------------------------------- Okuma --------------------------------- */

export interface HistoryStats {
  total: number; // toplam el
  finished: number; // sonucu bilinen el
  wins: number;
  losses: number;
  byRole: { roleName: string; count: number }[]; // en çok gelenden aza
}

export interface HistoryResponse {
  matches: MatchRecord[];
  stats: HistoryStats;
}

/** Bir hesabın son maçlarını ve özet istatistiğini döndürür. */
export async function historyForUser(userId: string): Promise<HistoryResponse> {
  const db = await getDb();
  const matches = await db
    .collection<MatchRecord>("matches")
    .find({ userIds: userId })
    .sort({ startedAt: -1 })
    .limit(HISTORY_LIMIT)
    .toArray();

  const roleCounts = new Map<string, number>();
  let finished = 0;
  let wins = 0;
  let losses = 0;
  for (const m of matches) {
    const me = m.players.find((p) => p.userId === userId);
    if (!me) continue;
    const roleName = me.roleName ?? "Bilinmiyor";
    roleCounts.set(roleName, (roleCounts.get(roleName) ?? 0) + 1);
    if (m.finished && me.won !== null) {
      finished++;
      if (me.won) wins++;
      else losses++;
    }
  }

  return {
    matches,
    stats: {
      total: matches.length,
      finished,
      wins,
      losses,
      byRole: [...roleCounts.entries()]
        .map(([roleName, count]) => ({ roleName, count }))
        .sort((a, b) => b.count - a.count),
    },
  };
}
