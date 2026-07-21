"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import type { RoleConfig } from "@/lib/types";

/* ============================================================
   Vampir Köylü — Özel ikon seti
   Tutarlı, çizgi tabanlı (line) ikonlar. currentColor ile
   vurgu rengine boyanır. Emoji yerine bunları kullanıyoruz.
   ============================================================ */

type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
};

function Svg({
  size = 24,
  className,
  strokeWidth = 1.9,
  style,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* --------------------------- Roller --------------------------- */

// Vampir: yarasa silüeti
export function BatIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 6c-.8 1.4-2 2-3.4 1.7C7.9 6.6 6.7 6 5.4 6.4 6 7.4 6 8.3 5.6 9.2 4.7 8.9 3.8 9 3 9.6c1.7.4 2.9 1.3 3.6 2.8.5 1 .6 1.9.7 3 .9-.9 2-1.6 3.2-1.6M12 6c.8 1.4 2 2 3.4 1.7C16.1 6.6 17.3 6 18.6 6.4 18 7.4 18 8.3 18.4 9.2c.9-.3 1.8-.2 2.6.4-1.7.4-2.9 1.3-3.6 2.8-.5 1-.6 1.9-.7 3-.9-.9-2-1.6-3.2-1.6" />
      <path d="M12 6V4" />
    </Svg>
  );
}

// Doktor: yuvarlak köşeli tıbbi haç
export function CrossIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </Svg>
  );
}

// Medyum: kristal küre
export function CrystalIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="10" r="6.2" />
      <path d="M7.5 18.5h9" />
      <path d="M9.4 9c.3-1.2 1.2-2.1 2.4-2.4" opacity="0.6" />
    </Svg>
  );
}

// Avcı: nişangah
export function CrosshairIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="7.2" />
      <path d="M12 2.4v3.6M12 18v3.6M2.4 12H6M18 12h3.6" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

// Köylü: kişi
export function VillagerIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}

// Soytarı: çıngıraklı soytarı şapkası
export function JesterIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 16.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
      <path d="M5.4 6.6c0 3.4 1 5.5 2.6 6.8" />
      <path d="M12 4.4V11" />
      <path d="M18.6 6.6c0 3.4-1 5.5-2.6 6.8" />
      <path d="M4.5 17h15" />
      <circle cx="5.4" cy="5.4" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="3.2" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="18.6" cy="5.4" r="1.25" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/* --------------------------- Sahne / durum --------------------------- */

export function MoonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 12.9A8.4 8.4 0 1 1 11.1 3 6.6 6.6 0 0 0 21 12.9Z" />
    </Svg>
  );
}

export function SunIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4.4" />
      <path d="M12 2.6v2.4M12 19v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.6 12h2.4M19 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
    </Svg>
  );
}

export function SkullIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 11a7 7 0 1 1 14 0c0 2.2-1 3.5-2 4.3V18a1.6 1.6 0 0 1-1.6 1.6H8.6A1.6 1.6 0 0 1 7 18v-2.7C6 14.5 5 13.2 5 11Z" />
      <circle cx="9.2" cy="11.2" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="11.2" r="1.5" fill="currentColor" stroke="none" />
      <path d="M10.5 19.4v-2M13.5 19.4v-2" />
    </Svg>
  );
}

export function BallotIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <path d="M8 12.3l2.6 2.6L16 9" />
    </Svg>
  );
}

export function DropIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.2c0 0 6 6.4 6 10.3A6 6 0 0 1 6 13.5C6 9.6 12 3.2 12 3.2Z" />
    </Svg>
  );
}

export function ShieldIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3l7.5 2.7v5.5c0 4.6-3.2 7.6-7.5 8.8-4.3-1.2-7.5-4.2-7.5-8.8V5.7z" />
    </Svg>
  );
}

export function CrownIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 18.5h16" />
      <path d="M4 18.5 2.7 7.7l5.1 3.9L12 4.5l4.2 7.1 5.1-3.9L20 18.5z" />
    </Svg>
  );
}

export function HomeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5" />
    </Svg>
  );
}

export function PlayIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function KeyIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="4.2" />
      <path d="M11 11l8 8M16 16l2.2-2.2M18.4 18.4l2-2" />
    </Svg>
  );
}

export function ArrowLeftIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

export function CopyIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2.4" />
      <path d="M5.5 15.5A2 2 0 0 1 4 13.6V6A2 2 0 0 1 6 4h7.6c.8 0 1.5.5 1.8 1.2" />
    </Svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 12.5l5 5 10-11" />
    </Svg>
  );
}

