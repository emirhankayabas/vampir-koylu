import { NextResponse } from "next/server";
import { listRooms } from "@/lib/game";

export const dynamic = "force-dynamic";

// Mevcut Oyunlar sayfası için tüm odaların özetini döndürür.
// Şifreler asla gönderilmez — yalnızca "hasPassword" bilgisi.
export async function GET() {
  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };
  try {
    const rooms = await listRooms();
    return NextResponse.json({ rooms }, { headers });
  } catch {
    return NextResponse.json({ error: "db" }, { headers });
  }
}
