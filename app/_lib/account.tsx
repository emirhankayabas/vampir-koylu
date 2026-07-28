"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Modal } from "@/app/_lib/ui";
import { readGuestName, saveGuestName, clearGuestName, GUEST_NAME_TTL_MS } from "@/app/_lib/client";
import { metaByKey } from "@/lib/roles";
import { CheckIcon, KeyIcon, ArrowLeftIcon, SkullIcon, CrownIcon, BallotIcon } from "@/app/_lib/icons";
import type { AccountView, MatchRecord, MatchPlayer, RoundEvent } from "@/lib/types";

/* ============================================================
   Hesap katmanı — ad + şifre, kayıt tamamen isteğe bağlı.

   Üç kimlik durumu var:
     • Hesapsız + isimsiz : ilk katılımda kimlik modalı çıkar
     • Ziyaretçi          : ismi bu cihazda 1 saat hatırlanır
     • Hesaplı            : isim sorulmaz, maç geçmişi birikir
   ============================================================ */

/* ------------------------------ Depo ------------------------------ */

// Hesap durumu tüm bileşenlerde ortak: her biri ayrı ayrı /api/account'a
// gitmesin diye modül düzeyinde tek bir önbellek + abonelik tutuyoruz.
// undefined = henüz bilinmiyor, null = giriş yapılmamış.
let cache: AccountView | null | undefined = undefined;
let inflight: Promise<AccountView | null> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setAccount(next: AccountView | null) {
  cache = next;
  emit();
}

async function loadAccount(force = false): Promise<AccountView | null> {
  if (!force && cache !== undefined) return cache;
  inflight ??= (async () => {
    try {
      const res = await fetch("/api/account", { cache: "no-store" });
      const data = await res.json();
      return (data?.account ?? null) as AccountView | null;
    } catch {
      return null; // ağ hatası — ziyaretçi gibi devam
    } finally {
      inflight = null;
    }
  })();
  const account = await inflight;
  setAccount(account);
  return account;
}

export interface AccountState {
  account: AccountView | null;
  /** İlk sorgu henüz dönmedi — kimlik bilinmiyor. */
  loading: boolean;
}

export function useAccount(): AccountState {
  const [state, setState] = useState<AccountState>(() => ({
    account: cache ?? null,
    loading: cache === undefined,
  }));

  useEffect(() => {
    const sync = () => setState({ account: cache ?? null, loading: cache === undefined });
    listeners.add(sync);
    sync();
    void loadAccount();
    return () => {
      listeners.delete(sync);
    };
  }, []);

  return state;
}

/* --------------------------- Sunucu çağrıları --------------------------- */

type AccountReply = { ok: boolean; error?: string; account?: AccountView | null };

async function accountAction(action: string, payload: Record<string, unknown> = {}): Promise<AccountReply> {
  try {
    const res = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = (await res.json()) as AccountReply;
    if (data.ok && data.account !== undefined) setAccount(data.account);
    return data;
  } catch {
    return { ok: false, error: "Ağ hatası." };
  }
}

/* ------------------------------ Ortak parçalar ------------------------------ */

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const letter = (name.trim()[0] ?? "?").toLocaleUpperCase("tr");
  return (
    <span
      className="font-display grid shrink-0 place-items-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.44,
        background: "linear-gradient(145deg, rgba(168,85,247,0.35), rgba(239,68,68,0.28))",
        border: "1px solid rgba(168,85,247,0.5)",
        color: "var(--ink)",
      }}
      aria-hidden
    >
      {letter}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--faint)]">{children}</label>;
}

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mt-2 text-center text-sm text-[var(--blood)]">{text}</p>;
}

/* ============================================================
   Kimlik kapısı — odaya İLK katılımda çıkan modal.

   Adı zaten katılım formunda aldık; burada sadece "nasıl devam edelim"
   soruluyor. Kayıt tek alan (şifre) istediği için sürtünme minimum.
   ============================================================ */

type GateMode = "choose" | "register" | "login";

