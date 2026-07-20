// Rol meta verisi — hem sunucu hem istemci kullanır.
// İkon, renk ve gece sırası gibi görsel/oyun bilgilerini merkezî tutar.

import type { RoleConfig } from "@/lib/types";

export type SpecialKey = "avci" | "doktor" | "medyum";

export interface RoleMeta {
  icon: string; // emoji ikon
  tagline: string; // rol kartında kısa açıklama
  ability: string; // yeteneğin tek cümlelik anlatımı
  // Tema renkleri (Tailwind sınıfları CSS değişkenlerine bağlanır)
  accent: string; // ana vurgu rengi (hex)
  glow: string; // parıltı rengi (rgba)
}

// Yerleşik roller için zengin meta veri. Özel anahtarı veya rol anahtarı ile eşleşir.
const META: Record<string, RoleMeta> = {
  vampir: {
    icon: "🧛",
    tagline: "Gecenin efendisi",
    ability: "Her gece diğer vampirlerle birlikte bir köylüyü öldürürsün.",
    accent: "#ef4444",
    glow: "rgba(239,68,68,0.45)",
  },
  doktor: {
    icon: "🩺",
    tagline: "Köyün şifacısı",
    ability: "Her gece bir kişiyi korursun. Vampirler ona saldırırsa kurtulur.",
    accent: "#22d3ee",
    glow: "rgba(34,211,238,0.45)",
  },
  medyum: {
    icon: "🔮",
    tagline: "Ruhların sesi",
    ability: "Her gece bir kişinin takımını (vampir mi köylü mü) öğrenirsin.",
    accent: "#a855f7",
    glow: "rgba(168,85,247,0.45)",
  },
  avci: {
    icon: "🏹",
    tagline: "Son nefeste bir kurşun",
    ability: "Oyla asılırsan ölmeden önce birini yanında götürürsün.",
    accent: "#f59e0b",
    glow: "rgba(245,158,11,0.45)",
  },
  koylu: {
    icon: "🧑‍🌾",
    tagline: "Namuslu köylü",
    ability: "Özel gücün yok. Gündüz tartışıp doğru oyu vererek köyü kurtarırsın.",
    accent: "#34d399",
    glow: "rgba(52,211,153,0.4)",
  },
};

const FALLBACK: RoleMeta = {
  icon: "❔",
  tagline: "Gizemli rol",
  ability: "Moderatör bu rolün nasıl oynanacağını anlatır.",
  accent: "#94a3b8",
  glow: "rgba(148,163,184,0.4)",
};

/** Bir rol için meta veriyi döndürür (özel anahtar → rol anahtarı → takım varsayılanı). */
export function roleMeta(role: RoleConfig | null | undefined): RoleMeta {
  if (!role) return FALLBACK;
  if (role.special && META[role.special]) return META[role.special];
  if (META[role.key]) return META[role.key];
  // Bilinmeyen özel rol: takıma göre varsayılan
  if (role.team === "vampir") return META.vampir;
  return META.koylu;
}

/** Yalnızca anahtar/özel bilgisi elde varken meta almak için kısayol. */
export function metaByKey(key: string, special?: SpecialKey): RoleMeta {
  if (special && META[special]) return META[special];
  return META[key] ?? FALLBACK;
}

// Gece sırası: küçük sayı önce oynar. Vampirler → Doktor → Medyum.
export const NIGHT_ORDER: Record<string, number> = {
  vampir: 1,
  doktor: 2,
  medyum: 3,
};
