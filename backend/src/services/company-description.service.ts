/**
 * Company Description Generator
 *
 * Generates unique, SEO-friendly descriptions in Serbian for each company
 * based on available data (name, activity, location, financials, etc.).
 *
 * Each description is unique because:
 * 1. Template variations are selected based on company data hash
 * 2. All available data points are woven into the text
 * 3. Different sentence structures for different data combinations
 */

// Activity code to Serbian name mapping (top ~200 codes covering 90%+ of companies)
const DELATNOSTI: Record<string, string> = {
  // Agriculture
  '0111': 'gajenje žitarica i mahunarki',
  '0112': 'gajenje pirinča',
  '0113': 'gajenje povrća, bostana, korena i krtola',
  '0119': 'gajenje ostalih jednogodišnjih useva',
  '0121': 'gajenje grožđa',
  '0124': 'gajenje jabučastog i koštičavog voća',
  '0125': 'gajenje bobičastog, jezgrastog i ostalog voća',
  '0141': 'uzgoj muznih krava',
  '0150': 'mešovita poljoprivredna proizvodnja',
  '0161': 'pomoćne delatnosti u proizvodnji useva',
  '0162': 'pomoćne delatnosti u uzgoju životinja',
  // Food
  '1011': 'prerada i konzervisanje mesa',
  '1013': 'proizvodnja mesnih prerađevina',
  '1039': 'ostala prerada i konzervisanje voća i povrća',
  '1041': 'proizvodnja ulja i masti',
  '1051': 'prerada mleka i proizvodnja sireva',
  '1061': 'proizvodnja mlinskih proizvoda',
  '1071': 'proizvodnja hleba, svežeg peciva i kolača',
  '1072': 'proizvodnja dvopeka, biskvita i srodnih proizvoda',
  '1082': 'proizvodnja kakao proizvoda, čokolade i konditorskih proizvoda',
  '1089': 'proizvodnja ostalih prehrambenih proizvoda',
  '1107': 'proizvodnja bezalkoholnih pića',
  // Textiles & Clothing
  '1412': 'proizvodnja radne odeće',
  '1413': 'proizvodnja ostale gornje odeće',
  '1419': 'proizvodnja ostale odeće i pribora za odeću',
  '1512': 'proizvodnja putnih i ručnih torbi i sličnih proizvoda',
  '1520': 'proizvodnja obuće',
  // Wood & Paper
  '1610': 'rezanje i obrada drveta',
  '1621': 'proizvodnja furnira i ploča od drveta',
  '1623': 'proizvodnja ostale građevinske stolarije',
  '1629': 'proizvodnja ostalih proizvoda od drveta',
  '1712': 'proizvodnja papira i kartona',
  '1721': 'proizvodnja talasastog papira i kartona i ambalaže',
  '1812': 'ostalo štampanje',
  // Chemicals & Pharma
  '2014': 'proizvodnja ostalih osnovnih organskih hemikalija',
  '2041': 'proizvodnja sapuna, deterdženata i sredstava za čišćenje',
  '2042': 'proizvodnja parfema i toaletnih preparata',
  '2110': 'proizvodnja osnovnih farmaceutskih proizvoda',
  '2120': 'proizvodnja farmaceutskih preparata',
  '2211': 'proizvodnja gumenih spoljnih i unutrašnjih pneumatika',
  '2219': 'proizvodnja ostalih proizvoda od gume',
  '2221': 'proizvodnja ploča, listova, cevi i profila od plastike',
  '2222': 'proizvodnja ambalaže od plastike',
  '2229': 'proizvodnja ostalih proizvoda od plastike',
  // Metals & Manufacturing
  '2410': 'proizvodnja sirovog gvožđa, čelika i ferolegura',
  '2511': 'proizvodnja metalnih konstrukcija i njihovih delova',
  '2529': 'proizvodnja ostalih metalnih cisterni, rezervoara i kontejnera',
  '2561': 'obrada i prevlačenje metala',
  '2562': 'mašinska obrada metala',
  '2572': 'proizvodnja brava i okova',
  '2593': 'proizvodnja proizvoda od žice, lanaca i opruga',
  '2599': 'proizvodnja ostalih metalnih proizvoda',
  '2611': 'proizvodnja elektronskih komponenata',
  '2620': 'proizvodnja računara i periferne opreme',
  '2630': 'proizvodnja komunikacione opreme',
  '2651': 'proizvodnja instrumenata za merenje, ispitivanje i navigaciju',
  '2711': 'proizvodnja elektromotora, generatora i transformatora',
  '2712': 'proizvodnja aparata za distribuciju i kontrolu električne energije',
  '2733': 'proizvodnja instalacionog materijala',
  '2751': 'proizvodnja električnih aparata za domaćinstvo',
  '2811': 'proizvodnja motora i turbina',
  '2825': 'proizvodnja rashladne i ventilacione opreme',
  '2892': 'proizvodnja mašina za metalurgiju',
  '2899': 'proizvodnja ostalih mašina za specijalnu namenu',
  '2910': 'proizvodnja motornih vozila',
  '2932': 'proizvodnja ostalih delova i dodatne opreme za motorna vozila',
  '3011': 'izgradnja brodova i plutajućih objekata',
  '3101': 'proizvodnja nameštaja za poslovne i prodajne prostore',
  '3102': 'proizvodnja kuhinjskog nameštaja',
  '3109': 'proizvodnja ostalog nameštaja',
  // Utilities
  '3511': 'proizvodnja električne energije',
  '3513': 'distribucija električne energije',
  '3521': 'proizvodnja gasa',
  '3530': 'snabdevanje parom i klimatizacija',
  '3600': 'sakupljanje, prečišćavanje i distribucija vode',
  '3811': 'sakupljanje neopasnog otpada',
  '3821': 'tretman i odlaganje neopasnog otpada',
  '3832': 'ponovna upotreba razvrstanih materijala',
  // Construction
  '4110': 'razrada građevinskih projekata',
  '4120': 'izgradnja stambenih i nestambenih zgrada',
  '4211': 'izgradnja puteva i autoputeva',
  '4221': 'izgradnja cevovoda',
  '4299': 'izgradnja ostalih objekata niskogradnje',
  '4311': 'rušenje objekata',
  '4312': 'priprema gradilišta',
  '4321': 'postavljanje električnih instalacija',
  '4322': 'postavljanje vodovodnih, kanalizacionih, grejnih i klimatizacionih sistema',
  '4329': 'ostali instalacioni radovi u građevinarstvu',
  '4331': 'malterisanje',
  '4332': 'ugradnja stolarije',
  '4333': 'postavljanje podnih i zidnih obloga',
  '4334': 'bojenje i zastakljivanje',
  '4339': 'ostali završni radovi',
  '4391': 'krovni radovi',
  '4399': 'ostale specijalizovane građevinske delatnosti',
  // Trade
  '4511': 'trgovina automobilima i lakim motornim vozilima',
  '4519': 'trgovina ostalim motornim vozilima',
  '4520': 'održavanje i popravka motornih vozila',
  '4531': 'trgovina na veliko delovima i priborom za motorna vozila',
  '4532': 'trgovina na malo delovima i priborom za motorna vozila',
  '4540': 'trgovina motociklima i njihovim delovima',
  '4611': 'posredovanje u trgovini poljoprivrednim sirovinama',
  '4612': 'posredovanje u trgovini gorivima i rudama',
  '4613': 'posredovanje u trgovini drvetom i građevinskim materijalom',
  '4614': 'posredovanje u trgovini mašinama i industrijskom opremom',
  '4615': 'posredovanje u trgovini nameštajem i predmetima za domaćinstvo',
  '4617': 'posredovanje u trgovini hranom, pićima i duvanom',
  '4618': 'specijalizovano posredovanje u trgovini ostalim proizvodima',
  '4619': 'posredovanje u trgovini raznovrsnim proizvodima',
  '4621': 'trgovina na veliko žitaricama, sirovim duvanom, semenjem i hranom za životinje',
  '4631': 'trgovina na veliko voćem i povrćem',
  '4632': 'trgovina na veliko mesom i mesnim proizvodima',
  '4634': 'trgovina na veliko pićima',
  '4639': 'nespecijalizovana trgovina na veliko hranom, pićima i duvanom',
  '4641': 'trgovina na veliko tekstilom',
  '4643': 'trgovina na veliko električnim aparatima za domaćinstvo',
  '4644': 'trgovina na veliko porcelanom i staklarijom',
  '4645': 'trgovina na veliko parfemima i kozmetikom',
  '4646': 'trgovina na veliko farmaceutskim proizvodima',
  '4647': 'trgovina na veliko nameštajem, tepisima i opremom za osvetljenje',
  '4649': 'trgovina na veliko ostalim proizvodima za domaćinstvo',
  '4651': 'trgovina na veliko računarima i računarskom opremom',
  '4652': 'trgovina na veliko elektronskim i telekomunikacionim delovima',
  '4661': 'trgovina na veliko poljoprivrednim mašinama i priborom',
  '4662': 'trgovina na veliko alatnim mašinama',
  '4663': 'trgovina na veliko mašinama za rudarstvo i građevinarstvo',
  '4669': 'trgovina na veliko ostalim mašinama i opremom',
  '4671': 'trgovina na veliko čvrstim, tečnim i gasovitim gorivima',
  '4672': 'trgovina na veliko metalima i metalnim rudama',
  '4673': 'trgovina na veliko drvetom, građevinskim materijalom i sanitarnom opremom',
  '4674': 'trgovina na veliko metalnom robom, instalacionim materijalom, opremom za grejanje',
  '4675': 'trgovina na veliko hemijskim proizvodima',
  '4676': 'trgovina na veliko ostalim poluproizvodima',
  '4677': 'trgovina na veliko otpacima i ostacima',
  '4690': 'nespecijalizovana trgovina na veliko',
  '4711': 'trgovina na malo u nespecijalizovanim prodavnicama pretežno hranom, pićima i duvanom',
  '4719': 'ostala trgovina na malo u nespecijalizovanim prodavnicama',
  '4721': 'trgovina na malo voćem i povrćem',
  '4722': 'trgovina na malo mesom i mesnim proizvodima',
  '4724': 'trgovina na malo hlebom, pecivom, kolačima i slatkišima',
  '4725': 'trgovina na malo pićima',
  '4726': 'trgovina na malo duvanskim proizvodima',
  '4741': 'trgovina na malo računarima i softverom',
  '4743': 'trgovina na malo audio i video opremom',
  '4751': 'trgovina na malo tekstilom',
  '4752': 'trgovina na malo metalnom robom, bojama i staklom',
  '4753': 'trgovina na malo tepisima, podnim i zidnim oblogama',
  '4754': 'trgovina na malo električnim aparatima za domaćinstvo',
  '4759': 'trgovina na malo nameštajem, opremom za osvetljenje',
  '4761': 'trgovina na malo knjigama',
  '4762': 'trgovina na malo novinama i kancelarijskim materijalom',
  '4764': 'trgovina na malo sportskom opremom',
  '4771': 'trgovina na malo odećom',
  '4772': 'trgovina na malo obućom i predmetima od kože',
  '4773': 'trgovina na malo farmaceutskim proizvodima u apotekama',
  '4774': 'trgovina na malo medicinskim i ortopedskim pomagalima',
  '4775': 'trgovina na malo kozmetičkim i toaletnim preparatima',
  '4776': 'trgovina na malo cvećem, sadnicama, semenjem i đubrivom',
  '4777': 'trgovina na malo satovima i nakitom',
  '4778': 'ostala trgovina na malo novim proizvodima',
  '4781': 'trgovina na malo hranom, pićima i duvanskim proizvodima na tezgama i pijacama',
  '4789': 'trgovina na malo ostalom robom na tezgama i pijacama',
  '4791': 'trgovina na malo posredstvom pošte ili interneta',
  '4799': 'ostala trgovina na malo izvan prodavnica, tezgi i pijaca',
  // Transport
  '4910': 'železnički prevoz putnika',
  '4920': 'železnički prevoz tereta',
  '4931': 'gradski i prigradski kopneni prevoz putnika',
  '4932': 'taksi prevoz',
  '4939': 'ostali kopneni prevoz putnika',
  '4941': 'drumski prevoz tereta',
  '4942': 'usluge preseljenja',
  '5010': 'pomorski i priobalni prevoz putnika',
  '5110': 'vazdušni prevoz putnika',
  '5210': 'skladištenje',
  '5221': 'uslužne delatnosti u kopnenom saobraćaju',
  '5224': 'pretovar tereta',
  '5229': 'ostale prateće delatnosti u saobraćaju',
  '5310': 'poštanske aktivnosti',
  '5320': 'kurirske aktivnosti',
  // Accommodation & Food
  '5510': 'hoteli i sličan smeštaj',
  '5520': 'odmarališta i slični objekti za kraći boravak',
  '5530': 'kampovi i prostori za kampovanje',
  '5590': 'ostali smeštaj',
  '5610': 'delatnost restorana i pokretnih ugostiteljskih objekata',
  '5621': 'ketering',
  '5629': 'ostale usluge pripremanja i posluživanja hrane',
  '5630': 'usluge pripremanja i posluživanja pića',
  // IT & Communications
  '5811': 'izdavanje knjiga',
  '5819': 'ostale izdavačke delatnosti',
  '5821': 'izdavanje računarskih igara',
  '5829': 'izdavanje ostalih softverskih paketa',
  '5911': 'proizvodnja filmova, video-zapisa i televizijskog programa',
  '5912': 'postprodukcija filmova, video-zapisa i televizijskog programa',
  '5913': 'distribucija filmova, video-zapisa i televizijskog programa',
  '5920': 'snimanje i izdavanje zvučnih zapisa i muzike',
  '6010': 'emitovanje radio programa',
  '6020': 'emitovanje televizijskog programa',
  '6110': 'kablovske telekomunikacije',
  '6120': 'bežične telekomunikacije',
  '6190': 'ostale telekomunikacione delatnosti',
  '6201': 'računarsko programiranje',
  '6202': 'konsultantske delatnosti u oblasti informacione tehnologije',
  '6209': 'ostale usluge informacione tehnologije',
  '6311': 'obrada podataka, hosting i slične delatnosti',
  '6312': 'veb portali',
  '6391': 'delatnost novinskih agencija',
  '6399': 'ostale informacione uslužne delatnosti',
  // Finance & Insurance
  '6419': 'ostalo monetarno posredovanje',
  '6420': 'delatnost holding kompanija',
  '6430': 'trustovi, fondovi i slični finansijski entiteti',
  '6491': 'finansijski lizing',
  '6492': 'ostalo kreditno davanje',
  '6499': 'ostale finansijske uslužne delatnosti',
  '6511': 'životno osiguranje',
  '6512': 'neživotno osiguranje',
  '6520': 'reosiguranje',
  '6611': 'upravljanje finansijskim tržištima',
  '6612': 'posredovanje u trgovini hartijama od vrednosti',
  '6619': 'ostale pomoćne delatnosti u finansijskim uslugama',
  '6621': 'procena rizika i štete',
  '6622': 'delatnost zastupnika i posrednika u osiguranju',
  '6629': 'ostale pomoćne delatnosti u osiguranju',
  '6630': 'upravljanje fondovima',
  // Real Estate
  '6810': 'kupovina i prodaja vlastitih nepokretnosti',
  '6820': 'iznajmljivanje vlastitih ili zakupljenih nepokretnosti',
  '6831': 'delatnost agencija za nekretnine',
  '6832': 'upravljanje nepokretnostima za naknadu',
  // Professional Services
  '6910': 'pravni poslovi',
  '6920': 'računovodstveni, knjigovodstveni i revizorski poslovi',
  '7010': 'upravljanje grupacijom',
  '7021': 'delatnost odnosa sa javnošću',
  '7022': 'konsultantske aktivnosti u vezi s poslovanjem',
  '7111': 'arhitektonska delatnost',
  '7112': 'inženjerska delatnost i tehničko savetovanje',
  '7120': 'tehničko ispitivanje i analize',
  '7211': 'istraživanje i razvoj u biotehnologiji',
  '7219': 'istraživanje i eksperimentalni razvoj u ostalim prirodnim i tehničkim naukama',
  '7220': 'istraživanje i razvoj u društvenim i humanističkim naukama',
  '7311': 'delatnost reklamnih agencija',
  '7312': 'medijsko predstavljanje',
  '7320': 'istraživanje tržišta i ispitivanje javnog mnjenja',
  '7410': 'specijalizovane dizajnerske delatnosti',
  '7420': 'fotografske usluge',
  '7430': 'prevođenje i usluge tumača',
  '7490': 'ostale stručne, naučne i tehničke delatnosti',
  // Admin & Support
  '7711': 'iznajmljivanje automobila i lakih motornih vozila',
  '7712': 'iznajmljivanje kamiona',
  '7721': 'iznajmljivanje opreme za rekreaciju i sport',
  '7729': 'iznajmljivanje ostalih predmeta za ličnu upotrebu',
  '7731': 'iznajmljivanje poljoprivrednih mašina i opreme',
  '7732': 'iznajmljivanje mašina i opreme za građevinarstvo',
  '7739': 'iznajmljivanje ostalih mašina i opreme',
  '7810': 'delatnost agencija za zapošljavanje',
  '7820': 'delatnost agencija za privremeno zapošljavanje',
  '7830': 'ustupanje radnika',
  '7911': 'delatnost putničkih agencija',
  '7912': 'delatnost tur-operatora',
  '7990': 'ostale usluge rezervacije',
  '8010': 'delatnost privatnog obezbeđenja',
  '8020': 'usluge sistema obezbeđenja',
  '8110': 'delatnosti kombinovanih pomoćnih usluga',
  '8121': 'osnovno čišćenje zgrada',
  '8122': 'ostale delatnosti čišćenja zgrada i opreme',
  '8129': 'ostale delatnosti čišćenja',
  '8130': 'usluge uređenja i održavanja okoline',
  '8211': 'kombinovane kancelarijske administrativne usluge',
  '8219': 'fotokopiranje i ostale kancelarijske usluge',
  '8220': 'delatnost pozivnih centara',
  '8230': 'organizovanje sastanaka i sajmova',
  '8291': 'delatnost agencija za naplatu potraživanja i kreditnih biroa',
  '8292': 'usluge pakovanja',
  '8299': 'ostale uslužne aktivnosti podrške poslovanju',
  // Education
  '8510': 'predškolsko obrazovanje',
  '8520': 'osnovno obrazovanje',
  '8531': 'srednje opšte obrazovanje',
  '8532': 'srednje stručno obrazovanje',
  '8541': 'obrazovanje posle srednjeg koje nije visoko',
  '8542': 'visoko obrazovanje',
  '8551': 'sportsko i rekreativno obrazovanje',
  '8552': 'umetničko obrazovanje',
  '8553': 'delatnost škola za obuku vozača',
  '8559': 'ostalo obrazovanje',
  '8560': 'pomoćne obrazovne delatnosti',
  // Health
  '8610': 'delatnost bolnica',
  '8621': 'opšta medicinska praksa',
  '8622': 'specijalistička medicinska praksa',
  '8623': 'stomatološka praksa',
  '8690': 'ostale zdravstvene delatnosti',
  '8710': 'smeštaj za stara lica i lica sa invaliditetom',
  '8720': 'smeštaj za lica sa smetnjama u razvoju i mentalnom zdravlju',
  '8730': 'smeštaj za stara lica i lica sa telesnim invaliditetom',
  '8790': 'ostale delatnosti socijalnog rada sa smeštajem',
  '8810': 'socijalni rad bez smeštaja za stara lica i lica sa invaliditetom',
  '8891': 'delatnost dnevnog zbrinjavanja dece',
  '8899': 'ostale delatnosti socijalnog rada bez smeštaja',
  // Entertainment
  '9001': 'izvođačka umetnost',
  '9002': 'pomoćne delatnosti u izvođačkoj umetnosti',
  '9003': 'umetnička delatnost',
  '9004': 'rad umetničkih ustanova',
  '9101': 'delatnost biblioteka i arhiva',
  '9102': 'delatnost muzeja',
  '9104': 'delatnost botaničkih i zooloških vrtova',
  '9200': 'kockanje i klađenje',
  '9311': 'rad sportskih objekata',
  '9312': 'delatnost sportskih klubova',
  '9313': 'delatnost fitnes klubova',
  '9319': 'ostale sportske delatnosti',
  '9321': 'delatnost zabavnih i tematskih parkova',
  '9329': 'ostale zabavne i rekreativne delatnosti',
  // Other Services
  '9411': 'delatnost poslovnih udruženja i udruženja poslodavaca',
  '9412': 'delatnost strukovnih udruženja',
  '9420': 'delatnost sindikata',
  '9491': 'delatnost verskih organizacija',
  '9492': 'delatnost političkih organizacija',
  '9499': 'delatnost ostalih organizacija na bazi učlanjenja',
  '9511': 'popravka računara i periferne opreme',
  '9512': 'popravka komunikacione opreme',
  '9521': 'popravka elektronske opreme za široku upotrebu',
  '9522': 'popravka aparata za domaćinstvo i kućne i baštenske opreme',
  '9523': 'popravka obuće i predmeta od kože',
  '9524': 'popravka nameštaja i opreme za domaćinstvo',
  '9525': 'popravka satova i nakita',
  '9529': 'popravka ostalih ličnih predmeta i predmeta za domaćinstvo',
  '9601': 'pranje i hemijsko čišćenje tekstilnih i krznenih proizvoda',
  '9602': 'delatnosti frizerskih i kozmetičkih salona',
  '9603': 'pogrebne i srodne delatnosti',
  '9604': 'delatnost nege i održavanja tela',
  '9609': 'ostale nepomenute lične uslužne delatnosti',
};

