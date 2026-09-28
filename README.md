# daktilab

Aşama aşama 10 parmak yazma eğitimi veren bir web uygulaması. SolidJS + TypeScript + Tailwind CSS ile yazıldı; backend yok, ilerleme tarayıcıda (localStorage) saklanıyor.

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
  store/        ayarlar ve ilerleme (localStorage)
  i18n/         TR/EN sözlükler
  components/   Keyboard, Hands, TypingArea, Runner, ResultCard, LineChart…
  pages/        Home, Lessons, Lesson, Practice, Stats, Settings, Onboarding
```
