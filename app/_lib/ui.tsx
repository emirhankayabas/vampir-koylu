"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeftIcon, CopyIcon, CheckIcon, CrownIcon, BatIcon, JesterIcon } from "@/app/_lib/icons";
import type { Phase, Winner } from "@/lib/types";

/* ============================================================
   Kazanma ekranı teması — oyuncu ve moderatör ekranları aynı
   renk/başlık/ikon takımını paylaşsın diye tek yerde.
   ============================================================ */

export interface WinnerTheme {
  decided: boolean; // sonuç belli mi (yoksa "Oyun Bitti")
  accent: string; // hale/kenarlık rengi
  textColor: string; // başlık rengi
  iconColor: string;
  palette: string[]; // konfeti renkleri
  Icon: (p: { size?: number; strokeWidth?: number }) => React.ReactElement;
  title: string;
  subtitle: string;
}

export function winnerTheme(winner: Winner | null): WinnerTheme {
  const jester = winner === "soytari";
  const evil = winner === "vampir";
  const village = winner === "koy";
  return {
    decided: jester || evil || village,
    accent: jester ? "#ec4899" : evil ? "#ef4444" : "#34d399",
    textColor: jester ? "#f9a8d4" : evil ? "#fca5a5" : "#6ee7b7",
    iconColor: jester ? "#f9a8d4" : evil ? "#fca5a5" : "#fde68a",
    palette: jester
      ? ["#ec4899", "#f472b6", "#a855f7", "#f59e0b", "#ffffff"]
      : evil
        ? ["#ef4444", "#b91c1c", "#a855f7", "#fca5a5", "#f59e0b"]
        : ["#34d399", "#6ee7b7", "#22d3ee", "#f59e0b", "#ffffff"],
    Icon: jester ? JesterIcon : evil ? BatIcon : CrownIcon,
    title: jester ? "Soytarı Kazandı" : evil ? "Vampirler Kazandı" : village ? "Köy Kazandı" : "Oyun Bitti",
    subtitle: jester
      ? "Herkesi kandırıp darağacına çıktı."
      : evil
        ? "Karanlık köyü ele geçirdi."
        : village
          ? "Köy şafağa kavuştu."
          : "El sona erdi.",
  };
}

/* ============================================================
   Modal sistemi — ortada açılan, arka planı karartan diyalog.
   Onay gerektiren tüm olaylar (odayı kapat, sıfırla, çıkış…) bunu kullanır.
   ============================================================ */

export function Modal({
  open,
  onClose,
  children,
  maxW = "max-w-xs",
}: {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  maxW?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className={`panel w-full ${maxW} p-5 text-center`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* Standart onay modalı — başlık, açıklama ve Evet/Vazgeç düğmeleri. */
export function ConfirmModal({
  open,
  title,
  body,
  icon,
  confirmLabel = "Evet",
  cancelLabel = "Vazgeç",
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  icon?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={busy ? undefined : onCancel}>
      {icon && <div className="text-4xl">{icon}</div>}
      <p className="mt-2 font-display text-lg font-bold">{title}</p>
      {body && <p className="mt-1 text-sm text-[var(--muted)]">{body}</p>}
      <div className="mt-4 flex gap-2">
        <button onClick={onConfirm} disabled={busy} className={`btn ${danger ? "btn-blood" : "btn-emerald"} flex-1`}>
          {busy ? "İşleniyor…" : confirmLabel}
        </button>
        <button onClick={onCancel} disabled={busy} className="btn btn-ghost flex-1">{cancelLabel}</button>
      </div>
    </Modal>
  );
}

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
          <div className="sun-rays spin-slow" />
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
        <button onClick={back} className="iconbtn" aria-label="Geri">
          <ArrowLeftIcon size={18} />
        </button>
        {showCode && (
          <button
            onClick={copy}
            className="flex items-center gap-1.5 rounded-lg py-1 pl-2 pr-1 transition active:scale-95"
            aria-label="Oda kodunu kopyala"
          >
            <span
              className="text-sm font-semibold text-[var(--muted)]"
              style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)", letterSpacing: "0.06em" }}
            >
              {code}
            </span>
            <span className={copied ? "text-[var(--emerald)]" : "text-[var(--faint)]"}>
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            </span>
          </button>
        )}
      </div>

      <ConfirmModal
        open={confirm}
        icon="🚪"
        title="Oyundan çıkılsın mı?"
        body="Bu odadan ayrılacaksın. Aynı kodla tekrar girebilirsin."
        confirmLabel="Çık"
        onConfirm={() => router.push("/")}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
