"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Modal } from "@/app/_lib/ui";
import { CheckIcon } from "@/app/_lib/icons";

/* ============================================================
   Köy Sözleşmesi — fair-play (davranış) kuralları.

   `/nasil-oynanir` OYUNUN kurallarını anlatır (roller, tur akışı, kazanma).
   Burası ise OYUNCULARIN kurallarını anlatır: gerekçesiz suçlama, meta-oyun,
   ölünce konuşma… Oyunun zevkini bozan şeyler kural ihlali değil "adet"
   meselesi olduğu için, oyuncudan bir kez açıkça onay alıyoruz.

   İki kademe var:
   1) Kapı (PactModal): odaya ilk kez katılırken / ilk oda kurarken tam metin.
      Sona kaydırmadan onay düğmesi açılmaz. Onay localStorage'da tutulur.
   2) Hatırlatma (RoundReminder): her el başında 3 çekirdek maddelik kısa kart.
   ============================================================ */

// Sözleşme sürümü. Kurallar değişirse burayı artır — herkes tekrar onaylar.
export const PACT_VERSION = 1;
const PACT_KEY = "vk_pact";
const roundKey = (code: string) => `vk_pact_round_${code}`;

export interface PactRule {
  icon: string;
  title: string;
  body: string;
  short: string; // el başındaki kısa hatırlatmada görünen hali
  core?: boolean; // kısa hatırlatmada gösterilecek çekirdek maddeler
}

export const PACT_RULES: PactRule[] = [
  {
    icon: "🗳️",
    title: "Gerekçesiz suçlama ve oy yok",
    body:
      "Birini suçluyorsan sebebini söyle. Daha kimse tek kelime etmemişken \"bu vampir\" deyip oylama açmak oyunu oyun olmaktan çıkarır. Suçladığın kişi köylü de olabilir, doktor da — kimseyi konuşma fırsatı bulmadan asma.",
    short: "Sebebini söylemeden kimseyi suçlama ve oy verme.",
    core: true,
  },
  {
    icon: "🎤",
    title: "Herkesin savunma hakkı var",
    body:
      "Suçlanan kişi kendini savunmadan oylamaya geçilmez. İlk gündüz kimse konuşmadan oy açmak yerine önce sırayla herkesi dinleyin — asıl oyun orada başlıyor.",
    short: "Suçlanan konuşmadan oylama kapanmaz.",
  },
  {
    icon: "🤐",
    title: "Öldüysen susarsın",
    body:
      "Ölen oyuncu konuşmaz, ipucu vermez, kaş göz işareti yapmaz, gülmez. Ruhun köyü sessizce izler. Ölülerin tepkisi hayattakiler için en büyük sızıntıdır.",
    short: "Ölen oyuncu konuşmaz, tepki vermez.",
    core: true,
  },
  {
    icon: "📵",
    title: "Oyun dışı bilgi yok",
    body:
      "Mesajlaşma, kulağa fısıldama, masa altından işaret, yan odadan bağırma yok. Yalnızca oyun içinde söylenenler geçerlidir. Önceki ellerde kimin ne rol aldığı da bu ele dahil değildir.",
    short: "Mesaj, fısıltı, işaret yok — sadece oyun içi konuşma.",
    core: true,
  },
  {
    icon: "👀",
    title: "Kimsenin ekranına bakma",
    body:
      "Kendi telefonun kendi rolündür. Başkasının ekranına bakmak ya da kendi rolünü göstermek eli anında bitirir. Rolünü açarken etrafına dikkat et.",
    short: "Başkasının ekranına bakma, kendi rolünü gösterme.",
  },
  {
    icon: "🎭",
    title: "Blöf serbest, hakaret değil",
    body:
      "Yalan söylemek, iftira atmak, başka bir rolmüş gibi davranmak oyunun ta kendisidir. Kişiselleştirmek, aşağılamak, küfür etmek ise oyun değil. Oyunda olan oyunda kalır.",
    short: "Blöf oyunun parçası; hakaret değil.",
  },
  {
    icon: "👑",
    title: "Moderatörün sözü geçerlidir",
    body:
      "Tartışmalı bir durumda son kararı moderatör verir. İtirazını el bittikten sonra söyle — el ortasında tartışma herkesin oyununu böler.",
    short: "Tartışmalı durumda son söz moderatörün.",
  },
];

