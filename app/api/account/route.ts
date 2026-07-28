import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  registerUser,
  loginUser,
  renameUser,
  changePassword,
  createSession,
  destroySession,
  destroyAllSessions,
  userFromToken,
  toAccountView,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

// Yanıtlar asla önbelleğe alınmamalı: hesap durumu kişiye özeldir.
const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

function sessionToken(request: NextRequest): string | undefined {
  return request.cookies.get(SESSION_COOKIE)?.value;
}

function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, // JS okuyamaz → XSS ile jeton çalınamaz
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

/** Oturumdaki hesabı döndürür (yoksa account: null). */
export async function GET(request: NextRequest) {
  try {
    const user = await userFromToken(sessionToken(request));
    return NextResponse.json({ ok: true, account: user ? toAccountView(user) : null }, { headers: NO_STORE });
  } catch {
    // Veritabanına ulaşılamıyorsa oyun yine de ziyaretçi olarak oynanabilmeli.
    return NextResponse.json({ ok: true, account: null }, { headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Geçersiz istek gövdesi.");
  }
  const action = String(body.action ?? "");

  try {
    switch (action) {
      // Kayıt: adı zaten katılım ekranında aldık, burada yalnızca şifre gelir.
      case "register": {
        const res = await registerUser(body.name, body.password);
        if (!res.ok) return bad(res.error);
        const token = await createSession(res.user._id);
        const out = NextResponse.json(
          { ok: true, account: toAccountView(res.user) },
          { headers: NO_STORE }
        );
        setSessionCookie(out, token);
        return out;
      }

      case "login": {
        const res = await loginUser(body.name, body.password);
        if (!res.ok) return bad(res.error, 401);
        const token = await createSession(res.user._id);
        const out = NextResponse.json(
          { ok: true, account: toAccountView(res.user) },
          { headers: NO_STORE }
        );
        setSessionCookie(out, token);
        return out;
      }

      case "logout": {
        await destroySession(sessionToken(request));
        const out = NextResponse.json({ ok: true, account: null }, { headers: NO_STORE });
        clearSessionCookie(out);
        return out;
      }

      case "rename": {
        const user = await userFromToken(sessionToken(request));
        if (!user) return bad("Giriş yapmalısın.", 401);
        const res = await renameUser(user._id, body.name);
        if (!res.ok) return bad(res.error);
        return NextResponse.json({ ok: true, account: toAccountView(res.user) }, { headers: NO_STORE });
      }

      // Şifre değişince diğer cihazlardaki oturumlar düşer, bu cihaz yenilenir.
      case "changePassword": {
        const user = await userFromToken(sessionToken(request));
        if (!user) return bad("Giriş yapmalısın.", 401);
        const res = await changePassword(user._id, body.currentPassword, body.newPassword);
        if (!res.ok) return bad(res.error);
        await destroyAllSessions(user._id);
        const token = await createSession(user._id);
        const out = NextResponse.json({ ok: true, account: toAccountView(user) }, { headers: NO_STORE });
        setSessionCookie(out, token);
        return out;
      }

      default:
        return bad("Bilinmeyen işlem: " + action);
    }
  } catch {
    return bad("İşlem tamamlanamadı, tekrar deneyin.", 500);
  }
}
