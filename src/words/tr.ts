// Sık kullanılan Türkçe kelimeler (kök ve yaygın çekimli biçimler).
// Kısa kelimeler bilerek bol tutuldu: ilk dersler az harfle çalışır.
const raw = `
a al ala ali ağ ak alfa ad ada adak adam adı adil af afiyet ağa ağaç ağır ağız ağla ahi ahşap aile ait ajan akıl akış akşam aksi aktif alan alçak aldı alet alış alkış allah alt altı altın ama amaç ana anahtar anı anlam anne ara araba arada aralık arı arka arkadaş arsa artık arz as asil asker aslan asla aşağı aşama aşçı aşk aşı at ata ateş atlas av avcı ay aya ayak ayar aydın ayna ayrı az azık
baba bacak badem bağ bağış bahçe bahar bak bakan bakış bal balık bana bank banka bar barış baş başka başla bay bayrak bazı bebek beden bek bekle bel belge belki ben bence beni benim beş beyaz beyin bez biber bil bile bilgi bilim bin bina bir biraz birlik bitki biz bize bizi bizim boş boy boya bu bugün bulut bura burada burun bunu bunlar bütün büyük
can canlı cam cadde cep cevap ceviz ceza ciddi cins civar cuma cümle
çabuk çağ çalış çam çanta çarşı çay çek çekiç çelik çevre çiçek çift çiz çocuk çok çorba çöl çözüm çünkü
da daha dağ dal dalga dam damla dar dede defa defter değer değil deli demek deniz ders dert dev devam devlet dış dil dile dilek dinle din diz doğa doğru doktor dolap dolu dost doz dua durum duvar düş düz dün dünya düşün
e ek eke ekim ekmek eksik el ela elde eli elif elma emek en enerji er erik erken esas eser eski eş eşek eşik et etek etki ev evet evli evin eyalet
fal far fark fasıl fayda fen fes fidan fikir film fiş fiyat fok fırsat fırın
gaz gazete geç gece gel gelir gemi genç gene gerçek geri gibi gider giriş git göl gölge göz gri güç gül gün güneş güzel
ha hak haki hal hala hale hali ham hamal han hane hangi hani har hasar hasta hat hata hatır hava hayal hayat hayır haz hazır hedef hem hep her herkes hesap hız hiç his hoş hukuk
ırk ısı ışık ıslak ıssız
iç içeri iki il ila ilaç ile ileri ilgi ilk ilke ilim imza in ince insan irade is isim iş işçi işte iyi iz
jel jest jeton
kaba kadar kadın kafa kağıt kahve kale kalem kalp kan kanat kap kapı kar kara karar kardeş kas kasa kaş kat kaya kaz kedi kel kelime kemik kenar kent kere kes kış kız kızıl ki kilo kim kimse kira kişi kitap koca kol koku kolay konu kor koyun köprü kötü köy kulak kum kurt kuş kutu kültür küçük
laf lale lamba lastik lazım leke lider lira liste lise lokanta
madde mal masa masal mavi mektup meslek meyve mide mimar mira mola mor mutfak mutlu müzik
nasıl ne neden nefes nehir nerede nesil net neşe nokta not numara
o oda odun okul okyanus olay oldu olsa on ona onu orada orman orta ot otel oyun oyuncak
ödev ödül ölçü ön önce önem öykü öyle öz özel özgür
pahalı para parça park pas pasta pazar pek pencere pil pis plan portakal pul
radyo rahat ray renk resim rol roman ruh rüya rüzgar
saat sabah sabır sade sağ sağlık sahil sahip saka sakal sakin sal salı sanat sandalye sarı sayı sayfa saz sebep sefer sekiz sel selam sen sene seni senin ses sessiz sevgi sevinç sıcak sıfır sınıf sıra sis siz size sizi sofra soğuk son sonra sor soru söz spor su sulu sürü süt
şaka şal şans şarkı şart şehir şeker şey şiir şimdi şişe şu şurada
tabak tabii tahta takım tam tane tarih tarla tas taş tat tatil tavuk taze tek tel telefon temiz tepe tuz tür türkü
ucuz uç uçak ulus umut un unut us uyku uzak uzun
üç ülke ümit ün üst ütü üzüm
vakit var varlık vatan ve veda vergi veri
ya yağ yağmur yakın yal yalan yalnız yaprak yardım yarın yaş yaşam yat yatak yavaş yaz yazı yel yemek yeni yer yeşil yıl yıldız yine yok yol yurt yük yüksek yüz
zaman zar zarf zayıf zeki zil zor
ağaçlar adamlar aileler akıllı alanlar anlat anladı anlatı aradı aramak aslında ayrıca bakar bakalım baktı başarı başladı bekledi belli bilgisayar biliyor bitti buldu bulmak çalıştı çıktı çıkmak dedi demek dinledi doğdu duydu durdu düşündü etti gelecek geldi gitti gördü görmek güldü hazırla istedi kaldı kalk kaldır konuştu koştu okudu oldu oturdu saldı sevdi söyledi tuttu uyudu verdi yaptı yazdı yürüdü
askı asla aşı adalar adaşı dağlar dallar dilek dilekler diller dişi gaga gala galiba hadi hafif hafıza haklı halka hasıl haşhaş ilaç kalas kalkış kalkan kıl kışla lafla sağla sakla salı şakak şalgam dış dışa kaşık kısa kısa kısık şakacı dilsiz ağlak sıkıl sıkı
aslı alış ağlıyor kas kasık kaşla dalış daldı dalak kıskaç sadakat şahıs şahsi sahil hasıl hassas haşlak halis ilah kalas lakap flaş filiz fil sis işsiz şişkin dikiş kilit silik iğde
kale kaleler kalem kalemler kel kelek kese kesik kesik kesil kesin kesme keski leke lekeler sek sele seki eksi deli deliler dile dilekçe eğe ekle ekler elek esas eşek ile ileri hedef hela helal hele heves
sahi dede deden dedik sade sadece dikkat şekil şekilde iddia adli adalet asil asilik
`;