const CORE_RULES = PACT_RULES.filter((r) => r.core);

/* ---------------------------- Depolama ---------------------------- */

/** Bu tarayıcı geçerli sözleşme sürümünü onaylamış mı. */
export function hasAcceptedPact(): boolean {
  if (typeof localStorage === "undefined") return false;
  return Number(localStorage.getItem(PACT_KEY)) >= PACT_VERSION;
}

export function acceptPact() {
  localStorage.setItem(PACT_KEY, String(PACT_VERSION));
}

/* ------------------------------ Kapı ------------------------------ */

/**
 * Sözleşme kapısı. `guard(fn)` çağrıldığında sözleşme onaylıysa `fn` hemen
 * çalışır; değilse önce sözleşme açılır, onaylanınca `fn` çalışır.
 *
 * Kullanım:
 *   const { guard, pactModal } = usePactGuard();
 *   <button onClick={() => guard(joinRoom)}>Köye Gir</button>
 *   {pactModal}
 */
export function usePactGuard() {
  // Fonksiyonu state'te tutarken sarmalıyoruz: setState bir fonksiyon alırsa
  // onu güncelleyici sanıp çağırır.
  const [pending, setPending] = useState<{ run: () => void } | null>(null);

  const guard = useCallback((fn: () => void) => {
    if (hasAcceptedPact()) fn();
    else setPending({ run: fn });
  }, []);

  const pactModal = (
    <PactModal
      open={pending !== null}
      onAccept={() => {
        acceptPact();
        const next = pending;
        setPending(null);
        next?.run();
      }}
      onCancel={() => setPending(null)}
    />
  );

  return { guard, pactModal };
}

