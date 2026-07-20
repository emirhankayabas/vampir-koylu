"use client";

import { useEffect, useState } from "react";
import { useStream, postAction } from "@/app/_lib/client";
import type { ModeratorView, RoleConfig, Game } from "@/lib/types";

export default function ModeratorPage() {
  const view = useStream<ModeratorView | { error: string }>(
    "/api/stream?role=moderator"
  );

  if (!view) {
    return <FullScreen>Bağlanıyor…</FullScreen>;
  }
  if ("error" in view || !view.game) {
    return (
      <FullScreen>
        <div className="max-w-sm text-center">
          <div className="text-4xl">⚠️</div>
          <p className="mt-3 font-semibold">Veritabanına bağlanılamıyor</p>
          <p className="mt-1 text-sm text-zinc-400">
            MongoDB bağlantısı kurulamadı. Bağlantı adresini (MONGODB_URI) ve
            Atlas kümesinin aktif olduğunu kontrol edin.
          </p>
        </div>
      </FullScreen>
    );
  }

  const game = view.game;

  return (
    <div className="min-h-full bg-zinc-950 px-4 py-6 text-zinc-100">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">🕹️ Moderatör</h1>
          <StatusBadge status={game.status} />
        </header>

        {game.status === "lobby" && <Lobby view={view} />}
        {game.status === "in_progress" && <InProgress view={view} />}
        {game.status === "ended" && <Ended view={view} />}

        <LogPanel game={game} />
      </div>
    </div>
  );
}

/* ----------------------------- LOBİ ----------------------------- */

