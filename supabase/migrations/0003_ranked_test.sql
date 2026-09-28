-- Server-scored tests: clients can no longer write scores directly. Idempotent: safe to re-run.
-- Requires 0001_init.sql and 0002_words.sql.
--
-- Flow: start_test() picks the passage and stamps the start time on the server;
-- finish_test() receives what was typed, scores it against that passage and updates the leaderboard.

create table if not exists public.test_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lang text not null check (lang in ('tr', 'en')),
  layout text not null check (layout in ('tr-q', 'tr-f', 'en-us')),
  passage text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score int
);

create index if not exists test_runs_user_idx on public.test_runs (user_id, started_at);
create index if not exists daily_test_scores_user_date_idx on public.daily_test_scores (user_id, test_date);

-- No policies: runs are only reachable through the security-definer functions below.
alter table public.test_runs enable row level security;

-- Leaderboard tables stay publicly readable but are written only by finish_test().
drop policy if exists "daily_test_scores are insertable by owner" on public.daily_test_scores;
drop policy if exists "personal_bests are writable by owner" on public.personal_bests;
drop policy if exists "personal_bests are updatable by owner" on public.personal_bests;
drop policy if exists "user_stats are writable by owner" on public.user_stats;
drop policy if exists "user_stats are updatable by owner" on public.user_stats;