/** Tam sözleşme metni. Sona kaydırılmadan onay düğmesi etkinleşmez. */
export function PactModal({
  open,
  onAccept,
  onCancel,
  readOnly = false,
}: {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
  /** Yalnızca okuma (ana sayfadan "sözleşmeyi oku"): kaydırma şartı yok. */
  readOnly?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(false);

  // Modal her açıldığında kaydırma şartı sıfırlanır. Efekt yerine render
  // sırasında ayarlıyoruz (React'in "prop değişince state'i düzelt" kalıbı) —
  // efekt içinde setState fazladan bir render turu doğururdu.
  const [openedFor, setOpenedFor] = useState(open);
  if (openedFor !== open) {
    setOpenedFor(open);
    setAtEnd(false);
  }

  // Sona gelindi mi? İçerik zaten sığıyorsa (uzun ekran) şart aranmaz.
  const check = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setAtEnd(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = scroller.current;
    if (el) el.scrollTop = 0;
    // Yerleşim tamamlandıktan sonra ölç.
    const id = requestAnimationFrame(check);
    return () => cancelAnimationFrame(id);
  }, [open, check]);

  const canAccept = readOnly || atEnd;

  return (
    <Modal open={open} onClose={readOnly ? onCancel : undefined} maxW="max-w-md">
      <div className="text-center">
        <div className="text-4xl">⚖️</div>
        <p className="font-display mt-2 text-xl font-black">Köy Sözleşmesi</p>
        <p className="mt-1 text-[13px] leading-snug text-[var(--muted)]">
          Bunlar oyunun değil, <b className="text-[var(--ink)]">oyuncuların</b> kurallarıdır.
          Oynamadan önce okuyup kabul et.
        </p>
      </div>

      <div
        ref={scroller}
        onScroll={check}
        className="mt-4 max-h-[46vh] space-y-2.5 overflow-y-auto overscroll-contain pr-1 text-left"
      >
        {PACT_RULES.map((rule, i) => (
          <div
            key={rule.title}
            className="panel-tight flex items-start gap-3 p-3"
            style={{ borderColor: "rgba(168,85,247,0.22)" }}
          >
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg"
              style={{ background: "rgba(168,85,247,0.14)" }}
            >
              {rule.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-snug">
                <span className="text-[var(--faint)]">{i + 1}.</span> {rule.title}
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-[var(--muted)]">{rule.body}</p>
            </div>
          </div>
        ))}
        <p className="px-1 pt-1 text-center text-[11px] leading-snug text-[var(--faint)]">
          Kurallara uymayan oyuncuyu moderatör odadan çıkarabilir.
        </p>
      </div>

      {!canAccept && (
        <motion.p
          animate={{ y: [0, 3, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="mt-2 text-center text-[11px] font-semibold text-[var(--amber)]"
        >
          ▼ Sonuna kadar kaydır
        </motion.p>
      )}

      <button
        onClick={onAccept}
        disabled={!canAccept}
        className="btn btn-emerald btn-lg mt-3 w-full"
      >
        <CheckIcon size={20} />
        {readOnly ? "Anladım" : "Okudum, kabul ediyorum"}
      </button>
      {!readOnly && (
        <button onClick={onCancel} className="btn btn-ghost mt-2 w-full">
          Vazgeç
        </button>
      )}
    </Modal>
  );
}

/* --------------------------- Hatırlatma --------------------------- */

/**
 * El başı hatırlatması. Oyun `in_progress`e geçtiğinde bir kez çıkar, oda
 * lobiye/bitişe döndüğünde işaret silinir — böylece her yeni el tekrar gösterir
 * ama el ortasında sayfa yenilense tekrar çıkmaz.
 */
export function RoundReminder({
  code,
  status,
  hold = false,
}: {
  code: string;
  status: string;
  /** true iken açılmaz — başlangıç geri sayımının bitmesini bekler. */
  hold?: boolean;
}) {
  // Durum değiştiği anda karar veriyoruz: oyun başladıysa ve bu el için henüz
  // gösterilmediyse "kurulu" duruma geç. Efekt yerine render sırasında ayarlanır.
  const [seen, setSeen] = useState<{ status: string | null; armed: boolean }>({ status: null, armed: false });
  if (seen.status !== status) {
    const shown = typeof localStorage !== "undefined" && !!localStorage.getItem(roundKey(code));
    setSeen({ status, armed: status === "in_progress" && !shown });
  }

  // Lobiye/bitişe dönüldüğünde işareti sil ki bir sonraki el tekrar gösterilsin.
  useEffect(() => {
    if (status !== "in_progress" && typeof localStorage !== "undefined") {
      localStorage.removeItem(roundKey(code));
    }
  }, [code, status]);

  const open = seen.armed && !hold;
  function dismiss() {
    localStorage.setItem(roundKey(code), "1");
    setSeen((s) => ({ ...s, armed: false }));
  }

  return (
    <Modal open={open} maxW="max-w-xs">
      <div className="text-4xl moon-pulse">🌙</div>
      <p className="font-display mt-2 text-lg font-bold">El başlıyor</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{"Köy Sözleşmesi'ni unutma:"}</p>

      <div className="mt-3 space-y-2 text-left">
        {CORE_RULES.map((rule) => (
          <div key={rule.title} className="flex items-start gap-2.5">
            <span className="shrink-0 text-base leading-tight">{rule.icon}</span>
            <p className="text-[13px] leading-snug text-[var(--muted)]">{rule.short}</p>
          </div>
        ))}
      </div>

      <button onClick={dismiss} className="btn btn-violet mt-4 w-full">
        Anladım
      </button>
    </Modal>
  );
}
