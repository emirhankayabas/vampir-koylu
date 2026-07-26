"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { listLocalSessions, forgetRoom, postAction, type LocalSession } from "@/app/_lib/client";
import { ConfirmModal } from "@/app/_lib/ui";
import { MoonIcon, SunIcon, LockIcon, PlayIcon } from "@/app/_lib/icons";
import type { SessionSummary } from "@/lib/types";

/* ============================================================
   "Devam eden odalarım" — ana sayfadaki yeniden bağlanma kartı.

   Sekmesi kapanan, sayfayı yenileyen ya da bağlantısı kopan oyuncu odadan
   ATILMAZ; sunucuda hâlâ oyunun içindedir. Bu kart, tarayıcıda duran oda
   kaydını sunucudaki güncel durumla eşleyip geri dönüş yolu sunar.

   Oda kapandıysa (moderatör kapattı ya da 1 saat işlem görmedi) sunucu o odayı
   hiç döndürmez — kaydı sessizce siliyoruz, yani herkes otomatik düşüyor.
   ============================================================ */

type Row = SessionSummary & { moderator: boolean; playerId: string | null };

/** Kayıtlı odaların sunucudaki güncel durumunu sorar. Hata olursa null döner
 *  (bu durumda hiçbir yerel kayda dokunmayız — ağ hatası oda kapandı demek değil). */
async function fetchSessions(local: LocalSession[]): Promise<SessionSummary[] | null> {
  if (local.length === 0) return [];
  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rooms: local.map((s) => ({ code: s.code, playerId: s.playerId })) }),
      cache: "no-store",
    });
    const data = await res.json();
    return Array.isArray(data.sessions) ? (data.sessions as SessionSummary[]) : null;
  } catch {
    return null;
  }
}

/** Sunucu yanıtını kartlara çevirir; gösterilmeyecek odaların kodlarını da
 *  ayrıca döndürür (çağıran onları yerel kayıttan siler). */
function toRows(local: LocalSession[], live: SessionSummary[]): { rows: Row[]; drop: string[] } {
  const byCode = new Map(local.map((s) => [s.code, s]));
  const liveCodes = new Set(live.map((s) => s.code));
  // Sunucunun hiç döndürmediği odalar kapanmıştır (silindi ya da bayatladı).
  const drop = local.filter((s) => !liveCodes.has(s.code)).map((s) => s.code);

  const rows: Row[] = [];
  for (const s of live) {
    const mine = byCode.get(s.code);
    const row: Row = { ...s, moderator: mine?.moderator ?? false, playerId: mine?.playerId ?? null };
    // Odada değilim ve lobi de kapalıysa (oyun sürüyor/bitti) çıkarılmışım
    // demektir — kartın anlamı kalmaz.
    if (!row.moderator && !row.exists && row.status !== "lobby") drop.push(s.code);
    else rows.push(row);
  }
  return { rows, drop };
}

export function ActiveSessions() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [leaving, setLeaving] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  // Yenileme tetikleyicisi: her artışta efekt yeniden çalışıp taze veri çeker.
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const local = listLocalSessions();
      const live = await fetchSessions(local);
      if (cancelled || !live) return;
      const { rows: next, drop } = toRows(local, live);
      for (const code of drop) forgetRoom(code);
      setRows(next);
    };
    load();

    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tick]);

  function open(row: Row) {
    router.push(row.moderator ? `/moderator/${row.code}` : `/oyna/${row.code}`);
  }

  async function confirmLeave() {
    if (!leaving) return;
    setBusy(true);
    // Lobideyken sunucudan da düşelim: aksi halde "hayalet oyuncu" olarak
    // kalır ve oyun başlayınca ona da rol dağıtılır (gece akışı kilitlenir).
    // Süren elde oyuncu listede kalır — çıkarmak rol dengesini bozardı.
    if (leaving.playerId && leaving.status === "lobby") {
      await postAction("leave", { code: leaving.code, playerId: leaving.playerId });
    }
    forgetRoom(leaving.code);
    setBusy(false);
    setLeaving(null);
    refresh();
  }

  if (rows.length === 0) return null;

  return (
    <>
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-[var(--faint)]">
          Devam eden odaların
        </p>
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <SessionCard key={r.code} row={r} onOpen={() => open(r)} onLeave={() => setLeaving(r)} />
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      <ConfirmModal
        open={!!leaving}
        icon="🚪"
        title="Odadan çıkılsın mı?"
        body={
          leaving?.moderator
            ? "Bu oda listenden kaldırılır. Oda kapanmaz — kodu bilen herkes girmeye devam edebilir."
            : leaving?.status === "lobby"
              ? "Lobiden çıkarılacaksın. İstersen aynı kodla tekrar katılabilirsin."
              : "Oda listenden kaldırılır. Oyun sürdüğü için moderatörün ekranında hâlâ görünürsün."
        }
        confirmLabel="Çık"
        busy={busy}
        onConfirm={confirmLeave}
        onCancel={() => setLeaving(null)}
      />
    </>
  );
}

const STATUS: Record<SessionSummary["status"], { label: string; color: string; bg: string }> = {
  lobby: { label: "Lobide", color: "#c4b5fd", bg: "rgba(168,85,247,0.16)" },
  in_progress: { label: "Oyunda", color: "#fca5a5", bg: "rgba(239,68,68,0.16)" },
  ended: { label: "Bitti", color: "#94a3b8", bg: "rgba(148,163,184,0.16)" },
};

function SessionCard({ row, onOpen, onLeave }: { row: Row; onOpen: () => void; onLeave: () => void }) {
  const st = STATUS[row.status];
  const playing = row.status === "in_progress";
  // Odada değilim ama lobi açık → yeniden katılabilirim (kick/sıfırlama sonrası).
  const rejoin = !row.moderator && !row.exists;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="panel flex items-center gap-3 p-3.5 text-left"
      style={{ borderColor: `${st.color}55` }}
    >
      <div
        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
        style={{
          background: playing ? "rgba(34,211,238,0.12)" : "rgba(168,85,247,0.12)",
          color: playing ? "#22d3ee" : "#c4b5fd",
        }}
      >
        {playing ? (row.phase === "night" ? <MoonIcon size={22} /> : <SunIcon size={22} />) : <span className="text-xl">🎭</span>}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-display font-bold">{row.name?.trim() || `Oda ${row.code}`}</span>
          {row.hasPassword && (
            <span className="shrink-0 text-[var(--amber)]" title="Şifreli oda"><LockIcon size={13} /></span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[var(--faint)]">
          <span className="font-mono">#{row.code}</span>
          <span>·</span>
          <span className="badge !px-1.5 !py-0.5 !text-[10px]" style={{ background: st.bg, color: st.color }}>{st.label}</span>
          {row.moderator ? (
            <>
              <span>·</span>
              <span className="text-[var(--violet)]">🕹️ Moderatörsün</span>
            </>
          ) : rejoin ? (
            <>
              <span>·</span>
              <span className="text-[var(--amber)]">artık odada değilsin</span>
            </>
          ) : (
            <>
              <span>·</span>
              <span>{row.playerName}</span>
              {playing && !row.alive && <span className="text-[var(--blood)]">· öldün</span>}
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button onClick={onOpen} className="btn btn-violet !px-3 !py-2 text-sm">
          <PlayIcon size={14} />
          {rejoin ? "Katıl" : "Dön"}
        </button>
        <button
          onClick={onLeave}
          className="iconbtn !h-9 !w-9 text-[var(--faint)] transition hover:text-[var(--blood)]"
          aria-label="Odadan çık"
          title="Odadan çık"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}