// Pravne forme - shorter human-readable names
const PRAVNE_FORME: Record<string, string> = {
  'Друштво са ограниченом одговорношћу': 'd.o.o.',
  'Акционарско друштво': 'akcionarsko društvo',
  'Предузетник': 'preduzetnik',
  'Ортачко друштво': 'ortačko društvo',
  'Командитно друштво': 'komanditno društvo',
  'Јавно предузеће': 'javno preduzeće',
  'Задруга': 'zadruga',
};

/**
 * Simple hash to pick template variation consistently per company
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Extract the "brand name" from a full company name
 * e.g., "PREDUZEĆE ZA PROIZVODNJU STEEL DRUM TRADE DOO BEOGRAD" -> "Steel Drum Trade"
 */
function extractBrandName(fullName: string): string {
  // First convert any cyrillic to latin
  let name = cyrillicToLatin(fullName);

  name = name
    // Remove status markers first
    .replace(/[-–]\s*U\s+(LIKVIDACIJI|STEČAJU|PRINUDNOJ LIKVIDACIJI)/gi, '')
    // Remove legal form suffixes/prefixes
    .replace(/\b(DOO|D\.O\.O\.?|AD|A\.D\.?|PR|OD|KD)\b/gi, '')
    .replace(/\b(PREDUZEĆE|DRUŠTVO|ORTAČKO|PROIZVODNO|PROMETNO|USLUŽNO|TRGOVINSKO|ZANATSKO|PRIVREDNO|OGRANАК|OGRANAK)\b/gi, '')
    .replace(/\bSA OGRANIČENOM ODGOVORNOŠĆU\b/gi, '')
    .replace(/\bSTRANOG PRIVREDNOG DRUŠTVA\b/gi, '')
    .replace(/\b(ZA|I|U|NA|IZ|SA)\b/gi, '')
    .replace(
      /\b(PROIZVODNJU|PROMET|USLUGE|TRGOVINU|PRODAJU|POSREDOVANJE|IZGRADNJU|SPOLJNU|UNUTRAŠNJU|MEĐUNARODNU|TRANSPORT|PREVOZ|EXPORT|IMPORT|EKSPORT|ROBOM|VELIKO|MALO|ŠPEDICIJU|MEĐUNARODNU ŠPEDICIJU)\b/gi, ''
    )
    // Remove city names in parens or after dash
    .replace(/\([^)]+\)/g, '')
    .replace(/[-–]\s*(BEOGRAD|NOVI SAD|NIŠ|VOŽDOVAC|SAVSKI VENAC|STARI GRAD|ČUKARICA|ZVEZDARA|PALILULA|RAKOVICA|ZEMUN|SURČIN|GROCKA|LAZAREVAC|MLADENOVAC|OBRENOVAC|SOPOT|BARAJEVO|VRAČAR|NOVI BEOGRAD)\b/gi, '')
    // Remove common city/municipality suffixes
    .replace(
      /\b(BEOGRAD|NOVI SAD|NIŠ|KRAGUJEVAC|SUBOTICA|ČAČAK|KRUŠEVAC|VRANJE|UŽICE|VALJEVO|KRALJEVO|LESKOVAC|ZAJEČAR|ŠABAC|JAGODINA|SMEDEREVO|PANČEVO|ZRENJANIN|SOMBOR|KIKINDA|PIROT|PROKUPLJE|LOZNICA|POŽAREVAC|IVANJICA|ARANĐELOVAC|VOŽDOVAC|SAVSKI VENAC|STARI GRAD|ČUKARICA|ZVEZDARA|PALILULA|RAKOVICA|ZEMUN|SURČIN|GROCKA|NOVI BEOGRAD|VRAČAR|VELIKA PLANA|DESIMIROVAC)\b/gi, ''
    )
    .replace(/[-–,.\s]+/g, ' ')
    .trim();

  // Title case if all uppercase
  if (name === name.toUpperCase() && name.length > 3) {
    name = titleCase(name);
  }

  return name || cyrillicToLatin(fullName).substring(0, 30);
}

