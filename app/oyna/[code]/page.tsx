"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { useStream, postAction, usePlayerId, savePlayerId, clearPlayerId } from "@/app/_lib/client";
import { SceneBackdrop, TopBar, Spinner } from "@/app/_lib/ui";
import { roleMeta } from "@/lib/roles";
import {
  RoleGlyph, Burst, CrownIcon, BatIcon, JesterIcon, MoonIcon, SunIcon, SkullIcon,
  BallotIcon, CheckIcon, CrossIcon, CrystalIcon, CrosshairIcon,
} from "@/app/_lib/icons";

const TURN_ICON: Record<TurnInfo["kind"], (p: { size?: number; strokeWidth?: number }) => React.ReactElement> = {
  vampir: (p) => <BatIcon {...p} />,
  doktor: (p) => <CrossIcon {...p} />,
  medyum: (p) => <CrystalIcon {...p} />,
  hunter: (p) => <CrosshairIcon {...p} />,
};
import type { ParticipantView, TurnInfo, Team, Announcement } from "@/lib/types";

function buzz(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* yok say */
  }
}

type Raw = ParticipantView | { error: string } | { notfound: true };

export default function OynaPage() {
  const params = useParams();
  const code = Array.isArray(params.code) ? params.code[0] : (params.code as string) ?? "";
  const playerId = usePlayerId(code);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = code ? `/api/stream?code=${code}${playerId ? `&playerId=${playerId}` : ""}` : null;
  const raw = useStream<Raw>(url);
  const dbError = !!raw && "error" in raw;
  const notFound = !!raw && "notfound" in raw;
  const view = raw && !("error" in raw) && !("notfound" in raw) ? raw : null;

  const viewForMe = !!view && view.forPlayerId === playerId;

  useEffect(() => {
    if (viewForMe && playerId && !view!.exists) clearPlayerId(code);
  }, [viewForMe, view, playerId, code]);

  async function join() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const res = await postAction("join", { code, name: trimmed });
    setBusy(false);
    if (res.ok && res.playerId) {
      savePlayerId(code, res.playerId);
      buzz(20);
    } else {
      setError(res.error ?? "Katılım başarısız.");
    }
  }

  if (notFound) {
    return (
      <Center>
        <div className="max-w-xs text-center">
          <div className="text-5xl">🔍</div>
          <p className="mt-3 font-semibold">Oda bulunamadı</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{code} kodlu bir oda yok ya da kapandı.</p>
          <Link href="/" className="btn btn-violet mt-5 inline-flex">Ana sayfaya dön</Link>
        </div>
      </Center>
    );
  }
  if (dbError) {
    return (
      <Center>
        <div className="max-w-xs text-center">
          <div className="text-5xl">⚠️</div>
          <p className="mt-3 font-semibold">Sunucuya bağlanılamıyor</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Lütfen biraz sonra tekrar deneyin.</p>
        </div>
      </Center>
    );
  }
  if (!view) return <Center><Spinner label="Bağlanıyor…" /></Center>;

  const inGame = view.status === "in_progress";

  // Katıldık ama akış henüz bizim kimliğimize bağlanmadı
  if (playerId && !viewForMe) {
    return <Center><Spinner label="Lobiye giriliyor…" /></Center>;
  }

  // --- Katılmamış ---
  if (!view.self) {
    if (view.status !== "lobby") {
      return (
        <div className="mx-auto w-full max-w-md px-5 py-6">
          <TopBar code={code} inGame={false} />
          <div className="flex flex-1 flex-col items-center justify-center pt-16 text-center">
            <div className="text-6xl moon-pulse">🌙</div>
            <p className="mt-5 text-lg font-semibold">Bu odada bir oyun sürüyor</p>
            <p className="mt-1 text-[var(--muted)]">Yeni elin başlamasını bekleyin.</p>
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-md px-5 py-6 safe-b">
        <TopBar code={code} inGame={false} />
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
          <div className="mb-7 text-center">
            <div className="text-6xl float-slow">🧛</div>
            <h1 className="font-display title-glow mt-3 text-3xl font-black">Odaya Katıl</h1>
            <p className="mt-1 text-sm text-[var(--faint)]">Oda kodu: <b className="code-chip">{code}</b></p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); join(); }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="İsminiz"
              maxLength={24}
              autoFocus
              enterKeyHint="go"
              className="input"
            />
            {error && <p className="mt-2 text-sm text-[var(--blood)]">{error}</p>}
            <button type="submit" disabled={busy || !name.trim()} className="btn btn-blood btn-lg mt-4 w-full">
              {busy ? "Katılıyor…" : "Köye Gir"}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  const self = view.self;

  // --- Lobi ---
  if (view.status === "lobby") {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-6 safe-b">
        <TopBar code={code} inGame={false} />
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6 text-center">
          <div className="text-5xl float-slow">👋</div>
          <p className="mt-3 text-2xl font-bold">Merhaba {self.name}</p>
          <p className="mt-1 text-[var(--muted)]">Moderatörün başlatması bekleniyor…</p>
          <div className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--faint)]">
            <span className="inline-block h-2 w-2 animate-ping rounded-full bg-[var(--violet)]" />
            Lobide bekleniyor
          </div>
        </motion.div>
        <PlayerList players={view.players} selfId={self.id} />
      </div>
    );
  }

  // --- Oyun bitti ---
  if (view.status === "ended") {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-6 safe-b">
        <TopBar code={code} inGame={false} />
        <EndScreen view={view} />
      </div>
    );
  }

  // --- Oyun sürüyor ---
  const turn = view.turn;
  return (
    <div className="mx-auto w-full max-w-md px-5 py-6 safe-b">
      <SceneBackdrop phase={view.phase} />
      <MediumResult readings={self.readings} />
      <TopBar code={code} inGame={inGame} />
      <PhaseHeader view={view} />
      <RoleCard self={self} />

      {turn && turn.kind === "hunter" ? (
        // Avcı asıldı: ölü olsa bile son kurşununu kendi ekranından atar.
        <TurnScreen key="turn-hunter" turn={turn} selfId={self.id} code={code} />
      ) : !self.alive ? (
        <Panel key="dead" className="border-[var(--blood-deep)]">
          <div className="text-center">
            <div className="blood-shake mx-auto grid h-14 w-14 place-items-center text-[var(--blood)]"><SkullIcon size={44} strokeWidth={1.7} /></div>
            <p className="mt-2 font-bold text-[var(--blood)]">Öldün</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Ruhun köyü izliyor. Kimseye ipucu verme!</p>
          </div>
        </Panel>
      ) : turn ? (
        <TurnScreen key={"turn-" + turn.kind} turn={turn} selfId={self.id} code={code} />
      ) : view.mode === "phone" && view.nightActive ? (
        <NightSleep key="sleep" />
      ) : view.phase === "day" && view.vote.active ? (
        <VotePanel key="vote" view={view} selfId={self.id} code={code} />
      ) : (
        <WaitCard key="wait" view={view} />
      )}

      {view.announcement && !turn && <AnnouncementCard a={view.announcement} />}
    </div>
  );
}

