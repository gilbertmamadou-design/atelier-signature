/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-phon.js : ne pas modifier ici. */
/* =====================================================================
   Majordome : phonétiseur français (texte → phonèmes API de Piper), code propre au projet.
   Remplace espeak-ng (GPL-3.0) pour les voix Piper : sherpa-onnx 2.x reçoit directement les
   phonèmes (GenerationConfig.phonemeCodepoints). Écrit à la main (règles graphème → phonème,
   lexique d'exceptions, nombres, élisions, liaisons, accent final) ; il suit les conventions
   de transcription avec lesquelles les voix Piper françaises ont été entraînées :
     - accent « ˈ » devant la dernière voyelle des mots pleins, aucun sur les mots-outils ;
     - « - » après les clitiques (le, la, les, de, du, des, ce, je, me, te, se, ne, ma, ta, sa, mes) ;
     - liaison collée à la fin du mot (« vuz avˈe »), élision fusionnée (« lapʁˈɛ ») ;
     - ponctuation collée au mot ; « y » pour le son de « nuit » (pas de « ɥ ») ; « ɡ » (U+0261).
   MJPhon.phonemize(texte) → [phrase en API, …] (une entrée par phrase : . ! ? …)
   MJPhon.normalize(texte) → texte avec nombres, heures, unités et sigles en toutes lettres
   MJPhon.word(mot) → API d'un mot isolé (avec accent)
   Utilisable dans la page, dans un worker (importScripts) et sous Node (module.exports).
   ===================================================================== */
