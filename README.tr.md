# daktilab

[English](README.md) | **Türkçe**

Aşama aşama 10 parmak yazma eğitimi veren, açık kaynak bir web uygulaması. SolidJS + TypeScript + Tailwind CSS ile yazıldı. İlerleme her zaman tarayıcıda (localStorage) saklanır; isteğe bağlı Go backend'i (`server/`) ile hesap, bulut senkronizasyon, 1 dakikalık test ve global sıralama eklenebilir (aşağıya bakın).

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
  lib/          API istemcisi, sıralama sorguları, test kelimesi çekme
  i18n/         TR/EN sözlükler
  components/   Keyboard, Hands, TypingArea, Runner, ResultCard, LineChart…
  pages/        Home, Lessons, Lesson, Practice, Test, Leaderboard, Stats, Settings, Login, Onboarding
server/         Go API'si: auth, senkronizasyon, sıralama, kelimeler (cmd/api, cmd/import-words)
```

## Backend kurulumu (opsiyonel)

Backend olmadan uygulama tamamen çalışır (localStorage). Hesap, cihazlar arası ilerleme senkronizasyonu ve global sıralama için [server/](server) içindeki Go API'si ve bir PostgreSQL 13+ veritabanı gerekir. API, şema migration'larını açılışta kendisi uygular.

### Yerel geliştirme

1. Postgres'i başlat, ör. `docker compose up -d db` (ya da boş bir veritabanı olan herhangi bir yerel Postgres).
2. API'yi başlat:

   ```sh
   cd server
   DATABASE_URL=postgres://daktilab:daktilab@localhost:5432/daktilab?sslmode=disable go run ./cmd/api
   ```

3. `.env.example` dosyasını `.env.local` olarak kopyala (içinde `VITE_API_URL=/api` var) ve `npm run dev` çalıştır. Vite `/api` isteklerini `localhost:8080`'e yönlendirir; böylece oturum cookie'si aynı origin'de kalır.
4. Hesap oluştur, kullanıcı adı seç, `/test` sayfasında testi tamamla, `/leaderboard`'da sonucu gör.

`VITE_API_URL` boşsa uygulama çevrimdışı modda çalışır; `/login`, `/leaderboard` ve `/test` sayfaları bunu belirtir.

### Yapılandırma

| Değişken | Varsayılan | Amaç |
| --- | --- | --- |
| `DATABASE_URL` | — (zorunlu) | Postgres bağlantı adresi |
| `ADDR` | `:8080` | Dinlenen adres |
| `APP_URL` | `http://localhost:5173` | Frontend'in sunulduğu adres. OAuth yalnızca bu origin'e geri yönlendirir; izin verilen tek CORS origin'i de budur |
| `PUBLIC_API_URL` | `$APP_URL/api` | Tarayıcının gördüğü API adresi; OAuth callback'leri `$PUBLIC_API_URL/auth/oauth/{google,github}/callback` |
| `COOKIE_SECURE` | `APP_URL` https ise `true` | Cookie'lerde `Secure` bayrağı |
| `TRUST_PROXY` | `false` | İstemci IP'sini `X-Forwarded-For`'dan oku (rate limit için); yalnızca kendi proxy'nin arkasında aç |
| `STATIC_DIR` | — | Bu dizini (derlenmiş `dist/`) `/` altında da sun |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | "Google ile devam et" düğmesini açar |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | "GitHub ile devam et" düğmesini açar |

### Production

[Dockerfile](Dockerfile), frontend'i ve API'yi 8080 portundan sunan tek bir imaj üretir. Yerelde `docker compose up --build` ile deneyip http://localhost:8080 adresini açabilirsin. Production'da `APP_URL`'i herkese açık https adresine ayarla. `$APP_URL/api/auth/oauth/google/callback` (ve `/github/callback`) adresini de OAuth redirect URI'si olarak kaydet.

Oturumlar HttpOnly cookie ile tutulur (30 gün, kullanıldıkça uzar). Şifreler argon2id ile hash'lenir. Siteler arası yazma istekleri reddedilir (CSRF), giriş ve kayıt IP başına sınırlanır. Skorlar sunucuda kontrol edilir: değer aralıkları, 45 saniyede en fazla bir gönderim ve hesaptan eski olamayan bir streak.

### Test sözlüğü (opsiyonel)

1 dakikalık test, kelimeleri veritabanındaki büyük sözlükten çeker. Her denemede `GET /api/words` ile ~800 rastgele kelime gelir; bir sonraki deneme için kelimeler önceden çekilir. Tablo boşsa ya da ulaşılamazsa uygulamaya gömülü küçük listeler kullanılır.

Her satırında bir kelime olan dosyaları yükle (o dilin kelimelerini değiştirir; tekrar çalıştırmak güvenli):

```sh
cd server
export DATABASE_URL=postgres://…
go run ./cmd/import-words en ../../ALL_ENGLISH_WORDS.txt
go run ./cmd/import-words tr ../../ALL_TURKISH_WORDS.txt
```

Araç her satırı o dilin kurallarıyla küçük harfe çevirir (Türkçe `I` → `ı`). Sadece o dilin harflerinden oluşan 2–20 harflik kelimeleri alır ve tekrarları atar. Türkçe dosya (~6,6 milyon kelime) veritabanında yaklaşık 500–700 MB yer kaplar.

### Supabase'den veri taşıma

Şema, Supabase'deki id'leri ve tablo yapılarını korur; bu yüzden mevcut veri doğrudan kopyalanabilir. Tabloların oluşması için API'yi yeni veritabanına karşı bir kez başlat, ardından:

```sh
OLD=postgres://…supabase…   NEW=postgres://…yeni…
psql "$OLD" -c "\copy (select id, lower(email), encrypted_password, created_at from auth.users) to users.csv csv"
psql "$OLD" -c "\copy (select provider, provider_id, user_id, lower(email), created_at from auth.identities where provider in ('google','github')) to identities.csv csv"
psql "$NEW" -c "\copy users (id, email, password_hash, created_at) from users.csv csv"
psql "$NEW" -c "\copy user_identities (provider, provider_user_id, user_id, email, created_at) from identities.csv csv"
for t in profiles progress_sync daily_test_scores personal_bests user_stats words; do
  psql "$OLD" -c "\copy public.$t to $t.csv csv" && psql "$NEW" -c "\copy $t from $t.csv csv"
done
psql "$NEW" -c "select setval('daily_test_scores_id_seq', (select coalesce(max(id), 1) from daily_test_scores))"
```

Supabase şifreleri bcrypt olarak saklar. API bunları olduğu gibi kabul eder ve her birini bir sonraki girişte argon2id'ye yükseltir. Kullanıcıların şifre sıfırlaması gerekmez.
