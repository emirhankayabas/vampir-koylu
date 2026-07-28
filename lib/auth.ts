// Hesap ve oturum katmanı — ad + şifre, başka alan yok.
//
// Kasıtlı olarak bağımlılıksız: şifre karması Node'un yerleşik `scrypt`'iyle
// üretilir. scrypt bellek-zor bir KDF'tir (bcrypt/argon2 ile aynı sınıf), native
// derleme gerektirmez ve Vercel'in Node çalışma zamanında sorunsuz çalışır.

import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { getDb } from "@/lib/mongodb";
import type { UserDoc, SessionDoc, AccountView } from "@/lib/types";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

export const SESSION_COOKIE = "vk_sess";
// Kullanıcı çıkış yapana kadar oturum açık kalsın: 1 yıl.
export const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export const NAME_MIN = 2;
export const NAME_MAX = 24;
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 72;

/* --------------------------- Ad normalizasyonu --------------------------- */

// Birleşen aksan işaretleri (U+0300–U+036F). Kaçış dizisiyle kuruyoruz ki
// kaynak dosya farklı editör/kodlamalarda bozulmasın.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Adın benzersizlik anahtarını üretir. Amaç, aynı ismin farklı yazımlarıyla
 * (büyük/küçük harf, aksan, i/ı) iki ayrı hesap açılmasını ve birinin diğerinin
 * yerine geçmesini engellemek:
 *   "Emir", "EMİR", "emır"  → hepsi "emir"
 *   "Şükrü", "SUKRU"        → hepsi "sukru"
 * Görünen ad (UserDoc.name) kullanıcının yazdığı hâliyle korunur; katlanan
 * yalnızca bu anahtardır.
 */
export function foldName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/ı/g, "i") // noktasız ı → i (TR küçültme tutarsızlığını kapatır)
    .normalize("NFC");
}

export type Validated = { ok: true; value: string } | { ok: false; error: string };

export function validateName(raw: unknown): Validated {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < NAME_MIN) return { ok: false, error: "İsim en az 2 karakter olmalı." };
  if (name.length > NAME_MAX) return { ok: false, error: "İsim en fazla 24 karakter olabilir." };
  if (foldName(name).length === 0) return { ok: false, error: "Geçersiz isim." };
  return { ok: true, value: name };
}

export function validatePassword(raw: unknown): Validated {
  const pw = String(raw ?? "");
  if (pw.length < PASSWORD_MIN) return { ok: false, error: "Şifre en az 4 karakter olmalı." };
  if (pw.length > PASSWORD_MAX) return { ok: false, error: "Şifre çok uzun." };
  return { ok: true, value: pw };
}

/* ------------------------------ Şifre karması ------------------------------ */

