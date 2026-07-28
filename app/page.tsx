"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { postAction, savePlayerId, saveModeratorRoom, useGuestName } from "@/app/_lib/client";
import { ActiveSessions } from "@/app/_lib/sessions";
import { AccountButton, useAccount, useIdentityGate } from "@/app/_lib/account";
import { usePactGuard, PactModal } from "@/app/_lib/pact";
import { Crest, RoleGlyph, PlayIcon, KeyIcon, ArrowLeftIcon, HomeIcon, CheckIcon } from "@/app/_lib/icons";
import { metaByKey } from "@/lib/roles";
import type { RoleConfig } from "@/lib/types";

// Ana ekrandaki rol vitrininde gösterilecek roller.
const SHOWCASE: RoleConfig[] = [
  { key: "vampir", name: "Vampir", team: "vampir", enabled: true, count: 0 },
  { key: "doktor", name: "Doktor", team: "koy", enabled: true, count: 0, special: "doktor" },
  { key: "medyum", name: "Medyum", team: "koy", enabled: true, count: 0, special: "medyum" },
  { key: "avci", name: "Avcı", team: "koy", enabled: true, count: 0, special: "avci" },
  { key: "koylu", name: "Köylü", team: "koy", enabled: true, count: 0, fill: true },
];

export default function Home() {
  const router = useRouter();
  const [view, setView] = useState<"home" | "join">("home");
  // Kullanıcı bir şey yazmadıysa hatırlanan ziyaretçi ismi kullanılır. Türetme
  // render sırasında yapılıyor — efektle setState etmeye gerek yok.
  const [typedName, setTypedName] = useState<string | null>(null);
  const rememberedName = useGuestName();
  const name = typedName ?? rememberedName ?? "";
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState<null | "create" | "join">(null);
  const [error, setError] = useState<string | null>(null);
  // Köy Sözleşmesi: odaya girmeden (ya da oda kurmadan) önce bir kez onaylanır.
  const { guard, pactModal } = usePactGuard();
  const [readPact, setReadPact] = useState(false);
  // Kimlik: hesap varsa isim sorulmaz; yoksa ilk katılımda ziyaretçi/kayıt modalı.
  const { account } = useAccount();
  const { gate, identityModal } = useIdentityGate();

  async function createRoom() {
    setBusy("create");
    setError(null);
    const res = await postAction("createRoom");
    if (res.ok && res.code) {
      saveModeratorRoom(res.code); // sekme kapansa da panele geri dönebilsin
      router.push(`/moderator/${res.code}`);
    } else {
      setBusy(null);
      setError(res.error ?? "Oda oluşturulamadı.");
    }
  }

  // Katılım iki adım: önce kimliği netleştir (hesap / ziyaretçi), sonra katıl.
  function startJoin() {
    const n = account ? account.name : name.trim();
    const c = code.replace(/\D/g, "").slice(0, 6);
    if (!n || c.length !== 6) {
      setError(account ? "6 haneli kodu girin." : "İsim ve 6 haneli kodu girin.");
      return;
    }
    setError(null);
    gate(n, joinRoom);
  }

  async function joinRoom(finalName: string) {
    const c = code.replace(/\D/g, "").slice(0, 6);
    setBusy("join");
    setError(null);
    const res = await postAction("join", { code: c, name: finalName, password: pw });
    if (res.ok && res.playerId) {
      savePlayerId(c, res.playerId);
      router.push(`/oyna/${c}`);
    } else {
      setBusy(null);
      setError(res.error ?? "Katılım başarısız.");
    }
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 safe-b">
      {/* --------- Hesap köşesi --------- */}
      <div className="absolute right-4 top-4 z-30">
        <AccountButton />
      </div>

      {/* --------- Kahraman: amblem + başlık --------- */}
      <motion.div
        initial={{ opacity: 0, scale: 0.86, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex flex-col items-center text-center"
      >
        {/* Amblemin arkasındaki nabız gibi atan hale */}
        <div className="relative grid place-items-center">
          <motion.div
            className="absolute h-44 w-44 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(168,85,247,0.35), transparent 68%)" }}
            animate={{ scale: [1, 1.12, 1], opacity: [0.55, 0.85, 0.55] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            animate={{ y: [0, -9, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            style={{ filter: "drop-shadow(0 12px 30px rgba(168,85,247,0.45))" }}
          >
            <Crest size={132} />
          </motion.div>
        </div>

        <h1 className="font-display title-glow mt-5 text-[2.9rem] font-black leading-none tracking-tight">
          Vampir Köylü
        </h1>
        <p className="mt-3 text-sm font-medium tracking-wide text-[var(--muted)]">
          Gece kimin sıra, gündüz kim asılır?
        </p>

        {/* Rol vitrini — özel ikonlar */}
        <div className="mt-6 flex items-center justify-center gap-2.5">
          {SHOWCASE.map((r, i) => {
            const meta = metaByKey(r.key, r.special);
            return (
              <motion.div
                key={r.key}
                initial={{ opacity: 0, y: 12, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.4 + i * 0.08, type: "spring", stiffness: 260, damping: 16 }}
                className="grid h-11 w-11 place-items-center rounded-2xl"
                style={{
                  background: `${meta.accent}18`,
                  border: `1px solid ${meta.accent}55`,
                  color: meta.accent,
                  boxShadow: `0 6px 18px -8px ${meta.glow}`,
                }}
                title={r.name}
              >
                <RoleGlyph role={r} size={22} />
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* --------- Aksiyonlar --------- */}
      <div className="mt-11 w-full max-w-sm">
        {view === "home" ? (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="grid gap-3"
          >
            <ActiveSessions />
            <button onClick={() => guard(createRoom)} disabled={busy !== null} className="btn btn-blood btn-lg">
              <PlayIcon size={22} />
              {busy === "create" ? "Oda kuruluyor…" : "Oyun Oluştur"}
            </button>
            <button
              onClick={() => { setView("join"); setError(null); }}
              disabled={busy !== null}
              className="btn btn-violet btn-lg"
            >
              <KeyIcon size={22} />
              Oyuna Katıl
            </button>
            <button
              onClick={() => router.push("/odalar")}
              disabled={busy !== null}
              className="btn btn-ghost btn-lg"
            >
              <HomeIcon size={22} />
              Mevcut Oyunlar
            </button>
            <button
              onClick={() => router.push("/nasil-oynanir")}
              disabled={busy !== null}
              className="mt-1 text-center text-sm font-semibold text-[var(--violet)] transition hover:text-[var(--ink)]"
            >
              📖 Nasıl Oynanır? · Roller ve Kurallar
            </button>
            <button
              onClick={() => setReadPact(true)}
              disabled={busy !== null}
              className="text-center text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--ink)]"
            >
              ⚖️ Köy Sözleşmesi · Oyuncu Kuralları
            </button>
            {error && <p className="mt-1 text-center text-sm text-[var(--blood)]">{error}</p>}

            <div className="panel mt-5 flex items-start gap-3 p-4 text-left">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[var(--violet)]" style={{ background: "rgba(168,85,247,0.14)", border: "1px solid rgba(168,85,247,0.3)" }}>
                <PlayIcon size={18} />
              </div>
              <p className="text-[13px] leading-snug text-[var(--muted)]">
                Odayı kuran <b className="text-[var(--ink)]">moderatör</b> olur ve 6 haneli bir kod alır.
                Arkadaşların bu kodla katılır — herkes kendi telefonundan oynar.
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div key="join" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="panel p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl text-[var(--violet)]" style={{ background: "rgba(168,85,247,0.14)", border: "1px solid rgba(168,85,247,0.35)" }}>
                <KeyIcon size={22} />
              </div>
              <div>
                <p className="font-display text-xl font-bold leading-none">Odaya Katıl</p>
                <p className="mt-1 text-xs text-[var(--faint)]">
                  {account ? "Moderatörün kodunu gir." : "İsmini ve moderatörün kodunu gir."}
                </p>
              </div>
            </div>

            {/* Hesaplıysa isim sorulmaz — odaya hesabın adıyla girilir. */}
            {account ? (
              <div className="mb-4 flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.28)" }}>
                <CheckIcon size={16} />
                <p className="text-[13px] text-[var(--muted)]">
                  <b className="text-[var(--ink)]">{account.name}</b> olarak katılacaksın
                </p>
              </div>
            ) : (
              <>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--faint)]">İsmin</label>
                <input
                  value={name}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Örn. Emir"
                  maxLength={24}
                  className="input mb-4"
                />
              </>
            )}
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--faint)]">Oda Kodu</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
              className="input code-input"
            />
            <label className="mb-1.5 mt-4 block text-xs uppercase tracking-wider text-[var(--faint)]">Şifre <span className="normal-case text-[var(--faint)]">(gerekiyorsa)</span></label>
            <input
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guard(startJoin)}
              type="password"
              placeholder="Oda şifresiz ise boş bırak"
              maxLength={40}
              className="input"
            />
            {error && <p className="mt-3 text-center text-sm text-[var(--blood)]">{error}</p>}
            <button onClick={() => guard(startJoin)} disabled={busy !== null} className="btn btn-emerald btn-lg mt-5 w-full">
              {busy === "join" ? "Katılıyor…" : "Köye Gir"}
            </button>
            <button onClick={() => { setView("home"); setError(null); }} className="btn btn-ghost mt-2 w-full">
              <ArrowLeftIcon size={18} /> Geri
            </button>
          </motion.div>
        )}
      </div>

      {pactModal}
      {identityModal}
      <PactModal readOnly open={readPact} onAccept={() => setReadPact(false)} onCancel={() => setReadPact(false)} />
    </div>
  );
}
