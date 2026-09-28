# daktilab

Aşama aşama 10 parmak yazma eğitimi veren bir web uygulaması. SolidJS + TypeScript + Tailwind CSS ile yazıldı. İlerleme her zaman tarayıcıda (localStorage) saklanır; isteğe bağlı bir Supabase backend'i ile hesap, bulut senkronizasyon, günlük test ve global sıralama eklenebilir (aşağıya bakın).

- Klavye düzenleri: **Türkçe Q**, **Türkçe F**, **İngilizce (US)**
- Arayüz: Türkçe / English

## Komutlar

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest: yazma motoru + müfredat testleri
npm run build    # dist/ (statik, her yere deploy edilebilir; HashRouter kullanır)
```

## Nasıl çalışır

- **Müfredat** ([src/curriculum/stages.ts](src/curriculum/stages.ts)): her düzen için tuş tanıtım sırası. Ana sıra → üst sıra → alt sıra → büyük harf → noktalama → rakamlar → semboller → gerçek metin.
- **Dersler** ([src/curriculum/generator.ts](src/curriculum/generator.ts)): her ders 1–3 yeni tuş tanıtır; adımlar: tanıtım → alıştırma → kelimeler → pekiştirme. Metinler yalnızca o ana kadar öğrenilmiş karakterleri kullanır (testle garanti edilir) ve her denemede değişir.
- **Yazma motoru** ([src/engine/session.ts](src/engine/session.ts)): UI'dan bağımsız, saf fonksiyonlar. Tuş başına isabet/hata/gecikme ve hatalı bigramları kaydeder.
- **Kas hafızası mekanikleri**: parmak renkli ekran klavyesi ve el şeması, ilerledikçe soluklaşan/gizlenen klavye, 1,5 sn duraksamadan sonra gelen ipucu, "hatada dur" modu, zayıf tuş ağırlıklı adaptif pratik, aralıklı tekrar, metronom.
- **Düzen kontrolü**: basılan tuşlar (`KeyboardEvent.code` + `key`) seçili düzenle uyuşmazsa uyarı gösterilir ve uygun düzen önerilir.
- **Kilit açma**: bir ders %94 doğruluk ve aşamanın hedef hızıyla geçilince sonraki açılır; 1–3 yıldız.

## Yapı

```
src/
  layouts/      düzen verileri (KeyboardEvent.code → karakter) + fiziksel klavye/parmak eşlemesi
  curriculum/   aşamalar ve ders/alıştırma üretici
  engine/       yazma oturumu, metrikler, metin üretici
  words/        TR/EN kelime listeleri ve cümleler
  store/        ayarlar, ilerleme (localStorage), auth + bulut senkronizasyon
  lib/          supabase istemcisi, sıralama (leaderboard) sorguları
  i18n/         TR/EN sözlükler
  components/   Keyboard, Hands, TypingArea, Runner, ResultCard, LineChart…
  pages/        Home, Lessons, Lesson, Practice, Test, Leaderboard, Stats, Settings, Login, Onboarding
```

## Backend kurulumu (opsiyonel)

Backend olmadan uygulama tamamen çalışır (localStorage). Hesap, cihazlar arası ilerleme senkronizasyonu, günlük standart test ve global sıralama için bir [Supabase](https://supabase.com) projesi gerekir:

1. Supabase'de yeni bir proje oluştur; Authentication → Providers'tan **Email** ve (istersen) **Google**/**GitHub** OAuth sağlayıcılarını aç.
2. SQL Editor'de [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) dosyasını çalıştır (tablolar + RLS politikaları).
3. Project Settings → API'den **Project URL** ve **anon public key**'i al.
4. `.env.example` dosyasını `.env.local` olarak kopyala ve `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` değerlerini doldur.
5. `npm run dev` — giriş yap, `/test` sayfasından günlük testi tamamla, `/leaderboard`'da sonucu gör.

Bu değişkenler boşsa uygulama otomatik olarak çevrimdışı modda çalışır; `/login`, `/leaderboard` ve `/test` sayfaları bunu belirtir.
