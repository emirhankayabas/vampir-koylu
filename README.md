# 🧛 Vampir Köylü

Gerçek zamanlı, moderatör destekli Vampir Köylü oyunu. Tek Next.js projesi
(App Router) — frontend, API ve gerçek zamanlı akış aynı yerde.

## Özellikler

- **Moderatör paneli** (`/moderator`): rolleri seç/ekle (checkbox ile aç-kapa),
  sayıları ayarla, oyunu başlat/bitir/sıfırla, oyuncu çıkar.
- **Katılımcı ekranı** (`/oyna`): isimle katıl, rolünü canlı gör.
- **İki yönetim modu**: 🗣️ Sözlü veya 📱 Telefondan.
- **Telefon modu**: gece ölenleri seçme, canlı oylama + moderatör onayıyla asma,
  Avcı asılınca atış hakkı, otomatik kazanan tespiti.
- **Roller**: Vampir, Doktor, Medyum, Avcı, Köylü (varsayılan) + özel rol ekleme.
- **Gerçek zamanlı**: Server-Sent Events (SSE) — Vercel ücretsiz planda çalışır,
  ek servis/WebSocket sunucusu gerektirmez.

## Kurulum

```bash
npm install
```

`.env.local` dosyasına çalışan bir MongoDB Atlas bağlantısı koyun:

```
MONGODB_URI=mongodb+srv://KULLANICI:SIFRE@KUME.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=vampir_koylu
```

> ⚠️ **Önemli:** Bağlantı adresindeki Atlas kümesinin gerçekten var ve aktif
> olması gerekir. Atlas'ta ücretsiz (M0) bir küme oluşturun, bir veritabanı
> kullanıcısı ekleyin ve **Network Access** kısmında `0.0.0.0/0` erişimine izin
> verin (Vercel'in bağlanabilmesi için). Bağlantı adresini
> Atlas → Connect → Drivers'tan alın.

```bash
npm run dev     # http://localhost:3000
```

## Vercel'e yayınlama

- Projeyi Vercel'e import edin.
- **Environment Variables** kısmına `MONGODB_URI` ve `MONGODB_DB` ekleyin.
- Gerçek zamanlılık SSE ile çalıştığı için ek yapılandırma gerekmez.

## Mimari

- `app/moderator` — moderatör arayüzü (client component).
- `app/oyna` — katılımcı arayüzü (client component).
- `app/api/game/route.ts` — tüm yazma aksiyonları (join, vote, start, hang, ...).
- `app/api/stream/route.ts` — SSE ile role göre filtrelenmiş canlı durum.
- `lib/game.ts` — oyun mantığı, rol dağıtımı, kazanan tespiti, projeksiyonlar.
- `lib/mongodb.ts` — önbelleğe alınmış Atlas bağlantısı.
- MongoDB'de tek bir `state` dokümanı tutulur (tek genel oyun).