const SCRYPT_KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, SCRYPT_KEYLEN);
  return `s1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Şifreyi doğrular. Karşılaştırma sabit zamanlıdır (zamanlama sızıntısı yok). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = String(stored ?? "").split("$");
  if (scheme !== "s1" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltHex, "hex"), SCRYPT_KEYLEN);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* -------------------------------- İndeksler -------------------------------- */

// Serverless'ta her soğuk başlangıçta bir kez kurulur, sonra süreç boyunca
// önbellekten döner. Hata olursa bir sonraki istekte tekrar denenir.
const globalCache = global as typeof globalThis & { _vkIndexes?: Promise<void> };

export async function ensureAccountIndexes(): Promise<void> {
  globalCache._vkIndexes ??= (async () => {
    const db = await getDb();
    await db.collection<UserDoc>("users").createIndex({ key: 1 }, { unique: true });
    await db.collection<SessionDoc>("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection("matches").createIndex({ userIds: 1, startedAt: -1 });
  })();
  try {
    await globalCache._vkIndexes;
  } catch (err) {
    globalCache._vkIndexes = undefined; // sonraki istekte yeniden dene
    throw err;
  }
}

/* --------------------------------- Hesaplar --------------------------------- */

export type AuthResult = { ok: true; user: UserDoc } | { ok: false; error: string };

export function toAccountView(user: UserDoc): AccountView {
  return { id: user._id, name: user.name, createdAt: user.createdAt };
}

export async function registerUser(rawName: unknown, rawPassword: unknown): Promise<AuthResult> {
  const name = validateName(rawName);
  if (!name.ok) return name;
  const password = validatePassword(rawPassword);
  if (!password.ok) return password;

  await ensureAccountIndexes();
  const db = await getDb();
  const now = Date.now();
  const user: UserDoc = {
    _id: randomUUID(),
    key: foldName(name.value),
    name: name.value,
    passwordHash: await hashPassword(password.value),
    createdAt: now,
    lastSeenAt: now,
  };
  try {
    await db.collection<UserDoc>("users").insertOne(user);
  } catch (err) {
    // 11000 = benzersiz indeks ihlali → bu isim alınmış.
    if ((err as { code?: number }).code === 11000) {
      return { ok: false, error: "Bu isim alınmış. Sana aitse giriş yap." };
    }
    throw err;
  }
  return { ok: true, user };
}

export async function loginUser(rawName: unknown, rawPassword: unknown): Promise<AuthResult> {
  const key = foldName(String(rawName ?? ""));
  const password = String(rawPassword ?? "");
  // Hatalı isim ile hatalı şifreyi ayırt ETMİYORUZ: kimin kayıtlı olduğu
  // dışarıdan denenerek öğrenilmesin.
  const fail = { ok: false, error: "İsim veya şifre hatalı." } as const;
  if (!key || !password) return fail;

  const db = await getDb();
  const user = await db.collection<UserDoc>("users").findOne({ key });
  if (!user) return fail;
  if (!(await verifyPassword(password, user.passwordHash))) return fail;
  return { ok: true, user };
}

/** Görünen adı (ve dolayısıyla giriş anahtarını) değiştirir. */
export async function renameUser(userId: string, rawName: unknown): Promise<AuthResult> {
  const name = validateName(rawName);
  if (!name.ok) return name;

  await ensureAccountIndexes();
  const db = await getDb();
  const key = foldName(name.value);
  try {
    const updated = await db
      .collection<UserDoc>("users")
      .findOneAndUpdate({ _id: userId }, { $set: { name: name.value, key } }, { returnDocument: "after" });
    if (!updated) return { ok: false, error: "Hesap bulunamadı." };
    return { ok: true, user: updated };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return { ok: false, error: "Bu isim başkası tarafından alınmış." };
    }
    throw err;
  }
}

export async function changePassword(
  userId: string,
  rawCurrent: unknown,
  rawNext: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const next = validatePassword(rawNext);
  if (!next.ok) return next;
  const db = await getDb();
  const user = await db.collection<UserDoc>("users").findOne({ _id: userId });
  if (!user) return { ok: false, error: "Hesap bulunamadı." };
  if (!(await verifyPassword(String(rawCurrent ?? ""), user.passwordHash))) {
    return { ok: false, error: "Mevcut şifre hatalı." };
  }
  await db
    .collection<UserDoc>("users")
    .updateOne({ _id: userId }, { $set: { passwordHash: await hashPassword(next.value) } });
  return { ok: true };
}

/* -------------------------------- Oturumlar -------------------------------- */

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Yeni oturum açar ve çereze yazılacak ham jetonu döndürür. */
export async function createSession(userId: string): Promise<string> {
  await ensureAccountIndexes();
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await db.collection<SessionDoc>("sessions").insertOne({
    _id: tokenHash(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now + SESSION_TTL_MS),
  });
  return token;
}

/**
 * Jetonun sahibini döndürür. Süresi geçmiş oturum yok sayılır (TTL indeksi
 * silmeyi biraz gecikmeli yapabilir, o yüzden burada da kontrol ediyoruz).
 */
export async function userFromToken(token: string | undefined | null): Promise<UserDoc | null> {
  if (!token) return null;
  const db = await getDb();
  const session = await db.collection<SessionDoc>("sessions").findOne({ _id: tokenHash(token) });
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  const user = await db.collection<UserDoc>("users").findOne({ _id: session.userId });
  if (!user) return null;
  // Son görülme damgası — hesabın aktif olduğunu bilmek için (yanıtı bekletmiyoruz).
  void db
    .collection<UserDoc>("users")
    .updateOne({ _id: user._id }, { $set: { lastSeenAt: Date.now() } })
    .catch(() => {});
  return user;
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  const db = await getDb();
  await db.collection<SessionDoc>("sessions").deleteOne({ _id: tokenHash(token) });
}

/** Tüm cihazlardan çıkış (şifre değişince çağrılabilir). */
export async function destroyAllSessions(userId: string): Promise<void> {
  const db = await getDb();
  await db.collection<SessionDoc>("sessions").deleteMany({ userId });
}