(function (root) {
  'use strict';
  var VOW = 'aeiouyàâäéèêëîïôöùûüÿœæ';
  function isV(c) { return !!c && VOW.indexOf(c) >= 0; }
  function isC(c) { return !!c && /[a-zç]/.test(c) && !isV(c); }
  var PV = 'aeɛəioɔuyøœɑ';   // voyelles phonétiques (les nasales = voyelle + U+0303)

  /* ---------------- Nombres en lettres ---------------- */
  var U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  var T = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
  function n99(n) {
    if (n < 20) return U[n];
    var d = Math.floor(n / 10), u = n % 10;
    if (d === 7 || d === 9) return T[d] + (d === 7 && u === 1 ? '-et-' : '-') + U[10 + u];
    if (u === 0) return d === 8 ? 'quatre-vingts' : T[d];
    return T[d] + (u === 1 && d !== 8 ? '-et-' : '-') + U[u];
  }
  function n999(n) {
    var c = Math.floor(n / 100), r = n % 100, s = '';
    if (c) s = (c > 1 ? U[c] + '-' : '') + (c > 1 && !r ? 'cents' : 'cent');
    if (r) s += (s ? '-' : '') + n99(r);
    return s;
  }
  function num(n) {
    if (n === 0) return 'zéro';
    if (n < 0) return 'moins ' + num(-n);
    var parts = [], units = [[1e9, 'milliard'], [1e6, 'million'], [1e3, 'mille']];
    for (var i = 0; i < units.length; i++) {
      var q = Math.floor(n / units[i][0]);
      if (q) {
        if (units[i][1] === 'mille') parts.push(q === 1 ? 'mille' : n999(q).replace(/cents$/, 'cent') + '-mille');
        else parts.push(n999(q) + '-' + units[i][1] + (q > 1 ? 's' : ''));
        n -= q * units[i][0];
      }
    }
    if (n) parts.push(n999(n));
    return parts.join('-');
  }
  function ordinal(n) {
    if (n === 1) return 'premier';
    var w = num(n);
    if (/cinq$/.test(w)) return w + 'uième';
    if (/neuf$/.test(w)) return w.replace(/neuf$/, 'neuvième');
    if (/e$/.test(w)) return w.slice(0, -1) + 'ième';
    if (/s$/.test(w) && !/trois$/.test(w)) w = w.slice(0, -1);
    return w + 'ième';
  }
  function decimal(intPart, frac) {
    var s = num(+intPart) + ' virgule ';
    if (/^0+/.test(frac) && frac.length > 1) s += frac.replace(/^(0+)/, function (z) { return z.split('').map(function () { return 'zéro '; }).join(''); }) + (frac.replace(/^0+/, '') ? num(+frac.replace(/^0+/, '')) : '');
    else s += num(+frac);
    return s;
  }
  var LETTERS = { a: 'a', b: 'bé', c: 'cé', d: 'dé', e: 'eu', f: 'èf', g: 'gé', h: 'ache', i: 'i', j: 'ji', k: 'ka', l: 'èl', m: 'èm', n: 'èn', o: 'o', p: 'pé', q: 'ku', r: 'èr', s: 'èss', t: 'té', u: 'u', v: 'vé', w: 'doublevé', x: 'iks', y: 'igrèk', z: 'zèd' };
  var SIGLES_MOTS = { OK: 'okè', ONU: 'onu', OTAN: 'otan', NASA: 'naza', SNCF: 'èss-èn-cé-èf', TGV: 'té-gé-vé', USB: 'u-èss-bé', PDF: 'pé-dé-èf', TV: 'té-vé', IA: 'i-a', API: 'a-pé-i', RER: 'èr-eu-èr', PIN: 'pine', SIM: 'sime', CO: 'cé-o', UV: 'u-vé', WC: 'vé-cé' };
  function spell(s) { return s.toLowerCase().split('').map(function (c) { return LETTERS[c] || c; }).join('-'); }

  var UNITS = [
    [/(\d)\s?km\/h\b/g, '$1 kilomètres-heure'], [/(\d)\s?°\s?C\b/g, '$1 degrés'], [/(\d)\s?°/g, '$1 degrés'], [/(\d)\s?%/g, '$1 pour cent'],
    [/(\d)\s?€/g, '$1 euros'], [/(\d)\s?\$/g, '$1 dollars'], [/(\d)\s?km\b/g, '$1 kilomètres'], [/(\d)\s?cm\b/g, '$1 centimètres'], [/(\d)\s?mm\b/g, '$1 millimètres'],
    [/(\d)\s?kg\b/g, '$1 kilos'], [/(\d)\s?min\b/g, '$1 minutes'], [/(\d)\s?ms\b/g, '$1 millisecondes'], [/(\d)\s?Mo\b/g, '$1 mégaoctets'], [/(\d)\s?Go\b/g, '$1 gigaoctets'],
    [/(\d)\s?ko\b/g, '$1 kilooctets'], [/(\d)\s?hPa\b/g, '$1 hectopascals'], [/(\d)\s?W\b/g, '$1 watts'], [/(\d)\s?kWh\b/g, '$1 kilowattheures'], [/(\d)\s?m\b(?![²³])/g, '$1 mètres'],
    [/(\d)\s?l\b/g, '$1 litres'], [/(\d)\s?s\b/g, '$1 secondes'], [/(\d)\s?h\b(?!\s?\d)/g, '$1 heures']
  ];
  function normalize(t) {
    t = String(t || '');
    t = t.replace(/[’‘`´]/g, '\'').replace(/[«»“”"]/g, ' ').replace(/…/g, '.').replace(/\s[–—]\s/g, ', ').replace(/[()[\]{}]/g, ', ').replace(/ | /g, ' ');
    t = t.replace(/\bM\.\s/g, 'monsieur ').replace(/\bMme\b/g, 'madame').replace(/\bMlle\b/g, 'mademoiselle').replace(/\bDr\b\.?/g, 'docteur').replace(/\bSt\b/g, 'saint').replace(/\bn°\s?/gi, 'numéro ')
      .replace(/\betc\b\.?/g, 'et cetera').replace(/\s&\s/g, ' et ').replace(/\s\+\s/g, ' plus ').replace(/\s=\s/g, ' égale ').replace(/\s[x×]\s(?=\d)/g, ' fois ').replace(/\s\/\s/g, ' sur ');
    // heures : 8:30, 08h30, 8 h 30
    t = t.replace(/\b(\d{1,2})\s?(?:h|:)\s?(\d{2})\b/g, function (m, h, mi) { return num(+h) + (+h > 1 ? ' heures ' : ' heure ') + (+mi ? num(+mi) : ''); });
    t = t.replace(/\b(\d{1,2})\s?h\b/g, function (m, h) { return num(+h) + (+h > 1 ? ' heures' : ' heure'); });
    UNITS.forEach(function (u) { t = t.replace(u[0], u[1]); });
    // ordinaux : 1er, 1re, 2e, 3ème, XXe
    t = t.replace(/\b1(er|re|ère)\b/g, function (m, s) { return s === 'er' ? 'premier' : 'première'; });
    t = t.replace(/\b(\d+)(e|ème|eme)\b/g, function (m, n) { return ordinal(+n); });
    // nombres avec espaces de milliers (1 234 567) puis décimaux (2,5 ; 2.5) et entiers
    t = t.replace(/\b\d{1,3}(?: \d{3})+\b/g, function (m) { return m.replace(/ /g, ''); });
    t = t.replace(/(^|[\s(])-(\d)/g, '$1moins $2');
    t = t.replace(/\b(\d+)[,.](\d+)\b/g, function (m, a, b) { return decimal(a, b); });
    t = t.replace(/\b\d+\b/g, function (m) { return m.length > 12 ? m.split('').map(function (c) { return num(+c); }).join(' ') : num(+m); });
    // sigles en capitales (2 à 5 lettres) : épelés, sauf ceux qui se lisent comme un mot
    t = t.replace(/\b[A-Z]{2,5}\b/g, function (m) { return SIGLES_MOTS[m] || (/[AEIOUY]/.test(m) && m.length >= 4 && /^[A-Z][AEIOUY][A-Z][AEIOUY]/.test(m) ? m.toLowerCase() : spell(m)); });
    return t.replace(/\s+/g, ' ').replace(/\s([,.;:!?])/g, '$1').replace(/,+\s*([.!?;:])/g, '$1').replace(/([,;:])(\s*[,;:])+/g, '$1').trim();
  }

  /* ---------------- Lexique : mots-outils et exceptions ----------------
     f : 1 = mot-outil sans accent ; 2 = clitique (sans accent, suivi de « - ») ;
     l : consonne de liaison devant voyelle. */
  var FW = {};
  function fw(list, f) { list.split(' ').forEach(function (e) { var p = e.split('='), w = p[0], ph = p[1].split('+'); FW[w] = { p: ph[0], f: f, l: ph[1] || '' }; }); }
  fw('le=lə la=la les=le+z de=də du=dy des=de+z ce=sə je=ʒə me=mə te=tə se=sə ne=nə ma=ma ta=ta sa=sa mes=me+z tes=te+z ses=se+z', 2);
  fw('un=œ̃+n une=yn il=il ils=il+z elle=ɛl elles=ɛl+z on=ɔ̃+n nous=nu+z vous=vu+z tu=ty y=i en=ɑ̃+n et=e est=ɛ+t à=a a=a au=o aux=o+z ou=u où=u ' +
     'est-ce=ɛs que=kə qui=ki pas=pa+z pour=puʁ sur=syʁ par=paʁ sous=su dans=dɑ̃+z sans=sɑ̃+z avec=avɛk chez=ʃe+z très=tʁɛ+z plus=ply+z mon=mɔ̃+n ton=tɔ̃+n son=sɔ̃+n ' +
     'nos=no+z vos=vo+z notre=nɔtʁ votre=vɔtʁ leur=lœʁ leurs=lœʁ+z cette=sɛt cet=sɛt ces=se+z quel=kɛl quelle=kɛl quels=kɛl+z quelles=kɛl+z car=kaʁ ni=ni mais=mɛ+z donc=dɔ̃k si=si ' +
     'ont=ɔ̃+t sont=sɔ̃+t sommes=sɔm+z êtes=ɛt suis=syi+z es=ɛ+z ai=e as=a+z eu=y faut=fo+t peut=pø+t peux=pø+z va=va vais=vɛ+z comme=kɔm lui=lyi quand=kɑ̃+t dont=dɔ̃ ' +
     'tout=tu+t tous=tu+z toute=tut toutes=tut+z ' +
     'moi=mwa toi=twa soi=swa eux=ø+z leur=lœʁ ça=sa cela=səla ceci=səsi ici=isi là=la puis=pyi+z alors=alɔʁ+z aussi=osi encore=ɑ̃kɔʁ déjà=deʒa ' +
     'jusque=ʒyskə lorsque=lɔʁskə puisque=pyiskə parce=paʁs entre=ɑ̃tʁ vers=vɛʁ+z depuis=dəpyi+z pendant=pɑ̃dɑ̃+t après=apʁɛ+z avant=avɑ̃+t contre=kɔ̃tʁ selon=səlɔ̃ ' +
     'quoi=kwa', 1);
  fw('bien=bjɛ̃+n rien=ʁjɛ̃+n aucun=okœ̃+n deux=dø+z trois=tʁwa+z cent=sɑ̃+t vingt=vɛ̃+t neuf=nœf+~v six=sis+~z dix=dis+~z huit=yit ' +
     'petit=pəti+t grand=ɡʁɑ̃+t gros=ɡʁo+z premier=pʁəmje+ʁ dernier=dɛʁnje+ʁ second=səɡɔ̃+d', 0);
  // élisions (l', d', j'…) : préfixe collé au mot suivant
  var ELI = { l: 'l', d: 'd', j: 'ʒ', qu: 'k', n: 'n', s: 's', c: 's', m: 'm', t: 't', jusqu: 'ʒysk', lorsqu: 'lɔʁsk', puisqu: 'pyisk', presqu: 'pʁɛsk', quoiqu: 'kwak' };
  // exceptions (mots pleins) : prononciation sans accent (ajouté ensuite)
  var LEX = {};
  ('monsieur=məsjø messieurs=mesjø madame=madam mesdames=medam mademoiselle=madmwazɛl femme=fam femmes=fam hier=jɛʁ mer=mɛʁ fer=fɛʁ cher=ʃɛʁ chère=ʃɛʁ fier=fjɛʁ hiver=ivɛʁ enfer=ɑ̃fɛʁ ' +
   'amer=amɛʁ ver=vɛʁ super=sypɛʁ hamster=amstɛʁ laser=lazɛʁ cancer=kɑ̃sɛʁ revolver=ʁevɔlvɛʁ ' +
   'oignon=ɔɲɔ̃ second=səɡɔ̃ seconde=səɡɔ̃d secondes=səɡɔ̃d fils=fis ours=uʁs bus=bys autobus=otobys virus=viʁys bonus=bɔnys cactus=kaktys campus=kɑ̃pys terminus=tɛʁminys ' +
   'sens=sɑ̃s os=ɔs mars=maʁs hélas=elas atlas=atlas tennis=tenis jadis=ʒadis maïs=mais vis=vis lis=lis iris=iʁis oasis=oazis pays=pei paysage=peizaʒ paysan=peizɑ̃ abbaye=abei ' +
   'août=ut sept=sɛt huit=yit net=nɛt but=byt brut=bʁyt ouest=wɛst internet=ɛ̃tɛʁnɛt zut=zyt chut=ʃyt dot=dɔt ' +
   'gentil=ʒɑ̃ti outil=uti fusil=fyzi sourcil=suʁsi persil=pɛʁsi nombril=nɔ̃bʁi ' +
   'ville=vil villes=vil village=vilaʒ villages=vilaʒ mille=mil million=miljɔ̃ millions=miljɔ̃ milliard=miljaʁ milliards=miljaʁ tranquille=tʁɑ̃kil tranquillement=tʁɑ̃kilmɑ̃ lille=lil ' +
   'examen=ɛɡzamɛ̃ pollen=pɔlɛn abdomen=abdɔmɛn spécimen=spesimɛn album=albɔm maximum=maksimɔm minimum=minimɔm forum=fɔʁɔm aquarium=akwaʁjɔm stadium=stadjɔm parfum=paʁfœ̃ ' +
   'tabac=taba estomac=ɛstɔma porc=pɔʁ blanc=blɑ̃ banc=bɑ̃ franc=fʁɑ̃ flanc=flɑ̃ tronc=tʁɔ̃ jonc=ʒɔ̃ clef=kle nerf=nɛʁ nerfs=nɛʁ œufs=ø bœufs=bø œuf=œf bœuf=bœf ' +
   'respect=ʁɛspɛ aspect=aspɛ suspect=syspɛ instinct=ɛ̃stɛ̃ distinct=distɛ̃ ' +
   'sud=syd david=david plomb=plɔ̃ doigt=dwa quatre-vingts=katʁəvɛ̃ temps=tɑ̃ printemps=pʁɛ̃tɑ̃ corps=kɔʁ longtemps=lɔ̃tɑ̃ compte=kɔ̃t comptes=kɔ̃t compter=kɔ̃te ' +
   'baptême=batɛm sculpture=skyltyʁ automne=otɔn condamner=kɔ̃dane ' +
   'quiz=kwiz gaz=ɡaz riz=ʁi ' +
   'écho=eko orchestre=ɔʁkɛstʁ chorale=kɔʁal chaos=kao psychologue=psikɔlɔɡ technique=tɛknik techniques=tɛknik technologie=tɛknɔlɔʒi chrétien=kʁetjɛ̃ ' +
   'eu=y eue=y eus=y eût=y ' +
   'client=kliɑ̃ clients=kliɑ̃ cliente=kliɑ̃t patient=pasjɑ̃ patiente=pasjɑ̃t patience=pasjɑ̃s quotient=kɔsjɑ̃ ingrédient=ɛ̃ɡʁedjɑ̃ inconvénient=ɛ̃kɔ̃venjɑ̃ orient=ɔʁjɑ̃ ' +
   'wagon=vaɡɔ̃ week-end=wikɛnd weekend=wikɛnd ' +
   'oui=wi non=nɔ̃ ok=ɔke okay=ɔke jarvis=ʒaʁvis majordome=maʒɔʁdɔm socle=sɔkl bluetooth=blutus wifi=wifi wi-fi=wifi hue=ju vrai=vʁɛ vraie=vʁɛ philips=filips android=ɑ̃dʁɔid windows=windoz ' +
   'google=ɡuɡœl edge=ɛdʒ chrome=kʁom lively=lajvli vosk=vɔsk piper=pajpœʁ zepp=zɛp franceinfo=fʁɑ̃sɛ̃fo open-meteo=ɔpɛnmeteo email=imɛl e-mail=imɛl mail=mɛl web=wɛb ' +
   'agenda=aʒɛ̃da appli=apli applis=apli app=ap apps=ap smartphone=smaʁtfɔn playlist=plɛlist podcast=pɔdkast spotify=spɔtifaj youtube=jutyb whatsapp=wɑtsap netflix=nɛtfliks deezer=dizœʁ ' +
   'panasonic=panazɔnik comfort=kɔ̃fɔʁ cloud=klawd zoom=zum meteoalarm=meteoalaʁm alpha=alfa cephei=sefei sherpa=ʃɛʁpa onnx=ɔniks ' +
   'beethoven=betɔvɛn mozart=mɔzaʁ shakespeare=ʃɛkspiʁ ' +
   'gare=ɡaʁ soixante=swasɑ̃t bruxelles=bʁysɛl auxerre=osɛʁ dix-sept=dˈisˈɛt dix-huit=dˈizyˈit dix-neuf=dˈiznˈœf ' +
   'plus-que-parfait=plyskəpaʁfɛ aujourd\'hui=oʒuʁdyi rendez-vous=ʁɑ̃devu').split(' ').forEach(function (e) { var i = e.indexOf('='); LEX[e.slice(0, i)] = e.slice(i + 1); });
  // h aspiré : pas de liaison ni d'élision
  var HASP = {};
  'haut haute hauts hautes hauteur hors hasard hâte héros honte hibou hache haine hall hamac hareng haricot hausse harpe hiérarchie hockey homard hurler hutte hongrie hublot handicap hollande hameau hanche hangar harcèlement hardi hérisson hêtre hibou hiboux huit huitième onze onzième oui ouate yaourt yoga web wifi wi-fi week-end weekend whatsapp windows wagon watt watts yacht'.split(' ').forEach(function (w) { HASP[w] = 1; });
  // mots en -ent prononcés [ɑ̃] (noms, adjectifs, adverbes) ; les autres « -ent » sont des verbes (finale muette)
  var ENT = {};
  ('accent accident adjacent adolescent agent ambient apparent argent arpent ardent absent auvent bent cent client comment compétent conscient content continent couvent ' +
   'décent dent différent diligent éloquent équivalent évident excellent fréquent gent grandement impatient imprudent incident indulgent innocent insolent intelligent ' +
   'lent mécontent moment omniprésent orient parent patent pendant permanent pertinent président prudent récent régent sergent serpent souvent silent talent torrent ' +
   'transparent urgent vent violent important adjacent concurrent consistent convergent cohérent incohérent intermittent latent pourcent précédent référent résident ' +
   'segment ciment élément aliment argument document fragment instrument jument logement monument paiement règlement sentiment supplément tempérament testament ' +
   'vêtement serment tourment ferment froment comment clément dément proéminent éminent négligent influent fluent affluent confluent onguent ' +
   'souvent auparavent pourtant parent apparent excellent récent latent').split(' ').forEach(function (w) { ENT[w] = 1; });
  var PRECONS = { huit: 'yi', six: 'si', dix: 'di' };   // devant une consonne
  var SUBJ = { ils: 1, elles: 1, qui: 1, 'qu\'ils': 1, 'qu\'elles': 1 };

  /* ---------------- Règles graphème → phonème ----------------
     [graphie, contexte gauche (regex sur ce qui précède, avec « # » en début), contexte droit (regex sur ce qui suit, « # » en fin), phonèmes] */
  var Vx = '[' + VOW + ']', Cx = '[bcçdfghjklmnpqrstvwxz]', NOTNASAL = '(?![' + VOW + 'nmh])';
  var R = {};
  function r(g, l, rr, p) { var k = g.charAt(0); (R[k] = R[k] || []).push({ g: g, l: l ? new RegExp(l + '$') : null, r: rr ? new RegExp('^' + rr) : null, p: p }); }
  // a
  r('aient', null, '#', 'ɛ'); r('ais', null, '#', 'ɛ'); r('ait', null, '#', 'ɛ'); r('aix', null, '#', 'ɛ'); r('aid', null, '#', 'ɛ'); r('ai', 'r', '#', 'e'); r('ai', null, '#', 'ɛ');
  r('aill', null, null, 'aj'); r('ail', null, 's?#', 'aj'); r('aim', null, NOTNASAL, 'ɛ̃'); r('ain', null, NOTNASAL, 'ɛ̃'); r('aî', null, null, 'ɛ'); r('ai', null, null, 'ɛ'); r('ay', null, Vx, 'ɛj'); r('ay', null, null, 'ɛ');
  r('aon', null, '#', 'ɑ̃'); r('au', null, null, 'o'); r('am', null, NOTNASAL, 'ɑ̃'); r('an', null, NOTNASAL, 'ɑ̃'); r('à', null, null, 'a'); r('â', null, null, 'a'); r('ä', null, null, 'a'); r('a', null, null, 'a');
  // e
  r('e', '#', '(ff|ss|cc)', 'e');
  r('eaux', null, '#', 'o'); r('eau', null, null, 'o');
  r('eux', null, '#', 'ø'); r('eu', null, '[rlfn]e?s?#', 'œ'); r('eu', null, '(il|ill)', 'œ'); r('eu', null, 'bl', 'œ'); r('eu', null, 'v[^' + VOW + ']', 'œ'); r('eu', null, null, 'ø');
  r('eim', null, NOTNASAL, 'ɛ̃'); r('ein', null, NOTNASAL, 'ɛ̃'); r('eill', null, null, 'ɛj'); r('eil', null, '(#|s#)', 'ɛj'); r('ei', null, null, 'ɛ'); r('ey', null, Vx, 'ɛj'); r('ey', null, null, 'ɛ');
  r('ent', '[' + VOW + 'bcdfgjklmnpqrstvz]', '#', '§ent'); // traité au niveau du mot
  r('emment', null, '#', 'amɑ̃'); r('emm', '#', null, 'ɑ̃m'); r('enn', '#', null, 'ɑ̃n'); r('enivr', '#', null, 'ɑ̃nivʁ');
  r('en', 'i', '(t#|ts#)', 'ɛ̃'); r('en', '[iy]', NOTNASAL, 'ɛ̃'); r('en', 'é', NOTNASAL, 'ɛ̃');
  r('em', null, NOTNASAL, 'ɑ̃'); r('en', null, NOTNASAL, 'ɑ̃');
  r('er', '..', '#', 'e'); r('ers', '..', '#', 'e'); r('ez', null, '#', 'e'); r('ed', null, 's?#', 'e'); r('et', null, 's?#', 'ɛ'); r('es', '#..?', '#', 'e'); r('es', null, '#', '');
  r('e', null, '#', '');
  r('exc', null, '[eiyéèê]', 'ɛks'); r('ex', '#', '[' + VOW + 'h]', 'ɛɡz'); r('ex', '#in', '[' + VOW + 'h]', 'ɛɡz'); r('e', null, 'x', 'ɛ');
  r('e', null, '([bcdfgkpstv])\\1', 'ɛ'); r('e', null, '(ll|nn|mm|rr)', 'ɛ'); r('e', null, '[rlcfbtkpqsz](#|s#)', 'ɛ');
  r('e', null, '([bcdfgkptv][rl]|ch|ph|th|gn|gu|qu)' + Vx, '§ə');
  r('e', null, Cx + Cx, 'ɛ'); r('e', null, Cx + '?' + Vx, '§ə'); r('e', null, null, '§ə');
  r('é', null, null, 'e'); r('è', null, null, 'ɛ'); r('ê', null, null, 'ɛ'); r('ë', null, null, 'ɛ');
  // i
  r('ient', '(v|t)', '#', 'jɛ̃'); r('ient', '..', '#', 'i');
  r('ien', null, NOTNASAL, 'jɛ̃'); r('ill', '[' + VOW + ']', null, 'j'); r('il', '[cg]ue', 's?#', 'j'); r('ill', null, null, 'ij'); r('il', '[aeuœ]', 's?#', 'j');
  r('im', null, '[pb]', 'ɛ̃'); r('in', null, NOTNASAL, 'ɛ̃'); r('im', null, '#', 'ɛ̃');
  r('i', null, '(e#|es#|ent#)', 'i'); r('i', '[bcdfgkpstv][rl]', Vx, 'ij'); r('i', '[^#]', '[aeoouéèêàâôû]', 'j'); r('î', null, null, 'i'); r('ï', null, null, 'i'); r('i', null, null, 'i');
  // o
  r('oin', null, NOTNASAL, 'wɛ̃'); r('oi', null, null, 'wa'); r('oî', null, null, 'wa'); r('oy', null, Vx, 'waj'); r('oy', null, null, 'wa');
  r('oeu', null, '[rlfn]e?s?#', 'œ'); r('œu', null, '[rlfn]e?s?#', 'œ'); r('oeu', null, null, 'ø'); r('œu', null, null, 'ø'); r('œ', null, null, 'e');
  r('ou', null, '(e#|es#|ent#)', 'u'); r('ou', null, '[aeiéèêo]', 'w'); r('où', null, null, 'u'); r('oû', null, null, 'u'); r('ou', null, null, 'u');
  r('om', null, NOTNASAL, 'ɔ̃'); r('on', null, NOTNASAL, 'ɔ̃');
  r('o', null, 's(e|es|ent)#', 'o'); r('o', null, 'z', 'o'); r('o', null, '#', 'o'); r('o', null, '[stdpxz]s?#', 'o');
  r('o', null, '(ll|nn|mm|rr|tt|pp|cc|ff|ss)', 'ɔ'); r('o', null, Cx + '(e|es|ent)#', 'ɔ'); r('o', null, '[rlcfkbgm]s?#', 'ɔ');
  r('o', null, '[bcdfgkpt][rl](e|es)#', 'ɔ'); r('o', null, '[bcdfgkpt][rl]', 'o'); r('o', null, Cx + Cx, 'ɔ'); r('ô', null, null, 'o'); r('ö', null, null, 'ø'); r('o', null, null, 'o');
  // u
  r('um', null, '#', 'ɔm'); r('um', null, '[pb]', 'œ̃'); r('un', null, NOTNASAL, 'œ̃');
  r('ui', null, null, 'yi'); r('ue', '[cg]', 'il', 'œ'); r('u', 'q', null, ''); r('u', 'g', '[eiéèêy]', ''); r('u', null, '(e#|es#|ent#)', 'y'); r('u', null, Vx, 'y'); r('û', null, null, 'y'); r('ù', null, null, 'y'); r('ü', null, null, 'y'); r('u', null, null, 'y');
  // y
  r('ym', null, '[pb]', 'ɛ̃'); r('yn', null, NOTNASAL, 'ɛ̃'); r('y', '#', Vx, 'j'); r('y', Vx, Vx, 'j'); r('y', null, null, 'i'); r('ÿ', null, null, 'i');
  // consonnes
  r('bb', null, null, 'b'); r('b', null, null, 'b');
  r('cch', null, null, 'k'); r('cc', null, '[eiyéèê]', 'ks'); r('cc', null, null, 'k'); r('ch', null, '[rl]', 'k'); r('ch', null, null, 'ʃ'); r('ck', null, null, 'k');
  r('ct', null, 's?#', 'kt'); r('c', '[nr]', 's?#', ''); r('c', null, '[eiyéèêë]', 's'); r('c', null, null, 'k'); r('ç', null, null, 's');
  r('dd', null, null, 'd'); r('d', null, 's?#', ''); r('d', null, null, 'd');
  r('ff', null, null, 'f'); r('f', null, null, 'f');
  r('gn', null, null, 'ɲ'); r('ge', null, '[aoâô]', 'ʒ'); r('gg', null, '[eiy]', 'ɡʒ'); r('gg', null, null, 'ɡ'); r('g', null, '[eiyéèêë]', 'ʒ'); r('g', 'in', 's?#', ''); r('g', '[nr]', 's?#', ''); r('g', null, null, 'ɡ');
  r('h', null, null, '');
  r('j', null, null, 'ʒ'); r('k', null, null, 'k');
  r('ll', null, null, 'l'); r('l', null, null, 'l');
  r('mm', null, null, 'm'); r('m', null, null, 'm');
  r('nn', null, null, 'n'); r('ng', 'i', 's?#', 'ŋ'); r('n', null, null, 'n');
  r('ph', null, null, 'f'); r('pp', null, null, 'p'); r('ps', null, '#', ''); r('pt', 'm', null, 't'); r('p', null, 's?#', ''); r('p', null, null, 'p');
  r('qu', null, null, 'k'); r('q', null, null, 'k');
  r('rr', null, null, 'ʁ'); r('r', null, null, 'ʁ');
  r('sch', null, null, 'ʃ'); r('sh', null, null, 'ʃ'); r('ss', null, null, 's'); r('sc', null, '[eiyéèê]', 's'); r('s', '#', null, 's'); r('s', null, '#', '');
  r('s', Vx, Vx, 'z'); r('s', null, null, 's');
  r('tionn', 's', null, 'tjɔn'); r('tionn', null, null, 'sjɔn'); r('tion', 's', null, 'tjɔ̃'); r('tion', null, null, 'sjɔ̃'); r('tial', '[' + VOW + ']', null, 'sjal'); r('tiel', null, null, 'sjɛl'); r('tienc', null, null, 'sjɑ̃s'); r('tieu', null, null, 'sjø'); r('tie', 'a', '(s?#)', 'si');
  r('th', null, null, 't'); r('tt', null, null, 't'); r('t', null, 's?#', ''); r('t', null, null, 't');
  r('v', null, null, 'v'); r('w', null, null, 'w');
  r('x', 'i', 's?#', ''); r('x', '[aeo]', '#', 'ks'); r('x', null, '#', ''); r('x', null, null, 'ks');
  r('zz', null, null, 'z'); r('z', null, '#', ''); r('z', null, null, 'z');

  /* graphie → phonèmes (mot sans apostrophe, minuscules) */
  function g2p(w) {
    if (LEX[w] != null) return LEX[w];
    if (FW[w]) return FW[w].p;
    var s = '#' + w + '#', out = '', i = 1, n = s.length - 1;
    while (i < n) {
      var c = s.charAt(i), rules = R[c], done = false;
      if (rules) {
        for (var k = 0; k < rules.length; k++) {
          var ru = rules[k];
          if (s.substr(i, ru.g.length) !== ru.g) continue;
          var left = s.slice(0, i), right = s.slice(i + ru.g.length);
          if (ru.l && !ru.l.test(left)) continue;
          if (ru.r && !ru.r.test(right)) continue;
          if (ru.p === '§ent') {             // finale -ent : nom/adjectif (ɑ̃) ou verbe (muette)
            if (ENT[w] || (/ment$/.test(w) && w.length > 5)) out += 'ɑ̃';
            else if (!/[aeiouyéèê]/.test(w.slice(0, -3))) out += 'ɑ̃';   // « cent », « dent », « vent »
            // sinon : 3e personne du pluriel, muette
          } else out += ru.p;
          i += ru.g.length; done = true; break;
        }
      }
      if (!done) { if (/[a-z]/.test(c)) out += c; i++; }
    }
    return schwa(out);
  }
  /* « e » intérieur (marqué §ə) : gardé après deux consonnes ou en première syllabe, sinon effacé (VCəCV → VCCV) */
  function schwa(p) {
    var res = '', segs = p.split('§ə');
    for (var k = 0; k < segs.length; k++) {
      res += segs[k];
      if (k === segs.length - 1) break;
      var before = res, after = segs[k + 1];
      var m = /([^aeɛəioɔuyøœɑ̃]*)$/.exec(before), cons = m ? m[1] : '';
      var hasVowelBefore = /[aeɛəioɔuyøœɑ]/.test(before.slice(0, before.length - cons.length));
      var nextVowel = /^[^aeɛəioɔuyøœɑ]*[aeɛəioɔuyøœɑ]/.test(after);
      if (hasVowelBefore && cons.length === 1 && nextVowel && !/^[jw]/.test(after)) continue;   // effacé
      if (!nextVowel) continue;                                                               // fin de mot
      res += 'ə';
    }
    return res;
  }
  /* accent : « ˈ » devant la dernière voyelle pleine */
  function stress(p) {
    if (p.indexOf('ˈ') >= 0) return p;
    var idx = -1, sch = -1;
    for (var i = 0; i < p.length; i++) { var c = p.charAt(i); if (PV.indexOf(c) >= 0) { if (c === 'ə') sch = i; else idx = i; } }
    if (idx < 0) idx = sch;
    if (idx < 0) return p;
    return p.slice(0, idx) + 'ˈ' + p.slice(idx);
  }
  function startsVowel(p) { return /^[ˈ]?[aeɛəioɔuyøœɑjw]/.test(p); }

  /* mot (avec tirets internes) → {p, f, l, h} */
  function wordInfo(raw) {
    var w = raw.toLowerCase();
    if (LEX[w] != null) return { p: LEX[w], f: 0, l: '', h: HASP[w] };
    if (FW[w]) return { p: FW[w].p, f: FW[w].f, l: FW[w].l, h: 0 };
    if (w.indexOf('-') > 0) {                          // mot composé : chaque partie, collées
      var parts = w.split('-').filter(Boolean), ps = [];
      for (var k = 0; k < parts.length; k++) {
        var x = parts[k];
        if (x === 't' && k > 0) { ps.push('t'); continue; }   // « a-t-il »
        var inf = wordInfo(x), ph = inf.p;
        if (k > 0 && /^(je|tu|il|ils|elle|elles|on|nous|vous|moi|toi|lui|leur|le|la|les|en|y|ce)$/.test(x)) { ps.push(x === 'je' ? 'ʒ' : ph); continue; }
        if ((x === 'dix' || x === 'six') && parts[k + 1] === 'neuf') ph = ph.slice(0, -1) + 'z';
        if ((x === 'dix' || x === 'six') && parts[k + 1] === 'sept') ph = ph.slice(0, -1);   // pronom après le verbe : sans accent
        // liaison interne (« quatre-vingt-un », « dix-huit », « kilomètres-heure »)
        var nx = parts[k + 1];
        if (nx && inf.l && startsVowel(wordInfo(nx).p)) ph = inf.l.charAt(0) === '~' ? ph.slice(0, -1) + inf.l.slice(1) : ph + inf.l;
        else if (nx && /^(il|ils|elle|elles|on)$/.test(nx) && /[td]$/.test(x) && !/t$/.test(ph)) ph += 't';
        else if (nx && /s$/.test(x) && !/s$/.test(ph) && startsVowel(wordInfo(nx).p) && !HASP[nx]) ph += 'z';
        ps.push(inf.f ? ph : stress(ph));
      }
      var lastInf = wordInfo(parts[parts.length - 1]);
      return { p: ps.join(''), f: 0, l: lastInf.f ? '' : lastInf.l, h: HASP[parts[0]], pre: 1 };
    }
    return { p: g2p(w), f: 0, l: '', h: HASP[w] };
  }

  /* une phrase → API */
  function phrase(t) {
    var toks = [], re = /([A-Za-zÀ-ÖØ-öø-ÿœŒæÆ]+(?:[-'][A-Za-zÀ-ÖØ-öø-ÿœŒæÆ]+)*'?)|([,;:.!?])/g, m;
    while ((m = re.exec(t))) toks.push(m[1] ? { w: m[1] } : { punct: m[2] });
    var items = [];
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (tk.punct) { items.push(tk); continue; }
      var w = tk.w, low = w.toLowerCase(), pre = '';
      // élision : l'heure, qu'il, jusqu'à, aujourd'hui (lexique)
      var em = /^([a-zà-ÿ]+)'(.+)$/.exec(low);
      if (em && LEX[low] == null) { if (ELI[em[1]] != null) { pre = ELI[em[1]]; low = em[2]; } else low = em[1] + em[2]; }
      if (/'$/.test(low)) { var e2 = low.slice(0, -1); if (ELI[e2] != null) { pre = ELI[e2]; low = ''; } }
      if (!low) { var nxt = toks[i + 1]; if (nxt && nxt.w) { nxt.pre = (nxt.pre || '') + pre; } continue; }
      var inf = wordInfo(low);
      items.push({ w: low, p: inf.p, f: inf.f, l: inf.l, h: inf.h, pre: (tk.pre || '') + pre, comp: inf.pre, subj: i > 0 && toks[i - 1].w && SUBJ[toks[i - 1].w.toLowerCase()] });
    }
    // 3e personne du pluriel après ils / elles / qui : finale -ent muette même pour « couvent », « parent »…
    items.forEach(function (it) { if (it.subj && /ent$/.test(it.w) && (ENT[it.w] || /ment$/.test(it.w)) && !LEX[it.w]) it.p = it.p.replace(/ɑ̃$/, ''); });
    var out = '';
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      if (it.punct) { out = out.replace(/ $/, '') + it.punct + ' '; continue; }
      var next = items[j + 1], last = !next || next.punct;
      var ph = it.p;
      var nextV = next && !next.punct && !next.h && !next.pre && startsVowel(next.p);
      var liaison = nextV && it.l ? it.l : '';
      if (liaison.charAt(0) === '~') { ph = ph.slice(0, -1); liaison = liaison.slice(1); }
      else if (!nextV && next && !next.punct && PRECONS[it.w]) ph = PRECONS[it.w];   // « huit gâteaux », « six minutes »
      if (it.f === 2) { out += it.pre + ph + '-' + liaison + ' '; continue; }
      if (it.f === 1 && !last) { out += it.pre + ph + liaison + ' '; continue; }
      out += it.pre + (it.comp ? ph : stress(ph)) + liaison + ' ';
    }
    return out.replace(/ +$/, '').replace(/ ([,;:.!?])/g, '$1').replace(/^[,;:.!? ]+/, '');
  }
  /* texte → phrases (découpées sur . ! ? et fins de ligne) */
  function sentences(t) {
    return String(t || '').split(/(?<=[.!?])\s+|\n+/).map(function (s) { return s.trim(); }).filter(function (s) { return /[A-Za-zÀ-ÿ0-9]/.test(s); });
  }
  function phonemize(text) {
    return sentences(normalize(text)).map(phrase).filter(Boolean);
  }
  var api = { phonemize: phonemize, normalize: normalize, sentences: sentences, num: num, phrase: phrase, word: function (w) { return stress(wordInfo(String(w).toLowerCase()).p); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MJPhon = api;
})(typeof self !== 'undefined' ? self : this);
