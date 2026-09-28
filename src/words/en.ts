// Common English words. Short words are kept plentiful because early lessons use few letters.
const raw = `
a ad add ads all as ash ask sad sass lad lads fad fads dad dads gal gals glad flag flags flask hall halls has had hash half lash gash jag jags salsa alfalfa shall dash flash slash salad ska
as fall falls glass lass dal
the of and to in is it you that he was for on are with as his they be at one have this from or had by hot word but what some we can out other were all there when up use your how said an each she which do their time if will way about many then them write would like so these her long make thing see him two has look more day could go come did number sound no most people my over know water than call first who may down side been now find
any new work part take get place made live where after back little only round man year came show every good me give our under name very through just form sentence great think say help low line differ turn cause much mean before move right boy old too same tell does set three want air well also play small end put home read hand port large spell add even land here must big high such follow act why ask men change went light kind off need house picture try us again animal point mother world near build self earth father head stand own page should country found answer school grow study still learn plant cover food sun four between state keep eye never last let thought city tree cross farm hard start might story saw far sea draw left late run while press close night real life few north open seem together next white children begin got walk example ease paper group always music those both mark often letter until mile river car feet care second book carry took science eat room friend began idea fish mountain stop once base hear horse cut sure watch color face wood main enough plain girl usual young ready above ever red list though feel talk bird soon body dog family direct pose leave song measure door product black short numeral class wind question happen complete ship area half rock order fire south problem piece told knew pass since top whole king space heard best hour better true during hundred five remember step early hold west ground interest reach fast verb sing listen six table travel less morning ten simple several vowel toward war lay against pattern slow center love person money serve appear road map rain rule govern pull cold notice voice unit power town fine certain fly fall lead cry dark machine note wait plan figure star box noun field rest correct able pound done beauty drive stood contain front teach week final gave green oh quick develop ocean warm free minute strong special mind behind clear tail produce fact street inch multiply nothing course stay wheel full force blue object decide surface deep moon island foot system busy test record boat common gold possible plane stead dry wonder laugh thousand ago ran check game shape equate miss brought heat snow tire bring yes distant fill east paint language among
desk jade kale lake leak lease sake safe seal shake shade shed sheds slide ideal field jail kid kids skill still fill hill ill dill lid lids sid said aid aids hid his is if fig gig
keyboard finger practice typing lesson speed accuracy rhythm focus quiet steady calm habit
`;

export const EN_WORDS: string[] = Array.from(
  new Set(
    raw
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0 && /^[a-z]+$/.test(w)),
  ),
);

export const EN_SENTENCES: string[] = [
  "The quick brown fox jumps over the lazy dog.",
  "Practice makes progress, not perfection.",
  "Keep your eyes on the screen, not on your hands.",
  "Accuracy first; speed will follow.",
  "A journey of a thousand miles begins with a single step.",
  "Small daily improvements lead to stunning results.",
  "Return your fingers to the home row after every key.",
  "Pack my box with five dozen liquor jugs.",
  "How vexingly quick daft zebras jump!",
  "Sphinx of black quartz, judge my vow.",
  "The early bird catches the worm.",
  "Actions speak louder than words.",
  "Where there is a will, there is a way.",
  "Knowledge is power, and practice is the key.",
  "Every expert was once a beginner.",
  "Slow and steady wins the race.",
  "Do not count the days; make the days count.",
  "Reading a good book is like talking to a wise friend.",
  "The sun rose over the quiet hills at dawn.",
  "She sells sea shells by the sea shore.",
  "Rain or shine, we walk to the park each morning.",
  "Music can change the mood of a whole room.",
  "Learning to type well saves hours every week.",
  "Good habits are hard to form but easy to live with.",
  "Great things never come from comfort zones.",
  "An idea is only as good as the work behind it.",
  "It always seems impossible until it is done.",
  "Curiosity is the engine of all learning.",
  "The best time to plant a tree was twenty years ago.",
  "Well begun is half done.",
];
