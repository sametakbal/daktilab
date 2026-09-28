# daktilab

[English](README.md) | **Türkçe**

Aşama aşama 10 parmak yazma eğitimi veren, açık kaynak bir web uygulaması. SolidJS + TypeScript + Tailwind CSS ile yazıldı. İlerleme her zaman tarayıcıda (localStorage) saklanır; isteğe bağlı bir Supabase backend'i ile hesap, bulut senkronizasyon, 1 dakikalık test ve global sıralama eklenebilir (aşağıya bakın).

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
- **1 dakikalık test**: arayüz dilinde, küçük harfli gerçek kelimeler; her denemede farklı. Süre ilk tuşla başlar, skor 60 saniyede doğru yazılan kelime sayısıdır. Pencere odağı kaybedilince metin bulanıklaşır ve süre durur.
- **Yazma motoru** ([src/engine/session.ts](src/engine/session.ts)): UI'dan bağımsız, saf fonksiyonlar. Tuş başına isabet/hata/gecikme ve hatalı bigramları kaydeder.
- **Kas hafızası mekanikleri**: parmak renkli ekran klavyesi ve el şeması, ilerledikçe soluklaşan/gizlenen klavye, 1,5 sn duraksamadan sonra gelen ipucu, "hatada dur" modu, zayıf tuş ağırlıklı adaptif pratik, aralıklı tekrar, metronom.
- **Düzen kontrolü**: basılan tuşlar (`KeyboardEvent.code` + `key`) seçili düzenle uyuşmazsa uyarı gösterilir ve uygun düzen önerilir.
- **Kilit açma**: bir ders %94 doğruluk ve aşamanın hedef hızıyla geçilince sonraki açılır; 1–3 yıldız.

## Yapı

```
src/
  layouts/      düzen verileri (KeyboardEvent.code → karakter) + fiziksel klavye/parmak eşlemesi
  curriculum/   aşamalar ve ders/alıştırma/test üretici
  engine/       yazma oturumu, metrikler, metin üretici
  words/        gömülü TR/EN kelime listeleri ve cümleler
  store/        ayarlar, ilerleme (localStorage), auth + bulut senkronizasyon
  lib/          supabase istemcisi, sıralama sorguları, test kelimesi çekme
  i18n/         TR/EN sözlükler
  components/   Keyboard, Hands, TypingArea, Runner, ResultCard, LineChart…
  pages/        Home, Lessons, Lesson, Practice, Test, Leaderboard, Stats, Settings, Login, Onboarding
scripts/        import-words.mjs (sözlük dosyalarını Supabase'e yükler)
supabase/       SQL migration'ları
```

## Backend kurulumu (opsiyonel)

Backend olmadan uygulama tamamen çalışır (localStorage). Hesap, cihazlar arası ilerleme senkronizasyonu ve global sıralama için bir [Supabase](https://supabase.com) projesi gerekir:

1. Supabase'de yeni bir proje oluştur; Authentication → Providers'tan **Email** ve (istersen) **Google**/**GitHub** OAuth sağlayıcılarını aç.
2. SQL Editor'de [supabase/migrations/](supabase/migrations/) klasöründeki dosyaları sırayla çalıştır (hepsi tekrar çalıştırılabilir):
   - `0001_init.sql`: tablolar ve RLS politikaları
   - `0002_words.sql`: test sözlüğü
   - `0003_ranked_test.sql`: sunucu tarafında puanlanan testler. İstemci skor yazamaz; `start_test()` metni seçip başlangıç zamanını kaydeder, `finish_test()` yazılan metni buna göre puanlayıp sıralamayı günceller. Ayrıca sözlüğe gömülü kelime listelerini yedek olarak ekler.
3. Project Settings → API'den **Project URL** ve **anon public key**'i al.
4. `.env.example` dosyasını `.env.local` olarak kopyala ve `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` değerlerini doldur.
5. `npm run dev` — giriş yap, kullanıcı adı seç, `/test` sayfasında testi tamamla, `/leaderboard`'da sonucu gör.

Bu değişkenler boşsa uygulama otomatik olarak çevrimdışı modda çalışır; `/login`, `/leaderboard` ve `/test` sayfaları bunu belirtir.

### Test sözlüğü (opsiyonel)

1 dakikalık test, kelimeleri veritabanındaki büyük sözlükten çeker. Her denemede `random_words` RPC'si ile ~800 rastgele kelime gelir; bir sonraki deneme için kelimeler önceden çekilir. Tablo boşsa ya da ulaşılamazsa uygulamaya gömülü küçük listeler kullanılır.

1. `0002_words.sql` ve `0003_ranked_test.sql` dosyalarının çalıştırıldığından emin ol (yukarıya bak).
2. Project Settings → API'den **service_role** key'i al ve `.env.local`'e `SUPABASE_SERVICE_ROLE_KEY=...` olarak ekle. Bu key RLS'i atlar: **asla `VITE_` önekiyle yazma**, yoksa tarayıcıya gönderilen pakete girer.
3. Her satırında bir kelime olan dosyaları yükle (tekrar çalıştırmak güvenli):

   ```sh
   node --env-file=.env.local scripts/import-words.mjs en ../ALL_ENGLISH_WORDS.txt
   node --env-file=.env.local --max-old-space-size=4096 scripts/import-words.mjs tr ../ALL_TURKISH_WORDS.txt
   ```

   Script satırları küçük harfe çevirir, sadece o dilin harflerinden oluşan 2–20 harflik kelimeleri alır ve tekrarları atar. Türkçe dosya (~6,6 milyon kelime) veritabanında yaklaşık 500–700 MB yer kaplar; Supabase ücretsiz planının sınırını aşar.
