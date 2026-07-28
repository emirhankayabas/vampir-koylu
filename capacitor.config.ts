import type { CapacitorConfig } from "@capacitor/cli";

/* ============================================================
   Android kabuğu (APK) yapılandırması.

   Bu oyun sunucu tarafında çalışıyor (API route'ları, MongoDB, yoklama ile
   canlı senkron) — yani statik olarak paketlenemez. Bu yüzden APK, yayındaki
   siteyi tam ekran gösteren ince bir native kabuk: kullanıcı uygulamayı açar,
   siteyi görür ama tarayıcı çubuğu yoktur, kendi ikonu ve açılış ekranı vardır,
   telefonun geri tuşu uygulama içinde çalışır.

   Böylece TEK kod tabanı kalıyor: web'de düzelttiğin şey APK'da da anında
   düzelmiş oluyor, yeni sürüm yayınlamaya gerek kalmıyor.
   ============================================================ */

// Uygulamanın açacağı adres. Vercel'deki PRODUCTION alan adı olmalı — yönlendirme
// yapan bir adres (ör. vampir-koylu-two.vercel.app → 307) verilirse uygulama
// açılışta başka bir hosta atlar, o host allowNavigation listesinde olmadığı için
// site telefonun tarayıcısında açılır ve APK bomboş kalır.
//
// İleride özel alan adı alırsan: ya bu satırı değiştir ya da GitHub'da APP_URL
// repo değişkenini tanımla — değişken varsa o kazanır, kod değişikliği gerekmez.
const appUrl = process.env.APP_URL || "https://villageofvampires.vercel.app";

// Uygulama içinde açık kalacak hostlar. Eski/yönlendiren alan adını da
// ekliyoruz ki paylaşılmış bir bağlantı uygulamanın dışına düşmesin.
const allowedHosts = [...new Set([new URL(appUrl).host, "vampir-koylu-two.vercel.app"])];

const config: CapacitorConfig = {
  appId: "com.emirhankayabas.vampirkoylu",
  appName: "Vampir Köylü",
  // Yerel varlık klasörü. Uzak adres kullandığımız için pratikte boş bir
  // yedek sayfa barındırır; Capacitor yine de var olmasını ister.
  webDir: "capacitor-shell",

  server: {
    url: appUrl,
    // Site https'te; temiz trafiğe izin vermiyoruz.
    cleartext: false,
    // Buraya girmeyen bir bağlantıya dokunulursa telefonun tarayıcısında
    // açılır — kullanıcı uygulamanın içinde yabancı bir sitede kaybolmaz.
    allowNavigation: allowedHosts,
  },

  // WebView yüklenene kadar görünen zemin. Uygulamanın koyu arka planıyla aynı
  // olsun ki açılışta bir kare beyaz parlamasın.
  backgroundColor: "#07060d",
  android: {
    backgroundColor: "#07060d",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      // Uygulamanın koyu zemini (globals.css --bg-0) ile aynı.
      backgroundColor: "#07060d",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK", // koyu zemin üstünde açık ikonlar
      backgroundColor: "#07060d",
    },
  },
};

export default config;
