"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { postAction, savePlayerId } from "@/app/_lib/client";

const roleEmojis = ["🧛", "🩺", "🔮", "🏹", "🧑‍🌾"];

export default function Home() {
  const router = useRouter();
  const [view, setView] = useState<"home" | "join">("home");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<null | "create" | "join">(null);
  const [error, setError] = useState<string | null>(null);

  async function createRoom() {
    setBusy("create");
    setError(null);
    const res = await postAction("createRoom");
    if (res.ok && res.code) {
      router.push(`/moderator/${res.code}`);
    } else {
      setBusy(null);
      setError(res.error ?? "Oda oluşturulamadı.");
    }
  }

  async function joinRoom() {
    const n = name.trim();
    const c = code.replace(/\D/g, "").slice(0, 6);
    if (!n || c.length !== 6) {
      setError("İsim ve 6 haneli kodu girin.");
      return;
    }
    setBusy("join");
    setError(null);
    const res = await postAction("join", { code: c, name: n });
    if (res.ok && res.playerId) {
      savePlayerId(c, res.playerId);
      router.push(`/oyna/${c}`);
    } else {
      setBusy(null);
      setError(res.error ?? "Katılım başarısız.");
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 safe-b">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-center"
      >
        <motion.div
          className="text-7xl float-slow"
          animate={{ rotate: [-6, 6, -6] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          🧛
        </motion.div>
        <h1 className="font-display title-glow mt-4 text-5xl font-black tracking-tight">Vampir Köylü</h1>
        <div className="mt-4 flex justify-center gap-2 text-2xl">
          {roleEmojis.map((r, i) => (
            <motion.span key={i} animate={{ y: [0, -8, 0] }} transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.18 }}>
              {r}
            </motion.span>
          ))}
        </div>
      </motion.div>

      <div className="mt-10 w-full max-w-sm">
        {view === "home" ? (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid gap-3"
          >
            <button onClick={createRoom} disabled={busy !== null} className="btn btn-blood btn-lg">
              {busy === "create" ? "Oda kuruluyor…" : "🎮 Oyun Oluştur"}
            </button>
            <button onClick={() => { setView("join"); setError(null); }} disabled={busy !== null} className="btn btn-violet btn-lg">
              🔑 Oyuna Katıl
            </button>
            {error && <p className="mt-1 text-center text-sm text-[var(--blood)]">{error}</p>}
            <p className="mt-4 text-center text-sm text-[var(--faint)]">
              Odayı kuran <b>moderatör</b> olur ve 6 haneli bir kod alır. Diğerleri bu kodla katılır.
            </p>
          </motion.div>
        ) : (
          <motion.div key="join" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="panel p-5">
            <p className="font-display mb-4 text-center text-xl font-bold">Odaya Katıl</p>
            <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--faint)]">İsmin</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Emir"
              maxLength={24}
              className="input mb-4"
            />
            <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--faint)]">Oda Kodu</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
              inputMode="numeric"
              placeholder="000000"
              className="input code-input"
            />
            {error && <p className="mt-3 text-center text-sm text-[var(--blood)]">{error}</p>}
            <button onClick={joinRoom} disabled={busy !== null} className="btn btn-emerald btn-lg mt-4 w-full">
              {busy === "join" ? "Katılıyor…" : "Köye Gir"}
            </button>
            <button onClick={() => { setView("home"); setError(null); }} className="btn btn-ghost mt-2 w-full">
              ← Geri
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
