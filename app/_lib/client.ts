"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

// --- Oyuncu kimliği (localStorage, oda koduna göre) ---
// useSyncExternalStore, localStorage gibi dış bir kaynağı okumanın React'çe
// doğru yolu: efekt içinde setState çağırmadan, SSR ile uyumlu çalışır.
const idKey = (code: string) => `vk_pid_${code}`;
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

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      if (!stopped) timer = setTimeout(poll, ms);
    };

    const poll = async () => {
      if (stopped) return;
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
): Promise<{ ok: boolean; error?: string; playerId?: string; code?: string }> {
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
