"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

// --- Oyuncu kimliği (localStorage, oda koduna göre) ---
// useSyncExternalStore, localStorage gibi dış bir kaynağı okumanın React'çe
// doğru yolu: efekt içinde setState çağırmadan, SSR ile uyumlu çalışır.
const ID_PREFIX = "vk_pid_"; // oyuncu kimliği: vk_pid_<kod> = playerId
const MOD_PREFIX = "vk_mod_"; // moderatörlük işareti: vk_mod_<kod> = "1"
const idKey = (code: string) => `${ID_PREFIX}${code}`;
const modKey = (code: string) => `${MOD_PREFIX}${code}`;
const idListeners = new Set<() => void>();

export function usePlayerId(code: string | null): string | null {
  const subscribe = useCallback((cb: () => void) => {
    idListeners.add(cb);
    window.addEventListener("storage", cb);
    return () => {
      idListeners.delete(cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  const getSnapshot = useCallback(() => {
    if (!code || typeof localStorage === "undefined") return null;
    return localStorage.getItem(idKey(code));
  }, [code]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
export function savePlayerId(code: string, id: string) {
  localStorage.setItem(idKey(code), id);
  idListeners.forEach((l) => l());
}
export function clearPlayerId(code: string) {
  localStorage.removeItem(idKey(code));
  idListeners.forEach((l) => l());
}

/**
 * Sayfa, APK kabuğunun içinde mi çalışıyor?
 *
 * Capacitor WebView'a `window.Capacitor` köprüsünü enjekte eder. Uygulamanın
 * içindeki kullanıcıya "uygulamayı indir" demenin anlamı yok — bu bayrak o
 * bağlantıyı gizlemek için. Değer sayfa ömrü boyunca sabit olduğundan
 * aboneliğe gerek yok; SSR'da web varsayılır.
 */
export function useInApp(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => typeof window !== "undefined" && !!(window as { Capacitor?: unknown }).Capacitor,
    () => false
  );
}

/* --- Misafir ismi (kısa süreli hatırlama) ---
   Kayıt olmayan oyuncu her odaya girişte adını yeniden yazmasın diye ismi bu
   cihazda saklıyoruz — ama KISA süre (1 saat). Kalıcı kimlik hesap işidir;
   ziyaretçi hatırlaması yalnızca "bu akşamki oyun" içindir. Süre dolunca
   katılım ekranında kimlik modalı yeniden çıkar ve kayıt teklif edilir. */

export const GUEST_NAME_TTL_MS = 60 * 60 * 1000; // 1 saat
const NAME_KEY = "vk_name";

interface StoredName {
  name: string;
  exp: number; // son geçerlilik damgası
}

/**
 * Hatırlanan misafir ismi; yoksa ya da süresi dolduysa null.
 * Yan etkisizdir (bayat kaydı silmez) — render sırasında da güvenle okunur.
 */
export function readGuestName(): string | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(NAME_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredName;
    if (!parsed?.name || typeof parsed.exp !== "number") return null;
    return Date.now() < parsed.exp ? parsed.name : null;
  } catch {
    return null;
  }
}

/** Hatırlanan ismi React'çe okur (SSR'da null döner, hidrasyon uyuşmazlığı yok). */
export function useGuestName(): string | null {
  const subscribe = useCallback((cb: () => void) => {
    idListeners.add(cb);
    window.addEventListener("storage", cb);
    return () => {
      idListeners.delete(cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  return useSyncExternalStore(subscribe, readGuestName, () => null);
}

/** İsmi kaydeder / süresini baştan başlatır. */
export function saveGuestName(name: string) {
  const value: StoredName = { name: name.trim().slice(0, 24), exp: Date.now() + GUEST_NAME_TTL_MS };
  localStorage.setItem(NAME_KEY, JSON.stringify(value));
  idListeners.forEach((l) => l());
}

export function clearGuestName() {
  localStorage.removeItem(NAME_KEY);
  idListeners.forEach((l) => l());
}

/* --- Kayıtlı oturumlar ("devam eden odalarım") ---
   Tarayıcı bir odaya girildiğini localStorage'da tutar. Sekme kapansa, sayfa
   yenilense ya da bağlantı kopsa bile kullanıcı ana sayfadan odaya dönebilir.
   Sunucu tarafında hiçbir şey silinmez: oyuncu zaten oyunun içindedir. */

export interface LocalSession {
  code: string;
  playerId: string | null; // oyuncu olarak katıldıysa kimliği
  moderator: boolean; // bu odayı ben mi kurdum
}

/** Bu tarayıcıda kayıtlı tüm oda oturumlarını okur (SSR'da boş döner). */
export function listLocalSessions(): LocalSession[] {
  if (typeof localStorage === "undefined") return [];
  const byCode = new Map<string, LocalSession>();
  const take = (code: string) =>
    byCode.get(code) ?? { code, playerId: null, moderator: false };

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(ID_PREFIX)) {
      const code = key.slice(ID_PREFIX.length);
      if (!/^\d{6}$/.test(code)) continue;
      byCode.set(code, { ...take(code), playerId: localStorage.getItem(key) });
    } else if (key.startsWith(MOD_PREFIX)) {
      const code = key.slice(MOD_PREFIX.length);
      if (!/^\d{6}$/.test(code)) continue;
      byCode.set(code, { ...take(code), moderator: true });
    }
  }
  return [...byCode.values()];
}

/** Bu odanın moderatörü olduğumuzu işaretler (oda kurulduğunda / panel açılınca). */
export function saveModeratorRoom(code: string) {
  localStorage.setItem(modKey(code), "1");
  idListeners.forEach((l) => l());
}

/** Odayla ilgili tüm yerel kayıtları siler — oda kapandığında ya da
 *  kullanıcı "Odadan çık" dediğinde çağrılır. */
export function forgetRoom(code: string) {
  localStorage.removeItem(idKey(code));
  localStorage.removeItem(modKey(code));
  idListeners.forEach((l) => l());
}

// Canlı durum aboneliği — kısa yoklama (polling) ile.
//
// Vercel ücretsiz planında uzun ömürlü SSE/WebSocket güvenilir değildir
// (bağlantı ~60 sn sonra kesilir ve bazı istemcilerde güncelleme durur —
// kullanıcı sayfayı yenilemek zorunda kalırdı). Bunun yerine her ~1.2 sn'de
// bir hızlı GET isteği atıyoruz. Sunucu bilinen sürümü karşılaştırır:
//  • sürüm aynıysa küçük `{ same: true }` döner (setState yok, render yok),
//  • değiştiyse taze durumu döner.
// Sekme arka plandayken yoklama durur (pil/veri tasarrufu); sekme yeniden
// görünür olunca anında bir istek atılıp durum tazelenir.
const POLL_MS = 1200;

// URL'ye istemcinin bildiği sürümü ekler (koşullu yanıt için).
function withVersion(url: string, v: number): string {
  return url + (url.includes("?") ? "&" : "?") + "v=" + v;
}

export function useStream<T>(url: string | null): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    if (!url) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    // En son görülen sürüm — sunucuya "bunu biliyorum" demek için.
    let version = -1;
    // Uçuşta bir istek var mı. Aynı anda iki döngünün başlamasını engeller
    // (aksi halde her sekme değişiminde istek sayısı katlanırdı).
    let inFlight = false;

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      if (!stopped) timer = setTimeout(poll, ms);
    };

    const poll = async () => {
      // Uçuşta istek varsa çık: onun `finally`'si sıradakini zaten planlayacak.
      if (stopped || inFlight) return;
      inFlight = true;
      // Not: Sekme arka plandayken tarayıcı zamanlayıcıları zaten kısar
      // (mobilde ~1/dk), kilit ekranında dondurur — ayrıca bir "hidden"
      // kısıtı koymuyoruz ki döngü hiçbir koşulda sessizce ölmesin.
      controller = new AbortController();
      try {
        const res = await fetch(withVersion(url, version), {
          signal: controller.signal,
          cache: "no-store",
        });
        const parsed = await res.json();
        if (!stopped && parsed) {
          if (parsed.same) {
            // Değişiklik yok — mevcut durumu koru.
          } else {
            if (typeof parsed.version === "number") version = parsed.version;
            setData(parsed as T);
          }
        }
      } catch {
        /* ağ hatası / iptal — sonraki turda tekrar dener */
      } finally {
        inFlight = false;
        schedule(POLL_MS);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        version = -1; // gizliyken kaçan güncellemeleri garanti almak için tazele
        schedule(0);
      }
    };

    poll();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (controller) controller.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url]);

  return data;
}

export async function postAction(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<{ ok: boolean; error?: string; playerId?: string; code?: string; name?: string }> {
  try {
    const res = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: "Ağ hatası." };
  }
}
