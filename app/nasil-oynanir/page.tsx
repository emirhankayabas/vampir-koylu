"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { roleMeta } from "@/lib/roles";
import { PACT_RULES } from "@/app/_lib/pact";
import type { RoleConfig } from "@/lib/types";
import {
  Crest, RoleGlyph, ArrowLeftIcon, MoonIcon, SunIcon, BallotIcon, SkullIcon, CrownIcon,
} from "@/app/_lib/icons";

// Rol vitrini — roles.ts meta verisiyle aynı ikon/renk/açıklamayı kullanır.
const ROLES: RoleConfig[] = [
  { key: "vampir", name: "Vampir", team: "vampir", enabled: true, count: 0 },
  { key: "doktor", name: "Doktor", team: "koy", enabled: true, count: 0, special: "doktor" },
  { key: "medyum", name: "Medyum", team: "koy", enabled: true, count: 0, special: "medyum" },
  { key: "avci", name: "Avcı", team: "koy", enabled: true, count: 0, special: "avci" },
  { key: "koylu", name: "Köylü", team: "koy", enabled: true, count: 0, fill: true },
  { key: "soytari", name: "Soytarı", team: "koy", enabled: true, count: 0, special: "soytari" },
  { key: "survivor", name: "Survivor", team: "koy", enabled: true, count: 0, special: "survivor" },
];

const FLOW: { icon: React.ReactNode; color: string; title: string; desc: string }[] = [
  {
    icon: <MoonIcon size={22} />, color: "#22d3ee", title: "1 · Gece",
    desc: "Herkes gözlerini kapar, o oyunda bulunan roller sırayla uyanır. Vampirler birlikte bir kurban seçer; oyunda varsa Doktor birini korur, Medyum birinin takımını öğrenir, Survivor kalkanını açabilir. Hangi rollerin olacağını moderatör baştan belirler.",
  },
  {
    icon: <SunIcon size={22} />, color: "#f59e0b", title: "2 · Sabah",
    desc: "Gece olanlar açıklanır. Biri öldüyse duyurulur — ama rolü gizli kalır, yalnızca takımı (Köylü / Vampir) görünür.",
  },
  {
    icon: <span className="text-lg">🗣️</span>, color: "#a855f7", title: "3 · Gündüz — Tartışma",
    desc: "Köy konuşur, ipuçlarını birleştirir ve kimin vampir olduğunu bulmaya çalışır. Blöf, iftira, savunma… her şey serbest.",
  },
  {
    icon: <BallotIcon size={22} />, color: "#34d399", title: "4 · Oylama",
    desc: "Köy bir kişiyi asmak için oy verir. En çok oyu alan asılır (eşitlikte kimse asılmaz). Sonra tekrar geceye dönülür.",
  },
];

const WINS: { icon: React.ReactNode; color: string; title: string; desc: string }[] = [
  { icon: <span className="text-xl">🏡</span>, color: "#34d399", title: "Köy kazanır", desc: "Tüm vampirler elenirse köylüler şafağa kavuşur." },
  { icon: <span className="text-xl">🧛</span>, color: "#ef4444", title: "Vampirler kazanır", desc: "Vampir sayısı köylülere eşit ya da fazla olursa karanlık köyü ele geçirir." },
  { icon: <span className="text-xl">🃏</span>, color: "#ec4899", title: "Soytarı kazanır", desc: "Soytarı gündüz oylamasında kendini astırmayı başarırsa tek başına kazanır." },
  { icon: <span className="text-xl">🛡️</span>, color: "#2dd4bf", title: "Survivor kazanır", desc: "Survivor oyun bittiğinde hâlâ hayattaysa, kazanan taraf hangisiyse onunla birlikte kazanır." },
];

