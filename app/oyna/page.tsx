"use client";

import { useEffect, useState } from "react";
import { useStream, postAction } from "@/app/_lib/client";
import type { ParticipantView } from "@/lib/types";

const STORAGE_KEY = "vk_player_id";

export default function OynaPage() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPlayerId(localStorage.getItem(STORAGE_KEY));
    setReady(true);
  }, []);

  const url = ready
    ? `/api/stream${playerId ? `?playerId=${playerId}` : ""}`
    : null;
  const raw = useStream<ParticipantView | { error: string }>(url);
  const dbError = !!raw && "error" in raw;
  const view = raw && !("error" in raw) ? raw : null;

  // Kick / reset tespiti: sunucuda artık yoksak kimliği temizle
  useEffect(() => {
    if (view && playerId && !view.exists) {
      localStorage.removeItem(STORAGE_KEY);
      setPlayerId(null);
    }
  }, [view, playerId]);

  async function join() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const res = await postAction("join", { name: trimmed });
    setBusy(false);
    if (res.ok && res.playerId) {
      localStorage.setItem(STORAGE_KEY, res.playerId);
      setPlayerId(res.playerId);
    } else {
      setError(res.error ?? "Katılım başarısız.");
    }
  }

  if (dbError) {
    return (
      <Center>
        <div className="max-w-xs text-center">
          <div className="text-4xl">⚠️</div>
          <p className="mt-3 font-semibold">Sunucuya bağlanılamıyor</p>
          <p className="mt-1 text-sm text-zinc-400">
            Lütfen biraz sonra tekrar deneyin.
          </p>
        </div>
      </Center>
    );
  }

  if (!ready || !view) {
    return <Center>Bağlanıyor…</Center>;
  }

  // --- Katılmamış / çıkarılmış ---
  if (!view.self) {
    if (view.status !== "lobby") {
      return (
        <Center>
          <div className="text-center">
            <div className="text-5xl">⏳</div>
            <p className="mt-4 text-lg">Oyun devam ediyor.</p>
            <p className="mt-1 text-zinc-400">
              Yeni oyunun başlamasını bekleyin.
            </p>
          </div>
        </Center>
      );
    }
    return (
      <Center>
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <div className="text-5xl">🧛</div>
            <h1 className="mt-3 text-2xl font-bold">Oyuna Katıl</h1>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="İsminiz"
            maxLength={24}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-lg outline-none focus:border-emerald-500"
          />
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <button
            onClick={join}
            disabled={busy || !name.trim()}
            className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-lg font-semibold transition hover:bg-emerald-500 disabled:opacity-40"
          >
            {busy ? "Katılıyor…" : "Katıl"}
          </button>
        </div>
      </Center>
    );
  }

  const self = view.self;

  // --- Lobi: beklemede ---
  if (view.status === "lobby") {
    return (
      <Center>
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl">👋</div>
          <p className="mt-3 text-xl font-semibold">Merhaba {self.name}</p>
          <p className="mt-1 text-zinc-400">
            Moderatörün oyunu başlatması bekleniyor…
          </p>
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left">
            <p className="mb-2 text-sm text-zinc-500">
              Oyuncular ({view.players.length})
            </p>
            <ul className="space-y-1">
              {view.players.map((p) => (
                <li key={p.id} className="text-sm">
                  {p.name}
                  {p.id === self.id && (
                    <span className="text-emerald-400"> (sen)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Center>
    );
  }

  // --- Oyun bitti: roller açık ---
  if (view.status === "ended") {
    return (
      <div className="min-h-full bg-zinc-950 px-5 py-10 text-zinc-100">
        <div className="mx-auto max-w-md">
          <WinnerBanner winner={view.winner} />
          <RoleCard self={self} big={false} />
          {view.reveal && (
            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="mb-3 text-sm text-zinc-500">Roller</p>
              <ul className="space-y-2">
                {view.reveal.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className={r.alive ? "" : "text-zinc-500 line-through"}>
                      {r.name}
                    </span>
                    <span
                      className={
                        r.team === "vampir" ? "text-red-400" : "text-emerald-400"
                      }
                    >
                      {r.roleName ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-6 text-center text-zinc-500">
            Yeni oyunun başlamasını bekleyin…
          </p>
        </div>
      </div>
    );
  }

  // --- Oyun sürüyor ---
  return (
    <div className="min-h-full bg-zinc-950 px-5 py-10 text-zinc-100">
      <div className="mx-auto max-w-md">
        {view.winner && <WinnerBanner winner={view.winner} />}
        <RoleCard self={self} big />

        {!self.alive && (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-4 text-center text-red-300">
            💀 Öldünüz. İzlemeye devam edin.
          </div>
        )}

        {/* Telefon modunda oylama */}
        {view.mode === "phone" && view.vote.active && self.alive && (
          <VotePanel view={view} selfId={self.id} />
        )}

        {view.mode === "phone" && !view.vote.active && self.alive && (
          <p className="mt-6 text-center text-zinc-500">
            {view.phase === "night"
              ? "🌙 Gece — moderatörü bekleyin."
              : "☀️ Gündüz — oylama bekleniyor."}
          </p>
        )}

        {view.mode === "verbal" && self.alive && (
          <p className="mt-6 text-center text-zinc-500">
            Oyun sözlü yönetiliyor. Moderatörü dinleyin.
          </p>
        )}
      </div>
    </div>
  );
}

function VotePanel({
  view,
  selfId,
}: {
  view: ParticipantView;
  selfId: string;
}) {
  const [busy, setBusy] = useState(false);
  async function vote(targetId: string) {
    setBusy(true);
    if (view.vote.myVote === targetId) {
      await postAction("unvote", { playerId: selfId });
    } else {
      await postAction("vote", { playerId: selfId, targetId });
    }
    setBusy(false);
  }
  const others = view.players.filter((p) => p.alive);
  return (
    <div className="mt-6">
      <p className="mb-2 text-center text-sm text-zinc-400">
        🗳️ Kimin asılacağına oy verin
      </p>
      <div className="grid grid-cols-2 gap-2">
        {others.map((p) => {
          const mine = view.vote.myVote === p.id;
          return (
            <button
              key={p.id}
              disabled={busy}
              onClick={() => vote(p.id)}
              className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${
                mine
                  ? "border-amber-400 bg-amber-500/20 text-amber-200"
                  : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
              } ${p.id === selfId ? "opacity-60" : ""}`}
            >
              {p.name}
              {p.id === selfId && " (sen)"}
            </button>
          );
        })}
      </div>
      {view.vote.myVote && (
        <p className="mt-2 text-center text-xs text-zinc-500">
          Oyunuzu değiştirmek için tekrar dokunun.
        </p>
      )}
    </div>
  );
}

function RoleCard({
  self,
  big,
}: {
  self: NonNullable<ParticipantView["self"]>;
  big: boolean;
}) {
  const role = self.role;
  const evil = role?.team === "vampir";
  return (
    <div
      className={`rounded-2xl border p-6 text-center ${
        evil
          ? "border-red-800 bg-gradient-to-b from-red-950 to-zinc-950"
          : "border-emerald-800 bg-gradient-to-b from-emerald-950 to-zinc-950"
      }`}
    >
      <p className="text-sm text-zinc-400">Rolünüz</p>
      <p
        className={`mt-1 font-bold ${big ? "text-4xl" : "text-2xl"} ${
          evil ? "text-red-300" : "text-emerald-300"
        }`}
      >
        {role?.name ?? "—"}
      </p>
      <p className="mt-2 text-sm text-zinc-500">
        {evil ? "🧛 Vampir takımı" : "🏡 Köy takımı"}
      </p>
    </div>
  );
}

function WinnerBanner({ winner }: { winner: ParticipantView["winner"] }) {
  if (!winner) return null;
  const evil = winner === "vampir";
  return (
    <div
      className={`mb-5 rounded-xl p-4 text-center text-lg font-bold ${
        evil ? "bg-red-900/60 text-red-200" : "bg-emerald-900/60 text-emerald-200"
      }`}
    >
      {evil ? "🧛 Vampirler kazandı!" : "🏡 Köy kazandı!"}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-950 px-5 py-10 text-zinc-100">
      {children}
    </div>
  );
}
