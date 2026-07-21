import { NextRequest, NextResponse } from "next/server";
import { getGame, getVersion, moderatorView, participantView } from "@/lib/game";

export const dynamic = "force-dynamic";

// Canlı durum — kısa "poll" (yoklama) uç noktası.
//
// NEDEN SSE DEĞİL: Vercel ücretsiz (Hobby) planında serverless fonksiyonlar
// uzun ömürlü değildir; dakikalarca açık tutulan bir SSE akışı ~60 sn sonra
// kesilir ya da edge katmanında tamponlanıp sessizce ölür. Bu yüzden bazı
// oyuncularda durum güncellenmez ve sayfayı yenilemeleri gerekirdi.
//
// ÇÖZÜM: İstemci her ~1.2 sn'de bir bu uç noktayı çağırır. İstek kısa sürer
// ve hemen döner — serverless'in en iyi yaptığı şey budur. İstemci son
// gördüğü sürümü `v` ile gönderir; sürüm değişmediyse sadece `{ same: true }`
// döneriz (küçük yanıt, gereksiz projeksiyon yok).

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const isModerator = url.searchParams.get("role") === "moderator";
  const playerId = url.searchParams.get("playerId");
  const code = url.searchParams.get("code") ?? "";
  const knownVersion = Number(url.searchParams.get("v") ?? "-1");

  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };

  try {
    // Önce yalnızca sürümü oku (hafif sorgu). Değişmediyse projeksiyon yapma.
    const version = await getVersion(code);
    if (version === 0) {
      return NextResponse.json({ notfound: true, version: 0 }, { headers });
    }
    if (version === knownVersion) {
      return NextResponse.json({ same: true, version }, { headers });
    }
    const game = await getGame(code);
    if (!game) {
      return NextResponse.json({ notfound: true, version: 0 }, { headers });
    }
    const view = isModerator ? moderatorView(game) : participantView(game, playerId);
    return NextResponse.json(view, { headers });
  } catch {
    return NextResponse.json({ error: "db" }, { headers });
  }
}
