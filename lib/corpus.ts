import type { Lang } from "./detect";

/**
 * Launch-category seed corpus (plan §2.5: government schemes, forms, official
 * process — highest value, verifiable, lowest harm). Answers carry official
 * domains as *plain text*, never hyperlinks: the §6.5 URL allowlist governs
 * what may become a link on a public page.
 *
 * In demo mode this corpus is also the retrieval set. In production (Week 1+)
 * it is replaced by a live provider; the shape of an answer does not change.
 */

export type CorpusEntry = {
  id: string;
  questions: Record<Lang, string>;
  answers: Record<Lang, string>;
};

export const CORPUS: CorpusEntry[] = [
  {
    id: "cibil",
    questions: {
      hi: "क्रेडिट स्कोर कैसे बढ़ाएं?",
      "hi-Latn": "Credit score kaise badhaye?",
      en: "How do I improve my credit score?",
    },
    answers: {
      hi:
        "क्रेडिट स्कोर तीन कामों से बढ़ता है, और तीनों में धैर्य लगता है।\n\n1. हर EMI और कार्ड बिल की तारीख़ पक्की रखें। एक भी लेट भुगतान स्कोर को महीनों पीछे कर देता है।\n2. कार्ड की कुल सीमा का 30% से कम इस्तेमाल करें। सीमा ₹50,000 है तो हर महीने ₹15,000 से कम।\n3. पुराना कार्ड बंद न करें। इतिहास जितना लंबा, स्कोर उतना मज़बूत।\n\nसाथ में साल में एक बार अपनी रिपोर्ट मुफ़्त में देखें — चारों बड़े ब्यूरो (CIBIL, Equifax, Experian, CRIF) की वेबसाइट पर यह सुविधा है। गलती दिखे तो उसी पेज से विवाद (dispute) दर्ज करें। सुधार में आम तौर पर 30–90 दिन लगते हैं, इससे तेज़ का वादा करने वाला कोई भी एजेंट ठगी है।",
      "hi-Latn":
        "Credit score teen kaamon se badhta hai, aur teeno mein patience lagta hai.\n\n1. Har EMI aur card bill ki date pakki rakhein. Ek bhi late payment score ko mahino peeche kar deti hai.\n2. Card ki total limit ka 30% se kam istemaal karein. Limit ₹50,000 hai to har mahine ₹15,000 se kam.\n3. Purana card band na karein. History jitni lambi, score utna mazboot.\n\nSaath mein saal mein ek baar apni report free mein dekhein — chaaron bureaus (CIBIL, Equifax, Experian, CRIF) ki website par ye suvidha hai. Galti dikhe to usi page se dispute darj karein. Sudhar mein 30–90 din lagte hain; isse tez ka waada karne wala koi bhi agent thagi hai.",
      en:
        "A credit score improves through three habits, all of which take patience.\n\n1. Keep every EMI and card bill date exact — one late payment sets the score back by months.\n2. Use under 30% of your card limit: on a ₹50,000 limit, spend under ₹15,000 a month.\n3. Do not close old cards; a longer history strengthens the score.\n\nCheck your report free once a year on any of the four bureaus (CIBIL, Equifax, Experian, CRIF) and file a dispute from the same page if you see an error. Improvement usually takes 30–90 days; anyone promising faster is a scam.",
    },
  },
  {
    id: "pmkisan",
    questions: {
      hi: "किसान सम्मान निधि की किस्त नहीं आई, क्या करूं?",
      "hi-Latn": "Kisan Samman Nidhi ki kist nahi aayi, kya karun?",
      en: "My PM-KISAN instalment has not arrived. What should I do?",
    },
    answers: {
      hi:
        "घबराइए मत — ज़्यादातर रुकी किस्तें दो कारणों से रुकती हैं, और दोनों घर बैठे ठीक होते हैं।\n\n1. पहले स्थिति देखें: pmkisan.gov.in पर “Beneficiary Status” में आधार या मोबाइल नंबर डालें। वहाँ लिखा होगा कि किस्त किस वजह से अटकी है।\n2. सबसे आम वजह: किसान क्रेडिट कार्ड (KCC) की e-KYC बाकी है, या आधार में नाम/पता खेत के कागज़ से मेल नहीं खाता। पोर्टल पर ही e-KYC पूरी करें — OTP से, मुफ़्त।\n3. दूसरी वजह: भूमि अभिलेख (land record) का मिलान बाकी। इसके लिए अपने ज़िले के कृषि/लेखपाल कार्यालय में भूमि अभिलेख की कॉपी जमा करें।\n\nस्थिति ठीक होते ही अटकी किस्त अगली सूची में जुड़ जाती है। हेल्पलाइन: 155261 या 011-24300606। किसी भी “एजेंट” को किस्त छुड़वाने के पैसे न दें — यह काम हमेशा मुफ़्त है।",
      "hi-Latn":
        "Ghabraiye mat — zyadatar ruki kistein do karnon se rukti hain, aur dono ghar baithe theek ho jaate hain.\n\n1. Pehle status dekhein: pmkisan.gov.in par “Beneficiary Status” mein Aadhaar ya mobile number daalein. Wahan likha hoga ki kist kis wajah se atki hai.\n2. Sabse aam wajah: e-KYC baaki hai, ya Aadhaar mein naam/pata khet ke kagaz se mel nahi khata. Portal par hi e-KYC poori karein — OTP se, free.\n3. Doosri wajah: land record ka milan baaki. Iske liye apne zile ke krishi/lekhpal karyalay mein bhoomi abhilekh ki copy jama karein.\n\nStatus theek hote hi atki kist agli suchi mein jud jaati hai. Helpline: 155261 ya 011-24300606. Kisi “agent” ko kist chhudwane ke paise na dein — ye kaam hamesha free hai.",
      en:
        "Most stalled PM-KISAN instalments stop for two reasons, and both can be fixed from home.\n\n1. Check status first: on pmkisan.gov.in open “Beneficiary Status” and enter your Aadhaar or mobile number; it states why the instalment is held.\n2. The commonest reason is pending e-KYC, or a name/address mismatch between Aadhaar and land papers. Complete e-KYC on the same portal via OTP, free of charge.\n3. The second is pending land-record verification; submit a copy of your land record at the district agriculture office.\n\nOnce the status clears, the held instalment joins the next list. Helpline: 155261 or 011-24300606. Never pay an “agent” to release it — the process is always free.",
    },
  },
  {
    id: "gst-notice",
    questions: {
      hi: "GST नोटिस आया है, क्या करूं?",
      "hi-Latn": "GST notice aaya hai, kya karun?",
      en: "I received a GST notice. What should I do?",
    },
    answers: {
      hi:
        "नोटिस का मतलब जुर्माना नहीं, जवाब माँगना है — और जवाब की घड़ी तुरंत शुरू हो जाती है।\n\n1. नोटिस पर धारा और जवाब की अंतिम तारीख़ देखें (अक्सर DRC-01/01A पर 30 दिन)। तारीख़ डायरी में लिख लें; देर ही सबसे महँगी गलती है।\n2. gst.gov.in पर अपने खाते में “View Notices” से पूरा नोटिस डाउनलोड करें और उसी पोर्टल पर लिखित जवाब दाखिल करें — डाक से नहीं।\n3. माँगी गई अवधि के बिल, लेजर और रिटर्न की मिलान-सूची बनाकर साथ लगाएँ। अंतर दिखे तो उसे स्वीकार करके चालान (DRC-03) से जमा करना अक्सर सबसे सस्ता रास्ता है।\n\nजवाब की भाषा सरल रखें: तथ्य, आँकड़े, संलग्नक। यदि माँगी गई राशि ₹5 लाख से ऊपर है या बात Show Cause तक पहुँची है, तो उसी हफ़ते किसी GST प्रैक्टिशनर से मिलें — पहली सुनवाई में दी गई सफ़ाई ही सबसे मज़बूत होती है।",
      "hi-Latn":
        "Notice ka matlab jurmana nahi, jawab maangna hai — aur jawab ki ghadi turant shuru ho jaati hai.\n\n1. Notice par dhara aur jawab ki antim tarikh dekhein (aksar DRC-01/01A par 30 din). Tarikh diary mein likh lein; der hi sabse mehngi galti hai.\n2. gst.gov.in par apne khaate mein “View Notices” se poora notice download karein aur usi portal par likhit jawab dakhil karein — daak se nahi.\n3. Maangi gayi avadhi ke bill, ledger aur return ki milan-suchi bana kar saath lagayein. Antar dikhe to use sveekaar karke challan (DRC-03) se jama karna aksar sabse sasta rasta hai.\n\nJawab ki bhasha saral rakhein: tathya, aankde, sanlagnak. Agar maangi gayi rashi ₹5 lakh se oopar hai ya baat Show Cause tak pahunchi hai, to usi hafte kisi GST practitioner se milein — pehli sunwai mein di gayi safai hi sabse mazboot hoti hai.",
      en:
        "A notice is a demand for a reply, not a penalty — and the clock starts at once.\n\n1. Note the section and the reply deadline on the notice (often 30 days on a DRC-01/01A). Write the date down; delay is the costliest error.\n2. On gst.gov.in open “View Notices”, download the full notice, and file your written reply on the same portal — not by post.\n3. Attach a reconciliation of invoices, ledgers and returns for the period asked. Where a gap is real, accepting it and paying via DRC-03 is usually the cheapest path.\n\nKeep the reply plain: facts, figures, attachments. If the demand exceeds ₹5 lakh or has reached Show Cause stage, see a GST practitioner that same week — the explanation given at the first hearing is the strongest one.",
    },
  },
  {
    id: "aadhaar-pan",
    questions: {
      hi: "आधार और PAN लिंक कैसे करें?",
      "hi-Latn": "Aadhaar aur PAN link kaise karein?",
      en: "How do I link my Aadhaar with my PAN?",
    },
    answers: {
      hi:
        "यह काम पाँच मिनट का है और घर बैठे हो जाता है।\n\n1. incometax.gov.in पर जाएँ और “Link Aadhaar with PAN” चुनें — लॉगिन ज़रूरी नहीं।\n2. PAN, आधार नंबर और नाम बिल्कुल वैसे भरें जैसे आधार पर छपा है। नाम में अंतर हो तो पहले आधार में सुधार करवाएँ, वरना लिंकिंग असफल होगी।\n3. यदि लिंक विलंब शुल्क (₹1,000) देय दिखे तो ई-पे से भुगतान करके दोबारा प्रयास करें; भुगतान के बिना अनुरोध आगे नहीं बढ़ता।\n4. अंत में OTP दर्ज करें। स्थिति उसी पेज पर “Link Aadhaar Status” से देखी जा सकती है।\n\nध्यान रहे: लिंक न होने पर रिटर्न दाखिल नहीं हो पाता और TDS ऊँची दर पर कटता है। किसी तीसरे पक्ष की वेबसाइट से यह काम न करें — केवल आयकर विभाग के आधिकारिक पोर्टल से।",
      "hi-Latn":
        "Ye kaam paanch minute ka hai aur ghar baithe ho jaata hai.\n\n1. incometax.gov.in par jayein aur “Link Aadhaar with PAN” chunein — login zaroori nahi.\n2. PAN, Aadhaar number aur naam bilkul waise bharein jaise Aadhaar par chhapa hai. Naam mein antar ho to pehle Aadhaar mein sudhaar karwayein, varna linking asafal hogi.\n3. Agar link vilamb shulk (₹1,000) dey dikhe to e-pay se bhugtaan karke dobara prayas karein; bhugtaan ke bina anurodh aage nahi badhta.\n4. Ant mein OTP darj karein. Status usi page par “Link Aadhaar Status” se dekhi ja sakti hai.\n\nDhyaan rahe: link na hone par return dakhil nahi hota aur TDS oonchi dar par katta hai. Kisi teesre paksh ki website se ye kaam na karein — keval aaykar vibhag ke adhikarik portal se.",
      en:
        "This takes five minutes and needs no visit anywhere.\n\n1. Go to incometax.gov.in and choose “Link Aadhaar with PAN” — no login required.\n2. Enter PAN, Aadhaar number and your name exactly as printed on Aadhaar; a name mismatch must be corrected on Aadhaar first or linking will fail.\n3. If a late fee (₹1,000) shows as payable, pay it through e-pay and retry; the request does not proceed without payment.\n4. Enter the OTP. Check progress any time via “Link Aadhaar Status” on the same page.\n\nRemember: without linking, returns cannot be filed and TDS is deducted at a higher rate. Do this only on the Income Tax Department's own portal, never a third-party site.",
    },
  },
  {
    id: "cyber-fraud",
    questions: {
      hi: "साइबर ठगी हो गई, पैसा वापस कैसे मिलेगा?",
      "hi-Latn": "Cyber thagi ho gayi, paisa wapas kaise milega?",
      en: "I have been defrauded online. How can I get my money back?",
    },
    answers: {
      hi:
        "पहले घंटे सबसे क़ीमती हैं — इसीलिए यह जवाब क्रम से पढ़ें।\n\n1. तुरंत 1930 पर कॉल करें (राष्ट्रीय साइबर हेल्पलाइन)। यह एकमात्र नंबर है जो बैंक को राशि रोकने (freeze) का संकेत भेजता है।\n2. कॉल के बाद cybercrime.gov.in पर शिकायत दर्ज करें और जो शिकायत नंबर मिले उसे बैंक को लिखित रूप में दें।\n3. अपने बैंक की शाखा में जाकर “unauthorised transaction” लिखित दावा दें; स्क्रीनशॉट, UPI रेफ़रेंस और SMS संलग्न करें। RBI के नियम से रिपोर्ट में देरी नहीं होनी चाहिए।\n4. UPI से भेजी राशि पर ऐप में “Report fraud” भी दबाएँ — इससे प्राप्तकर्ता का खाता चिह्नित होता है।\n\nपुलिस स्टेशन जाने की भी आज़ादी है; साइबर शिकायत FIR का विकल्प है, बाधा नहीं। और हाँ — “रिकवरी एजेंट” या हैकर के दावे पर कभी भुगतान न करें; वह दूसरी ठगी है।",
      "hi-Latn":
        "Pehle ghante sabse keemti hain — isliye ye jawab kram se padhein.\n\n1. Turant 1930 par call karein (rashtriya cyber helpline). Ye akela number hai jo bank ko rashi rokne (freeze) ka sanket bhejta hai.\n2. Call ke baad cybercrime.gov.in par shikayat darj karein aur jo shikayat number mile use bank ko likhit roop mein dein.\n3. Apne bank ki shakha mein jakar “unauthorised transaction” likhit dawa dein; screenshot, UPI reference aur SMS sanlagn karein.\n4. UPI se bheji rashi par app mein “Report fraud” bhi dabayein — isse praptkarta ka khaata chihnit hota hai.\n\nPolice station jaane ki bhi aazadi hai; cyber shikayat FIR ka vikalp hai, badha nahi. Aur haan — “recovery agent” ya hacker ke dawe par kabhi bhugtaan na karein; wo doosri thagi hai.",
      en:
        "The first hour is the most valuable, so read this in order.\n\n1. Call 1930 (the national cyber helpline) immediately; it is the only number that signals banks to freeze the amount.\n2. Then file a complaint on cybercrime.gov.in and give the complaint number to your bank in writing.\n3. Submit a written “unauthorised transaction” claim at your branch with screenshots, the UPI reference and SMS; RBI rules require prompt reporting.\n4. In your UPI app tap “Report fraud” on the transfer, which flags the recipient account.\n\nYou may also go to a police station; the cyber complaint is an alternative to an FIR, not a barrier. Never pay a “recovery agent” or self-styled hacker — that is the second fraud.",
    },
  },
  {
    id: "pmay",
    questions: {
      hi: "पीएम आवास योजना के लिए पात्रता क्या है?",
      "hi-Latn": "PM Awas Yojana ke liye patrata kya hai?",
      en: "What is the eligibility for PM Awas Yojana?",
    },
    answers: {
      hi:
        "पात्रता की पहली और सबसे सख़्त शर्त: परिवार के नाम पर शहरी भारत में पक्का मकान नहीं होना चाहिए।\n\n1. आय सीमा: EWS (₹3 लाख तक) और LIG (₹6 लाख तक) वर्ग प्राथमिकता में हैं; कई राज्यों में MIG तक छूट है — अपनी राज्य सूची देखें।\n2. आवेदन pmay-urban.gov.in (शहरी) या pmayg.gov.in (ग्रामीण) पर; ग्रामीण सूची में नाम समाजिक-आर्थिक जातीय जनगणना (SECC) से आता है, इसलिए पहले ग्राम पंचायत में अपनी प्रविष्टि देखें।\n3. ज़रूरी कागज़: आधार, आय प्रमाण, बैंक खाता और भूमि/अभिलेख विवरण। महिला के नाम या संयुक्त स्वामित्व को प्राथमिकता मिलती है।\n4. स्थिति उसी पोर्टल पर “Assessment Status” से देखें।\n\nनियम वर्ष अनुसार बदलते हैं; अंतिम शब्द आधिकारिक पोर्टल का ही है। किसी बिचौलिए को “सूची में नाम डालने” का शुल्क न दें — नाम डालना हमेशा मुफ़्त है।",
      "hi-Latn":
        "Patrata ki pehli aur sabse sakht shart: parivar ke naam par shehri Bharat mein pakka makaan nahi hona chahiye.\n\n1. Aay seema: EWS (₹3 lakh tak) aur LIG (₹6 lakh tak) varg prathmikta mein hain; kai rajyon mein MIG tak chhoot hai — apni rajya suchi dekhein.\n2. Aavedan pmay-urban.gov.in (shehri) ya pmayg.gov.in (gramin) par; gramin suchi mein naam SECC se aata hai, isliye pehle gram panchayat mein apni pravisti dekhein.\n3. Zaroori kagaz: Aadhaar, aay pramaan, bank khaata aur bhoomi/abhilekh vivaran. Mahila ke naam ya sanyukt swamitv ko prathmikta milti hai.\n4. Status usi portal par “Assessment Status” se dekhein.\n\nNiyam varsh anusaar badalte hain; antim shabd adhikarik portal ka hi hai. Kisi bichauliye ko “suchi mein naam daalne” ka shulk na dein — naam daalna hamesha free hai.",
      en:
        "The first and strictest condition: the family must not own a pucca house in urban India.\n\n1. Income bands: EWS (up to ₹3 lakh) and LIG (up to ₹6 lakh) are prioritised; several states extend relief to MIG — check your state list.\n2. Apply on pmay-urban.gov.in (urban) or pmayg.gov.in (rural); rural lists derive from the SECC census, so verify your entry at the gram panchayat first.\n3. Documents: Aadhaar, income proof, bank account and land records. Ownership in a woman's name or jointly is preferred.\n4. Track progress via “Assessment Status” on the same portal.\n\nRules change year to year and the official portal governs. Never pay a middleman to “put your name on the list” — enrolment is always free.",
    },
  },
];

