import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, userFromToken } from "@/lib/auth";
import { historyForUser } from "@/lib/matches";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

/** Oturumdaki hesabın oynadığı eller + özet istatistik. */
export async function GET(request: NextRequest) {
  try {
    const user = await userFromToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Giriş yapmalısın." }, { status: 401, headers: NO_STORE });
    }
    const history = await historyForUser(user._id);
    return NextResponse.json({ ok: true, ...history }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçmiş yüklenemedi." },
      { status: 500, headers: NO_STORE }
    );
  }
}
