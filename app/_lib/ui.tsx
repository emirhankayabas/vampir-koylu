"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import type { Phase } from "@/lib/types";

/* Gece/gündüz sahnesi — tam ekran arka plan, faza göre çapraz geçiş.
   Gece: kararır, ay çıkar. Gündüz: aydınlanır, güneş çıkar. */
export function SceneBackdrop({ phase }: { phase: Phase }) {
  return (
    <div className="scene" aria-hidden>
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: phase === "night" ? 1 : 0 }}
        transition={{ duration: 1.2 }}
        style={{ background: "radial-gradient(135% 80% at 50% -18%, #18122f 0%, #0a0715 55%, #04030a 100%)" }}
      >
        <motion.div className="disc moon-disc" animate={{ y: [0, -6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />
      </motion.div>
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: phase === "day" ? 1 : 0 }}
        transition={{ duration: 1.2 }}
        style={{
          background:
            "radial-gradient(135% 85% at 50% -20%, rgba(251,191,36,0.42) 0%, rgba(236,72,153,0.14) 32%, transparent 62%), linear-gradient(180deg, #2a1e46 0%, #0a0715 100%)",
        }}
      >
        <div className="disc sun-disc">
          <div className="absolute inset-[-40%] spin-slow" style={{ background: "conic-gradient(from 0deg, transparent 0 8deg, rgba(251,191,36,0.22) 8deg 12deg, transparent 12deg 30deg)" }} />
        </div>
      </motion.div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="text-center">
      <motion.div className="mx-auto text-4xl" animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
        🌙
      </motion.div>
      {label && <p className="mt-3 text-sm text-[var(--muted)]">{label}</p>}
    </div>
  );
}

/* Üst çubuk: sol üstte geri tuşu (oyundayken uyarır), sağda oda kodu. */
export function TopBar({ code, inGame, showCode = true }: { code: string; inGame: boolean; showCode?: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  function back() {
    if (inGame) setConfirm(true);
    else router.push("/");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* yok say */
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={back} className="iconbtn" aria-label="Geri">←</button>
        {showCode && (
          <button onClick={copy} className="panel-tight flex items-center gap-2 border border-[var(--panel-line)] px-3 py-1.5" style={{ borderRadius: 12 }}>
            <span className="text-[10px] uppercase tracking-wider text-[var(--faint)]">Oda</span>
            <span className="code-chip text-sm text-[var(--ink)]">{code}</span>
            <span className="text-xs text-[var(--faint)]">{copied ? "✓" : "⧉"}</span>
          </button>
        )}
      </div>

      {confirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
          onClick={() => setConfirm(false)}
        >
          <motion.div
            initial={{ scale: 0.9, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="panel w-full max-w-xs p-5 text-center"
          >
            <div className="text-4xl">🚪</div>
            <p className="mt-2 font-display text-lg font-bold">Oyundan çıkılsın mı?</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Bu odadan ayrılacaksın. Aynı kodla tekrar girebilirsin.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => router.push("/")} className="btn btn-blood flex-1">Çık</button>
              <button onClick={() => setConfirm(false)} className="btn btn-ghost flex-1">Vazgeç</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