export function SparkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function StopIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function RefreshIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v4h-4" />
    </Svg>
  );
}

export function LockIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Svg>
  );
}

/* --------------------------- Rol → ikon eşlemesi --------------------------- */

/** Bir rolün özel/anahtar/takım bilgisine göre doğru ikon bileşenini döndürür. */
export function RoleGlyph({
  role,
  size = 24,
  className,
  style,
  strokeWidth,
}: {
  role: RoleConfig | null | undefined;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
}) {
  const key = role?.special ?? role?.key ?? (role?.team === "vampir" ? "vampir" : "koylu");
  const Comp =
    key === "vampir"
      ? BatIcon
      : key === "doktor"
        ? CrossIcon
        : key === "medyum"
          ? CrystalIcon
          : key === "avci"
            ? CrosshairIcon
            : key === "soytari"
              ? JesterIcon
              : VillagerIcon;
  return <Comp size={size} className={className} style={style} strokeWidth={strokeWidth} />;
}

/* ============================================================
   Konfeti / parçacık patlaması — kazanma ekranı için.
   Merkezden dışa doğru saçılan renkli parçacıklar.
   ============================================================ */

export function Burst({
  palette,
  count = 30,
}: {
  palette: string[];
  count?: number;
}) {
  const bits = useMemo(() => {
    const rnd = (min: number, max: number) => min + Math.random() * (max - min);
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + rnd(-0.25, 0.25);
      const dist = rnd(90, 190);
      return {
        id: i,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist - rnd(0, 40),
        color: palette[i % palette.length],
        size: rnd(6, 12),
        delay: rnd(0, 0.25),
        rot: rnd(-220, 220),
        round: Math.random() > 0.5,
      };
    });
  }, [count, palette]);

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-0 w-0" aria-hidden>
      {bits.map((b) => (
        <motion.span
          key={b.id}
          className="absolute"
          style={{
            width: b.size,
            height: b.size,
            background: b.color,
            borderRadius: b.round ? "50%" : "2px",
            boxShadow: `0 0 8px ${b.color}`,
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
          animate={{ x: b.x, y: b.y, opacity: 0, scale: 1, rotate: b.rot }}
          transition={{ duration: 1.5, delay: b.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  );
}

/* ============================================================
   Amblem / Crest — ana sayfa kahramanı.
   Kalkan + vampir dişleri + kan damlası. Duotone, parıltılı.
   ============================================================ */

export function Crest({ size = 128, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 128"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="crestShield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a1030" />
          <stop offset="0.55" stopColor="#3a0f1c" />
          <stop offset="1" stopColor="#1a0a1f" />
        </linearGradient>
        <linearGradient id="crestEdge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c084fc" />
          <stop offset="0.5" stopColor="#a855f7" />
          <stop offset="1" stopColor="#ef4444" />
        </linearGradient>
        <linearGradient id="crestFang" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e9d5ff" />
        </linearGradient>
      </defs>

      {/* Kalkan gövdesi */}
      <path
        d="M60 8 L104 22 V60 C104 90 84 108 60 116 C36 108 16 90 16 60 V22 Z"
        fill="url(#crestShield)"
        stroke="url(#crestEdge)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* İç çizgi */}
      <path
        d="M60 16 L96 27 V60 C96 85 79 101 60 108 C41 101 24 85 24 60 V27 Z"
        fill="none"
        stroke="rgba(168,85,247,0.35)"
        strokeWidth="1.5"
      />

      {/* Yarasa kanatları */}
      <path
        d="M60 44 c-4 5-9 6-14 4 1 2 1 4 0 6 -3-1-6 0-8 2 3 .3 5 2 6 5 3-2 7-2 10 .5 M60 44 c4 5 9 6 14 4 -1 2-1 4 0 6 3-1 6 0 8 2 -3 .3-5 2-6 5 -3-2-7-2-10 .5"
        fill="rgba(239,68,68,0.18)"
        stroke="rgba(239,68,68,0.55)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Dudak + dişler */}
      <path d="M44 52 Q60 62 76 52" fill="none" stroke="url(#crestFang)" strokeWidth="3" strokeLinecap="round" />
      <path d="M50 55 L57 55 L53.5 74 Z" fill="url(#crestFang)" />
      <path d="M63 55 L70 55 L66.5 74 Z" fill="url(#crestFang)" />
      {/* Kan damlası */}
      <path d="M66.5 80 c0 0 4 4.5 4 7 a4 4 0 0 1 -8 0 c0-2.5 4-7 4-7Z" fill="#ef4444" />
    </svg>
  );
}