/**
 * Convert cyrillic text to latin Serbian
 */
function cyrillicToLatin(text: string): string {
  // Digraphs must be replaced first (before individual chars)
  const digraphs: [string, string, string][] = [
    ['Љ', 'Lj', 'LJ'], ['Њ', 'Nj', 'NJ'], ['Џ', 'Dž', 'DŽ'],
  ];
  let result = text;
  for (const [cyr, lat, latUpper] of digraphs) {
    // If surrounded by uppercase, use full uppercase
    result = result.replace(new RegExp(cyr, 'g'), (_, offset: number) => {
      const next = text[offset + 1];
      if (next && next === next.toUpperCase() && next !== next.toLowerCase()) return latUpper;
      return lat;
    });
  }
  const map: Record<string, string> = {
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Ђ': 'Đ', 'Е': 'E', 'Ж': 'Ž',
    'З': 'Z', 'И': 'I', 'Ј': 'J', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N',
    'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'Ћ': 'Ć', 'У': 'U',
    'Ф': 'F', 'Х': 'H', 'Ц': 'C', 'Ч': 'Č', 'Ш': 'Š',
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ђ': 'đ', 'е': 'e', 'ж': 'ž',
    'з': 'z', 'и': 'i', 'ј': 'j', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
    'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'ћ': 'ć', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'č', 'ш': 'š',
    'љ': 'lj', 'њ': 'nj', 'џ': 'dž',
  };
  return result.split('').map(c => map[c] || c).join('');
}

