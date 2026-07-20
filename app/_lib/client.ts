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

// SSE ile canlı durum aboneliği. Tarayıcının EventSource'u bağlantı
// koptuğunda (fonksiyon ~4dk sonra kapanınca) otomatik yeniden bağlanır.
export function useStream<T>(url: string | null): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!url) return;
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        setData(JSON.parse(e.data));
      } catch {
        /* ping veya bozuk mesaj — yok say */
      }
    };
    return () => es.close();
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