function IdentityModal({
  open,
  name,
  onGuest,
  onAccount,
  onCancel,
}: {
  open: boolean;
  name: string;
  onGuest: () => void;
  onAccount: (account: AccountView) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<GateMode>("choose");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal her açıldığında baştan başlasın (önceki denemenin şifresi/hatası kalmasın).
  const [openedFor, setOpenedFor] = useState(open);
  if (openedFor !== open) {
    setOpenedFor(open);
    if (open) {
      setMode("choose");
      setPw("");
      setError(null);
      setBusy(false);
    }
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await accountAction(mode === "register" ? "register" : "login", { name, password: pw });
    setBusy(false);
    if (res.ok && res.account) onAccount(res.account);
    else setError(res.error ?? "İşlem başarısız.");
  }

  return (
    <Modal open={open} onClose={busy ? undefined : onCancel} maxW="max-w-sm">
      <div className="text-4xl">{mode === "choose" ? "👋" : "🔐"}</div>
      <p className="font-display mt-2 text-xl font-black">
        {mode === "choose" ? "Merhaba " : mode === "register" ? "Hesap oluştur" : "Giriş yap"}
        {mode === "choose" && <span className="text-[var(--violet)]">{name}</span>}
      </p>

      {mode === "choose" ? (
        <>
          <p className="mt-1.5 text-[13px] leading-snug text-[var(--muted)]">
            Bu isimle nasıl devam edelim?
          </p>

          <button onClick={onGuest} className="btn btn-ghost btn-lg mt-4 w-full flex-col !items-start !gap-0.5 !py-3 text-left">
            <span className="font-bold">Ziyaretçi olarak devam et</span>
            <span className="text-[11px] font-normal leading-snug text-[var(--faint)]">
              İsmin bu cihazda 1 saat hatırlanır. Oyun geçmişi tutulmaz.
            </span>
          </button>

          <button
            onClick={() => { setMode("register"); setError(null); }}
            className="btn btn-violet btn-lg mt-2 w-full flex-col !items-start !gap-0.5 !py-3 text-left"
          >
            <span className="font-bold">Kayıt ol — sadece şifre belirle</span>
            <span className="text-[11px] font-normal leading-snug" style={{ color: "rgba(245,243,255,0.75)" }}>
              İsmin kalıcı olur, bir daha sorulmaz. Oynadığın eller ve gelen roller kaydedilir.
            </span>
          </button>

          <button
            onClick={() => { setMode("login"); setError(null); }}
            className="mt-3 w-full text-center text-[13px] font-semibold text-[var(--muted)] transition hover:text-[var(--ink)]"
          >
            Zaten hesabım var → Giriş yap
          </button>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-[13px] leading-snug text-[var(--muted)]">
            {mode === "register" ? (
              <>
                Hesap adın: <b className="text-[var(--ink)]">{name}</b>. Tek yapman gereken bir şifre belirlemek.
              </>
            ) : (
              <>
                <b className="text-[var(--ink)]">{name}</b> hesabının şifresini gir.
              </>
            )}
          </p>

          <div className="mt-4 text-left">
            <FieldLabel>{mode === "register" ? "Yeni şifre" : "Şifre"}</FieldLabel>
            <input
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pw.length >= 4 && submit()}
              type="password"
              autoFocus
              maxLength={72}
              placeholder="En az 4 karakter"
              className="input"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </div>
          <ErrorLine text={error} />

          <button onClick={submit} disabled={busy || pw.length < 4} className="btn btn-emerald btn-lg mt-4 w-full">
            <CheckIcon size={20} />
            {busy ? "Gönderiliyor…" : mode === "register" ? "Hesabı oluştur ve katıl" : "Giriş yap ve katıl"}
          </button>
          <button onClick={() => { setMode("choose"); setError(null); }} disabled={busy} className="btn btn-ghost mt-2 w-full">
            <ArrowLeftIcon size={18} /> Geri
          </button>
        </>
      )}
    </Modal>
  );
}

/**
 * Katılım kapısı. `gate(name, run)` çağrıldığında:
 *   • hesap varsa      → `run(hesabın adı)` hemen çalışır
 *   • isim hatırlanıyorsa → süre tazelenir, `run(name)` çalışır
 *   • ilk defaysa      → kimlik modalı açılır, seçim sonrası `run` çalışır
 *
 * Kullanım (Köy Sözleşmesi kapısıyla aynı kalıp):
 *   const { gate, identityModal } = useIdentityGate();
 *   <button onClick={() => pactGuard(() => gate(name, join))}>Köye Gir</button>
 *   {identityModal}
 */
