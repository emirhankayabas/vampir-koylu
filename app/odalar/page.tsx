"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { postAction, saveModeratorRoom } from "@/app/_lib/client";
import { Spinner } from "@/app/_lib/ui";
import { ArrowLeftIcon, LockIcon, PlayIcon, RefreshIcon, MoonIcon, SunIcon } from "@/app/_lib/icons";
import type { RoomSummary } from "@/lib/types";

const POLL_MS = 3000;

const STATUS: Record<RoomSummary["status"], { label: string; color: string; bg: string }> = {
  lobby: { label: "Lobi", color: "#c4b5fd", bg: "rgba(168,85,247,0.16)" },
  in_progress: { label: "Oyunda", color: "#fca5a5", bg: "rgba(239,68,68,0.16)" },
  ended: { label: "Bitti", color: "#94a3b8", bg: "rgba(148,163,184,0.16)" },
};

export default function OdalarPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  // Yenile/tekrar-dene düğmeleri bu sayacı artırır; efekt yeniden çalışıp taze veri çeker.
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Uçuşta istek varken ikinci bir döngü başlamasın (sekme değişimlerinde
    // yoklama sayısı katlanmasın).
    let inFlight = false;

    const poll = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch("/api/rooms", { cache: "no-store" });
        const data = await res.json();
        if (!stopped) {
          if (data.rooms) {
            setRooms(data.rooms as RoomSummary[]);
            setError(false);
          } else {
            setError(true);
          }
        }
      } catch {
        if (!stopped) setError(true);
      } finally {
        inFlight = false;
        if (timer) clearTimeout(timer);
        if (!stopped) timer = setTimeout(poll, POLL_MS);
      }
    };

    poll();
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reloadKey]);

  async function createRoom() {
    setCreating(true);
    const res = await postAction("createRoom");
    if (res.ok && res.code) {
      saveModeratorRoom(res.code); // sekme kapansa da panele geri dönebilsin
      router.push(`/moderator/${res.code}`);
    } else setCreating(false);
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 safe-b">
      <div className="mb-5 flex items-center justify-between">
        <button onClick={() => router.push("/")} className="iconbtn" aria-label="Geri">
          <ArrowLeftIcon size={18} />
        </button>
        <button onClick={refresh} className="iconbtn" aria-label="Yenile">
          <RefreshIcon size={18} />
        </button>
      </div>

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6 text-center">
        <h1 className="font-display title-glow text-3xl font-black">Mevcut Oyunlar</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Bir odaya dokunup içine gir.</p>
      </motion.div>

      {rooms === null && !error && (
        <div className="py-16"><Spinner label="Odalar yükleniyor…" /></div>
      )}

      {error && rooms === null && (
        <div className="panel p-6 text-center">
          <div className="text-4xl">⚠️</div>
          <p className="mt-2 font-semibold">Odalar alınamadı</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Bağlantıyı kontrol edip tekrar deneyin.</p>
          <button onClick={refresh} className="btn btn-violet mt-4 inline-flex">Tekrar dene</button>
        </div>
      )}

      {rooms !== null && rooms.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panel p-8 text-center">
          <div className="text-5xl float-slow">🏚️</div>
          <p className="mt-3 font-semibold">Şu an açık oda yok</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Aşağıdan yeni bir oda kurabilirsin.</p>
          <p className="mx-auto mt-3 max-w-xs text-xs leading-snug text-[var(--faint)]">
            🕐 Odalar, <b className="text-[var(--muted)]">1 saat</b> boyunca kimse katılmaz veya oyun başlamazsa otomatik kapanır.
          </p>
        </motion.div>
      )}

      {rooms !== null && rooms.length > 0 && (
        <ul className="space-y-2.5">
          {rooms.map((r, i) => (
            <RoomRow key={r.code} r={r} i={i} onOpen={() => router.push(`/oyna/${r.code}`)} />
          ))}
        </ul>
      )}

      <button onClick={createRoom} disabled={creating} className="btn btn-blood btn-lg mt-6 w-full">
        <PlayIcon size={20} />
        {creating ? "Oda kuruluyor…" : "Yeni Oyun Oluştur"}
      </button>
    </div>
  );
}

function RoomRow({ r, i, onOpen }: { r: RoomSummary; i: number; onOpen: () => void }) {
  const st = STATUS[r.status];
  const title = r.name?.trim() || `Oda ${r.code}`;
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i * 0.04, 0.4) }}
    >
      <button
        onClick={onOpen}
        className="panel flex w-full items-center gap-3 p-4 text-left transition active:scale-[0.99]"
        style={{ borderColor: `${st.color}44` }}
      >
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
          style={{ background: r.mode === "phone" ? "rgba(34,211,238,0.12)" : "rgba(245,158,11,0.12)", color: r.mode === "phone" ? "#22d3ee" : "#f59e0b" }}
        >
          {r.status === "in_progress" ? (r.phase === "night" ? <MoonIcon size={24} /> : <SunIcon size={24} />) : <span className="text-2xl">🎭</span>}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-lg font-bold">{title}</span>
            {r.hasPassword && (
              <span className="shrink-0 text-[var(--amber)]" title="Şifreli oda"><LockIcon size={15} /></span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--faint)]">
            <span className="font-mono tracking-wide">#{r.code}</span>
            <span>·</span>
            <span>{r.playerCount} oyuncu</span>
            <span>·</span>
            <span>{r.mode === "phone" ? "📱 Telefon" : "🗣️ Sözlü"}</span>
          </div>
        </div>

        <span className="badge shrink-0" style={{ background: st.bg, color: st.color }}>{st.label}</span>
      </button>
    </motion.li>
  );
}