create or replace function public.start_test(p_lang text, p_layout text)
returns table (run_id uuid, run_text text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_text text;
  v_id uuid;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if not exists (select 1 from profiles where profiles.id = uid) then
    raise exception 'pick a username first';
  end if;
  if p_lang not in ('tr', 'en') or p_layout not in ('tr-q', 'tr-f', 'en-us') then
    raise exception 'invalid language or layout';
  end if;

  delete from test_runs where user_id = uid and started_at < now() - interval '1 day';

  -- ~2500 characters of distinct random words the layout can type (en-us has no Turkish letters).
  with pool as materialized (
    select distinct t.w from random_words(p_lang, 1000) as t(w)
    where p_layout <> 'en-us' or t.w ~ '^[a-z]+$'
  ),
  shuffled as materialized (
    select w, random() as r from pool
  ),
  ranked as (
    select w, r, sum(char_length(w) + 1) over (order by r rows unbounded preceding) as upto from shuffled
  )
  select string_agg(w, ' ' order by r) into v_text from ranked where upto - char_length(w) - 1 < 2500;

  if v_text is null or char_length(v_text) < 200 then
    raise exception 'not enough words for this language';
  end if;

  insert into test_runs (user_id, lang, layout, passage) values (uid, p_lang, p_layout, v_text)
  returning test_runs.id into v_id;
  return query select v_id, v_text;
end;
$$;

create or replace function public.finish_test(p_run uuid, p_typed text, p_accuracy numeric)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r test_runs%rowtype;
  v_word text;
  v_off int := 0;
  v_score int := 0;
  v_elapsed interval;
  v_acc numeric := least(greatest(coalesce(p_accuracy, 0), 0), 100);
  v_today date := (now() at time zone 'utc')::date;
  v_streak int := 0;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  select * into r from test_runs where id = p_run and user_id = uid for update;
  if not found then
    raise exception 'unknown test';
  end if;
  if r.finished_at is not null then
    raise exception 'test already submitted';
  end if;

  -- The client clock only runs while typing (and pauses when the window loses focus),
  -- so real elapsed time can only be longer than the 60 s limit, never shorter.
  v_elapsed := now() - r.started_at;
  if v_elapsed < interval '59 seconds' then
    raise exception 'test finished too early';
  end if;
  if v_elapsed > interval '2 hours' then
    raise exception 'test expired';
  end if;
  if char_length(coalesce(p_typed, '')) > char_length(r.passage) then
    raise exception 'typed text is longer than the passage';
  end if;

  -- Same rule as correctWords() in the client: a word counts once its last letter is typed
  -- and every character at those positions matches.
  foreach v_word in array string_to_array(r.passage, ' ') loop
    exit when char_length(p_typed) < v_off + char_length(v_word);
    if substr(p_typed, v_off + 1, char_length(v_word)) = v_word then
      v_score := v_score + 1;
    end if;
    v_off := v_off + char_length(v_word) + 1;
  end loop;

  if v_score > 250 then
    raise exception 'implausible score';
  end if;

  update test_runs set finished_at = now(), score = v_score where id = r.id;

  insert into daily_test_scores (user_id, layout, test_date, wpm, accuracy)
  values (uid, r.layout, v_today, v_score, v_acc);

  insert into personal_bests (user_id, layout, best_wpm, best_accuracy, achieved_at)
  values (uid, r.layout, v_score, v_acc, now())
  on conflict (user_id, layout) do update
    set best_wpm = excluded.best_wpm, best_accuracy = excluded.best_accuracy, achieved_at = excluded.achieved_at
    where personal_bests.best_wpm < excluded.best_wpm;

  -- Streak: consecutive UTC days, ending today, with at least one finished test.
  while exists (select 1 from daily_test_scores where user_id = uid and test_date = v_today - v_streak) loop
    v_streak := v_streak + 1;
  end loop;

  insert into user_stats (user_id, current_streak, longest_streak, last_practice_date, updated_at)
  values (uid, v_streak, v_streak, v_today, now())
  on conflict (user_id) do update
    set current_streak = excluded.current_streak,
        longest_streak = greatest(user_stats.longest_streak, excluded.current_streak),
        last_practice_date = excluded.last_practice_date,
        updated_at = excluded.updated_at;

  return v_score;
end;
$$;

revoke execute on function public.start_test(text, text) from public, anon;
revoke execute on function public.finish_test(uuid, text, numeric) from public, anon;
grant execute on function public.start_test(text, text) to authenticated;
grant execute on function public.finish_test(uuid, text, numeric) to authenticated;

-- Fallback dictionary: the app's bundled word lists, loaded only while a language has no words yet.
-- scripts/import-words.mjs later overwrites these rows with the full dictionaries.
-- en: 576 words
insert into public.words (lang, n, word)
select 'en', t.n, t.word
from unnest(array[
  'a','ad','add','ads','all','as','ash','ask','sad','sass','lad','lads','fad','fads','dad','dads','gal','gals',
  'glad','flag','flags','flask','hall','halls','has','had','hash','half','lash','gash','jag','jags','salsa',
  'alfalfa','shall','dash','flash','slash','salad','ska','fall','falls','glass','lass','dal','the','of','and',
  'to','in','is','it','you','that','he','was','for','on','are','with','his','they','be','at','one','have','this',
  'from','or','by','hot','word','but','what','some','we','can','out','other','were','there','when','up','use',
  'your','how','said','an','each','she','which','do','their','time','if','will','way','about','many','then',
  'them','write','would','like','so','these','her','long','make','thing','see','him','two','look','more','day',
  'could','go','come','did','number','sound','no','most','people','my','over','know','water','than','call',
  'first','who','may','down','side','been','now','find','any','new','work','part','take','get','place','made',
  'live','where','after','back','little','only','round','man','year','came','show','every','good','me','give',
  'our','under','name','very','through','just','form','sentence','great','think','say','help','low','line',
  'differ','turn','cause','much','mean','before','move','right','boy','old','too','same','tell','does','set',
  'three','want','air','well','also','play','small','end','put','home','read','hand','port','large','spell',
  'even','land','here','must','big','high','such','follow','act','why','men','change','went','light','kind',
  'off','need','house','picture','try','us','again','animal','point','mother','world','near','build','self',
  'earth','father','head','stand','own','page','should','country','found','answer','school','grow','study',
  'still','learn','plant','cover','food','sun','four','between','state','keep','eye','never','last','let',
  'thought','city','tree','cross','farm','hard','start','might','story','saw','far','sea','draw','left','late',
  'run','while','press','close','night','real','life','few','north','open','seem','together','next','white',
  'children','begin','got','walk','example','ease','paper','group','always','music','those','both','mark',
  'often','letter','until','mile','river','car','feet','care','second','book','carry','took','science','eat',
  'room','friend','began','idea','fish','mountain','stop','once','base','hear','horse','cut','sure','watch',
  'color','face','wood','main','enough','plain','girl','usual','young','ready','above','ever','red','list',
  'though','feel','talk','bird','soon','body','dog','family','direct','pose','leave','song','measure','door',
  'product','black','short','numeral','class','wind','question','happen','complete','ship','area','rock','order',
  'fire','south','problem','piece','told','knew','pass','since','top','whole','king','space','heard','best',
  'hour','better','true','during','hundred','five','remember','step','early','hold','west','ground','interest',
  'reach','fast','verb','sing','listen','six','table','travel','less','morning','ten','simple','several','vowel',
  'toward','war','lay','against','pattern','slow','center','love','person','money','serve','appear','road','map',
  'rain','rule','govern','pull','cold','notice','voice','unit','power','town','fine','certain','fly','lead',
  'cry','dark','machine','note','wait','plan','figure','star','box','noun','field','rest','correct','able',
  'pound','done','beauty','drive','stood','contain','front','teach','week','final','gave','green','oh','quick',
  'develop','ocean','warm','free','minute','strong','special','mind','behind','clear','tail','produce','fact',
  'street','inch','multiply','nothing','course','stay','wheel','full','force','blue','object','decide','surface',
  'deep','moon','island','foot','system','busy','test','record','boat','common','gold','possible','plane',
  'stead','dry','wonder','laugh','thousand','ago','ran','check','game','shape','equate','miss','brought','heat',
  'snow','tire','bring','yes','distant','fill','east','paint','language','among','desk','jade','kale','lake',
  'leak','lease','sake','safe','seal','shake','shade','shed','sheds','slide','ideal','jail','kid','kids','skill',
  'hill','ill','dill','lid','lids','sid','aid','aids','hid','fig','gig','keyboard','finger','practice','typing',
  'lesson','speed','accuracy','rhythm','focus','quiet','steady','calm','habit'
]) with ordinality as t(word, n)
where not exists (select 1 from public.words where lang = 'en');

-- tr: 819 words
insert into public.words (lang, n, word)
select 'tr', t.n, t.word
from unnest(array[
  'a','al','ala','ali','ağ','ak','alfa','ad','ada','adak','adam','adı','adil','af','afiyet','ağa','ağaç','ağır',
  'ağız','ağla','ahi','ahşap','aile','ait','ajan','akıl','akış','akşam','aksi','aktif','alan','alçak','aldı',
  'alet','alış','alkış','allah','alt','altı','altın','ama','amaç','ana','anahtar','anı','anlam','anne','ara',
  'araba','arada','aralık','arı','arka','arkadaş','arsa','artık','arz','as','asil','asker','aslan','asla',
  'aşağı','aşama','aşçı','aşk','aşı','at','ata','ateş','atlas','av','avcı','ay','aya','ayak','ayar','aydın',
  'ayna','ayrı','az','azık','baba','bacak','badem','bağ','bağış','bahçe','bahar','bak','bakan','bakış','bal',
  'balık','bana','bank','banka','bar','barış','baş','başka','başla','bay','bayrak','bazı','bebek','beden','bek',
  'bekle','bel','belge','belki','ben','bence','beni','benim','beş','beyaz','beyin','bez','biber','bil','bile',
  'bilgi','bilim','bin','bina','bir','biraz','birlik','bitki','biz','bize','bizi','bizim','boş','boy','boya',
  'bu','bugün','bulut','bura','burada','burun','bunu','bunlar','bütün','büyük','can','canlı','cam','cadde','cep',
  'cevap','ceviz','ceza','ciddi','cins','civar','cuma','cümle','çabuk','çağ','çalış','çam','çanta','çarşı','çay',
  'çek','çekiç','çelik','çevre','çiçek','çift','çiz','çocuk','çok','çorba','çöl','çözüm','çünkü','da','daha',
  'dağ','dal','dalga','dam','damla','dar','dede','defa','defter','değer','değil','deli','demek','deniz','ders',
  'dert','dev','devam','devlet','dış','dil','dile','dilek','dinle','din','diz','doğa','doğru','doktor','dolap',
  'dolu','dost','doz','dua','durum','duvar','düş','düz','dün','dünya','düşün','e','ek','eke','ekim','ekmek',
  'eksik','el','ela','elde','eli','elif','elma','emek','en','enerji','er','erik','erken','esas','eser','eski',
  'eş','eşek','eşik','et','etek','etki','ev','evet','evli','evin','eyalet','fal','far','fark','fasıl','fayda',
  'fen','fes','fidan','fikir','film','fiş','fiyat','fok','fırsat','fırın','gaz','gazete','geç','gece','gel',
  'gelir','gemi','genç','gene','gerçek','geri','gibi','gider','giriş','git','göl','gölge','göz','gri','güç',
  'gül','gün','güneş','güzel','ha','hak','haki','hal','hala','hale','hali','ham','hamal','han','hane','hangi',
  'hani','har','hasar','hasta','hat','hata','hatır','hava','hayal','hayat','hayır','haz','hazır','hedef','hem',
  'hep','her','herkes','hesap','hız','hiç','his','hoş','hukuk','ırk','ısı','ışık','ıslak','ıssız','iç','içeri',
  'iki','il','ila','ilaç','ile','ileri','ilgi','ilk','ilke','ilim','imza','in','ince','insan','irade','is',
  'isim','iş','işçi','işte','iyi','iz','jel','jest','jeton','kaba','kadar','kadın','kafa','kağıt','kahve','kale',
  'kalem','kalp','kan','kanat','kap','kapı','kar','kara','karar','kardeş','kas','kasa','kaş','kat','kaya','kaz',
  'kedi','kel','kelime','kemik','kenar','kent','kere','kes','kış','kız','kızıl','ki','kilo','kim','kimse','kira',
  'kişi','kitap','koca','kol','koku','kolay','konu','kor','koyun','köprü','kötü','köy','kulak','kum','kurt',
  'kuş','kutu','kültür','küçük','laf','lale','lamba','lastik','lazım','leke','lider','lira','liste','lise',
  'lokanta','madde','mal','masa','masal','mavi','mektup','meslek','meyve','mide','mimar','mira','mola','mor',
  'mutfak','mutlu','müzik','nasıl','ne','neden','nefes','nehir','nerede','nesil','net','neşe','nokta','not',
  'numara','o','oda','odun','okul','okyanus','olay','oldu','olsa','on','ona','onu','orada','orman','orta','ot',
  'otel','oyun','oyuncak','ödev','ödül','ölçü','ön','önce','önem','öykü','öyle','öz','özel','özgür','pahalı',
  'para','parça','park','pas','pasta','pazar','pek','pencere','pil','pis','plan','portakal','pul','radyo',
  'rahat','ray','renk','resim','rol','roman','ruh','rüya','rüzgar','saat','sabah','sabır','sade','sağ','sağlık',
  'sahil','sahip','saka','sakal','sakin','sal','salı','sanat','sandalye','sarı','sayı','sayfa','saz','sebep',
  'sefer','sekiz','sel','selam','sen','sene','seni','senin','ses','sessiz','sevgi','sevinç','sıcak','sıfır',
  'sınıf','sıra','sis','siz','size','sizi','sofra','soğuk','son','sonra','sor','soru','söz','spor','su','sulu',
  'sürü','süt','şaka','şal','şans','şarkı','şart','şehir','şeker','şey','şiir','şimdi','şişe','şu','şurada',
  'tabak','tabii','tahta','takım','tam','tane','tarih','tarla','tas','taş','tat','tatil','tavuk','taze','tek',
  'tel','telefon','temiz','tepe','tuz','tür','türkü','ucuz','uç','uçak','ulus','umut','un','unut','us','uyku',
  'uzak','uzun','üç','ülke','ümit','ün','üst','ütü','üzüm','vakit','var','varlık','vatan','ve','veda','vergi',
  'veri','ya','yağ','yağmur','yakın','yal','yalan','yalnız','yaprak','yardım','yarın','yaş','yaşam','yat',
  'yatak','yavaş','yaz','yazı','yel','yemek','yeni','yer','yeşil','yıl','yıldız','yine','yok','yol','yurt','yük',
  'yüksek','yüz','zaman','zar','zarf','zayıf','zeki','zil','zor','ağaçlar','adamlar','aileler','akıllı',
  'alanlar','anlat','anladı','anlatı','aradı','aramak','aslında','ayrıca','bakar','bakalım','baktı','başarı',
  'başladı','bekledi','belli','bilgisayar','biliyor','bitti','buldu','bulmak','çalıştı','çıktı','çıkmak','dedi',
  'dinledi','doğdu','duydu','durdu','düşündü','etti','gelecek','geldi','gitti','gördü','görmek','güldü',
  'hazırla','istedi','kaldı','kalk','kaldır','konuştu','koştu','okudu','oturdu','saldı','sevdi','söyledi',
  'tuttu','uyudu','verdi','yaptı','yazdı','yürüdü','askı','adalar','adaşı','dağlar','dallar','dilekler','diller',
  'dişi','gaga','gala','galiba','hadi','hafif','hafıza','haklı','halka','hasıl','haşhaş','kalas','kalkış',
  'kalkan','kıl','kışla','lafla','sağla','sakla','şakak','şalgam','dışa','kaşık','kısa','kısık','şakacı',
  'dilsiz','ağlak','sıkıl','sıkı','aslı','ağlıyor','kasık','kaşla','dalış','daldı','dalak','kıskaç','sadakat',
  'şahıs','şahsi','hassas','haşlak','halis','ilah','lakap','flaş','filiz','fil','işsiz','şişkin','dikiş','kilit',
  'silik','iğde','kaleler','kalemler','kelek','kese','kesik','kesil','kesin','kesme','keski','lekeler','sek',
  'sele','seki','eksi','deliler','dilekçe','eğe','ekle','ekler','elek','hela','helal','hele','heves','sahi',
  'deden','dedik','sadece','dikkat','şekil','şekilde','iddia','adli','adalet','asilik'
]) with ordinality as t(word, n)
where not exists (select 1 from public.words where lang = 'tr');


notify pgrst, 'reload schema';