/** Demo-mode explanation when nothing matches, per language. */
export const FALLBACK: Record<Lang, string> = {
  hi:
    "यह डेमो इंजन है — असली मॉडल अभी नहीं जुड़ा (वह माप-सप्ताह के बाद आएगा)। इसलिए मैं अभी उन सवालों के पक्के जवाब दे सकता हूँ जो मेरे पास दर्ज हैं, जैसे:\n\n• क्रेडिट स्कोर कैसे बढ़ाएं?\n• किसान सम्मान निधि की किस्त नहीं आई, क्या करूं?\n• GST नोटिस आया है, क्या करूं?\n• आधार और PAN लिंक कैसे करें?\n• साइबर ठगी हो गई, पैसा वापस कैसे मिलेगा?\n• पीएम आवास योजना के लिए पात्रता क्या है?\n\nइनमें से कोई भी पूछकर देखें — जवाब पूरा, क्रम से और आधिकारिक स्रोत के साथ मिलेगा। असली इंजन जुड़ने के बाद यह वही सवाल किसी भी विषय पर उत्तर देगा।",
  "hi-Latn":
    "Ye demo engine hai — asli model abhi nahi juda (wo map-saptah ke baad aayega). Isliye main abhi un sawaalon ke pakke jawab de sakta hoon jo mere paas darj hain, jaise:\n\n• Credit score kaise badhaye?\n• Kisan Samman Nidhi ki kist nahi aayi, kya karun?\n• GST notice aaya hai, kya karun?\n• Aadhaar aur PAN link kaise karein?\n• Cyber thagi ho gayi, paisa wapas kaise milega?\n• PM Awas Yojana ke liye patrata kya hai?\n\nInmein se koi bhi poochh kar dekhein — jawab poora, kram se aur adhikarik srot ke saath milega. Asli engine judne ke baad ye wahi sawaal kisi bhi vishay par uttar dega.",
  en:
    "This is the demo engine — the live model is not connected yet (it arrives after the measurement week). For now I can answer the questions on file, for example:\n\n• How do I improve my credit score?\n• My PM-KISAN instalment has not arrived. What should I do?\n• I received a GST notice. What should I do?\n• How do I link my Aadhaar with my PAN?\n• I have been defrauded online. How can I get my money back?\n• What is the eligibility for PM Awas Yojana?\n\nAsk any of these and you will get the full, ordered answer with official sources. Once the live engine is connected, the same field answers any subject.",
};