function Lobby({ view }: { view: ModeratorView }) {
  const game = view.game;
  const [draft, setDraft] = useState<RoleConfig[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Rolleri sunucudan bir kez yükle
  useEffect(() => {
    if (draft === null) setDraft(game.roles);
  }, [game.roles, draft]);

  if (!draft) return null;

  const totalSpecial = draft
    .filter((r) => r.enabled && !r.fill)
    .reduce((s, r) => s + r.count, 0);

  function update(i: number, patch: Partial<RoleConfig>) {
    setDraft((d) => d!.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRole() {
    const key = "rol_" + Math.random().toString(36).slice(2, 7);
    setDraft((d) => [
      ...d!,
      { key, name: "Yeni Rol", team: "koy", enabled: true, count: 1 },
    ]);
  }
  function removeRole(i: number) {
    setDraft((d) => d!.filter((_, idx) => idx !== i));
  }
  async function saveRoles() {
    const res = await postAction("saveRoles", { roles: draft });
    if (!res.ok) setErr(res.error ?? "Kaydedilemedi.");
    else setErr(null);
  }
  async function start() {
    await postAction("saveRoles", { roles: draft });
    const res = await postAction("start");
    if (!res.ok) setErr(res.error ?? "Başlatılamadı.");
    else setErr(null);
  }

  return (
    <div className="space-y-6">
      {/* Mod seçimi */}
      <Section title="Oyun Yönetimi">
        <div className="grid grid-cols-2 gap-2">
          <ModeButton
            active={game.mode === "verbal"}
            onClick={() => postAction("setMode", { mode: "verbal" })}
            label="🗣️ Sözlü"
            desc="Konuşarak yönetilir"
          />
          <ModeButton
            active={game.mode === "phone"}
            onClick={() => postAction("setMode", { mode: "phone" })}
            label="📱 Telefondan"
            desc="Gece/oylama ekrandan"
          />
        </div>
      </Section>

      {/* Roller */}
      <Section title="Roller">
        <div className="space-y-2">
          {draft.map((r, i) => (
            <div
              key={r.key}
              className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-2"
            >
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => update(i, { enabled: e.target.checked })}
                className="size-5 accent-emerald-500"
              />
              <input
                value={r.name}
                onChange={(e) => update(i, { name: e.target.value })}
                disabled={r.builtin}
                className="min-w-0 flex-1 rounded-lg bg-zinc-800 px-2 py-1.5 text-sm outline-none disabled:opacity-70"
              />
              {!r.fill ? (
                <input
                  type="number"
                  min={0}
                  value={r.count}
                  onChange={(e) =>
                    update(i, { count: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-14 rounded-lg bg-zinc-800 px-2 py-1.5 text-center text-sm outline-none"
                />
              ) : (
                <span className="w-14 text-center text-xs text-zinc-500">
                  kalan
                </span>
              )}
              <button
                onClick={() => update(i, { team: r.team === "vampir" ? "koy" : "vampir" })}
                className={`rounded-lg px-2 py-1.5 text-xs font-medium ${
                  r.team === "vampir"
                    ? "bg-red-900/60 text-red-300"
                    : "bg-emerald-900/60 text-emerald-300"
                }`}
              >
                {r.team === "vampir" ? "Vampir" : "Köy"}
              </button>
              {!r.builtin && (
                <button
                  onClick={() => removeRole(i)}
                  className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:text-red-400"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={addRole}
          className="mt-3 w-full rounded-xl border border-dashed border-zinc-700 py-2 text-sm text-zinc-400 hover:bg-zinc-900"
        >
          + Rol ekle
        </button>

        <div className="mt-3 flex items-center justify-between text-sm">
          <span
            className={
              totalSpecial > game.players.length ? "text-red-400" : "text-zinc-400"
            }
          >
            Özel rol: {totalSpecial} / Oyuncu: {game.players.length}
          </span>
          <button
            onClick={saveRoles}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
          >
            Rolleri kaydet
          </button>
        </div>
      </Section>

      {/* Oyuncular */}
      <Section title={`Oyuncular (${game.players.length})`}>
        {game.players.length === 0 ? (
          <p className="text-sm text-zinc-500">Henüz katılan yok.</p>
        ) : (
          <ul className="space-y-1.5">
            {game.players.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-2 text-sm"
              >
                <span>{p.name}</span>
                <button
                  onClick={() => postAction("kick", { targetId: p.id })}
                  className="text-xs text-zinc-500 hover:text-red-400"
                >
                  Çıkar
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="flex gap-2">
        <button
          onClick={start}
          disabled={game.players.length === 0}
          className="flex-1 rounded-xl bg-emerald-600 py-3 text-lg font-semibold hover:bg-emerald-500 disabled:opacity-40"
        >
          ▶️ Başlat
        </button>
        <ResetButton />
      </div>
    </div>
  );
}

/* --------------------------- OYUN SÜRÜYOR --------------------------- */

function InProgress({ view }: { view: ModeratorView }) {
  const game = view.game;
  const alive = game.players.filter((p) => p.alive);
  const [nightPicks, setNightPicks] = useState<Set<string>>(new Set());
  const hunter = game.pendingHunterId
    ? game.players.find((p) => p.id === game.pendingHunterId)
    : null;

  function toggleNight(id: string) {
    setNightPicks((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  async function resolveNight() {
    await postAction("nightResolve", { deaths: [...nightPicks] });
    setNightPicks(new Set());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-3">
        <span className="font-semibold">
          {game.phase === "night" ? "🌙 Gece" : "☀️ Gündüz"} · {game.dayNumber}. gün
        </span>
        <div className="flex gap-2">
          <button
            onClick={() =>
              postAction("setPhase", {
                phase: game.phase === "night" ? "day" : "night",
              })
            }
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700"
          >
            {game.phase === "night" ? "Gündüze geç" : "Geceye geç"}
          </button>
        </div>
      </div>

      {game.winner && (
        <div
          className={`rounded-xl p-3 text-center font-bold ${
            game.winner === "vampir"
              ? "bg-red-900/60 text-red-200"
              : "bg-emerald-900/60 text-emerald-200"
          }`}
        >
          {game.winner === "vampir" ? "🧛 Vampirler kazandı" : "🏡 Köy kazandı"} —
          oyunu bitirebilirsiniz.
        </div>
      )}

      {/* Avcı atışı */}
      {hunter && (
        <Section title={`🏹 Avcı atışı — ${hunter.name}`}>
          <p className="mb-2 text-sm text-zinc-400">
            Avcı bir oyuncuyu öldürebilir.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {alive
              .filter((p) => p.id !== hunter.id)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => postAction("hunterShoot", { targetId: p.id })}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
                >
                  {p.name}
                </button>
              ))}
          </div>
          <button
            onClick={() => postAction("hunterSkip")}
            className="mt-2 w-full rounded-lg bg-zinc-800 py-2 text-sm hover:bg-zinc-700"
          >
            Atış yapmadan geç
          </button>
        </Section>
      )}

      {/* Telefon modu kontrolleri */}
      {game.mode === "phone" && !hunter && (
        <>
          {game.phase === "night" && (
            <Section title="🌙 Gece — ölenleri seç">
              <p className="mb-2 text-sm text-zinc-400">
                Bu gece ölecek oyuncuları işaretleyip geceyi bitir.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {alive.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => toggleNight(p.id)}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      nightPicks.has(p.id)
                        ? "border-red-500 bg-red-950/50 text-red-200"
                        : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <button
                onClick={resolveNight}
                className="mt-3 w-full rounded-xl bg-amber-600 py-2.5 font-semibold hover:bg-amber-500"
              >
                Geceyi bitir → Gündüz
              </button>
            </Section>
          )}

          {game.phase === "day" && (
            <Section title="🗳️ Oylama">
              {!game.vote.active ? (
                <button
                  onClick={() => postAction("voteStart")}
                  className="w-full rounded-xl bg-amber-600 py-2.5 font-semibold hover:bg-amber-500"
                >
                  Oylamayı başlat
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-400">
                    Canlı oylar ({Object.keys(game.vote.votes).length}/
                    {alive.length} oy)
                  </p>
                  {view.tally.length === 0 ? (
                    <p className="text-sm text-zinc-500">Henüz oy yok.</p>
                  ) : (
                    <div className="space-y-2">
                      {view.tally.map((t) => (
                        <div
                          key={t.targetId}
                          className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-2"
                        >
                          <span className="text-sm">
                            {t.targetName}{" "}
                            <span className="text-amber-400">({t.count})</span>
                          </span>
                          <button
                            onClick={() =>
                              postAction("hang", { targetId: t.targetId })
                            }
                            className="rounded-lg bg-red-700 px-3 py-1 text-xs font-medium hover:bg-red-600"
                          >
                            Onayla & As
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => postAction("voteCancel")}
                    className="w-full rounded-lg bg-zinc-800 py-2 text-sm hover:bg-zinc-700"
                  >
                    Oylamayı iptal et
                  </button>
                </div>
              )}
            </Section>
          )}
        </>
      )}

      {game.mode === "verbal" && (
        <p className="rounded-xl bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
          Sözlü mod: oyunu konuşarak yönetin. Ölümleri aşağıdaki listeden
          işaretleyebilirsiniz.
        </p>
      )}

      {/* Oyuncu / rol listesi */}
      <Section title="Oyuncular & Roller">
        <div className="space-y-1.5">
          {game.players.map((p) => (
            <PlayerRow key={p.id} game={game} playerId={p.id} />
          ))}
        </div>
      </Section>

      <div className="flex gap-2">
        <button
          onClick={() => postAction("end")}
          className="flex-1 rounded-xl bg-zinc-700 py-3 font-semibold hover:bg-zinc-600"
        >
          ⏹️ Bitir
        </button>
        <ResetButton />
      </div>
    </div>
  );
}

function PlayerRow({ game, playerId }: { game: Game; playerId: string }) {
  const p = game.players.find((x) => x.id === playerId)!;
  const role = game.roles.find((r) => r.key === p.role);
  const evil = role?.team === "vampir";
  return (
    <div
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
        p.alive ? "bg-zinc-900" : "bg-zinc-900/40"
      }`}
    >
      <span className={p.alive ? "" : "text-zinc-500 line-through"}>
        {p.name}
      </span>
      <div className="flex items-center gap-3">
        <span className={evil ? "text-red-400" : "text-emerald-400"}>
          {role?.name ?? "—"}
        </span>
        <button
          onClick={() => postAction("toggleKill", { targetId: p.id })}
          className="rounded-lg bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
        >
          {p.alive ? "Öldür" : "Dirilt"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ BİTTİ ------------------------------ */

function Ended({ view }: { view: ModeratorView }) {
  const game = view.game;
  return (
    <div className="space-y-6">
      <div
        className={`rounded-xl p-4 text-center text-xl font-bold ${
          game.winner === "vampir"
            ? "bg-red-900/60 text-red-200"
            : "bg-emerald-900/60 text-emerald-200"
        }`}
      >
        {game.winner === "vampir"
          ? "🧛 Vampirler kazandı"
          : game.winner === "koy"
            ? "🏡 Köy kazandı"
            : "Oyun bitti"}
      </div>

      <Section title="Roller">
        <div className="space-y-1.5">
          {game.players.map((p) => (
            <PlayerRow key={p.id} game={game} playerId={p.id} />
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          onClick={() => postAction("newRound")}
          className="rounded-xl bg-emerald-600 py-3 font-semibold hover:bg-emerald-500"
        >
          🔄 Yeni el (aynı oyuncular)
        </button>
        <button
          onClick={() => postAction("backToLobby")}
          className="rounded-xl bg-zinc-700 py-3 font-semibold hover:bg-zinc-600"
        >
          🏠 Lobiye dön
        </button>
        <ResetButton />
      </div>
    </div>
  );
}

/* ------------------------------ Ortak ------------------------------ */

function ResetButton() {
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="rounded-xl bg-red-900/70 px-4 py-3 font-semibold text-red-200 hover:bg-red-900"
      >
        🗑️ Sıfırla
      </button>
    );
  }
  return (
    <div className="flex gap-1">
      <button
        onClick={() => {
          postAction("reset");
          setConfirm(false);
        }}
        className="rounded-xl bg-red-700 px-3 py-3 text-sm font-semibold hover:bg-red-600"
      >
        Emin misin?
      </button>
      <button
        onClick={() => setConfirm(false)}
        className="rounded-xl bg-zinc-800 px-3 py-3 text-sm"
      >
        Vazgeç
      </button>
    </div>
  );
}

function LogPanel({ game }: { game: Game }) {
  if (game.log.length === 0) return null;
  return (
    <details className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
      <summary className="cursor-pointer text-sm text-zinc-400">
        Olay geçmişi
      </summary>
      <ul className="mt-2 space-y-1 text-xs text-zinc-500">
        {game.log.map((l, i) => (
          <li key={i}>
            {new Date(l.at).toLocaleTimeString("tr-TR", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            — {l.text}
          </li>
        ))}
      </ul>
    </details>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      {children}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition ${
        active
          ? "border-emerald-500 bg-emerald-950/40"
          : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
      }`}
    >
      <div className="font-semibold">{label}</div>
      <div className="text-xs text-zinc-500">{desc}</div>
    </button>
  );
}

function StatusBadge({ status }: { status: Game["status"] }) {
  const map: Record<Game["status"], { t: string; c: string }> = {
    lobby: { t: "Lobi", c: "bg-blue-900/60 text-blue-200" },
    in_progress: { t: "Oyunda", c: "bg-emerald-900/60 text-emerald-200" },
    ended: { t: "Bitti", c: "bg-zinc-800 text-zinc-300" },
  };
  const s = map[status];
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${s.c}`}>
      {s.t}
    </span>
  );
}
