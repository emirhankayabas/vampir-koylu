"use client";

import { useEffect, useState } from "react";

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
): Promise<{ ok: boolean; error?: string; playerId?: string }> {
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
