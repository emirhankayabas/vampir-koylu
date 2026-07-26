import { NextRequest, NextResponse } from "next/server";
import { listSessions } from "@/lib/game";

export const dynamic = "force-dynamic";

// "Devam eden odalarım" kartı için — istemcinin localStorage'ında duran oda
// kayıtlarının sunucudaki güncel karşılığını döndürür.
//
// Neden POST: gövdede oyuncu kimlikleri taşınıyor; bunları URL'ye (dolayısıyla
// sunucu/proxy günlüklerine) yazmamak için. Route Handler'larda POST zaten
// önbelleklenmez.
//
// Kapanmış ya da 1 saattir işlem görmemiş odalar yanıtta YER ALMAZ; istemci
// dönmeyen kodların yerel kaydını siler — yani oda kapanınca herkes düşer.
export async function POST(request: NextRequest) {
  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };

  let body: { rooms?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400, headers });
  }

  const raw = Array.isArray(body.rooms) ? body.rooms : [];
  const refs = raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      code: String(r.code ?? ""),
      playerId: r.playerId ? String(r.playerId) : null,
    }));

  try {
    return NextResponse.json({ sessions: await listSessions(refs) }, { headers });
  } catch {
    return NextResponse.json({ error: "db" }, { headers });
  }
}