export default function NasilOynanirPage() {
  const router = useRouter();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 safe-b">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => router.back()} className="iconbtn" aria-label="Geri">
          <ArrowLeftIcon size={18} />
        </button>
      </div>

      {/* Kahraman */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col items-center text-center">
        <Crest size={84} />
        <h1 className="font-display title-glow mt-3 text-3xl font-black">Nasıl Oynanır?</h1>
        <p className="mt-2 max-w-md text-sm leading-snug text-[var(--muted)]">
          Vampir Köylü, gizli rollerle oynanan bir <b className="text-[var(--ink)]">köy vs. vampir</b> oyunudur.
          Köy vampirleri bulup asmaya, vampirler ise fark edilmeden köyü ele geçirmeye çalışır.
        </p>
      </motion.div>

      {/* Amaç: iki taraf */}
      <div className="mb-8 grid grid-cols-2 gap-3">
        <TeamCard emoji="🏡" title="Köy" color="#34d399" desc="Amaç: gündüz doğru oy vererek tüm vampirleri elemek." />
        <TeamCard emoji="🧛" title="Vampirler" color="#ef4444" desc="Amaç: gece köylüleri avlayıp sayıca üstün gelmek." />
      </div>

      {/* Tur akışı */}
      <SectionTitle>Bir Tur Nasıl İşler?</SectionTitle>
      <div className="mb-8 space-y-2.5">
        {FLOW.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="panel flex items-start gap-3 p-4"
            style={{ borderColor: `${s.color}44` }}
          >
            <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${s.color}1e`, color: s.color }}>
              {s.icon}
            </div>
            <div className="min-w-0">
              <p className="font-display font-bold">{s.title}</p>
              <p className="mt-0.5 text-sm leading-snug text-[var(--muted)]">{s.desc}</p>
            </div>
          </motion.div>
        ))}
        <p className="px-1 pt-1 text-center text-xs text-[var(--faint)]">
          Bu döngü, taraflardan biri kazanana kadar gece–gündüz olarak tekrarlanır.
        </p>
      </div>

      {/* Roller */}
      <SectionTitle>Roller</SectionTitle>
      <p className="mb-3 px-1 -mt-1 text-xs leading-snug text-[var(--faint)]">
        Her oyunda bu rollerin hepsi bulunmaz — moderatör oyun başında hangi rollerin ve kaçar tane olacağını seçer. Yalnızca Vampir ve Köylü her zaman vardır.
      </p>
      <div className="mb-8 grid gap-2.5 sm:grid-cols-2">
        {ROLES.map((r, i) => (
          <RoleCard key={r.key} role={r} i={i} />
        ))}
      </div>

      {/* Ek kural: Âşıklar */}
      <SectionTitle>Ek Kural — Âşıklar</SectionTitle>
      <div className="panel mb-8 flex items-start gap-3 p-4" style={{ borderColor: "rgba(236,72,153,0.4)" }}>
        <div className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: "rgba(236,72,153,0.16)" }}>💘</div>
        <div className="min-w-0">
          <p className="font-display font-bold" style={{ color: "#f9a8d4" }}>Âşıklar</p>
          <p className="mt-1 text-sm leading-snug text-[var(--muted)]">
            Moderatör bu kuralı açarsa oyun başında <b className="text-[var(--ink)]">rastgele 2 oyuncu âşık</b> olur (Soytarı ve Survivor hariç — sadece Köy/Vampir rolleri). Her âşık partnerinin yalnızca <b className="text-[var(--ink)]">adını</b> görür, rolünü bilmez. <b className="text-[var(--ink)]">Biri ölürse diğeri de kahrından ölür.</b> Kazanmaya karışmaz — herkes yine kendi takımıyla kazanır.
          </p>
        </div>
      </div>

      {/* Kazanma koşulları */}
      <SectionTitle>Kim Kazanır?</SectionTitle>
      <div className="mb-8 grid gap-2.5 sm:grid-cols-2">
        {WINS.map((w, i) => (
          <motion.div
            key={w.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="panel flex items-start gap-3 p-3.5"
            style={{ borderColor: `${w.color}44` }}
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${w.color}1e` }}>{w.icon}</div>
            <div className="min-w-0">
              <p className="font-semibold" style={{ color: w.color }}>{w.title}</p>
              <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">{w.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Köy Sözleşmesi — oyuncu davranış kuralları */}
      <SectionTitle>Köy Sözleşmesi</SectionTitle>
      <p className="mb-3 -mt-1 px-1 text-xs leading-snug text-[var(--faint)]">
        Yukarıdakiler oyunun kuralları. Bunlar ise <b className="text-[var(--muted)]">oyuncuların</b> kuralları —
        odaya ilk kez girerken herkes bunları okuyup kabul eder.
      </p>
      <div className="mb-8 space-y-2.5">
        {PACT_RULES.map((rule, i) => (
          <motion.div
            key={rule.title}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i * 0.05, 0.35) }}
            className="panel flex items-start gap-3 p-4"
            style={{ borderColor: "rgba(168,85,247,0.3)" }}
          >
            <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl" style={{ background: "rgba(168,85,247,0.14)" }}>
              {rule.icon}
            </div>
            <div className="min-w-0">
              <p className="font-display font-bold">
                <span className="text-[var(--faint)]">{i + 1}.</span> {rule.title}
              </p>
              <p className="mt-0.5 text-sm leading-snug text-[var(--muted)]">{rule.body}</p>
            </div>
          </motion.div>
        ))}
        <p className="px-1 pt-1 text-center text-xs text-[var(--faint)]">
          Kurallara uymayan oyuncuyu moderatör odadan çıkarabilir.
        </p>
      </div>

      {/* İpuçları */}
      <SectionTitle>İpuçları</SectionTitle>
      <div className="panel space-y-2 p-4 text-sm text-[var(--muted)]">
        <Tip icon={<SkullIcon size={16} />}>Öldüğünde rolün gizli kalır — kimseye ipucu verme, ruhun köyü izler.</Tip>
        <Tip icon={<CrownIcon size={16} />}>Özel roller (Doktor, Medyum, Avcı…) öldüğünde bile “Köylü” görünür; kimliğini erken açık etme.</Tip>
        <Tip icon={<span className="text-sm">📱</span>}>Telefon modunda herkes kendi ekranından oynar. Sözlü modda ise moderatör her şeyi yönetir.</Tip>
      </div>

      <button onClick={() => router.push("/")} className="btn btn-violet btn-lg mt-8 w-full">Ana Sayfaya Dön</button>
    </div>
  );
}

