import { NextRequest, NextResponse } from "next/server";
import {
  getGame,
  saveGame,
  makeFreshGame,
  assignRoles,
  checkWinner,
  log,
} from "@/lib/game";
import type { Game, RoleConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
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
  const game = await getGame();

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
      return NextResponse.json({ ok: true, playerId: id });
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
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    case "unvote": {
      const playerId = String(body.playerId ?? "");
      delete game.vote.votes[playerId];
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    // --- Moderatör: lobi ---
    case "setMode": {
      const mode = body.mode === "phone" ? "phone" : "verbal";
      game.mode = mode;
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    case "saveRoles": {
      if (game.status === "in_progress") return bad("Oyun sürerken roller değiştirilemez.");
      const roles = body.roles as RoleConfig[];
      if (!Array.isArray(roles) || roles.length === 0) return bad("Rol listesi geçersiz.");
      if (!roles.some((r) => r.fill && r.enabled)) return bad("Aktif bir dolgu rolü (Köylü) olmalı.");
      // Anahtar benzersizliği
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
      return NextResponse.json({ ok: true });
    }

    case "kick": {
      if (game.status === "in_progress") return bad("Oyun sürerken oyuncu çıkarılamaz.");
      const targetId = String(body.targetId ?? "");
      const before = game.players.length;
      game.players = game.players.filter((p) => p.id !== targetId);
      if (game.players.length < before) log(game, "Bir oyuncu çıkarıldı.");
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    // --- Moderatör: oyun akışı ---
    case "start":
    case "newRound": {
      const res = assignRoles(game);
      if (!res.ok) return bad(res.error!);
      game.status = "in_progress";
      game.phase = "night";
      game.dayNumber = 1;
      game.winner = null;
      game.pendingHunterId = null;
      game.vote = { active: false, votes: {} };
      log(game, action === "newRound" ? "Yeni el başladı." : "Oyun başladı. Roller dağıtıldı.");
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    case "setPhase": {
      const phase = body.phase === "day" ? "day" : "night";
      if (phase === "night") game.dayNumber += 1;
      game.phase = phase;
      game.vote = { active: false, votes: {} };
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    case "nightResolve": {
      // Moderatör gece kimlerin öldüğünü seçer
      const deaths = Array.isArray(body.deaths) ? (body.deaths as string[]) : [];
      const names: string[] = [];
      for (const id of deaths) {
        const killed = killPlayer(game, id);
        if (killed) names.push(game.players.find((p) => p.id === killed)!.name);
      }
      game.phase = "day";
      log(game, names.length ? `Gece ${names.join(", ")} öldü.` : "Gece kimse ölmedi.");
      game.winner = checkWinner(game);
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    case "voteStart": {
      game.phase = "day";
      game.vote = { active: true, votes: {} };
      log(game, "Oylama başladı.");
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    case "voteCancel": {
      game.vote = { active: false, votes: {} };
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    case "hang": {
      // Moderatör onayı ile asma
      const targetId = String(body.targetId ?? "");
      const target = game.players.find((p) => p.id === targetId);
      if (!target) return bad("Oyuncu bulunamadı.");
      killPlayer(game, targetId);
      game.vote = { active: false, votes: {} };
      log(game, `${target.name} asıldı.`);
      // Avcı asıldıysa atış hakkı
      const role = game.roles.find((r) => r.key === target.role);
      if (role?.special === "avci") {
        game.pendingHunterId = target.id;
        log(game, `${target.name} (Avcı) atış hakkı kazandı.`);
      }
      game.winner = checkWinner(game);
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    case "hunterShoot": {
      if (!game.pendingHunterId) return bad("Bekleyen avcı yok.");
      const targetId = String(body.targetId ?? "");
      const target = game.players.find((p) => p.id === targetId);
      if (target) {
        killPlayer(game, targetId);
        log(game, `Avcı ${target.name}'i vurdu.`);
      }
      game.pendingHunterId = null;
      game.winner = checkWinner(game);
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    case "hunterSkip": {
      game.pendingHunterId = null;
      log(game, "Avcı atış yapmadı.");
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    case "toggleKill": {
      // Moderatör manuel öldür/dirilt (esneklik için)
      const targetId = String(body.targetId ?? "");
      const p = game.players.find((x) => x.id === targetId);
      if (!p) return bad("Oyuncu bulunamadı.");
      p.alive = !p.alive;
      log(game, `${p.name} ${p.alive ? "diriltildi" : "öldürüldü"}.`);
      game.winner = checkWinner(game);
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    case "end": {
      game.status = "ended";
      game.vote = { active: false, votes: {} };
      game.pendingHunterId = null;
      if (!game.winner) game.winner = checkWinner(game);
      log(game, "Oyun bitti.");
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    case "backToLobby": {
      // Oyuncular kalır, roller sıfırlanır; yeni katılımcılar girebilir
      game.status = "lobby";
      game.winner = null;
      game.pendingHunterId = null;
      game.vote = { active: false, votes: {} };
      game.players.forEach((p) => {
        p.role = null;
        p.alive = true;
      });
      log(game, "Lobiye dönüldü.");
      await saveGame(game);
      return NextResponse.json({ ok: true });
    }

    case "reset": {
      const fresh = makeFreshGame();
      fresh.roles = game.roles; // rol yapılandırmasını koru
      fresh.mode = game.mode;
      fresh.version = game.version; // saveGame +1 yapacak
      log(fresh, "Oyun sıfırlandı.");
      await saveGame(fresh);
      return NextResponse.json({ ok: true });
    }

    default:
      return bad("Bilinmeyen aksiyon: " + action);
  }
}
