"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Crest } from "@/app/_lib/icons";

/* ============================================================
   El başlangıcı geri sayımı.

   Moderatör "Oyunu Başlat" dediğinde oyun bir anda başlıyordu; bu ekran
   araya nefes koyar: 5… 4… 3… 2… 1… → "Başladı".

   Senkronizasyon: sayım her telefonda KENDİ başladığı andan değil, sunucunun
   koyduğu `startedAt` damgasından hesaplanır. Durum yoklamayla (~1.2 sn)
   öğrenildiği için telefonlar sayımı farklı rakamlardan yakalayabilir, ama
   BİTİŞ anı hepsinde aynıdır — masadaki herkes aynı anda oyuna girer.
   ============================================================ */

const SECONDS = 5;
const TOTAL_MS = SECONDS * 1000;
const OUTRO_MS = 900; // "Başladı" finali

export interface CountdownState {
  active: boolean; // ekran görünmeli mi
  left: number; // kalan tam saniye (0 = final)
  progress: number; // 0 → 1 arası tamamlanma oranı
}

/**
 * Geri sayımın durumunu hesaplar. Sayfada BİR kez çağrılır; sonucu hem
 * `<StartCountdown>` bileşenine hem de "geri sayım bitene kadar bekleyen"
 * diğer ekranlara (örn. el başı hatırlatması) verilir.
 */
export function useStartCountdown(startedAt: number | null | undefined): CountdownState {
  // Saat okuması yalnızca efekt içinde yapılır (render saf kalsın diye), bu
  // yüzden damgayla birlikte saklanır: eski bir elin ölçümü yeni ele sızmaz.
  const [tick, setTick] = useState<{ anchor: number; now: number } | null>(null);
  const anchor = startedAt ?? null;

  useEffect(() => {
    if (anchor == null) return;
    // Sayfayı sonradan açan oyuncu bitmiş bir sayımı görmesin.
    if (Date.now() - anchor >= TOTAL_MS + OUTRO_MS) return;
    const id = setInterval(() => {
      const now = Date.now();
      setTick({ anchor, now });
      if (now - anchor >= TOTAL_MS + OUTRO_MS) clearInterval(id);
    }, 90);
    return () => clearInterval(id);
  }, [anchor]);

  // İlk ölçüm gelene kadar (≈90 ms) perde kapalıdır.
  const elapsed = tick && tick.anchor === anchor ? tick.now - tick.anchor : null;
  // İstemci saati sunucununkinden ciddi şekilde sapmışsa sayım gösterilmez;
  // oyunun kendisi zaten normal akışına devam eder.
  const active = elapsed != null && elapsed >= -1500 && elapsed < TOTAL_MS + OUTRO_MS;

  const left = elapsed == null ? SECONDS : Math.max(0, Math.ceil((TOTAL_MS - elapsed) / 1000));
  const progress = elapsed == null ? 0 : Math.min(1, Math.max(0, elapsed / TOTAL_MS));
  return { active, left, progress };
}

function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* yok say */
  }
}

const RING = 92; // yarıçap
const CIRC = 2 * Math.PI * RING;

/** Tam ekran geri sayım perdesi. Modalların da üstünde durur. */
export function StartCountdown({ active, left, progress }: CountdownState) {
  const done = left === 0;

  // Her rakamda kısa bir titreşim, bitişte daha uzun bir tane.
  useEffect(() => {
    if (!active) return;
    buzz(done ? 90 : 18);
  }, [active, left, done]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.55 } }}
          className="fixed inset-0 z-[80] grid place-items-center overflow-hidden"
          style={{ background: "radial-gradient(120% 90% at 50% 45%, #1b1033 0%, #0a0715 55%, #04030a 100%)" }}
          aria-live="assertive"
        >
          {/* Arkada yavaşça büyüyen kanlı hale */}
          <motion.div
            className="pointer-events-none absolute h-[70vmin] w-[70vmin] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(168,85,247,0.30), rgba(239,68,68,0.12) 55%, transparent 72%)" }}
            animate={{ scale: [1, 1.18, 1], opacity: [0.65, 1, 0.65] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Her saniyede dışarı açılan dalga */}
          <AnimatePresence>
            <motion.div
              key={`ripple-${left}`}
              className="pointer-events-none absolute rounded-full"
              style={{ height: RING * 2, width: RING * 2, border: "1px solid rgba(168,85,247,0.5)" }}
              initial={{ scale: 0.75, opacity: 0.75 }}
              animate={{ scale: 1.85, opacity: 0 }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </AnimatePresence>

          <div className="relative grid place-items-center">
            {/* Boşalan halka */}
            <svg
              width={(RING + 12) * 2}
              height={(RING + 12) * 2}
              viewBox={`0 0 ${(RING + 12) * 2} ${(RING + 12) * 2}`}
              className="absolute -rotate-90"
              aria-hidden
            >
              <defs>
                <linearGradient id="cd-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>
              <circle
                cx={RING + 12}
                cy={RING + 12}
                r={RING}
                fill="none"
                stroke="rgba(168,85,247,0.14)"
                strokeWidth="3"
              />
              <circle
                cx={RING + 12}
                cy={RING + 12}
                r={RING}
                fill="none"
                stroke="url(#cd-grad)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * progress}
                style={{ filter: "drop-shadow(0 0 10px rgba(168,85,247,0.75))" }}
              />
            </svg>

            {/* Rakam / final */}
            <div className="grid h-[184px] w-[184px] place-items-center">
              <AnimatePresence mode="popLayout">
                {done ? (
                  <motion.div
                    key="done"
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 13 }}
                    className="flex flex-col items-center"
                  >
                    <Crest size={76} />
                  </motion.div>
                ) : (
                  <motion.span
                    key={left}
                    initial={{ scale: 1.75, opacity: 0, filter: "blur(10px)" }}
                    animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                    exit={{ scale: 0.55, opacity: 0, filter: "blur(6px)" }}
                    transition={{ type: "spring", stiffness: 220, damping: 18 }}
                    className="font-display font-black leading-none"
                    style={{
                      fontSize: "7.5rem",
                      color: "#f5f3ff",
                      textShadow: "0 0 28px rgba(168,85,247,0.85), 0 0 70px rgba(239,68,68,0.45)",
                    }}
                  >
                    {left}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Alt başlık */}
          <motion.p
            key={done ? "t-done" : "t-count"}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display absolute bottom-[19vh] text-center text-xl font-black uppercase"
            style={{
              letterSpacing: "0.34em",
              color: done ? "#fca5a5" : "#a9a3c7",
              textShadow: done ? "0 0 26px rgba(239,68,68,0.6)" : "none",
            }}
          >
            {done ? "Başladı" : "Oyun Başlıyor"}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
