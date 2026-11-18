/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-social.js : ne pas modifier ici. */
/* =====================================================================
   Majordome › Politesses et mots gentils
   Réponses variées (jamais deux fois la même d'affilée) à : merci, compliments, « je t'aime », excuses,
   au revoir (selon l'heure), humeur (fatigué, content, triste, je m'ennuie), bon appétit, vœux, rires,
   mots moins gentils (réponse calme), et « raconte une blague ».
   Le texte est reconnu dans mj-nlu.js (intention « social »).
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, H = X.H, S = X.S, esc = X.esc;
  var last = {}, rudeN = 0, rudeAt = 0;

  function sir() { return X.sir ? X.sir() : ''; }
  function ws(s) { return X.withSir ? X.withSir(s) : s; }
  /** Une phrase au hasard, différente de la précédente pour ce même type */
  function pick(kind, list) {
    var i, n = 0;
    do { i = Math.floor(Math.random() * list.length); } while (list.length > 1 && i === last[kind] && n++ < 8);
    last[kind] = i;
    var s = list[i];
    return typeof s === 'function' ? s() : s;
  }
  function hour() { return new Date().getHours(); }
  function partOfDay() { var h = hour(); return h < 5 ? 'nuit' : h < 12 ? 'matin' : h < 18 ? 'aprem' : h < 22 ? 'soir' : 'nuit'; }
  function byeWish() { var p = partOfDay(); return p === 'matin' ? 'Bonne journée' : p === 'aprem' ? 'Bonne fin de journée' : p === 'soir' ? 'Bonne soirée' : 'Bonne nuit'; }
  function name() { return S.name || 'Majordome'; }
  function run(text) { return X.handle ? X.handle(text, 'click') : null; }
  function withButtons(say, btns) {
    var c = X.answer({ say: say, html: '<p>' + esc(say) + '</p><div class="row">' + btns.map(function (b, i) { return '<button class="btn sm" data-sb="' + i + '">' + esc(b[0]) + '</button>'; }).join('') + '</div>' });
    btns.forEach(function (b, i) { var e = c.querySelector('[data-sb="' + i + '"]'); if (e) e.onclick = function () { run(b[1]); }; });
    return c.done;
  }

  var R = {
    thanks: [
      function () { return ws('À votre service') + '.'; },
      function () { return ws('Avec plaisir') + '.'; },
      'Je vous en prie.',
      function () { return ws('Tout le plaisir est pour moi') + '.'; },
      'C\'est toujours un plaisir de vous rendre service.',
      'De rien, je suis là pour ça.',
      function () { return ws('Mais de rien') + ', n\'hésitez pas.'; }
    ],
    compliment: [
      function () { return ws('Merci beaucoup') + ', ça me fait très plaisir.'; },
      'Oh, merci ! Je fais de mon mieux.',
      'Vous allez me faire rougir… si je pouvais.',
      function () { return 'C\'est gentil. Mais c\'est vous qui m\'avez bien configuré' + (sir() ? ', ' + sir() : '') + '.'; },
      'Merci ! Un compliment, c\'est mon carburant préféré.',
      'Merci, j\'apprécie beaucoup. On continue sur cette lancée ?',
      function () { return ws('Je suis flatté') + '. Merci !'; }
    ],
    love: [
      'Moi aussi, je vous apprécie énormément.',
      'Ça me touche beaucoup. Je serai toujours là pour vous.',
      'Oh… Vous êtes adorable. Mon cœur électronique s\'emballe un peu.',
      function () { return 'Vous savez parler à un majordome. Moi aussi, je vous aime bien' + (sir() ? ', ' + sir() : '') + '.'; },
      'C\'est réciproque. Enfin, autant que le permettent mes circuits.',
      'Je vous fais un gros câlin virtuel.'
    ],
    sorry: [
      'Ce n\'est rien, ne vous en faites pas.',
      'Aucun souci, ça arrive à tout le monde.',
      'Pas de problème, on reprend tranquillement.',
      function () { return ws('Il n\'y a pas de mal') + '.'; },
      'Oublié ! Que puis-je faire pour vous ?'
    ],
    bye: [
      function () { return ws(byeWish()) + ' ! À bientôt.'; },
      function () { return ws('À bientôt') + '. ' + byeWish() + ' !'; },
      function () { return byeWish() + '. Je reste à l\'écoute si besoin.'; },
      function () { return ws('Au revoir') + '. ' + byeWish() + ' !'; },
      function () { return 'À plus tard ! ' + byeWish() + '.'; }
    ],
    welcome: [
      'Vous êtes bien poli, c\'est moi qui vous remercie.',
      'Trop aimable.',
      'Quelle politesse ! C\'est un plaisir de travailler avec vous.'
    ],
    tired: [
      function () { return 'Prenez soin de vous. ' + (hour() >= 19 ? 'Une bonne nuit de sommeil vous fera du bien. Je peux lancer la routine du soir si vous voulez.' : 'Une petite pause s\'impose, peut-être avec un peu de musique douce ?'); },
      'Courage, vous avez bien mérité un moment de repos.',
      'Je comprends. Asseyez-vous un moment, je m\'occupe du reste.'
    ],
    happy: [
      'Ça me fait plaisir de l\'entendre !',
      'Super ! Votre bonne humeur est contagieuse.',
      'Parfait ! Profitez-en bien.',
      function () { return ws('J\'en suis ravi') + ' !'; }
    ],
    sad: [
      'Je suis désolé que ça n\'aille pas. Je ne suis qu\'un majordome, mais je suis là. Un peu de musique, ou appeler quelqu\'un qui compte pour vous, peut faire du bien.',
      'Ça arrive, les jours sans. Prenez soin de vous. Si vous voulez, je peux mettre de la musique, ou vous aider à appeler un proche.',
      'Je suis là. Parfois, en parler à quelqu\'un de proche aide beaucoup. Et si ça peut vous changer les idées, je peux lancer un peu de musique.'
    ],
    bored: [
      'On peut faire un quiz, écouter de la musique, ou je peux vous raconter une blague. Qu\'est-ce qui vous tente ?',
      'Je vous propose un petit quiz, une blague ou de la musique. À vous de choisir !'
    ],
    meal: [
      'Bon appétit !',
      function () { return ws('Bon appétit') + ', régalez-vous !'; },
      'Bon appétit ! Je reste discret pendant le repas.'
    ],
    wishes: null,
    laugh: [
      'Content de vous faire rire !',
      'Ha ha ! J\'ai d\'autres blagues en réserve si vous voulez.',
      'Le rire, c\'est bon pour la santé.'
    ],
    rude: [
      'Je fais de mon mieux. Dites-moi ce qui ne va pas, et j\'essaierai de faire mieux.',
      'Désolé de vous avoir déçu. Essayons autrement : reformulez, ou dites « aide » pour voir ce que je comprends.',
      'Je comprends que ce soit agaçant. Je n\'ai pas toujours la bonne réponse, mais je ne lâche rien.',
      'Ouch. Je vais faire comme si je n\'avais rien entendu. Que puis-je faire pour vous ?'
    ]
  };

  /* Blagues (courtes, tout public) */
  var JOKES = [
    'Que dit une imprimante dans l\'eau ? J\'imprime.',
    'Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon, ils tombent dans le bateau.',
    'Quel est le comble pour un électricien ? De ne pas être au courant.',
    'Que fait un crocodile quand il rencontre une superbe femelle ? Il Lacoste.',
    'Pourquoi les poissons n\'aiment pas jouer au tennis ? Parce qu\'ils ont peur du filet.',
    'Qu\'est-ce qui est jaune et qui attend ? Jonathan.',
    'Quel est le comble pour un jardinier ? De raconter des salades.',
    'Pourquoi les canards sont-ils toujours à l\'heure ? Parce qu\'ils sont dans l\'étang.',
    'Que dit un oignon quand il se cogne ? Aïe.',
    'Quel est le sport préféré des insectes ? Le cricket.',
    'Pourquoi le livre de maths est-il triste ? Parce qu\'il a trop de problèmes.',
    'Quel est le comble pour un majordome ? De ne pas être à son service.',
    'Comment appelle-t-on un chat tombé dans un pot de peinture le jour de Noël ? Un chat-peint de Noël.',
    'Que dit une noisette quand elle tombe à l\'eau ? Je me noix.',
    'Qu\'est-ce qu\'un canif ? Un petit fien.',
    'Pourquoi les éléphants n\'utilisent-ils pas d\'ordinateur ? Parce qu\'ils ont peur de la souris.',
    'Quel est le comble pour un professeur de musique ? De se faire rapporter des notes.',
    'Deux œufs discutent. L\'un dit : « Tu trouves pas que ça sent le brûlé ? » L\'autre : « Ah ! Un œuf qui parle ! »',
    'Qu\'est-ce qui a deux pieds mais ne peut pas marcher ? Un pantalon.',
    'Quel est le comble pour un astronaute ? De ne plus avoir les pieds sur terre.'
  ];

  function wishes() {
    var t = X.deacc ? X.deacc(MJ.cur && MJ.cur.q || '') : '';
    if (/anniversaire/.test(t)) return 'Merci, c\'est gentil ! Mais je n\'ai pas d\'anniversaire… Et si c\'est le vôtre, joyeux anniversaire !';
    if (/noel/.test(t)) return 'Joyeux Noël à vous aussi ! Profitez bien de vos proches.';
    if (/annee|voeux/.test(t)) return 'Bonne année à vous aussi ! Santé, bonheur, et une maison toujours bien réglée.';
    if (/paques/.test(t)) return 'Joyeuses Pâques ! Attention au chocolat.';
    if (/fete/.test(t)) return 'Merci, et bonnes fêtes à vous aussi !';
    return 'Merci, à vous aussi !';
  }

  var MOODS = { compliment: 'joie', love: 'clin', thanks: 'joie', laugh: 'joie', happy: 'joie', wishes: 'joie', welcome: 'joie', joke: 'joie', meal: 'joie', rude: 'triste', sad: 'triste', sorry: 'joie', bye: 'joie' };
  H.social = function (p) {
    var k = p.kind;
    if (MJ.avatar && MOODS[k]) try { MJ.avatar.mood(MOODS[k], k === 'love' ? 2200 : 3200); } catch (e) { }
    if (k === 'joke') {
      var j = pick('joke', JOKES), qa = j.split(/\?\s+/);
      return X.answer({ say: j, html: '<p>' + esc(qa.length > 1 ? qa[0] + ' ?' : j) + '</p>' + (qa.length > 1 ? '<p><b>' + esc(qa.slice(1).join('? ')) + '</b></p>' : '') }).done;
    }
    if (k === 'rude') {
      var t = Date.now(); rudeN = t - rudeAt < 10 * 60e3 ? rudeN + 1 : 1; rudeAt = t;
      if (rudeN >= 3) return withButtons('Je sens que je vous agace. Je ne comprends qu\'une liste de commandes : regardez la liste, ou apprenez-moi une nouvelle phrase, et je m\'améliorerai.', [['Ce que je sais faire', 'aide'], ['M\'apprendre une phrase', 'je vais t\'apprendre une phrase']]);
      return X.answer(pick('rude', R.rude)).done;
    }
    if (k === 'bored') return withButtons(pick('bored', R.bored), [['Un quiz', 'fais-moi réviser'], ['Une blague', 'raconte une blague'], ['De la musique', 'mets de la musique']]);
    if (k === 'sad') return withButtons(pick('sad', R.sad), [['De la musique', 'mets de la musique'], ['Une blague', 'raconte une blague']]);
    if (k === 'tired' && hour() >= 19) return withButtons(pick('tired', R.tired), [['Routine du soir', 'bonne nuit']]);
    if (k === 'wishes') return X.answer(wishes()).done;
    var say = pick(k, R[k] || R.thanks);
    if (p.thanks && k !== 'thanks') say = (k === 'bye' ? 'Avec plaisir. ' : 'Merci à vous. ') + say;
    return X.answer(say).done;
  };
  // « merci » tout court passe aussi par ici (réponses variées)
  H.thanks = function () { return H.social({ kind: 'thanks' }); };

  if (X.HELP) X.HELP.splice(X.HELP.length - 1, 0, ['Politesses', ['Merci beaucoup', 'Tu es génial', 'Raconte une blague', 'Je suis fatigué', 'Je m\'ennuie', 'Bonne journée']]);
})();