export function useIdentityGate() {
  const { account } = useAccount();
  const [pending, setPending] = useState<{ name: string; run: (name: string) => void } | null>(null);

  const gate = useCallback(
    (name: string, run: (finalName: string) => void) => {
      if (account) {
        run(account.name);
        return;
      }
      if (readGuestName()) {
        saveGuestName(name); // süreyi baştan başlat
        run(name);
        return;
      }
      setPending({ name, run });
    },
    [account]
  );

  const identityModal = (
    <IdentityModal
      open={pending !== null}
      name={pending?.name ?? ""}
      onGuest={() => {
        const next = pending;
        if (!next) return;
        saveGuestName(next.name);
        setPending(null);
        next.run(next.name);
      }}
      onAccount={(acc) => {
        const next = pending;
        setPending(null);
        clearGuestName(); // hesap var, ziyaretçi kaydına gerek yok
        next?.run(acc.name);
      }}
      onCancel={() => setPending(null)}
    />
  );

  return { gate, identityModal };
}

/* ============================================================
   Hesap düğmesi (ana sayfa sağ üst) ve menüsü
   ============================================================ */

export function AccountButton() {
  const { account, loading } = useAccount();
  const [menu, setMenu] = useState(false);
  const [auth, setAuth] = useState(false);

  if (loading) {
    return <div className="h-9 w-9 animate-pulse rounded-full" style={{ background: "rgba(168,85,247,0.14)" }} />;
  }

  return (
    <>
      {account ? (
        <button
          onClick={() => setMenu(true)}
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition active:scale-95"
          style={{ background: "var(--panel)", border: "1px solid var(--panel-line)" }}
          aria-label="Hesabım"
        >
          <Avatar name={account.name} size={30} />
          <span className="max-w-[7.5rem] truncate text-[13px] font-semibold">{account.name}</span>
        </button>
      ) : (
        <button
          onClick={() => setAuth(true)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition active:scale-95"
          style={{ background: "var(--panel)", border: "1px solid var(--panel-line)", color: "var(--muted)" }}
        >
          <KeyIcon size={14} />
          Giriş yap
        </button>
      )}

      <AccountMenu open={menu} onClose={() => setMenu(false)} />
      <AuthModal open={auth} onClose={() => setAuth(false)} />
    </>
  );
}

/** Hesabı olmayan için giriş/kayıt modalı (ad + şifre). */
function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openedFor, setOpenedFor] = useState(open);
  if (openedFor !== open) {
    setOpenedFor(open);
    if (open) {
      setName(readGuestName() ?? "");
      setPw("");
      setError(null);
      setBusy(false);
      setMode("login");
    }
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await accountAction(mode, { name: name.trim(), password: pw });
    setBusy(false);
    if (res.ok && res.account) {
      clearGuestName();
      onClose();
    } else {
      setError(res.error ?? "İşlem başarısız.");
    }
  }

  const ready = name.trim().length >= 2 && pw.length >= 4;

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} maxW="max-w-sm">
      <div className="text-4xl">🔐</div>
      <p className="font-display mt-2 text-xl font-black">{mode === "login" ? "Giriş yap" : "Hesap oluştur"}</p>
      <p className="mt-1.5 text-[13px] leading-snug text-[var(--muted)]">
        Sadece ad ve şifre. Hesabınla girdiğinde odalara ismin otomatik gelir, oynadığın eller kaydedilir.
      </p>

      <div className="mt-4 text-left">
        <FieldLabel>İsim</FieldLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          placeholder="Örn. Emir"
          className="input"
          autoComplete="username"
        />
        <div className="mt-3">
          <FieldLabel>Şifre</FieldLabel>
          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ready && submit()}
            type="password"
            maxLength={72}
            placeholder="En az 4 karakter"
            className="input"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>
      </div>
      <ErrorLine text={error} />

      <button onClick={submit} disabled={busy || !ready} className="btn btn-emerald btn-lg mt-4 w-full">
        {busy ? "Gönderiliyor…" : mode === "login" ? "Giriş yap" : "Hesabı oluştur"}
      </button>
      <button
        onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
        disabled={busy}
        className="mt-3 w-full text-center text-[13px] font-semibold text-[var(--muted)] transition hover:text-[var(--ink)]"
      >
        {mode === "login" ? "Hesabın yok mu? → Kayıt ol" : "Hesabın var mı? → Giriş yap"}
      </button>
    </Modal>
  );
}