function TeamCard({ emoji, title, color, desc }: { emoji: string; title: string; color: string; desc: string }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="panel p-4 text-center" style={{ borderColor: `${color}55` }}>
      <div className="text-3xl">{emoji}</div>
      <p className="font-display mt-1 text-lg font-black" style={{ color }}>{title}</p>
      <p className="mt-1 text-xs leading-snug text-[var(--muted)]">{desc}</p>
    </motion.div>
  );
}

function RoleCard({ role, i }: { role: RoleConfig; i: number }) {
  const meta = roleMeta(role);
  const [open, setOpen] = useState(false);
  // Uzun açıklamalar (Soytarı, Survivor) 2 satıra kırpılır; "Devamını gör" ile açılır.
  const long = meta.ability.length > 100;
  const neutral = role.special === "soytari" || role.special === "survivor";
  const evil = role.team === "vampir";
  const badge = neutral
    ? { text: "Tarafsız", bg: `${meta.accent}22`, color: meta.accent }
    : evil
      ? { text: "Vampir", bg: "rgba(239,68,68,0.16)", color: "#fca5a5" }
      : { text: "Köy", bg: "rgba(52,211,153,0.14)", color: "#6ee7b7" };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i * 0.05, 0.4) }}
      className="panel flex items-start gap-3 p-4"
      style={{ borderColor: `${meta.accent}44` }}
    >
      <div className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `${meta.accent}22`, border: `1px solid ${meta.accent}44`, color: meta.accent }}>
        <RoleGlyph role={role} size={24} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold" style={{ color: meta.accent }}>{role.name}</span>
          <span className="badge" style={{ background: badge.bg, color: badge.color }}>{badge.text}</span>
        </div>
        <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--faint)]">{meta.tagline}</p>
        <p className={`mt-1 text-sm leading-snug text-[var(--muted)] ${open ? "" : "line-clamp-2"}`}>{meta.ability}</p>
        {long && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-1 text-[10px] font-bold uppercase tracking-wide"
            style={{ color: meta.accent }}
          >
            {open ? "Daha az ▴" : "Devamını gör ▾"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 px-1 font-display text-lg font-black">{children}</h2>;
}

function Tip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-[var(--violet)]">{icon}</span>
      <p className="leading-snug">{children}</p>
    </div>
  );
}