export const TR_WORDS: string[] = Array.from(
  new Set(
    raw
      .split(/\s+/)
      .map((w) => w.trim().normalize("NFC"))
      .filter((w) => w.length > 0 && /^[a-zçğıöşü]+$/u.test(w)),
  ),
);

export const TR_SENTENCES: string[] = [
  "Damlaya damlaya göl olur.",
  "Sakla samanı, gelir zamanı.",
  "Ağaç yaşken eğilir.",
  "Bir elin nesi var, iki elin sesi var.",
  "Sabır acıdır, meyvesi tatlıdır.",
  "Komşu komşunun külüne muhtaçtır.",
  "Dost kara günde belli olur.",
  "Az olsun, öz olsun.",
  "İşleyen demir ışıldar.",
  "Bugünün işini yarına bırakma.",
  "Emek olmadan yemek olmaz.",
  "Gülü seven dikenine katlanır.",
  "Her işte bir hayır vardır.",
  "Söz gümüşse sükut altındır.",
  "Tatlı dil yılanı deliğinden çıkarır.",
  "Üzüm üzüme baka baka kararır.",
  "Görünen köy kılavuz istemez.",
  "Akıl akıldan üstündür.",
  "Balık baştan kokar.",
  "Bin bilsen de bir bilene danış.",
  "Çok yaşayan bilmez, çok gezen bilir.",
  "El elden üstündür.",
  "Gönül ne kahve ister ne kahvehane.",
  "Hatasız kul olmaz.",
  "İyilik eden iyilik bulur.",
  "Keskin sirke küpüne zarar.",
  "Ne ekersen onu biçersin.",
  "Ak akçe kara gün içindir.",
  "Yalancının mumu yatsıya kadar yanar.",
  "Zaman her şeyin ilacıdır.",
  "Kitap okumak zihni besler.",
  "Sabah erken kalkan yol alır.",
  "Parmaklarını ana sırada tut ve ekrana bak.",
  "Doğruluk hızdan önce gelir.",
  "Her gün biraz pratik, büyük fark yaratır.",
  "Pijamalı hasta yağız şoföre çabucak güvendi.",
  "Klavyeye bakmadan yazmak zamanla kolaylaşır.",
  "Yavaş ve doğru yazmak, hızlı ve hatalı yazmaktan iyidir.",
  "Deniz kenarında yürüyüş yapmak insanı dinlendirir.",
  "Bu akşam arkadaşlarla birlikte film izleyeceğiz.",
];