/* ------------------------- Faz başlığı ------------------------- */
function PhaseHeader({ view }: { view: ParticipantView }) {
  const night = view.phase === "night";
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.82, rotate: night ? -20 : 20 }}
          onClick={() => buzz(10)}
          className={`grid h-12 w-12 place-items-center rounded-2xl ${night ? "moon-pulse" : "sun-pulse"}`}
          style={{ background: night ? "rgba(34,211,238,0.10)" : "rgba(245,158,11,0.12)", color: night ? "#22d3ee" : "#f59e0b" }}
          aria-label={night ? "Gece" : "Gündüz"}
        >
          <motion.span
            key={night ? "moon" : "sun"}
            initial={{ scale: 0, rotate: -90, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            {night ? <MoonIcon size={26} /> : <SunIcon size={26} />}
          </motion.span>
        </motion.button>
        <div>
          <p className="font-display text-lg font-bold leading-none">{night ? "Gece" : "Gündüz"}</p>
          <p className="text-xs text-[var(--faint)]">{view.dayNumber}. gün</p>
        </div>
      </div>
      <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "var(--muted)" }}>
        {view.players.filter((p) => p.alive).length} hayatta
      </span>
    </div>
  );
}

/* ------------------------- Rol kartı (göz ile aç/kapa) ------------------------- */
const REVEAL_MS = 6000;

