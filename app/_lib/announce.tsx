"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Modal } from "@/app/_lib/ui";
import { DownloadIcon, CheckIcon } from "@/app/_lib/icons";

/* ============================================================
   Duyuru — tek seferlik "iyi haber" kartı.

   Uyarı değil, müjde: yeni bir şey çıktığında bir kez gösterilir, kapatılınca
   bir daha çıkmaz. Kapatma işareti localStorage'da duyurunun KİMLİĞİYLE
   saklanır; bir sonraki duyuruda `NEWS.id`'yi değiştirmek yeni kartın
   herkese bir kez daha gösterilmesi için yeterlidir (eskiyi görmüş olmak
   yenisini bastırmaz).
   ============================================================ */

const SEEN_KEY = "vk_news_seen";

// Yürürlükteki duyuru. Yenisini yayınlamak için: id'yi değiştir, metinleri
// güncelle. Duyuruyu tamamen kaldırmak için page.tsx'teki <NewsModal/>'ı sil.
export const NEWS = {
  id: "mobil-uygulama-1",
  emoji: "📱",
  title: "Mobil Uygulama Çıktı!",
  body: "Vampir Köylü artık telefonunda kendi uygulaması olarak yaşıyor. Tarayıcı çubuğu yok, tam ekran — ana ekranından tek dokunuşla köye giriyorsun.",
  cta: "Hemen İndir",
  dismiss: "Tamam, sonra bakarım",
};

/**
 * Duyuru kartı.
 *
 * @param enabled Duyurunun anlamlı olduğu durum (ör. APK gerçekten yayında mı).
 *                false ise kart hiç açılmaz ve "görüldü" işareti de konmaz —
 *                böylece duyuru, konusu hazır olduğunda gösterilir.
 * @param href    Ana düğmenin gideceği adres.
 */
export function NewsModal({ enabled, href }: { enabled: boolean; href: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem(SEEN_KEY) === NEWS.id) return;
    // Kısa gecikme: ana sayfanın giriş animasyonu otursun, kart üstüne
    // çakılmasın. Efektin İÇİNDE değil, zamanlayıcı geri çağrısında state
    // değiştiriyoruz — senkron setState zincirleme render doğurur.
    const timer = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(timer);
  }, [enabled]);

  function seen() {
    try {
      localStorage.setItem(SEEN_KEY, NEWS.id);
    } catch {
      /* depolama kapalıysa duyuru bir daha çıkar — kırılmaz */
    }
    setOpen(false);
  }

  return (
    <Modal open={open} onClose={seen} maxW="max-w-xs">
      {/* Kutlama: ikonun arkasında nabız gibi atan hale */}
      <div className="relative grid place-items-center">
        <motion.div
          className="absolute h-24 w-24 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(52,211,153,0.35), transparent 68%)" }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="text-5xl"
          initial={{ scale: 0.4, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 14 }}
        >
          {NEWS.emoji}
        </motion.div>
      </div>

      <p className="font-display title-glow mt-3 text-xl font-black leading-tight">{NEWS.title}</p>
      <p className="mt-2 text-[13px] leading-snug text-[var(--muted)]">{NEWS.body}</p>

      <a href={href} download onClick={seen} className="btn btn-emerald btn-lg mt-4 w-full">
        <DownloadIcon size={20} />
        {NEWS.cta}
      </a>
      <button onClick={seen} className="btn btn-ghost mt-2 w-full">
        <CheckIcon size={18} />
        {NEWS.dismiss}
      </button>
    </Modal>
  );
}