type MenuView = "menu" | "rename" | "password";

function AccountMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { account } = useAccount();
  const [view, setView] = useState<MenuView>("menu");
  const [history, setHistory] = useState(false);
  const [value, setValue] = useState("");
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNext, setPwNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [openedFor, setOpenedFor] = useState(open);
  if (openedFor !== open) {
    setOpenedFor(open);
    if (open) {
      setView("menu");
      setError(null);
      setDone(null);
      setPwCurrent("");
      setPwNext("");
    }
  }

  if (!account) return null;

  async function run(action: string, payload: Record<string, unknown>, okMessage: string) {
    setBusy(true);
    setError(null);
    const res = await accountAction(action, payload);
    setBusy(false);
    if (res.ok) {
      setDone(okMessage);
      setView("menu");
    } else {
      setError(res.error ?? "İşlem başarısız.");
    }
  }

  return (
    <>
      <Modal open={open && !history} onClose={busy ? undefined : onClose} maxW="max-w-sm">
        {view === "menu" && (
          <>
            <div className="flex flex-col items-center">
              <Avatar name={account.name} size={56} />
              <p className="font-display mt-2.5 text-xl font-black">{account.name}</p>
              <p className="mt-0.5 text-[11px] text-[var(--faint)]">
                {new Date(account.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
                {"'den beri köydesin"}
              </p>
            </div>

            {done && (
              <p className="mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold text-[var(--emerald)]" style={{ background: "rgba(52,211,153,0.12)" }}>
                {done}
              </p>
            )}

            <div className="mt-4 grid gap-2">
              <button onClick={() => setHistory(true)} className="btn btn-violet btn-lg w-full">
                <BallotIcon size={20} /> Oyun geçmişim
              </button>
              <button onClick={() => { setValue(account.name); setView("rename"); setError(null); setDone(null); }} className="btn btn-ghost w-full">
                İsmimi değiştir
              </button>
              <button onClick={() => { setView("password"); setError(null); setDone(null); }} className="btn btn-ghost w-full">
                Şifremi değiştir
              </button>
              <button
                onClick={async () => { await accountAction("logout"); onClose(); }}
                className="mt-1 w-full text-center text-[13px] font-semibold text-[var(--blood)] transition hover:text-[var(--ink)]"
              >
                Çıkış yap
              </button>
            </div>
          </>
        )}

        {view === "rename" && (
          <>
            <div className="text-4xl">✏️</div>
            <p className="font-display mt-2 text-lg font-bold">İsmini değiştir</p>
            <p className="mt-1 text-[13px] leading-snug text-[var(--muted)]">
              Odalara bu isimle katılırsın. Giriş yaparken de bu ismi kullanacaksın.
            </p>
            <div className="mt-4 text-left">
              <FieldLabel>Yeni isim</FieldLabel>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && value.trim().length >= 2 && run("rename", { name: value.trim() }, "İsmin güncellendi.")}
                maxLength={24}
                autoFocus
                className="input"
              />
            </div>
            <ErrorLine text={error} />
            <button
              onClick={() => run("rename", { name: value.trim() }, "İsmin güncellendi.")}
              disabled={busy || value.trim().length < 2 || value.trim() === account.name}
              className="btn btn-emerald btn-lg mt-4 w-full"
            >
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button onClick={() => setView("menu")} disabled={busy} className="btn btn-ghost mt-2 w-full">
              <ArrowLeftIcon size={18} /> Geri
            </button>
          </>
        )}

        {view === "password" && (
          <>
            <div className="text-4xl">🔑</div>
            <p className="font-display mt-2 text-lg font-bold">Şifreni değiştir</p>
            <p className="mt-1 text-[13px] leading-snug text-[var(--muted)]">
              Değiştirdiğinde diğer cihazlardaki oturumlar kapanır.
            </p>
            <div className="mt-4 text-left">
              <FieldLabel>Mevcut şifre</FieldLabel>
              <input value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} type="password" maxLength={72} autoFocus className="input" autoComplete="current-password" />
              <div className="mt-3">
                <FieldLabel>Yeni şifre</FieldLabel>
                <input value={pwNext} onChange={(e) => setPwNext(e.target.value)} type="password" maxLength={72} placeholder="En az 4 karakter" className="input" autoComplete="new-password" />
              </div>
            </div>
            <ErrorLine text={error} />
            <button
              onClick={() => run("changePassword", { currentPassword: pwCurrent, newPassword: pwNext }, "Şifren güncellendi.")}
              disabled={busy || pwCurrent.length < 1 || pwNext.length < 4}
              className="btn btn-emerald btn-lg mt-4 w-full"
            >
              {busy ? "Kaydediliyor…" : "Şifreyi değiştir"}
            </button>
            <button onClick={() => setView("menu")} disabled={busy} className="btn btn-ghost mt-2 w-full">
              <ArrowLeftIcon size={18} /> Geri
            </button>
          </>
        )}
      </Modal>

      <HistoryModal open={history} onClose={() => setHistory(false)} userId={account.id} />
    </>
  );
}

