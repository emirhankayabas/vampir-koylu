import type { Metadata, Viewport } from "next";
import { Inter, Cinzel } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
});

export const metadata: Metadata = {
  title: "Vampir Köylü",
  description: "Gerçek zamanlı, animasyonlu vampir köylü oyunu",
  applicationName: "Vampir Köylü",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Vampir Köylü" },
};

export const viewport: Viewport = {
  themeColor: "#07060d",
  width: "device-width",
  initialScale: 1,
  // maximumScale/userScalable BİLEREK ayarlanmıyor: yakınlaştırmayı kapatmak
  // küçük etiketleri (10-11px rozetler) okuyamayan kullanıcıları dışarıda
  // bırakır ve iOS bunu zaten yok sayar. Çift dokunuşla istemsiz zoom'u
  // engellemek için CSS'te `touch-action: manipulation` kullanıyoruz.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${inter.variable} ${cinzel.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
