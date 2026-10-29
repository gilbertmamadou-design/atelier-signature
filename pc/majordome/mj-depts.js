/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-depts.js : ne pas modifier ici. */
/* Départements (préfecture, coordonnées) : repris de l'appli Actualités, pour situer la vigilance sans service en ligne. */
(function () {
  var DEPTS = ('01|Ain|Bourg-en-Bresse|ARA|46.205|5.226;02|Aisne|Laon|HDF|49.564|3.620;03|Allier|Moulins|ARA|46.566|3.333;04|Alpes-de-Haute-Provence|Digne-les-Bains|PAC|44.092|6.236;' +
  '05|Hautes-Alpes|Gap|PAC|44.559|6.079;06|Alpes-Maritimes|Nice|PAC|43.710|7.262;07|Ardèche|Privas|ARA|44.735|4.599;08|Ardennes|Charleville-Mézières|GES|49.773|4.720;' +
  '09|Ariège|Foix|OCC|42.965|1.607;10|Aube|Troyes|GES|48.297|4.074;11|Aude|Carcassonne|OCC|43.213|2.351;12|Aveyron|Rodez|OCC|44.350|2.575;13|Bouches-du-Rhône|Marseille|PAC|43.296|5.370;' +
  '14|Calvados|Caen|NOR|49.182|-0.370;15|Cantal|Aurillac|ARA|44.926|2.440;16|Charente|Angoulême|NAQ|45.648|0.156;17|Charente-Maritime|La Rochelle|NAQ|46.160|-1.151;18|Cher|Bourges|CVL|47.081|2.399;' +
  '19|Corrèze|Tulle|NAQ|45.267|1.772;2A|Corse-du-Sud|Ajaccio|COR|41.919|8.738;2B|Haute-Corse|Bastia|COR|42.697|9.451;21|Côte-d\'Or|Dijon|BFC|47.322|5.041;22|Côtes-d\'Armor|Saint-Brieuc|BRE|48.514|-2.765;' +
  '23|Creuse|Guéret|NAQ|46.171|1.871;24|Dordogne|Périgueux|NAQ|45.184|0.721;25|Doubs|Besançon|BFC|47.238|6.024;26|Drôme|Valence|ARA|44.933|4.892;27|Eure|Évreux|NOR|49.024|1.151;' +
  '28|Eure-et-Loir|Chartres|CVL|48.446|1.489;29|Finistère|Quimper|BRE|47.996|-4.102;30|Gard|Nîmes|OCC|43.837|4.360;31|Haute-Garonne|Toulouse|OCC|43.605|1.444;32|Gers|Auch|OCC|43.646|0.586;' +
  '33|Gironde|Bordeaux|NAQ|44.838|-0.579;34|Hérault|Montpellier|OCC|43.611|3.877;35|Ille-et-Vilaine|Rennes|BRE|48.117|-1.678;36|Indre|Châteauroux|CVL|46.811|1.691;37|Indre-et-Loire|Tours|CVL|47.394|0.685;' +
  '38|Isère|Grenoble|ARA|45.188|5.725;39|Jura|Lons-le-Saunier|BFC|46.675|5.555;40|Landes|Mont-de-Marsan|NAQ|43.890|-0.500;41|Loir-et-Cher|Blois|CVL|47.586|1.335;42|Loire|Saint-Étienne|ARA|45.440|4.387;' +
  '43|Haute-Loire|Le Puy-en-Velay|ARA|45.043|3.885;44|Loire-Atlantique|Nantes|PDL|47.218|-1.554;45|Loiret|Orléans|CVL|47.902|1.909;46|Lot|Cahors|OCC|44.448|1.441;47|Lot-et-Garonne|Agen|NAQ|44.203|0.616;' +
  '48|Lozère|Mende|OCC|44.518|3.500;49|Maine-et-Loire|Angers|PDL|47.478|-0.563;50|Manche|Saint-Lô|NOR|49.116|-1.091;51|Marne|Châlons-en-Champagne|GES|48.957|4.363;52|Haute-Marne|Chaumont|GES|48.111|5.139;' +
  '53|Mayenne|Laval|PDL|48.073|-0.770;54|Meurthe-et-Moselle|Nancy|GES|48.692|6.184;55|Meuse|Bar-le-Duc|GES|48.772|5.160;56|Morbihan|Vannes|BRE|47.658|-2.760;57|Moselle|Metz|GES|49.120|6.176;' +
  '58|Nièvre|Nevers|BFC|46.990|3.159;59|Nord|Lille|HDF|50.629|3.057;60|Oise|Beauvais|HDF|49.430|2.081;61|Orne|Alençon|NOR|48.432|0.091;62|Pas-de-Calais|Arras|HDF|50.291|2.777;' +
  '63|Puy-de-Dôme|Clermont-Ferrand|ARA|45.778|3.087;64|Pyrénées-Atlantiques|Pau|NAQ|43.296|-0.370;65|Hautes-Pyrénées|Tarbes|OCC|43.233|0.078;66|Pyrénées-Orientales|Perpignan|OCC|42.699|2.895;' +
  '67|Bas-Rhin|Strasbourg|GES|48.573|7.752;68|Haut-Rhin|Colmar|GES|48.079|7.358;69|Rhône|Lyon|ARA|45.764|4.836;70|Haute-Saône|Vesoul|BFC|47.622|6.156;71|Saône-et-Loire|Mâcon|BFC|46.307|4.828;' +
  '72|Sarthe|Le Mans|PDL|48.006|0.199;73|Savoie|Chambéry|ARA|45.564|5.918;74|Haute-Savoie|Annecy|ARA|45.899|6.129;75|Paris|Paris|IDF|48.857|2.352;76|Seine-Maritime|Rouen|NOR|49.443|1.100;' +
  '77|Seine-et-Marne|Melun|IDF|48.540|2.660;78|Yvelines|Versailles|IDF|48.805|2.135;79|Deux-Sèvres|Niort|NAQ|46.323|-0.464;80|Somme|Amiens|HDF|49.894|2.296;81|Tarn|Albi|OCC|43.929|2.148;' +
  '82|Tarn-et-Garonne|Montauban|OCC|44.018|1.355;83|Var|Toulon|PAC|43.124|5.928;84|Vaucluse|Avignon|PAC|43.949|4.806;85|Vendée|La Roche-sur-Yon|PDL|46.670|-1.426;86|Vienne|Poitiers|NAQ|46.580|0.340;' +
  '87|Haute-Vienne|Limoges|NAQ|45.834|1.261;88|Vosges|Épinal|GES|48.173|6.450;89|Yonne|Auxerre|BFC|47.798|3.567;90|Territoire de Belfort|Belfort|BFC|47.640|6.863;91|Essonne|Évry-Courcouronnes|IDF|48.629|2.441;' +
  '92|Hauts-de-Seine|Nanterre|IDF|48.892|2.207;93|Seine-Saint-Denis|Bobigny|IDF|48.909|2.439;94|Val-de-Marne|Créteil|IDF|48.790|2.455;95|Val-d\'Oise|Cergy|IDF|49.036|2.076;' +
  '971|Guadeloupe|Basse-Terre|DOM|15.997|-61.726;972|Martinique|Fort-de-France|DOM|14.616|-61.059;973|Guyane|Cayenne|DOM|4.922|-52.313;974|La Réunion|Saint-Denis|DOM|-20.882|55.450;976|Mayotte|Mamoudzou|DOM|-12.781|45.228')
  .split(';').map(function(s){ var p = s.split('|'); return { code: p[0], name: p[1], pref: p[2], reg: p[3], lat: +p[4], lon: +p[5] }; });
  window.MJDepts = DEPTS;
})();