function RoleCard({ self }: { self: NonNullable<ParticipantView["self"]> }) {
  const [revealed, setRevealed] = useState(false);
  const [showAbility, setShowAbility] = useState(false);
  const meta = roleMeta(self.role);
  const evil = self.role?.team === "vampir";
  const neutral = self.role?.special === "soytari";
  const accent = meta.accent;

  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => {
      setRevealed(false);
      setShowAbility(false);
    }, REVEAL_MS);
    return () => clearTimeout(t);
  }, [revealed]);

  if (!revealed) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => { buzz(15); setRevealed(true); }}
        className="panel relative mb-4 flex w-full items-center gap-4 overflow-hidden p-5 text-left"
        style={{ borderColor: "rgba(168,85,247,0.3)" }}
      >
        <motion.div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl"
          style={{ background: "rgba(168,85,247,0.14)", border: "1px solid rgba(168,85,247,0.4)" }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        >
          👁️
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-black leading-tight">Rolün gizli</p>
          <p className="mt-1 text-xs leading-snug text-[var(--muted)]">Yan yana oynarken başkaları görmesin. Görmek için <b>dokun</b>.</p>
          <span className="badge mt-2 inline-flex" style={{ background: "rgba(168,85,247,0.16)", color: "#d8b4fe" }}>👁 Göster</span>
        </div>
      </motion.button>
    );
  }

  return (
    <motion.div
      key="revealed"
      initial={{ opacity: 0, rotateX: -14, y: 6 }}
      animate={{ opacity: 1, rotateX: 0, y: 0 }}
      transition={{ type: "spring", stiffness: 130, damping: 15 }}
      className="panel relative mb-4 overflow-hidden p-5"
      style={{ borderColor: `${accent}55`, boxShadow: `0 12px 40px -18px ${meta.glow}` }}
    >
      <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full opacity-30 blur-2xl" style={{ background: accent }} />
      <div className="flex items-center gap-4">
        <motion.div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl"
          style={{ background: `${accent}22`, border: `1px solid ${accent}55`, color: accent }}
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <RoleGlyph role={self.role} size={34} strokeWidth={1.7} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-[var(--faint)]">Rolün</p>
          <p className="font-display text-2xl font-black leading-tight" style={{ color: accent }}>{self.role?.name ?? "—"}</p>
          <p className="text-xs text-[var(--muted)]">{meta.tagline}</p>
        </div>
        <button onClick={() => { setRevealed(false); setShowAbility(false); }} className="btn-ghost rounded-xl px-3 py-2 text-xs">🙈 Gizle</button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {neutral ? (
          <span className="badge" style={{ background: "rgba(236,72,153,0.18)", color: "#f9a8d4" }}>🃏 Tarafsız · Soytarı</span>
        ) : (
          <span className="badge" style={{ background: evil ? "rgba(239,68,68,0.16)" : "rgba(52,211,153,0.16)", color: evil ? "#fca5a5" : "#6ee7b7" }}>
            {evil ? "🧛 Vampir takımı" : "🏡 Köy takımı"}
          </span>
        )}
        <button onClick={() => setShowAbility((s) => !s)} className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "var(--muted)" }}>
          {showAbility ? "Yeteneği gizle" : "Yeteneği gör"}
        </button>
      </div>

      {neutral && (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "rgba(236,72,153,0.35)", background: "rgba(236,72,153,0.08)" }}>
          <p className="text-xs font-semibold" style={{ color: "#f9a8d4" }}>🎯 Amacın</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Gündüz oylamasında <b className="text-[var(--ink)]">kendini astır</b>. Başarırsan tek başına kazanırsın! Vampirler seni öldürürse ya da bir taraf kazanırsa kaybedersin.</p>
        </div>
      )}

      <motion.div animate={{ height: showAbility ? "auto" : 0, opacity: showAbility ? 1 : 0 }} initial={false} transition={{ duration: 0.28 }} className="overflow-hidden">
        <p className="mt-3 rounded-xl bg-[rgba(255,255,255,0.04)] p-3 text-sm text-[var(--muted)]">{meta.ability}</p>
      </motion.div>

      {self.teammates.length > 0 && (
        <div className="mt-3 rounded-xl border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3">
          <p className="text-xs font-semibold text-[#fca5a5]">🩸 Vampir kardeşlerin</p>
          <p className="mt-1 text-sm">{self.teammates.map((t) => t.name).join(", ")}</p>
        </div>
      )}

      {self.readings.length > 0 && (
        <div className="mt-3 rounded-xl border border-[rgba(168,85,247,0.25)] bg-[rgba(168,85,247,0.08)] p-3">
          <p className="text-xs font-semibold text-[#d8b4fe]">🔮 Ruh defterin</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {self.readings.map((r, i) => (
              <li key={i} className="flex justify-between">
                <span>{r.day}. gece · {r.targetName}</span>
                <span style={{ color: r.team === "vampir" ? "#fca5a5" : "#6ee7b7" }}>{r.team === "vampir" ? "🩸 Vampir" : "😇 Masum"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <motion.div className="mt-3 h-0.5 rounded-full" style={{ background: accent, transformOrigin: "left" }} initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: REVEAL_MS / 1000, ease: "linear" }} />
    </motion.div>
  );
}

/* ------------------------- Medyum sonucu (görsün sonra yatsın) ------------------------- */
const MEDIUM_SHOW_MS = 6000;

function MediumResult({ readings }: { readings: { targetName: string; team: Team; day: number }[] }) {
  const latest = readings.length ? readings[readings.length - 1] : null;
  const latestKey = latest ? `${latest.day}-${latest.targetName}` : "";
  // Mount'ta mevcut son okuma "görülmüş" sayılır; yalnızca YENİ okuma açılır.
  const [seenKey, setSeenKey] = useState(latestKey);
  const show = !!latest && latestKey !== seenKey;

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setSeenKey(latestKey), MEDIUM_SHOW_MS);
    return () => clearTimeout(t);
  }, [show, latestKey]);

  if (!show || !latest) return null;
  const vamp = latest.team === "vampir";
  const color = vamp ? "#ef4444" : "#34d399";

  return (
    <motion.button
      initial={{ opacity: 0, y: -30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 18 }}
      onClick={() => setSeenKey(latestKey)}
      className="fixed inset-x-0 top-3 z-40 mx-auto flex w-[min(92%,26rem)] flex-col items-center rounded-2xl p-5 text-center"
      style={{ background: "rgba(18,12,32,0.96)", border: `2px solid ${color}`, boxShadow: `0 16px 50px -12px ${color}aa`, backdropFilter: "blur(8px)" }}
    >
      <motion.div className="text-5xl" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>
        {vamp ? "🩸" : "😇"}
      </motion.div>
      <p className="mt-1 text-xs uppercase tracking-widest text-[var(--faint)]">🔮 Ruh Okuması</p>
      <p className="mt-1 text-lg">
        <b>{latest.targetName}</b>
      </p>
      <p className="font-display text-2xl font-black" style={{ color }}>
        {vamp ? "VAMPİR!" : "Masum · vampir değil"}
      </p>
      <p className="mt-2 text-[11px] text-[var(--faint)]">Kapatmak için dokun</p>
      <motion.div className="mt-2 h-0.5 w-full rounded-full" style={{ background: color, transformOrigin: "left" }} initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: MEDIUM_SHOW_MS / 1000, ease: "linear" }} />
    </motion.button>
  );
}