function titleCase(str: string): string {
  // Split on whitespace/hyphens, capitalize first letter of each word (supports Serbian chars)
  return str.toLowerCase().replace(/(^|[\s-])(\S)/g, (_, prefix, char) => prefix + char.toUpperCase());
}

function formatRsd(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} mlrd. RSD`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} mil. RSD`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)} hiljada RSD`;
  return `${amount} RSD`;
}

function yearsAgo(dateStr: string): number {
  const d = new Date(dateStr);
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export interface CompanyData {
  maticniBroj: string;
  pib?: string | null;
  poslovnoIme: string;
  pravnaForma?: string | null;
  sifraDelatnosti?: string | null;
  opstina?: string | null;
  grad?: string | null;
  adresa?: string | null;
  datumOsnivanja?: string | null;
  status?: string | null;
  brojZaposlenih?: number | null;
  prihod?: number | null;
  kapital?: number | null;
  imeVlasnika?: string | null;
  prezimeVlasnika?: string | null;
}

/**
 * Generate a unique SEO description for a company profile page.
 * Returns 2-4 sentences of natural-sounding Serbian text.
 */
export function generateCompanyDescription(data: CompanyData): string {
  const hash = simpleHash(data.maticniBroj);
  const brandName = extractBrandName(data.poslovnoIme);
  const location = data.grad || (data.opstina ? titleCase(cyrillicToLatin(data.opstina)) : null);
  const delatnost = data.sifraDelatnosti ? DELATNOSTI[data.sifraDelatnosti] : null;
  const pravnaForma = data.pravnaForma ? PRAVNE_FORME[data.pravnaForma] || null : null;
  const years = data.datumOsnivanja ? yearsAgo(data.datumOsnivanja) : null;
  const isActive = !data.status || data.status === 'Активан';

  const parts: string[] = [];

  // === SENTENCE 1: Introduction (who they are) ===
  const intros = [
    () => {
      let s = `${brandName} je ${pravnaForma || 'privredno društvo'}`;
      if (location) s += ` sa sedištem u opštini ${location}`;
      if (delatnost) s += `, registrovano za ${delatnost}`;
      return s + '.';
    },
    () => {
      let s = delatnost
        ? `Kompanija ${brandName} se bavi delatnošću koja obuhvata ${delatnost}`
        : `${brandName} je ${pravnaForma || 'privredno društvo'}`;
      if (location) s += `, a sedište se nalazi u opštini ${location}`;
      return s + '.';
    },
    () => {
      let s = location
        ? `U opštini ${location} posluje ${pravnaForma || 'privredno društvo'} ${brandName}`
        : `${brandName} je registrovano ${pravnaForma || 'privredno društvo'}`;
      if (delatnost) s += ` čija je osnovna delatnost ${delatnost}`;
      return s + '.';
    },
    () => {
      let s = delatnost
        ? `${brandName} je firma specijalizovana za ${delatnost}`
        : `${brandName} je registrovana firma`;
      if (location) s += ` iz opštine ${location}`;
      return s + '.';
    },
    () => {
      let s = `Privredno društvo ${brandName}`;
      if (location) s += ` iz opštine ${location}`;
      s += delatnost ? ` posluje u oblasti koja obuhvata ${delatnost}` : ' je aktivno privredno društvo u Srbiji';
      return s + '.';
    },
  ];
  parts.push(intros[hash % intros.length]());

  // === SENTENCE 2: History/Age ===
  if (years !== null && years > 0) {
    const historyTemplates = [
      `Firma je osnovana ${data.datumOsnivanja?.substring(0, 4)}. godine i posluje već ${years} ${years === 1 ? 'godinu' : years < 5 ? 'godine' : 'godina'}.`,
      `Sa tradicijom dugom ${years} ${years === 1 ? 'godinu' : years < 5 ? 'godine' : 'godina'}, ovo preduzeće je na tržištu od ${data.datumOsnivanja?.substring(0, 4)}. godine.`,
      `Društvo je registrovano ${data.datumOsnivanja?.substring(0, 4)}. godine, što znači da ima ${years} ${years === 1 ? 'godinu' : years < 5 ? 'godine' : 'godina'} iskustva u poslovanju.`,
      `Od osnivanja ${data.datumOsnivanja?.substring(0, 4)}. godine, firma je prisutna na srpskom tržištu više od ${years > 2 ? (years - 1) : years} ${years <= 2 ? 'godinu' : years < 6 ? 'godine' : 'godina'}.`,
    ];
    parts.push(historyTemplates[(hash >> 4) % historyTemplates.length]);
  }

  // === SENTENCE 3: Employees/Size ===
  if (data.brojZaposlenih && data.brojZaposlenih > 0) {
    const sizeTemplates = [
      `Prema poslednjim podacima, firma zapošljava ${data.brojZaposlenih} ${data.brojZaposlenih === 1 ? 'radnika' : data.brojZaposlenih < 5 ? 'radnika' : 'radnika'}.`,
      `U kompaniji je zaposleno ${data.brojZaposlenih} ${data.brojZaposlenih === 1 ? 'lice' : data.brojZaposlenih < 5 ? 'lica' : 'lica'}.`,
      `Tim od ${data.brojZaposlenih} zaposlenih čini okosnicu poslovanja ovog preduzeća.`,
    ];
    parts.push(sizeTemplates[(hash >> 8) % sizeTemplates.length]);
  }

  // === SENTENCE 4: Financials (if available) ===
  if (data.prihod && data.prihod > 0) {
    const finTemplates = [
      `Godišnji prihod kompanije iznosi ${formatRsd(data.prihod)}.`,
      `Prema finansijskim izveštajima, kompanija ostvaruje prihod od ${formatRsd(data.prihod)} na godišnjem nivou.`,
      `Firma beleži godišnji prihod u iznosu od ${formatRsd(data.prihod)}.`,
    ];
    parts.push(finTemplates[(hash >> 12) % finTemplates.length]);
  }

  // === SENTENCE 5: Registration data (PIB, MB) ===
  const regTemplates = [
    () => {
      let s = `Matični broj preduzeća je ${data.maticniBroj}`;
      if (data.pib) s += `, a PIB je ${data.pib}`;
      return s + '.';
    },
    () => {
      let s = `Firma je registrovana pod matičnim brojem ${data.maticniBroj}`;
      if (data.pib) s += ` (PIB: ${data.pib})`;
      if (data.sifraDelatnosti) s += `, šifra delatnosti ${data.sifraDelatnosti}`;
      return s + '.';
    },
    () => {
      const s = data.pib
        ? `Poreski identifikacioni broj (PIB) ovog preduzeća je ${data.pib}, matični broj ${data.maticniBroj}`
        : `Matični broj firme je ${data.maticniBroj}`;
      return s + '.';
    },
  ];
  parts.push(regTemplates[(hash >> 16) % regTemplates.length]());

  // === Status warning ===
  if (!isActive && data.status) {
    const statusLatin = cyrillicToLatin(data.status).toLowerCase();
    parts.push(`Napomena: firma je trenutno u statusu "${statusLatin}".`);
  }

  return parts.join(' ');
}

/**
 * Generate a short meta description (max 160 chars) for SEO
 */
export function generateMetaDescription(data: CompanyData): string {
  const brandName = extractBrandName(data.poslovnoIme);
  const location = data.grad || (data.opstina ? titleCase(cyrillicToLatin(data.opstina)) : 'Srbija');
  const delatnost = data.sifraDelatnosti ? DELATNOSTI[data.sifraDelatnosti] : null;

  if (delatnost) {
    const desc = `${brandName} - ${delatnost}, ${location}. MB: ${data.maticniBroj}${data.pib ? `, PIB: ${data.pib}` : ''}. Kontakt, finansije i više informacija.`;
    return desc.length > 160 ? desc.substring(0, 157) + '...' : desc;
  }

  const desc = `${brandName}, ${location} - matični broj ${data.maticniBroj}${data.pib ? `, PIB ${data.pib}` : ''}. Osnovni podaci, kontakt informacije i detalji o poslovanju.`;
  return desc.length > 160 ? desc.substring(0, 157) + '...' : desc;
}