/* ============================================================
   Oyun geçmişi
   ============================================================ */

interface HistoryPayload {
  ok: boolean;
  error?: string;
  matches?: MatchRecord[];
  stats?: {
    total: number;
    finished: number;
    wins: number;
    losses: number;
    byRole: { roleName: string; count: number }[];
  };
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RoleChip({ player, dim = false }: { player: MatchPlayer; dim?: boolean }) {
  const meta = metaByKey(player.roleKey ?? "", player.special);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-bold"
      style={{
        background: `${meta.accent}${dim ? "12" : "20"}`,
        border: `1px solid ${meta.accent}${dim ? "30" : "55"}`,
        color: meta.accent,
      }}
    >
      {meta.icon} {player.roleName ?? "?"}
    </span>
  );
}

function RoundList({ rounds }: { rounds: RoundEvent[] }) {
  if (!rounds?.length) return null;
  const label: Record<RoundEvent["kind"], string> = {
    night: "🌙 Gece",
    hang: "⚖️ İnfaz",
    hunter: "🏹 Avcı atışı",
  };
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--faint)]">Tur raporu</p>
      {rounds.map((r, i) => (
        <div key={i} className="flex items-start gap-2 text-[12px] leading-snug">
          <span className="shrink-0 text-[var(--faint)]">
            {r.day}. {label[r.kind]}
          </span>
          <span className="text-[var(--muted)]">
            {r.deaths.length ? r.deaths.map((d) => `${d.name} (${d.role})`).join(", ") + " öldü" : "kimse ölmedi"}
            {r.saved ? " · doktor kurtardı" : ""}
            {r.survivorShielded ? " · kalkan savuşturdu" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function MatchCard({ match, userId }: { match: MatchRecord; userId: string }) {
  const [open, setOpen] = useState(false);
  const me = match.players.find((p) => p.userId === userId);
  const meta = metaByKey(me?.roleKey ?? "", me?.special);
  // Takım arkadaşları yalnızca vampir için anlamlı (gece birlikte oynanır).
  const mates = me?.team === "vampir" ? match.players.filter((p) => p !== me && p.team === "vampir") : [];

  const outcome = !match.finished
    ? { text: "Sonuç girilmedi", color: "var(--faint)", bg: "rgba(111,106,141,0.14)" }
    : me?.won
      ? { text: "Kazandın", color: "var(--emerald)", bg: "rgba(52,211,153,0.14)" }
      : { text: "Kaybettin", color: "var(--blood)", bg: "rgba(239,68,68,0.14)" };

  return (
    <div className="panel-tight overflow-hidden p-3 text-left" style={{ borderColor: `${meta.accent}30` }}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 text-left">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg"
          style={{ background: `${meta.accent}1a`, border: `1px solid ${meta.accent}55` }}
        >
          {meta.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <b className="truncate text-sm" style={{ color: meta.accent }}>{me?.roleName ?? "Bilinmiyor"}</b>
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: outcome.bg, color: outcome.color }}>
              {outcome.text}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--faint)]">
            <span>{match.mode === "phone" ? "📱 Telefon" : "🗣️ Sözlü"}</span>
            <span>·</span>
            <span>{match.playerCount} kişi</span>
            <span>·</span>
            <span className="truncate">{formatDate(match.startedAt)}</span>
          </span>
        </span>
        <span className="shrink-0 text-[var(--faint)]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--panel-line)" }}>
            {mates.length > 0 && (
              <p className="mb-2 text-[12px] text-[var(--muted)]">
                🧛 Vampir ortakların: <b className="text-[var(--ink)]">{mates.map((m) => m.name).join(", ")}</b>
              </p>
            )}
            {me?.lover && <p className="mb-2 text-[12px] text-[var(--muted)]">💘 Bu elde âşıktın.</p>}

            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--faint)]">Masadakiler</p>
            <div className="mt-1.5 space-y-1">
              {match.players.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <span className={`min-w-0 flex-1 truncate ${p === me ? "font-bold text-[var(--ink)]" : "text-[var(--muted)]"}`}>
                    {p.name}
                    {p === me && " (sen)"}
                  </span>
                  {!p.alive && <SkullIcon size={12} />}
                  {p.won && match.finished && <CrownIcon size={12} />}
                  <RoleChip player={p} dim={p !== me} />
                </div>
              ))}
            </div>

            <RoundList rounds={match.rounds} />

            <p className="mt-3 text-[11px] text-[var(--faint)]">
              Oda: {match.roomName?.trim() || match.code} · {match.dayCount} gün
              {match.mode === "verbal" && !match.finished && " · sözlü oyun uygulamada bitirilmedi"}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function HistoryModal({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const [data, setData] = useState<HistoryPayload | null>(null);

  // Modal her açıldığında listeyi sıfırla — efekt içinde değil, render sırasında
  // (React'in "prop değişince state'i düzelt" kalıbı; fazladan render turu yok).
  const [openedFor, setOpenedFor] = useState(open);
  if (openedFor !== open) {
    setOpenedFor(open);
    if (open) setData(null);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/history", { cache: "no-store" });
        const json = (await res.json()) as HistoryPayload;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData({ ok: false, error: "Geçmiş yüklenemedi." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const stats = data?.stats;
  const matches = data?.matches ?? [];

  return (
    <Modal open={open} onClose={onClose} maxW="max-w-md">
      <div className="text-4xl">📜</div>
      <p className="font-display mt-2 text-xl font-black">Oyun Geçmişim</p>

      {!data && <p className="mt-4 text-sm text-[var(--muted)]">Yükleniyor…</p>}
      {data && !data.ok && <ErrorLine text={data.error ?? "Geçmiş yüklenemedi."} />}

      {data?.ok && stats && (
        <>
          {stats.total === 0 ? (
            <p className="mt-3 text-[13px] leading-snug text-[var(--muted)]">
              Henüz kaydedilmiş bir elin yok. Hesabınla bir odaya katıl — roller dağıtıldığı an burada görünür.
            </p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { label: "El", value: stats.total, color: "var(--violet)" },
                  { label: "Galibiyet", value: stats.wins, color: "var(--emerald)" },
                  { label: "Mağlubiyet", value: stats.losses, color: "var(--blood)" },
                ].map((s) => (
                  <div key={s.label} className="panel-tight py-2">
                    <p className="font-display text-xl font-black" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--faint)]">{s.label}</p>
                  </div>
                ))}
              </div>

              {stats.byRole.length > 0 && (
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {stats.byRole.map((r) => (
                    <span key={r.roleName} className="rounded-lg px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]" style={{ background: "rgba(168,85,247,0.1)" }}>
                      {r.roleName} × {r.count}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 max-h-[52vh] space-y-2 overflow-y-auto overscroll-contain pr-1">
                {matches.map((m) => (
                  <MatchCard key={m._id} match={m} userId={userId} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <button onClick={onClose} className="btn btn-ghost mt-4 w-full">Kapat</button>
    </Modal>
  );
}

/** Ziyaretçi ismi hatırlanıyorsa kalan süreyi kabaca söyler (ana sayfa ipucu). */
export function guestNameTtlLabel(): string {
  const minutes = Math.round(GUEST_NAME_TTL_MS / 60000);
  return minutes >= 60 ? `${Math.round(minutes / 60)} saat` : `${minutes} dakika`;
}