/* ------------------------- Gece / sıra ekranı ------------------------- */
const TURN_THEME: Record<TurnInfo["kind"], { icon: string; title: string; hint: string; color: string; btn: string }> = {
  vampir: { icon: "🧛", title: "Avını Seç", hint: "Bu gece kimi öldüreceksin?", color: "#ef4444", btn: "btn-blood" },
  doktor: { icon: "🩺", title: "Kimi Koruyacaksın?", hint: "Vampirler ona saldırırsa kurtarırsın.", color: "#22d3ee", btn: "btn-moon" },
  medyum: { icon: "🔮", title: "Bir Ruhu Oku", hint: "Seçtiğinin takımını öğreneceksin.", color: "#a855f7", btn: "btn-violet" },
  hunter: { icon: "🏹", title: "Son Kurşun", hint: "Asıldın! Ölmeden birini yanında götür.", color: "#f59e0b", btn: "btn-amber" },
};

function TurnScreen({ turn, selfId, code }: { turn: TurnInfo; selfId: string; code: string }) {
  const [sel, setSel] = useState<string | null>(turn.myPick);
  const [busy, setBusy] = useState(false);
  const theme = TURN_THEME[turn.kind];

  async function confirm(skip = false) {
    if (!skip && !sel) return;
    setBusy(true);
    buzz(25);
    if (turn.kind === "hunter") {
      await postAction("playerHunterShoot", { code, playerId: selfId, targetId: skip ? null : sel });
    } else {
      await postAction("nightAction", { code, playerId: selfId, kind: turn.kind, targetId: sel });
    }
    setBusy(false);
  }

  const locked = turn.kind !== "vampir" && turn.myPick !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="panel relative overflow-hidden p-5 pulse-glow"
      style={{ borderColor: `${theme.color}66` }}
    >
      <div className="text-center">
        <motion.div className="mx-auto grid h-14 w-14 place-items-center" style={{ color: theme.color }} animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1.8, repeat: Infinity }}>{TURN_ICON[turn.kind]({ size: 46, strokeWidth: 1.7 })}</motion.div>
        <h3 className="font-display mt-2 text-2xl font-black" style={{ color: theme.color }}>{theme.title}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{theme.hint}</p>
        {turn.note && <p className="mt-1 text-xs text-[var(--faint)]">💡 {turn.note}</p>}
      </div>

      {turn.mates && turn.mates.length > 0 && (
        <div className="mt-3 rounded-xl border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3 text-xs">
          <p className="mb-1 font-semibold text-[#fca5a5]">🩸 Kardeşlerinin seçimi</p>
          <ul className="space-y-0.5">
            {turn.mates.map((m) => (
              <li key={m.id} className="flex items-center justify-between">
                <span>{m.name}</span>
                <span style={{ color: m.targetName ? "#fca5a5" : "var(--faint)" }}>
                  {m.targetName ? `→ ${m.targetName}` : "seçmedi…"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-[var(--faint)]">Herkesin oyu tamamlanınca en çok oyu alan tek kişi ölür — anlaşın.</p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {turn.candidates.map((c) => {
          const n = turn.kind === "vampir" ? turn.teamPicks?.find((t) => t.id === c.id)?.count ?? 0 : 0;
          return (
            <button key={c.id} disabled={locked} onClick={() => { buzz(); setSel(c.id); }} className={`pick relative ${sel === c.id ? "pick-on" : ""}`} style={{ ["--sel" as string]: theme.color }}>
              {c.name}
              {n > 0 && (
                <span
                  className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold"
                  style={{ background: theme.color, color: "#1a0606" }}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <button onClick={() => confirm(false)} disabled={busy || !sel || locked} className={`btn ${theme.btn} flex-1`}>
          {locked ? "Seçim yapıldı ✓" : turn.kind === "hunter" ? "🔫 Ateş et" : "Onayla"}
        </button>
        {turn.kind === "hunter" && (
          <button onClick={() => confirm(true)} disabled={busy} className="btn btn-ghost">Vazgeç</button>
        )}
      </div>
      {locked && <p className="mt-2 text-center text-xs text-[var(--faint)]">Diğer roller bekleniyor…</p>}
    </motion.div>
  );
}

/* ------------------------- Uyku ekranı ------------------------- */
function NightSleep() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panel p-8 text-center">
      <motion.div className="text-6xl" animate={{ opacity: [0.4, 1, 0.4], y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity }}>😴</motion.div>
      <p className="font-display mt-4 text-xl font-bold">Gözlerini Kapat</p>
      <p className="mt-1 text-sm text-[var(--muted)]">Köy uykuda. Sıra sende değil — bekle.</p>
      <div className="mt-4 flex justify-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="inline-block h-2 w-2 rounded-full bg-[var(--violet)]" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
        ))}
      </div>
    </motion.div>
  );
}

/* ------------------------- Bekleme kartı ------------------------- */
function WaitCard({ view }: { view: ParticipantView }) {
  const night = view.phase === "night";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panel p-6 text-center">
      <div className="text-4xl">{night ? "🌙" : "☀️"}</div>
      <p className="mt-3 text-[var(--muted)]">
        {view.mode === "verbal"
          ? "Oyun sözlü yönetiliyor. Moderatörü dinleyin."
          : night
            ? "Gece sürüyor…"
            : "Gündüz — tartışma sürüyor. Oylama bekleniyor."}
      </p>
    </motion.div>
  );
}

/* ------------------------- Oylama ------------------------- */
function VotePanel({ view, selfId, code }: { view: ParticipantView; selfId: string; code: string }) {
  const [busy, setBusy] = useState(false);
  async function vote(targetId: string) {
    setBusy(true);
    buzz(18);
    if (view.vote.myVote === targetId) await postAction("unvote", { code, playerId: selfId });
    else await postAction("vote", { code, playerId: selfId, targetId });
    setBusy(false);
  }
  // Ölenler hariç herkes listelenir — kendine de oy verilebilir.
  const candidates = view.players.filter((p) => p.alive);
  const countFor = (id: string) => view.vote.tally.find((t) => t.targetId === id)?.count ?? 0;
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="panel p-5" style={{ borderColor: "rgba(245,158,11,0.4)" }}>
      <div className="text-center">
        <div className="sun-pulse mx-auto grid h-12 w-12 place-items-center text-[var(--amber)]"><BallotIcon size={38} /></div>
        <h3 className="font-display mt-1 text-xl font-black text-[var(--amber)]">Kimi Asalım?</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">{view.vote.count}/{view.vote.total} oy verildi</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {candidates.map((p) => {
          const mine = view.vote.myVote === p.id;
          const n = countFor(p.id);
          const isSelf = p.id === selfId;
          return (
            <button key={p.id} disabled={busy} onClick={() => vote(p.id)} className={`pick relative ${mine ? "pick-on" : ""}`} style={{ ["--sel" as string]: "#f59e0b" }}>
              {mine && "🪢 "}{p.name}{isSelf && " (sen)"}
              {n > 0 && (
                <span
                  className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold"
                  style={{ background: "#f59e0b", color: "#1a1206" }}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {view.vote.myVote && <p className="mt-3 text-center text-xs text-[var(--faint)]">Değiştirmek için tekrar dokun.</p>}
    </motion.div>
  );
}

/* ------------------------- Duyuru ------------------------- */
function teamColor(t: Team | null | undefined) {
  return t === "vampir" ? "#fca5a5" : "#6ee7b7";
}
function AnnouncementCard({ a }: { a: Announcement }) {
  return (
    <motion.div
      key={a.at}
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="panel mt-4 overflow-hidden p-5 text-center"
      style={{ borderColor: a.dead ? "rgba(239,68,68,0.4)" : "rgba(52,211,153,0.35)" }}
    >
      <p className="font-display text-sm uppercase tracking-widest text-[var(--faint)]">{a.title}</p>
      {a.dead ? (
        <motion.div className="mt-2 grid place-items-center text-[var(--blood)]" initial={{ scale: 0.5, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200 }}><SkullIcon size={46} strokeWidth={1.7} /></motion.div>
      ) : (
        <div className="mt-2 grid place-items-center text-[var(--emerald)]"><CheckIcon size={44} /></div>
      )}
      <div className="mt-2 space-y-1">
        {a.lines.map((l, i) => (
          <p key={i} className={i === 0 ? "text-lg font-bold" : "text-sm text-[var(--muted)]"}>{l}</p>
        ))}
      </div>
      {a.dead && (
        <span className="badge mt-3" style={{ background: "rgba(255,255,255,0.06)", color: teamColor(a.dead.team) }}>{a.dead.roleName}</span>
      )}
    </motion.div>
  );
}

/* ------------------------- Bitiş ekranı ------------------------- */
function EndScreen({ view }: { view: ParticipantView }) {
  const jester = view.winner === "soytari";
  const evil = view.winner === "vampir";
  const decided = jester || evil || view.winner === "koy";
  const accent = jester ? "#ec4899" : evil ? "#ef4444" : "#34d399";
  const textColor = jester ? "#f9a8d4" : evil ? "#fca5a5" : "#6ee7b7";
  const palette = jester
    ? ["#ec4899", "#f472b6", "#a855f7", "#f59e0b", "#ffffff"]
    : evil
      ? ["#ef4444", "#b91c1c", "#a855f7", "#fca5a5", "#f59e0b"]
      : ["#34d399", "#6ee7b7", "#22d3ee", "#f59e0b", "#ffffff"];
  const WinIcon = jester ? JesterIcon : evil ? BatIcon : CrownIcon;
  const title = jester ? "Soytarı Kazandı" : evil ? "Vampirler Kazandı" : view.winner === "koy" ? "Köy Kazandı" : "Oyun Bitti";
  const subtitle = jester ? "Herkesi kandırıp darağacına çıktı." : evil ? "Karanlık köyü ele geçirdi." : view.winner === "koy" ? "Köy şafağa kavuştu." : "El sona erdi.";

  // Bu oyuncu kazandı mı? Soytarı yalnızca kendisi astırılınca kazanır; köy
  // kazanınca soytarı kaybeder.
  const myTeam = view.self?.role?.team ?? null;
  const iAmJester = view.self?.role?.special === "soytari";
  const iWon = decided
    ? jester
      ? iAmJester
      : evil
        ? myTeam === "vampir"
        : myTeam === "koy" && !iAmJester
    : null;

  return (
    <div className="mt-2">
      <motion.div
        initial={{ opacity: 0, scale: 0.82, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 150, damping: 13 }}
        className="panel relative overflow-hidden p-7 text-center"
        style={{ borderColor: `${accent}88`, boxShadow: `0 20px 60px -20px ${accent}aa` }}
      >
        {decided && <Burst palette={palette} />}
        <div className="pointer-events-none absolute -top-16 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full opacity-40 blur-3xl" style={{ background: accent }} />

        <motion.div
          className="relative mx-auto grid h-24 w-24 place-items-center"
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: `radial-gradient(circle, ${accent}55, transparent 70%)` }}
            animate={{ scale: [1, 1.18, 1] }}
            transition={{ duration: 2.4, repeat: Infinity }}
          />
          <span style={{ color: jester ? "#f9a8d4" : evil ? "#fca5a5" : "#fde68a" }}>
            <WinIcon size={62} strokeWidth={1.6} />
          </span>
        </motion.div>

        <p className="relative mt-4 text-xs uppercase tracking-[0.3em] text-[var(--faint)]">
          {decided ? "Zafer" : "Sonuç"}
        </p>
        <h2 className="font-display title-glow relative mt-1 text-[2rem] font-black leading-tight" style={{ color: textColor }}>
          {title}
        </h2>
        <p className="relative mt-2 text-sm text-[var(--muted)]">{subtitle}</p>

        {iWon !== null && (
          <span
            className="badge relative mt-4"
            style={{
              background: iWon ? "rgba(52,211,153,0.16)" : "rgba(239,68,68,0.14)",
              color: iWon ? "#6ee7b7" : "#fca5a5",
            }}
          >
            {iWon ? "🎉 Kazandın" : "💀 Kaybettin"}
          </span>
        )}
      </motion.div>

      {view.reveal && (
        <div className="panel mt-4 p-4">
          <p className="mb-3 text-xs uppercase tracking-wider text-[var(--faint)]">Tüm Roller</p>
          <ul className="space-y-1.5">
            {view.reveal.map((r, i) => {
              const rc = r.roleKey
                ? { key: r.roleKey, name: r.roleName ?? r.roleKey, team: r.team ?? "koy", enabled: true, count: 0, special: r.special }
                : null;
              const m = roleMeta(rc);
              return (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  className="flex items-center justify-between rounded-xl bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm"
                >
                  <span className={`flex items-center gap-2.5 ${r.alive ? "" : "text-[var(--faint)] line-through"}`}>
                    <span style={{ color: m.accent }}><RoleGlyph role={rc} size={18} /></span>
                    {r.name}
                  </span>
                  <span style={{ color: r.special === "soytari" ? "#f9a8d4" : teamColor(r.team) }}>{r.roleName ?? "—"}</span>
                </motion.li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="mt-6 text-center text-sm text-[var(--faint)]">Yeni elin başlamasını bekleyin…</p>
    </div>
  );
}

/* ------------------------- Ortak ------------------------- */
function PlayerList({ players, selfId }: { players: { id: string; name: string }[]; selfId: string }) {
  return (
    <div className="panel mt-6 p-4">
      <p className="mb-2 text-xs uppercase tracking-wider text-[var(--faint)]">Oyuncular ({players.length})</p>
      <ul className="grid grid-cols-2 gap-2">
        {players.map((p, i) => (
          <motion.li key={p.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }} className="rounded-xl bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm">
            {p.name}{p.id === selfId && <span className="text-[var(--violet)]"> (sen)</span>}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`panel p-5 ${className}`}>{children}</motion.div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center px-5 py-10">{children}</div>;
}