/** Prompt-injection / jailbreak patterns (§6.5 hard refusals). */
export const JAILBREAK_RE =
  /(ignore (all |the )?(previous|above|prior) (instructions|rules|prompt))|(you are now (dan|jailbroken|unrestricted))|(developer mode)|(system prompt ko (print|show|batao))|(act as (an? )?(unrestricted|jailbroken))/i;

/** Self-harm routing (§6.5): these get helplines before anything else. */
export const SELFHARM_RE =
  /(खुदकुशी|आत्महत्या|मरना चाहता|मरनी चाहती|जान दे दूं|suicide|kill myself|end my life|self ?harm)/i;

export const SELFHARM_RESPONSE: Record<Lang, string> = {
  hi:
    "रुकिए। आपकी बात मेरे लिए सबसे ज़रूरी है, और यह कोई सवाल नहीं जिसका जवाब मैं अकेले दूं।\n\nअभी, इसी वक़्त, इनमें से किसी एक पर बात कीजिए — मुफ़्त, गोपनीय, हिंदी में:\n• टेली-मानस: 14416\n• आईकॉल: 9152987821\n• आपातकाल: 108\n\nआप अकेले नहीं हैं। जो भार आप उठा रहे हैं वह बाँटा जा सकता है — कृपया आज एक कॉल कीजिए।",
  "hi-Latn":
    "Rukiye. Aapki baat mere liye sabse zaroori hai, aur ye koi sawaal nahi jiska jawab main akele doon.\n\nAbhi, isi waqt, inmein se kisi ek par baat kijiye — free, gopaniya, Hindi mein:\n• Tele-MANAS: 14416\n• iCall: 9152987821\n• Aapatkal: 108\n\nAap akele nahi hain. Jo bhaar aap utha rahe hain wo baanta ja sakta hai — kripya aaj ek call kijiye.",
  en:
    "Please stop a moment. What you are carrying matters more than any question, and it is not one I should answer alone.\n\nRight now, please talk to someone — free, confidential:\n• Tele-MANAS: 14416\n• iCall: 9152987821\n• Emergency: 108\n\nYou are not alone, and this weight can be shared. Please make one call today.",
};
