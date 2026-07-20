import { NextRequest } from "next/server";
import { getGame, getVersion, moderatorView, participantView } from "@/lib/game";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Sunucudan istemciye canlı durum akışı (Server-Sent Events).
// Vercel ücretsiz planında kalıcı WebSocket olmadığı için SSE kullanıyoruz:
// bağlantı açık tutulur, MongoDB'deki `version` alanı hafifçe pollenir,
// değiştiğinde yeni durum push edilir. Bağlantı ~4 dk sonra kapanır,
// tarayıcının EventSource'u otomatik yeniden bağlanır.

const POLL_MS = 1000;
const MAX_LIFETIME_MS = 4 * 60 * 1000;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const isModerator = url.searchParams.get("role") === "moderator";
  const playerId = url.searchParams.get("playerId");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      const ping = () => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: ping\n\n`));
      };

      const project = async () => {
        const game = await getGame();
        return isModerator ? moderatorView(game) : participantView(game, playerId);
      };

      // İlk durum
      let lastVersion = -1;
      try {
        const view = await project();
        lastVersion = view.version;
        send(view);
      } catch {
        send({ error: "db" });
      }

      const start = Date.now();
      let heartbeat = 0;

      const interval = setInterval(async () => {
        if (closed) return;
        try {
          const v = await getVersion();
          if (v !== lastVersion) {
            const view = await project();
            lastVersion = view.version;
            send(view);
          } else if (++heartbeat % 15 === 0) {
            ping(); // bağlantıyı canlı tut
          }
        } catch {
          // yut, sonraki turda tekrar dener
        }
        if (Date.now() - start > MAX_LIFETIME_MS) {
          cleanup();
        }
      }, POLL_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* zaten kapalı */
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
