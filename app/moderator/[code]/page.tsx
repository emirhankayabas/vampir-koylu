"use client";

import { createContext, useContext, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { useStream, postAction } from "@/app/_lib/client";
import { SceneBackdrop, TopBar, Spinner } from "@/app/_lib/ui";
import { roleMeta } from "@/lib/roles";
import type { ModeratorView, RoleConfig, Game } from "@/lib/types";

/* Oda kodunu ağaç boyunca taşımak için context + bağlı aksiyon yardımcı. */
const CodeContext = createContext<string>("");
function useAct() {
  const code = useContext(CodeContext);
  return (action: string, payload: Record<string, unknown> = {}) => postAction(action, { code, ...payload });
}

type Raw = ModeratorView | { error: string } | { notfound: true };

export default function ModeratorPage() {
  const params = useParams();
  const code = Array.isArray(params.code) ? params.code[0] : (params.code as string) ?? "";
  const raw = useStream<Raw>(code ? `/api/stream?role=moderator&code=${code}` : null);

  if (!raw) return <FullScreen><Spinner label="Bağlanıyor…" /></FullScreen>;
  if ("notfound" in raw) {
    return (
      <FullScreen>
        <div className="max-w-xs text-center">
          <div className="text-5xl">🔍</div>
          <p className="mt-3 font-semibold">Oda bulunamadı</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{code} kodlu oda yok ya da kapandı.</p>
          <Link href="/" className="btn btn-violet mt-5 inline-flex">Ana sayfa</Link>
        </div>
      </FullScreen>
    );
  }
  if ("error" in raw || !raw.game) {
    return (
      <FullScreen>
        <div className="max-w-sm text-center">
          <div className="text-5xl">⚠️</div>
          <p className="mt-3 font-semibold">Veritabanına bağlanılamıyor</p>
          <p className="mt-1 text-sm text-[var(--muted)]">MongoDB bağlantısını (MONGODB_URI) kontrol edin.</p>
        </div>
      </FullScreen>
    );
  }

  const view = raw;
  const game = view.game;
  const inGame = game.status === "in_progress";

  return (
    <CodeContext.Provider value={code}>
      <div className="mx-auto min-h-full w-full max-w-xl px-4 py-6 safe-b">
        {inGame && <SceneBackdrop phase={game.phase} />}
        <TopBar code={code} inGame={inGame} />
        <header className="mb-5 flex items-center justify-between">
          <h1 className="font-display title-glow text-2xl font-black">🕹️ Moderatör</h1>
          <StatusBadge status={game.status} />
        </header>

        <motion.div key={game.status} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {game.status === "lobby" && <Lobby view={view} code={code} />}
          {game.status === "in_progress" && <InProgress view={view} />}
          {game.status === "ended" && <Ended view={view} />}
        </motion.div>

        <LogPanel game={game} />
      </div>
    </CodeContext.Provider>
  );
}

/* ----------------------------- LOBİ ----------------------------- */
function Lobby({ view, code }: { view: ModeratorView; code: string }) {
  const game = view.game;
  const act = useAct();
  const [draft, setDraft] = useState<RoleConfig[]>(game.roles);
  const [err, setErr] = useState<string | null>(null);
  const [modeSel, setModeSel] = useState(game.mode);
  function chooseMode(m: "phone" | "verbal") {
    setModeSel(m);
    act("setMode", { mode: m });
  }

  const totalSpecial = draft.filter((r) => r.enabled && !r.fill).reduce((s, r) => s + r.count, 0);

  function update(i: number, patch: Partial<RoleConfig>) {
    setDraft((d) => d.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  async function saveRoles() {
    const res = await act("saveRoles", { roles: draft });
    setErr(res.ok ? null : res.error ?? "Kaydedilemedi.");
  }
  async function start() {
    await act("saveRoles", { roles: draft });
    const res = await act("start");
    setErr(res.ok ? null : res.error ?? "Başlatılamadı.");
  }

  return (
    <div className="space-y-5">
      {/* Oda kodu kartı */}
      <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="panel p-5 text-center" style={{ borderColor: "rgba(168,85,247,0.4)" }}>
        <p className="text-xs uppercase tracking-widest text-[var(--faint)]">Oda Kodu</p>
        <p className="code-chip mt-1 text-5xl font-black" style={{ color: "var(--violet)" }}>{code}</p>
        <p className="mt-2 text-xs text-[var(--muted)]">Bu kodu arkadaşlarına ver — ana sayfadan <b>“Oyuna Katıl”</b> deyip girsinler.</p>
      </motion.div>

      <Section title="Oyun Modu">
        <div className="grid grid-cols-2 gap-2">
          <ModeButton active={modeSel === "phone"} onClick={() => chooseMode("phone")} label="📱 Telefondan" desc="Roller kendi ekranından oynar (önerilen)" />
          <ModeButton active={modeSel === "verbal"} onClick={() => chooseMode("verbal")} label="🗣️ Sözlü" desc="Her şeyi konuşarak sen yönet" />
        </div>
      </Section>

      <Section title="Roller & Adet">
        <div className="space-y-2">
          {draft.map((r, i) => {
            const meta = roleMeta(r);
            const evil = r.team === "vampir";
            return (
              <motion.div
                key={r.key}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`panel-tight flex items-center gap-3 border p-3 transition ${r.enabled ? "" : "opacity-45"}`}
                style={{ borderColor: r.enabled ? `${meta.accent}44` : "var(--panel-line)", background: "rgba(255,255,255,0.03)" }}
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: `${meta.accent}22`, border: `1px solid ${meta.accent}44` }}>{meta.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{r.name}</span>
                    <span className="badge" style={{ background: evil ? "rgba(239,68,68,0.16)" : "rgba(52,211,153,0.14)", color: evil ? "#fca5a5" : "#6ee7b7" }}>{evil ? "Vampir" : "Köy"}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-tight text-[var(--faint)]">{meta.ability}</p>
                </div>
                {r.fill ? (
                  <span className="shrink-0 text-center text-[10px] text-[var(--faint)]">kalan<br />herkes</span>
                ) : (
                  <Stepper value={r.count} onChange={(v) => update(i, { count: v, enabled: v > 0 })} accent={meta.accent} />
                )}
              </motion.div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className={totalSpecial > game.players.length ? "text-[var(--blood)]" : "text-[var(--muted)]"}>
            Özel rol: {totalSpecial} / Oyuncu: {game.players.length}
          </span>
          <button onClick={saveRoles} className="btn btn-ghost px-3 py-1.5 text-sm">Kaydet</button>
        </div>
      </Section>

      <Section title={`Oyuncular (${game.players.length})`}>
        {game.players.length === 0 ? (
          <p className="rounded-xl bg-[rgba(255,255,255,0.03)] px-4 py-6 text-center text-sm text-[var(--faint)]">Henüz katılan yok. Kodu paylaş; oyuncular ana sayfadan girsin.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {game.players.map((p) => (
              <motion.li key={p.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center justify-between rounded-xl bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm">
                <span className="truncate">{p.name}</span>
                <button onClick={() => act("kick", { targetId: p.id })} className="ml-2 shrink-0 text-xs text-[var(--faint)] hover:text-[var(--blood)]">✕</button>
              </motion.li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Rol Dağıtımı">
        <AssignModeSwitch mode={game.assignMode} />
        {game.assignMode === "manual" && <ManualAssign game={game} />}
      </Section>

      {err && <p className="text-sm text-[var(--blood)]">{err}</p>}
      <div className="flex gap-2">
        <button onClick={start} disabled={game.players.length === 0} className="btn btn-emerald btn-lg flex-1">▶️ Oyunu Başlat</button>
        <ResetButton />
      </div>
      <CloseRoomButton />
    </div>
  );
}

/* --------------------------- OYUN SÜRÜYOR --------------------------- */
function InProgress({ view }: { view: ModeratorView }) {
  const game = view.game;
  const act = useAct();
  const alive = game.players.filter((p) => p.alive);
  const [nightPicks, setNightPicks] = useState<Set<string>>(new Set());
  const hunter = game.pendingHunterId ? game.players.find((p) => p.id === game.pendingHunterId) : null;

  function toggleNight(id: string) {
    setNightPicks((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  async function resolveNight() {
    await act("nightResolve", { deaths: [...nightPicks] });
    setNightPicks(new Set());
  }

  return (
    <div className="space-y-5">
      <motion.div
        key={game.phase}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="panel flex items-center justify-between p-4"
      >
        <span className="flex items-center gap-2 font-semibold">
          <motion.span key={game.phase + "i"} initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} className={game.phase === "night" ? "moon-pulse" : "sun-pulse"}>
            {game.phase === "night" ? "🌙" : "☀️"}
          </motion.span>
          {game.phase === "night" ? "Gece" : "Gündüz"} · {game.dayNumber}. gün
        </span>
        <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "var(--muted)" }}>{alive.length} hayatta</span>
      </motion.div>

      {game.winner && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="panel p-4 text-center font-bold"
          style={{ borderColor: game.winner === "vampir" ? "rgba(239,68,68,0.5)" : "rgba(52,211,153,0.5)", color: game.winner === "vampir" ? "#fca5a5" : "#6ee7b7" }}
        >
          {game.winner === "vampir" ? "🧛 Vampirler kazandı" : "🏡 Köy kazandı"} — oyunu bitirebilirsin.
        </motion.div>
      )}

      {game.announcement && <ModAnnouncement game={game} />}

      {hunter && (
        <Section title={`🏹 Avcı atışı — ${hunter.name}`}>
          <p className="mb-2 text-sm text-[var(--muted)]">Avcı kendi telefonundan seçebilir. Gerekirse onun adına seç:</p>
          <div className="grid grid-cols-2 gap-2">
            {alive.filter((p) => p.id !== hunter.id).map((p) => (
              <button key={p.id} onClick={() => act("hunterShoot", { targetId: p.id })} className="pick" style={{ ["--sel" as string]: "#f59e0b" }}>{p.name}</button>
            ))}
          </div>
          <button onClick={() => act("hunterSkip")} className="btn btn-ghost mt-2 w-full">Atış yapmadan geç</button>
        </Section>
      )}

      {game.mode === "phone" && !hunter && (
        <motion.div key={game.phase + "-body"} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }}>
          {game.phase === "night" && game.night.active && view.night && (
            <Section title="🌙 Gece — otomatik akış">
              <div className="panel-tight border border-[var(--panel-line)] bg-[rgba(255,255,255,0.03)] p-4">
                <p className="font-display text-lg font-bold">{view.night.label}</p>
                {view.night.waiting.length > 0 ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">Bekleniyor: <span className="text-[var(--ink)]">{view.night.waiting.join(", ")}</span></p>
                ) : (
                  <p className="mt-1 text-sm text-[var(--faint)]">Çözümleniyor…</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => act("nightSkip")} className="btn btn-ghost flex-1 text-sm">Bu adımı atla</button>
                  <button onClick={() => act("nightForceResolve")} className="btn btn-ghost flex-1 text-sm">Geceyi bitir</button>
                </div>
              </div>
              <p className="mt-2 text-center text-xs text-[var(--faint)]">Roller telefonlarından sırayla oynuyor; herkes bitince sabah otomatik gelir.</p>
            </Section>
          )}

          {game.phase === "day" && (
            <Section title="☀️ Gündüz">
              {!game.vote.active ? (
                <div className="space-y-2">
                  <button onClick={() => act("voteStart")} className="btn btn-amber w-full">🗳️ Oylamayı başlat</button>
                  {(() => {
                    const canNext = game.hangedThisDay || !!game.winner;
                    return (
                      <>
                        <button
                          onClick={() => act("nextNight")}
                          disabled={!canNext}
                          className="btn btn-violet w-full"
                        >
                          🌙 Yeni geceye geç
                        </button>
                        {!canNext && (
                          <p className="text-center text-xs text-[var(--faint)]">
                            Yeni geceye geçmek için önce bir kişi asılmalı.
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--muted)]">Canlı oylar ({Object.keys(game.vote.votes).length}/{alive.length})</p>
                  <VoteTally view={view} />
                  <div className="flex gap-2">
                    <button onClick={() => act("voteEnd")} className="btn btn-blood flex-1">Oylamayı bitir & uygula</button>
                    <button onClick={() => act("voteCancel")} className="btn btn-ghost">İptal</button>
                  </div>
                  <p className="text-center text-xs text-[var(--faint)]">Herkes oy verince otomatik sonuçlanır.</p>
                </div>
              )}
            </Section>
          )}
        </motion.div>
      )}

      {game.mode === "verbal" && !hunter && (
        <div>
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => act(game.phase === "night" ? "nightResolve" : "nextNight", game.phase === "night" ? { deaths: [] } : {})}
              disabled={game.phase === "day" && !game.hangedThisDay && !game.winner}
              className="btn btn-ghost flex-1 text-sm"
            >
              {game.phase === "night" ? "Gündüze geç" : "Yeni geceye geç"}
            </button>
          </div>
          {game.phase === "day" && !game.hangedThisDay && !game.winner && (
            <p className="mb-3 text-center text-xs text-[var(--faint)]">Yeni geceye geçmek için önce bir kişi asılmalı.</p>
          )}
          {game.phase === "night" && (
            <Section title="🌙 Gece — ölenleri seç">
              <div className="grid grid-cols-2 gap-2">
                {alive.map((p) => (
                  <button key={p.id} onClick={() => toggleNight(p.id)} className={`pick ${nightPicks.has(p.id) ? "pick-on" : ""}`} style={{ ["--sel" as string]: "#ef4444" }}>{p.name}</button>
                ))}
              </div>
              <button onClick={resolveNight} className="btn btn-amber mt-3 w-full">Geceyi bitir → Gündüz</button>
            </Section>
          )}
          {game.phase === "day" && (
            <Section title="🗳️ Oylama">
              {!game.vote.active ? (
                <button onClick={() => act("voteStart")} className="btn btn-amber w-full">Oylamayı başlat</button>
              ) : (
                <div className="space-y-3">
                  <VoteTally view={view} hangable />
                  <button onClick={() => act("voteCancel")} className="btn btn-ghost w-full text-sm">Oylamayı iptal et</button>
                </div>
              )}
            </Section>
          )}
        </div>
      )}

      <Section title="Oyuncular & Roller">
        <div className="space-y-1.5">
          {game.players.map((p) => <PlayerRow key={p.id} game={game} playerId={p.id} />)}
        </div>
      </Section>

      <div className="flex gap-2">
        <button onClick={() => act("end")} className="btn btn-ghost flex-1">⏹️ Bitir</button>
        <ResetButton />
      </div>
      <CloseRoomButton />
    </div>
  );
}

function VoteTally({ view, hangable = false }: { view: ModeratorView; hangable?: boolean }) {
  const act = useAct();
  if (view.tally.length === 0) return <p className="text-sm text-[var(--faint)]">Henüz oy yok.</p>;
  const max = Math.max(...view.tally.map((t) => t.count), 1);
  return (
    <div className="space-y-2">
      {view.tally.map((t) => (
        <div key={t.targetId} className="rounded-xl bg-[rgba(255,255,255,0.04)] p-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t.targetName} <span className="text-[var(--amber)]">({t.count})</span></span>
            {hangable && <button onClick={() => act("hang", { targetId: t.targetId })} className="btn btn-blood px-3 py-1 text-xs">As</button>}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
            <motion.div className="h-full rounded-full bg-[var(--amber)]" initial={{ width: 0 }} animate={{ width: `${(t.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ModAnnouncement({ game }: { game: Game }) {
  const a = game.announcement!;
  return (
    <motion.div key={a.at} initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="panel p-4" style={{ borderColor: a.dead ? "rgba(239,68,68,0.35)" : "rgba(52,211,153,0.3)" }}>
      <p className="text-xs uppercase tracking-widest text-[var(--faint)]">{a.title}</p>
      <div className="mt-1 space-y-0.5">
        {a.lines.map((l, i) => (
          <p key={i} className={i === 0 ? "font-semibold" : "text-sm text-[var(--muted)]"}>{l}</p>
        ))}
      </div>
    </motion.div>
  );
}

function PlayerRow({ game, playerId }: { game: Game; playerId: string }) {
  const act = useAct();
  const p = game.players.find((x) => x.id === playerId)!;
  const role = game.roles.find((r) => r.key === p.role) ?? null;
  const meta = roleMeta(role);
  const evil = role?.team === "vampir";
  return (
    <div className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${p.alive ? "bg-[rgba(255,255,255,0.04)]" : "bg-[rgba(255,255,255,0.02)]"}`}>
      <span className={`flex items-center gap-2 ${p.alive ? "" : "text-[var(--faint)] line-through"}`}>
        <span>{meta.icon}</span>{p.name}
      </span>
      <div className="flex items-center gap-3">
        <span style={{ color: evil ? "#fca5a5" : "#6ee7b7" }}>{role?.name ?? "—"}</span>
        <button onClick={() => act("toggleKill", { targetId: p.id })} className="rounded-lg bg-[rgba(255,255,255,0.06)] px-2 py-1 text-xs hover:bg-[rgba(255,255,255,0.12)]">{p.alive ? "Öldür" : "Dirilt"}</button>
      </div>
    </div>
  );
}

/* ------------------------------ BİTTİ ------------------------------ */
function Ended({ view }: { view: ModeratorView }) {
  const game = view.game;
  const act = useAct();
  const evil = game.winner === "vampir";
  return (
    <div className="space-y-5">
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 140 }} className="panel p-5 text-center" style={{ borderColor: evil ? "rgba(239,68,68,0.5)" : "rgba(52,211,153,0.5)" }}>
        <div className="text-5xl">{evil ? "🧛" : game.winner === "koy" ? "🏡" : "🎭"}</div>
        <h2 className="font-display title-glow mt-2 text-2xl font-black" style={{ color: evil ? "#fca5a5" : "#6ee7b7" }}>
          {evil ? "Vampirler Kazandı" : game.winner === "koy" ? "Köy Kazandı" : "Oyun Bitti"}
        </h2>
      </motion.div>

      <Section title="Roller">
        <div className="space-y-1.5">{game.players.map((p) => <PlayerRow key={p.id} game={game} playerId={p.id} />)}</div>
      </Section>

      <div className="grid gap-2 sm:grid-cols-3">
        <button onClick={() => act("newRound")} className="btn btn-emerald">🔄 Yeni el</button>
        <button onClick={() => act("backToLobby")} className="btn btn-ghost">🏠 Lobiye dön</button>
        <ResetButton />
      </div>
      <CloseRoomButton />
    </div>
  );
}

/* ------------------------------ Ortak ------------------------------ */
function CloseRoomButton() {
  const act = useAct();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)} className="btn btn-ghost w-full text-[var(--blood)]">
        🔒 Odayı Kapat
      </button>
    );
  }
  return (
    <div className="panel p-3">
      <p className="mb-2 text-center text-sm">Oda tamamen kapatılsın mı? Tüm oyuncular çıkarılır ve kod geçersiz olur.</p>
      <div className="flex gap-2">
        <button
          onClick={async () => {
            setBusy(true);
            await act("closeRoom");
            router.push("/");
          }}
          disabled={busy}
          className="btn btn-blood flex-1"
        >
          {busy ? "Kapatılıyor…" : "Evet, kapat"}
        </button>
        <button onClick={() => setConfirm(false)} className="btn btn-ghost flex-1">Vazgeç</button>
      </div>
    </div>
  );
}

function ResetButton() {
  const act = useAct();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) return <button onClick={() => setConfirm(true)} className="btn btn-ghost text-[var(--blood)]">🗑️</button>;
  return (
    <div className="flex gap-1">
      <button onClick={() => { act("reset"); setConfirm(false); }} className="btn btn-blood px-3 text-sm">Emin misin?</button>
      <button onClick={() => setConfirm(false)} className="btn btn-ghost px-3 text-sm">Vazgeç</button>
    </div>
  );
}

function LogPanel({ game }: { game: Game }) {
  if (game.log.length === 0) return null;
  return (
    <details className="panel mt-6 p-3">
      <summary className="cursor-pointer text-sm text-[var(--muted)]">Olay geçmişi</summary>
      <ul className="mt-2 space-y-1 text-xs text-[var(--faint)]">
        {game.log.map((l, i) => (
          <li key={i}>{new Date(l.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} — {l.text}</li>
        ))}
      </ul>
    </details>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-full flex-1 items-center justify-center px-6 text-[var(--ink)]">{children}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--faint)]">{title}</h2>
      {children}
    </div>
  );
}

function Stepper({ value, onChange, accent }: { value: number; onChange: (v: number) => void; accent: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button onClick={() => onChange(Math.max(0, value - 1))} className="grid h-8 w-8 place-items-center rounded-lg bg-[rgba(255,255,255,0.06)] text-lg font-bold hover:bg-[rgba(255,255,255,0.12)]">−</button>
      <span className="w-5 text-center text-lg font-bold" style={{ color: value > 0 ? accent : "var(--faint)" }}>{value}</span>
      <button onClick={() => onChange(Math.min(9, value + 1))} className="grid h-8 w-8 place-items-center rounded-lg bg-[rgba(255,255,255,0.06)] text-lg font-bold hover:bg-[rgba(255,255,255,0.12)]">+</button>
    </div>
  );
}

function ModeButton({ active, onClick, label, desc }: { active: boolean; onClick: () => void; label: string; desc: string }) {
  return (
    <button onClick={onClick} className="rounded-2xl border p-3 text-left transition" style={{ borderColor: active ? "var(--violet)" : "var(--panel-line)", background: active ? "rgba(168,85,247,0.14)" : "rgba(255,255,255,0.03)" }}>
      <div className="font-semibold">{label}</div>
      <div className="mt-0.5 text-[11px] text-[var(--faint)]">{desc}</div>
    </button>
  );
}

function AssignModeSwitch({ mode }: { mode: Game["assignMode"] }) {
  const act = useAct();
  const manual = mode === "manual";
  return (
    <div className="panel-tight flex items-center justify-between gap-3 border border-[var(--panel-line)] bg-[rgba(255,255,255,0.03)] p-3">
      <div className="min-w-0">
        <p className="font-semibold">{manual ? "🎯 Moderatör seçer" : "🎲 Rastgele dağıt"}</p>
        <p className="mt-0.5 text-[11px] leading-tight text-[var(--faint)]">
          {manual
            ? "Her oyuncunun rolünü aşağıdan sen atarsın."
            : "Roller başlangıçta oyunculara rastgele dağıtılır."}
        </p>
      </div>
      <button
        role="switch"
        aria-checked={manual}
        onClick={() => act("setAssignMode", { assignMode: manual ? "random" : "manual" })}
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
        style={{ background: manual ? "var(--violet)" : "rgba(255,255,255,0.15)" }}
      >
        <span
          className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all"
          style={{ left: manual ? "1.55rem" : "0.25rem" }}
        />
      </button>
    </div>
  );
}

function ManualAssign({ game }: { game: Game }) {
  const act = useAct();
  const roles = game.roles.filter((r) => r.enabled);
  const specials = roles.filter((r) => !r.fill);
  const countAssigned = (key: string) => game.players.filter((p) => p.role === key).length;

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {specials.map((r) => {
          const n = countAssigned(r.key);
          const ok = n === r.count;
          const meta = roleMeta(r);
          return (
            <span key={r.key} className="badge" style={{ background: `${meta.accent}1e`, color: ok ? "#6ee7b7" : "#fca5a5" }}>
              {meta.icon} {r.name} {n}/{r.count}
            </span>
          );
        })}
      </div>

      {game.players.length === 0 ? (
        <p className="rounded-xl bg-[rgba(255,255,255,0.03)] px-4 py-4 text-center text-sm text-[var(--faint)]">
          Önce oyuncular katılmalı.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {game.players.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-[rgba(255,255,255,0.04)] px-3 py-2">
              <span className="min-w-0 truncate text-sm">{p.name}</span>
              <select
                value={p.role ?? ""}
                onChange={(e) => act("assignRole", { targetId: p.id, roleKey: e.target.value || null })}
                className="shrink-0 rounded-lg border border-[var(--panel-line)] bg-[rgba(0,0,0,0.35)] px-2 py-1.5 text-sm text-[var(--ink)]"
              >
                <option value="">— rol seç —</option>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>{r.name}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] leading-tight text-[var(--faint)]">
        Boş bırakılanlar otomatik <b>Köylü</b> olur. Adetleri değiştirdiysen önce <b>“Kaydet”</b>e bas — başlatınca sayılar tutmazsa uyarı gösterilir.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: Game["status"] }) {
  const map: Record<Game["status"], { t: string; bg: string; c: string }> = {
    lobby: { t: "Lobi", bg: "rgba(59,130,246,0.18)", c: "#93c5fd" },
    in_progress: { t: "Oyunda", bg: "rgba(52,211,153,0.16)", c: "#6ee7b7" },
    ended: { t: "Bitti", bg: "rgba(255,255,255,0.08)", c: "var(--muted)" },
  };
  const s = map[status];
  return <span className="badge" style={{ background: s.bg, color: s.c }}>{s.t}</span>;
}
