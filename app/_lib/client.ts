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

// SSE ile canlı durum aboneliği. Tarayıcının EventSource'u kopan bağlantıyı
// normalde otomatik yeniden bağlar; ancak mobilde sekme arka plana atılıp
// kilitlenince bağlantı "sessizce" ölebilir ve durum güncellemeleri durur
// (kullanıcı sayfayı yenilemek zorunda kalır). Bunu önlemek için:
//  • Sunucu ~5 sn'de bir kalp atışı (hb) yollar; hiç mesaj gelmezse bağlantı
//    ölmüş sayılıp yeniden kurulur (watchdog).
//  • Sekme tekrar görünür olunca anında taze bağlantı açılır.
const WATCHDOG_MS = 20000;

export function useStream<T>(url: string | null): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!url) return;
    let es: EventSource | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const arm = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(connect, WATCHDOG_MS);
    };

    const connect = () => {
      if (stopped) return;
      if (es) es.close();
      es = new EventSource(url);
      arm();
      es.onopen = arm;
      es.onmessage = (e) => {
        arm(); // her mesaj (kalp atışı dahil) bağlantının canlı olduğunu gösterir
        try {
          const parsed = JSON.parse(e.data);
          if (parsed && parsed.hb) return; // kalp atışı — durum değil, yok say
          setData(parsed as T);
        } catch {
          /* bozuk mesaj — yok say */
        }
      };
      es.onerror = arm; // tarayıcı kendi yeniden bağlanmayı dener; watchdog yedek
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") connect();
    };

    connect();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      if (watchdog) clearTimeout(watchdog);
      document.removeEventListener("visibilitychange", onVisible);
      if (es) es.close();
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
