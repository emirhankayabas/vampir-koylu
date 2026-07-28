import { existsSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

// Android APK'sı public/ içinde duruyorsa siteden doğrudan indirilir; GitHub'a
// ya da başka bir servise gerek yok. Dosyanın VAR OLUP OLMADIĞINI derleme
// anında bakıyoruz: yoksa ana sayfadaki indirme kartı hiç basılmaz, yani
// kullanıcı asla kırık bir bağlantıya tıklamaz. APK'yı public/ içine atıp
// yeniden yayınlamak kartı geri getirmeye yeter.
export const APK_FILENAME = "vampir-koylu.apk";
const apkAvailable = existsSync(join(process.cwd(), "public", APK_FILENAME));

const nextConfig: NextConfig = {
  reactCompiler: true,

  env: {
    NEXT_PUBLIC_APK_AVAILABLE: String(apkAvailable),
  },

  async headers() {
    return [
      {
        source: `/${APK_FILENAME}`,
        headers: [
          // Tarayıcı APK'yı görüntülemeye çalışmasın, indirsin.
          { key: "Content-Type", value: "application/vnd.android.package-archive" },
          { key: "Content-Disposition", value: `attachment; filename="${APK_FILENAME}"` },
        ],
      },
    ];
  },
};

export default nextConfig;
