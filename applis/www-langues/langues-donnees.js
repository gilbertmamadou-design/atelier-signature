/* =====================================================================
   Langues › contenu des leçons : [français, espagnol (Espagne), portugais (Portugal), anglais (Royaume-Uni)].
   Écrit pour l'appli (aucun contenu repris d'un autre cours). Portugais : orthographe de l'accord de 1990
   (receção, proteção, ótimo…) et mots du Portugal (comboio, autocarro, pequeno-almoço, casa de banho, telemóvel).
   Vocabulaire de chantier : termes courants, qui peuvent varier d'une entreprise ou d'une région à l'autre.
   Une langue de plus = une colonne de plus (voir LANGS) ; chaque thème a des mots (m) et des phrases (p).
   ===================================================================== */
window.LANGUES = {
  LANGS: [
    { id: 'es', col: 1, nom: 'Espagnol', pays: 'Espagne', tag: 'es-ES', alt: ['es'] },
    { id: 'pt', col: 2, nom: 'Portugais', pays: 'Portugal', tag: 'pt-PT', alt: ['pt'] },
    { id: 'en', col: 3, nom: 'Anglais', pays: 'Royaume-Uni', tag: 'en-GB', alt: ['en'] }
  ],
  THEMES: [
    { id: 'bases', n: 'Premiers mots', d: 'Saluer, remercier, se faire comprendre', g: 'voyage', ic: 'hand',
      m: [
        ['bonjour', 'hola', 'olá', 'hello'],
        ['bonjour (le matin)', 'buenos días', 'bom dia', 'good morning'],
        ['bon après-midi', 'buenas tardes', 'boa tarde', 'good afternoon'],
        ['bonsoir, bonne nuit', 'buenas noches', 'boa noite', 'good evening, good night'],
        ['au revoir', 'adiós', 'adeus', 'goodbye'],
        ['à bientôt', 'hasta pronto', 'até breve', 'see you soon'],
        ['à demain', 'hasta mañana', 'até amanhã', 'see you tomorrow'],
        ['s\'il vous plaît', 'por favor', 'por favor', 'please'],
        ['merci', 'gracias', 'obrigado', 'thank you'],
        ['merci beaucoup', 'muchas gracias', 'muito obrigado', 'thank you very much'],
        ['de rien', 'de nada', 'de nada', 'you\'re welcome'],
        ['oui', 'sí', 'sim', 'yes'],
        ['non', 'no', 'não', 'no'],
        ['pardon, excusez-moi', 'perdón', 'desculpe', 'sorry, excuse me'],
        ['d\'accord', 'vale', 'está bem', 'okay'],
        ['bienvenue', 'bienvenido', 'bem-vindo', 'welcome'],
        ['enchanté', 'encantado', 'muito prazer', 'nice to meet you']
      ],
      p: [
        ['Comment ça va ?', '¿Qué tal?', 'Como está?', 'How are you?'],
        ['Très bien, et vous ?', 'Muy bien, ¿y usted?', 'Muito bem, e consigo?', 'Very well, and you?'],
        ['Je ne comprends pas.', 'No entiendo.', 'Não percebo.', 'I don\'t understand.'],
        ['Je ne sais pas.', 'No lo sé.', 'Não sei.', 'I don\'t know.'],
        ['Pouvez-vous répéter ?', '¿Puede repetir?', 'Pode repetir?', 'Could you repeat that?'],
        ['Plus lentement, s\'il vous plaît.', 'Más despacio, por favor.', 'Mais devagar, por favor.', 'More slowly, please.'],
        ['Parlez-vous français ?', '¿Habla francés?', 'Fala francês?', 'Do you speak French?'],
        ['Je parle un peu.', 'Hablo un poco.', 'Falo um pouco.', 'I speak a little.'],
        ['Je suis désolé.', 'Lo siento.', 'Peço desculpa.', 'I\'m sorry.']
      ] },

    { id: 'moi', n: 'Se présenter', d: 'Nom, pays, métier, famille', g: 'voyage', ic: 'user',
      m: [
        ['le nom', 'el nombre', 'o nome', 'the name'],
        ['l\'âge', 'la edad', 'a idade', 'the age'],
        ['la France', 'Francia', 'a França', 'France'],
        ['français', 'francés', 'francês', 'French'],
        ['le métier', 'el oficio', 'a profissão', 'the job'],
        ['le formateur', 'el formador', 'o formador', 'the trainer'],
        ['la famille', 'la familia', 'a família', 'the family'],
        ['marié', 'casado', 'casado', 'married'],
        ['les enfants', 'los hijos', 'os filhos', 'the children'],
        ['l\'ami', 'el amigo', 'o amigo', 'the friend'],
        ['la ville', 'la ciudad', 'a cidade', 'the town'],
        ['le pays', 'el país', 'o país', 'the country']
      ],
      p: [
        ['Je m\'appelle Paul.', 'Me llamo Paul.', 'Chamo-me Paul.', 'My name is Paul.'],
        ['Comment vous appelez-vous ?', '¿Cómo se llama?', 'Como se chama?', 'What\'s your name?'],
        ['Je suis français.', 'Soy francés.', 'Sou francês.', 'I\'m French.'],
        ['D\'où venez-vous ?', '¿De dónde es?', 'De onde é?', 'Where are you from?'],
        ['Je vis en France.', 'Vivo en Francia.', 'Vivo em França.', 'I live in France.'],
        ['Je suis formateur.', 'Soy formador.', 'Sou formador.', 'I\'m a trainer.'],
        ['J\'ai deux enfants.', 'Tengo dos hijos.', 'Tenho dois filhos.', 'I have two children.'],
        ['J\'ai cinquante ans.', 'Tengo cincuenta años.', 'Tenho cinquenta anos.', 'I\'m fifty years old.'],
        ['Enchanté de vous connaître.', 'Encantado de conocerle.', 'Muito prazer em conhecê-lo.', 'Nice to meet you.']
      ] },

    { id: 'nombres', n: 'Nombres', d: 'Compter, les prix, les mesures', g: 'voyage', ic: 'hash',
      m: [
        ['zéro', 'cero', 'zero', 'zero'], ['un', 'uno', 'um', 'one'], ['deux', 'dos', 'dois', 'two'], ['trois', 'tres', 'três', 'three'],
        ['quatre', 'cuatro', 'quatro', 'four'], ['cinq', 'cinco', 'cinco', 'five'], ['six', 'seis', 'seis', 'six'], ['sept', 'siete', 'sete', 'seven'],
        ['huit', 'ocho', 'oito', 'eight'], ['neuf', 'nueve', 'nove', 'nine'], ['dix', 'diez', 'dez', 'ten'], ['onze', 'once', 'onze', 'eleven'],
        ['douze', 'doce', 'doze', 'twelve'], ['treize', 'trece', 'treze', 'thirteen'], ['quatorze', 'catorce', 'catorze', 'fourteen'], ['quinze', 'quince', 'quinze', 'fifteen'],
        ['seize', 'dieciséis', 'dezasseis', 'sixteen'], ['dix-sept', 'diecisiete', 'dezassete', 'seventeen'], ['dix-huit', 'dieciocho', 'dezoito', 'eighteen'],
        ['dix-neuf', 'diecinueve', 'dezanove', 'nineteen'], ['vingt', 'veinte', 'vinte', 'twenty'], ['trente', 'treinta', 'trinta', 'thirty'],
        ['quarante', 'cuarenta', 'quarenta', 'forty'], ['cinquante', 'cincuenta', 'cinquenta', 'fifty'], ['soixante', 'sesenta', 'sessenta', 'sixty'],
        ['soixante-dix', 'setenta', 'setenta', 'seventy'], ['quatre-vingts', 'ochenta', 'oitenta', 'eighty'], ['quatre-vingt-dix', 'noventa', 'noventa', 'ninety'],
        ['cent', 'cien', 'cem', 'one hundred'], ['mille', 'mil', 'mil', 'one thousand'],
        ['le mètre', 'el metro', 'o metro', 'the metre'], ['le centimètre', 'el centímetro', 'o centímetro', 'the centimetre'], ['le kilo', 'el kilo', 'o quilo', 'the kilo']
      ],
      p: [
        ['Combien ça coûte ?', '¿Cuánto cuesta?', 'Quanto custa?', 'How much is it?'],
        ['C\'est dix euros.', 'Son diez euros.', 'São dez euros.', 'It\'s ten euros.'],
        ['Quel est votre numéro de téléphone ?', '¿Cuál es su número de teléfono?', 'Qual é o seu número de telefone?', 'What is your phone number?'],
        ['Il mesure trois mètres.', 'Mide tres metros.', 'Mede três metros.', 'It\'s three metres long.'],
        ['Il en faut vingt.', 'Hacen falta veinte.', 'São precisos vinte.', 'We need twenty.']
      ] },

    { id: 'temps', n: 'Jours et heures', d: 'Jours, mois, heure, rendez-vous', g: 'voyage', ic: 'clock',
      m: [
        ['lundi', 'lunes', 'segunda-feira', 'Monday'], ['mardi', 'martes', 'terça-feira', 'Tuesday'], ['mercredi', 'miércoles', 'quarta-feira', 'Wednesday'],
        ['jeudi', 'jueves', 'quinta-feira', 'Thursday'], ['vendredi', 'viernes', 'sexta-feira', 'Friday'], ['samedi', 'sábado', 'sábado', 'Saturday'],
        ['dimanche', 'domingo', 'domingo', 'Sunday'],
        ['aujourd\'hui', 'hoy', 'hoje', 'today'], ['demain', 'mañana', 'amanhã', 'tomorrow'], ['hier', 'ayer', 'ontem', 'yesterday'],
        ['maintenant', 'ahora', 'agora', 'now'], ['plus tard', 'más tarde', 'mais tarde', 'later'], ['tôt', 'temprano', 'cedo', 'early'], ['tard', 'tarde', 'tarde', 'late'],
        ['le matin', 'la mañana', 'a manhã', 'the morning'], ['l\'après-midi', 'la tarde', 'a tarde', 'the afternoon'], ['la nuit', 'la noche', 'a noite', 'the night'],
        ['la semaine', 'la semana', 'a semana', 'the week'], ['le mois', 'el mes', 'o mês', 'the month'], ['l\'année', 'el año', 'o ano', 'the year'],
        ['l\'heure', 'la hora', 'a hora', 'the hour'], ['la minute', 'el minuto', 'o minuto', 'the minute'],
        ['janvier', 'enero', 'janeiro', 'January'], ['février', 'febrero', 'fevereiro', 'February'], ['mars', 'marzo', 'março', 'March'], ['avril', 'abril', 'abril', 'April'],
        ['mai', 'mayo', 'maio', 'May'], ['juin', 'junio', 'junho', 'June'], ['juillet', 'julio', 'julho', 'July'], ['août', 'agosto', 'agosto', 'August'],
        ['septembre', 'septiembre', 'setembro', 'September'], ['octobre', 'octubre', 'outubro', 'October'], ['novembre', 'noviembre', 'novembro', 'November'], ['décembre', 'diciembre', 'dezembro', 'December']
      ],
      p: [
        ['Quelle heure est-il ?', '¿Qué hora es?', 'Que horas são?', 'What time is it?'],
        ['Il est huit heures.', 'Son las ocho.', 'São oito horas.', 'It\'s eight o\'clock.'],
        ['À quelle heure ?', '¿A qué hora?', 'A que horas?', 'At what time?'],
        ['On commence à sept heures et demie.', 'Empezamos a las siete y media.', 'Começamos às sete e meia.', 'We start at half past seven.'],
        ['Demain, c\'est lundi.', 'Mañana es lunes.', 'Amanhã é segunda-feira.', 'Tomorrow is Monday.'],
        ['À tout à l\'heure.', 'Hasta luego.', 'Até logo.', 'See you later.']
      ] },

    { id: 'transports', n: 'Voyage : transports', d: 'Avion, train, bus, voiture', g: 'voyage', ic: 'plane',
      m: [
        ['l\'aéroport', 'el aeropuerto', 'o aeroporto', 'the airport'], ['l\'avion', 'el avión', 'o avião', 'the plane'], ['le vol', 'el vuelo', 'o voo', 'the flight'],
        ['le billet', 'el billete', 'o bilhete', 'the ticket'], ['le passeport', 'el pasaporte', 'o passaporte', 'the passport'], ['la valise', 'la maleta', 'a mala', 'the suitcase'],
        ['les bagages', 'el equipaje', 'a bagagem', 'the luggage'], ['la gare', 'la estación', 'a estação', 'the station'], ['le train', 'el tren', 'o comboio', 'the train'],
        ['le bus', 'el autobús', 'o autocarro', 'the bus'], ['le métro', 'el metro', 'o metro', 'the underground'], ['le taxi', 'el taxi', 'o táxi', 'the taxi'],
        ['la voiture', 'el coche', 'o carro', 'the car'], ['l\'essence', 'la gasolina', 'a gasolina', 'the petrol'], ['le gazole', 'el gasóleo', 'o gasóleo', 'the diesel'],
        ['le départ', 'la salida', 'a partida', 'the departure'], ['l\'arrivée', 'la llegada', 'a chegada', 'the arrival'], ['le retard', 'el retraso', 'o atraso', 'the delay'],
        ['l\'aller-retour', 'la ida y vuelta', 'a ida e volta', 'the return ticket'], ['la route', 'la carretera', 'a estrada', 'the road']
      ],
      p: [
        ['Un billet pour le centre-ville, s\'il vous plaît.', 'Un billete para el centro, por favor.', 'Um bilhete para o centro, por favor.', 'A ticket to the town centre, please.'],
        ['À quelle heure part le train ?', '¿A qué hora sale el tren?', 'A que horas parte o comboio?', 'What time does the train leave?'],
        ['Où est la gare ?', '¿Dónde está la estación?', 'Onde fica a estação?', 'Where is the station?'],
        ['Mon vol est en retard.', 'Mi vuelo lleva retraso.', 'O meu voo está atrasado.', 'My flight is delayed.'],
        ['J\'ai perdu ma valise.', 'He perdido mi maleta.', 'Perdi a minha mala.', 'I\'ve lost my suitcase.'],
        ['Je voudrais louer une voiture.', 'Quisiera alquilar un coche.', 'Queria alugar um carro.', 'I\'d like to hire a car.'],
        ['Le plein, s\'il vous plaît.', 'Lleno, por favor.', 'Encha o depósito, por favor.', 'Fill it up, please.']
      ] },

    { id: 'hotel', n: 'Voyage : hôtel', d: 'Réserver, la chambre, le petit-déjeuner', g: 'voyage', ic: 'bed',
      m: [
        ['l\'hôtel', 'el hotel', 'o hotel', 'the hotel'], ['la chambre', 'la habitación', 'o quarto', 'the room'], ['la réservation', 'la reserva', 'a reserva', 'the booking'],
        ['la clé', 'la llave', 'a chave', 'the key'], ['le lit', 'la cama', 'a cama', 'the bed'], ['la douche', 'la ducha', 'o duche', 'the shower'],
        ['les toilettes', 'el baño', 'a casa de banho', 'the toilets'], ['le petit-déjeuner', 'el desayuno', 'o pequeno-almoço', 'the breakfast'],
        ['la serviette', 'la toalla', 'a toalha', 'the towel'], ['l\'ascenseur', 'el ascensor', 'o elevador', 'the lift'], ['l\'étage', 'la planta', 'o andar', 'the floor'],
        ['la réception', 'la recepción', 'a receção', 'the reception'], ['le mot de passe', 'la contraseña', 'a palavra-passe', 'the password'], ['le téléphone portable', 'el móvil', 'o telemóvel', 'the mobile phone']
      ],
      p: [
        ['J\'ai une réservation.', 'Tengo una reserva.', 'Tenho uma reserva.', 'I have a booking.'],
        ['Pour trois nuits.', 'Para tres noches.', 'Para três noites.', 'For three nights.'],
        ['À quelle heure est le petit-déjeuner ?', '¿A qué hora es el desayuno?', 'A que horas é o pequeno-almoço?', 'What time is breakfast?'],
        ['Quel est le mot de passe du wifi ?', '¿Cuál es la contraseña del wifi?', 'Qual é a palavra-passe do wi-fi?', 'What\'s the wifi password?'],
        ['La douche ne marche pas.', 'La ducha no funciona.', 'O duche não funciona.', 'The shower doesn\'t work.'],
        ['Avez-vous une chambre libre ?', '¿Tiene una habitación libre?', 'Tem um quarto livre?', 'Do you have a room available?']
      ] },

    { id: 'repas', n: 'Restaurant et courses', d: 'Commander, payer, faire ses courses', g: 'voyage', ic: 'food',
      m: [
        ['le restaurant', 'el restaurante', 'o restaurante', 'the restaurant'], ['la table', 'la mesa', 'a mesa', 'the table'], ['le menu, la carte', 'la carta', 'a ementa', 'the menu'],
        ['l\'addition', 'la cuenta', 'a conta', 'the bill'], ['l\'eau', 'el agua', 'a água', 'the water'], ['le pain', 'el pan', 'o pão', 'the bread'], ['le vin', 'el vino', 'o vinho', 'the wine'],
        ['la bière', 'la cerveza', 'a cerveja', 'the beer'], ['le café', 'el café', 'o café', 'the coffee'], ['le poisson', 'el pescado', 'o peixe', 'the fish'],
        ['la viande', 'la carne', 'a carne', 'the meat'], ['le poulet', 'el pollo', 'o frango', 'the chicken'], ['les légumes', 'las verduras', 'os legumes', 'the vegetables'],
        ['le fromage', 'el queso', 'o queijo', 'the cheese'], ['le dessert', 'el postre', 'a sobremesa', 'the dessert'], ['le supermarché', 'el supermercado', 'o supermercado', 'the supermarket'],
        ['la boulangerie', 'la panadería', 'a padaria', 'the bakery'], ['la pharmacie', 'la farmacia', 'a farmácia', 'the chemist\'s'], ['cher', 'caro', 'caro', 'expensive'],
        ['pas cher', 'barato', 'barato', 'cheap'], ['la carte bancaire', 'la tarjeta', 'o cartão', 'the bank card'], ['l\'argent liquide', 'el efectivo', 'o dinheiro', 'cash']
      ],
      p: [
        ['Une table pour deux, s\'il vous plaît.', 'Una mesa para dos, por favor.', 'Uma mesa para dois, por favor.', 'A table for two, please.'],
        ['L\'addition, s\'il vous plaît.', 'La cuenta, por favor.', 'A conta, por favor.', 'The bill, please.'],
        ['Je voudrais un café.', 'Quisiera un café.', 'Queria um café.', 'I\'d like a coffee.'],
        ['Je peux payer par carte ?', '¿Puedo pagar con tarjeta?', 'Posso pagar com cartão?', 'Can I pay by card?'],
        ['C\'est très bon !', '¡Está muy bueno!', 'Está muito bom!', 'It\'s delicious!'],
        ['Sans viande, s\'il vous plaît.', 'Sin carne, por favor.', 'Sem carne, por favor.', 'Without meat, please.'],
        ['De l\'eau, s\'il vous plaît.', 'Agua, por favor.', 'Água, por favor.', 'Some water, please.']
      ] },

    { id: 'ville', n: 'En ville', d: 'Demander son chemin, les lieux', g: 'voyage', ic: 'map',
      m: [
        ['la rue', 'la calle', 'a rua', 'the street'], ['la place', 'la plaza', 'a praça', 'the square'], ['à gauche', 'a la izquierda', 'à esquerda', 'on the left'],
        ['à droite', 'a la derecha', 'à direita', 'on the right'], ['tout droit', 'todo recto', 'sempre em frente', 'straight on'], ['près', 'cerca', 'perto', 'near'],
        ['loin', 'lejos', 'longe', 'far'], ['ici', 'aquí', 'aqui', 'here'], ['là-bas', 'allí', 'ali', 'over there'], ['la banque', 'el banco', 'o banco', 'the bank'],
        ['la poste', 'correos', 'os correios', 'the post office'], ['l\'hôpital', 'el hospital', 'o hospital', 'the hospital'], ['le plan', 'el mapa', 'o mapa', 'the map'],
        ['le parking', 'el aparcamiento', 'o parque de estacionamento', 'the car park'], ['le feu rouge', 'el semáforo', 'o semáforo', 'the traffic lights'],
        ['le carrefour', 'el cruce', 'o cruzamento', 'the crossroads'], ['la plage', 'la playa', 'a praia', 'the beach'], ['le musée', 'el museo', 'o museu', 'the museum'],
        ['l\'église', 'la iglesia', 'a igreja', 'the church']
      ],
      p: [
        ['Où sont les toilettes ?', '¿Dónde están los servicios?', 'Onde é a casa de banho?', 'Where are the toilets?'],
        ['C\'est loin ?', '¿Está lejos?', 'É longe?', 'Is it far?'],
        ['Tournez à gauche.', 'Gire a la izquierda.', 'Vire à esquerda.', 'Turn left.'],
        ['Continuez tout droit.', 'Siga todo recto.', 'Siga sempre em frente.', 'Go straight on.'],
        ['Je suis perdu.', 'Me he perdido.', 'Estou perdido.', 'I\'m lost.'],
        ['Pouvez-vous me montrer sur le plan ?', '¿Me lo puede indicar en el mapa?', 'Pode mostrar-me no mapa?', 'Can you show me on the map?']
      ] },

    { id: 'sante', n: 'Santé et urgences', d: 'Le corps, le médecin, les secours', g: 'voyage', ic: 'cross',
      m: [
        ['au secours !', '¡socorro!', 'socorro!', 'help!'], ['l\'urgence', 'la urgencia', 'a emergência', 'the emergency'], ['le médecin', 'el médico', 'o médico', 'the doctor'],
        ['l\'ambulance', 'la ambulancia', 'a ambulância', 'the ambulance'], ['la police', 'la policía', 'a polícia', 'the police'], ['les pompiers', 'los bomberos', 'os bombeiros', 'the fire brigade'],
        ['la tête', 'la cabeza', 'a cabeça', 'the head'], ['le dos', 'la espalda', 'as costas', 'the back'], ['le bras', 'el brazo', 'o braço', 'the arm'],
        ['la jambe', 'la pierna', 'a perna', 'the leg'], ['la main', 'la mano', 'a mão', 'the hand'], ['le pied', 'el pie', 'o pé', 'the foot'], ['l\'œil', 'el ojo', 'o olho', 'the eye'],
        ['blessé', 'herido', 'ferido', 'injured'], ['malade', 'enfermo', 'doente', 'ill'], ['le médicament', 'el medicamento', 'o medicamento', 'the medicine'],
        ['la fièvre', 'la fiebre', 'a febre', 'the fever'], ['la brûlure', 'la quemadura', 'a queimadura', 'the burn'], ['la coupure', 'el corte', 'o corte', 'the cut']
      ],
      p: [
        ['Appelez une ambulance !', '¡Llame a una ambulancia!', 'Chame uma ambulância!', 'Call an ambulance!'],
        ['Il y a un blessé.', 'Hay un herido.', 'Há um ferido.', 'Someone is injured.'],
        ['J\'ai mal au dos.', 'Me duele la espalda.', 'Doem-me as costas.', 'My back hurts.'],
        ['J\'ai mal ici.', 'Me duele aquí.', 'Dói-me aqui.', 'It hurts here.'],
        ['Où est la pharmacie ?', '¿Dónde está la farmacia?', 'Onde fica a farmácia?', 'Where is the chemist\'s?'],
        ['Le numéro d\'urgence est le 112.', 'El número de emergencias es el 112.', 'O número de emergência é o 112.', 'The emergency number is 112.']
      ] },

    { id: 'echaf', n: 'Chantier : échafaudage', d: 'Le matériel et le montage', g: 'travail', ic: 'scaf',
      m: [
        ['l\'échafaudage', 'el andamio', 'o andaime', 'the scaffold'], ['le tube', 'el tubo', 'o tubo', 'the tube'], ['le collier', 'la abrazadera', 'a braçadeira', 'the coupler'],
        ['le plancher', 'la plataforma', 'a plataforma', 'the platform'], ['le garde-corps', 'la barandilla', 'o guarda-corpos', 'the guardrail'], ['la plinthe', 'el rodapié', 'o rodapé', 'the toe board'],
        ['la diagonale', 'la diagonal', 'a diagonal', 'the brace'], ['la lisse', 'el larguero', 'a longarina', 'the ledger'], ['le montant', 'el montante', 'o prumo', 'the standard'],
        ['le socle réglable', 'la base regulable', 'a base regulável', 'the base jack'], ['la console', 'la ménsula', 'a consola', 'the bracket'], ['l\'échelle', 'la escalera', 'a escada', 'the ladder'],
        ['la trappe', 'la trampilla', 'o alçapão', 'the hatch'], ['l\'ancrage', 'el anclaje', 'a ancoragem', 'the tie'], ['la clé à cliquet', 'la llave de carraca', 'a chave de roquete', 'the ratchet spanner'],
        ['le niveau', 'el nivel', 'o nível', 'the spirit level'], ['le mètre ruban', 'la cinta métrica', 'a fita métrica', 'the tape measure'], ['le marteau', 'el martillo', 'o martelo', 'the hammer'],
        ['la corde', 'la cuerda', 'a corda', 'the rope'], ['la poulie', 'la polea', 'a roldana', 'the pulley'], ['la charge', 'la carga', 'a carga', 'the load'],
        ['le poids', 'el peso', 'o peso', 'the weight'], ['le montage', 'el montaje', 'a montagem', 'the erection'], ['le démontage', 'el desmontaje', 'a desmontagem', 'the dismantling'],
        ['monter', 'montar', 'montar', 'to put up'], ['démonter', 'desmontar', 'desmontar', 'to take down']
      ],
      p: [
        ['Passe-moi un tube de trois mètres.', 'Pásame un tubo de tres metros.', 'Passa-me um tubo de três metros.', 'Pass me a three-metre tube.'],
        ['Serre le collier.', 'Aprieta la abrazadera.', 'Aperta a braçadeira.', 'Tighten the coupler.'],
        ['Le garde-corps n\'est pas posé.', 'La barandilla no está puesta.', 'O guarda-corpos não está montado.', 'The guardrail isn\'t fitted.'],
        ['Mets la plinthe.', 'Pon el rodapié.', 'Põe o rodapé.', 'Put the toe board on.'],
        ['Vérifie le niveau.', 'Comprueba el nivel.', 'Verifica o nível.', 'Check the level.'],
        ['Il faut ajouter une diagonale.', 'Hay que añadir una diagonal.', 'É preciso pôr uma diagonal.', 'We need to add a brace.'],
        ['Monte la charge avec la poulie.', 'Sube la carga con la polea.', 'Sobe a carga com a roldana.', 'Lift the load with the pulley.'],
        ['Ne monte pas, l\'échafaudage n\'est pas terminé.', 'No subas, el andamio no está terminado.', 'Não subas, o andaime não está terminado.', 'Don\'t climb up, the scaffold isn\'t finished.']
      ] },

    { id: 'calo', n: 'Chantier : calorifuge', d: 'Isolation, tôle, tuyauterie', g: 'travail', ic: 'pipe',
      m: [
        ['l\'isolation thermique', 'el aislamiento térmico', 'o isolamento térmico', 'the thermal insulation'], ['l\'isolant', 'el aislante', 'o isolante', 'the insulating material'],
        ['la laine de roche', 'la lana de roca', 'a lã de rocha', 'the rock wool'], ['la laine de verre', 'la lana de vidrio', 'a lã de vidro', 'the glass wool'],
        ['la tôle', 'la chapa', 'a chapa', 'the sheet metal'], ['l\'aluminium', 'el aluminio', 'o alumínio', 'the aluminium'], ['l\'inox', 'el acero inoxidable', 'o aço inoxidável', 'the stainless steel'],
        ['la tuyauterie', 'la tubería', 'a tubagem', 'the pipework'], ['le coude', 'el codo', 'a curva', 'the bend'], ['la vanne', 'la válvula', 'a válvula', 'the valve'],
        ['la bride', 'la brida', 'a flange', 'the flange'], ['le rivet', 'el remache', 'o rebite', 'the rivet'], ['la vis', 'el tornillo', 'o parafuso', 'the screw'],
        ['la perceuse', 'el taladro', 'o berbequim', 'the drill'], ['la cisaille', 'la cizalla', 'a tesoura de chapa', 'the tin snips'], ['l\'épaisseur', 'el espesor', 'a espessura', 'the thickness'],
        ['le diamètre', 'el diámetro', 'o diâmetro', 'the diameter'], ['chaud', 'caliente', 'quente', 'hot'], ['froid', 'frío', 'frio', 'cold']
      ],
      p: [
        ['Coupe la tôle à cette mesure.', 'Corta la chapa a esta medida.', 'Corta a chapa por esta medida.', 'Cut the sheet to this size.'],
        ['Mets cinquante millimètres d\'isolant.', 'Pon cincuenta milímetros de aislante.', 'Põe cinquenta milímetros de isolante.', 'Put on fifty millimetres of insulation.'],
        ['Attention, le tuyau est chaud !', '¡Cuidado, el tubo está caliente!', 'Cuidado, o tubo está quente!', 'Careful, the pipe is hot!'],
        ['Pose les rivets tous les dix centimètres.', 'Pon los remaches cada diez centímetros.', 'Põe os rebites a cada dez centímetros.', 'Put a rivet every ten centimetres.'],
        ['Quel est le diamètre ?', '¿Cuál es el diámetro?', 'Qual é o diâmetro?', 'What\'s the diameter?']
      ] },

    { id: 'secu', n: 'Chantier : sécurité', d: 'Protections, consignes, dangers', g: 'travail', ic: 'shield',
      m: [
        ['attention !', '¡cuidado!', 'cuidado!', 'watch out!'], ['le danger', 'el peligro', 'o perigo', 'the danger'], ['interdit', 'prohibido', 'proibido', 'forbidden'],
        ['stop !', '¡para!', 'para!', 'stop!'], ['le casque', 'el casco', 'o capacete', 'the hard hat'], ['le harnais', 'el arnés', 'o arnês', 'the harness'],
        ['la longe', 'el cabo de anclaje', 'o talabarte', 'the lanyard'], ['les gants', 'los guantes', 'as luvas', 'the gloves'],
        ['les chaussures de sécurité', 'las botas de seguridad', 'as botas de segurança', 'the safety boots'],
        ['les lunettes de protection', 'las gafas de protección', 'os óculos de proteção', 'the safety glasses'], ['le gilet fluo', 'el chaleco reflectante', 'o colete refletor', 'the hi-vis vest'],
        ['la chute', 'la caída', 'a queda', 'the fall'], ['tomber', 'caer', 'cair', 'to fall'], ['la charge maximale', 'la carga máxima', 'a carga máxima', 'the maximum load'],
        ['l\'accident', 'el accidente', 'o acidente', 'the accident'], ['la trousse de secours', 'el botiquín', 'a caixa de primeiros socorros', 'the first-aid kit'],
        ['le vent', 'el viento', 'o vento', 'the wind'], ['la pluie', 'la lluvia', 'a chuva', 'the rain'], ['glissant', 'resbaladizo', 'escorregadio', 'slippery']
      ],
      p: [
        ['Mets ton casque.', 'Ponte el casco.', 'Põe o capacete.', 'Put your hard hat on.'],
        ['Accroche ton harnais.', 'Engancha el arnés.', 'Prende o arnês.', 'Clip on your harness.'],
        ['Il est interdit de monter.', 'Está prohibido subir.', 'É proibido subir.', 'It\'s forbidden to climb up.'],
        ['Attention, ça glisse !', '¡Cuidado, resbala!', 'Cuidado, escorrega!', 'Careful, it\'s slippery!'],
        ['Trop de vent, on arrête.', 'Hace demasiado viento, paramos.', 'Está muito vento, paramos.', 'It\'s too windy, we\'re stopping.'],
        ['Ne dépasse pas la charge maximale.', 'No superes la carga máxima.', 'Não ultrapasses a carga máxima.', 'Don\'t exceed the maximum load.'],
        ['Où est la trousse de secours ?', '¿Dónde está el botiquín?', 'Onde está a caixa de primeiros socorros?', 'Where is the first-aid kit?']
      ] },

    { id: 'travail', n: 'Travail et formation', d: 'Horaires, équipe, consignes de formateur', g: 'travail', ic: 'work',
      m: [
        ['le travail', 'el trabajo', 'o trabalho', 'the work'], ['le chantier', 'la obra', 'a obra', 'the building site'], ['le chef d\'équipe', 'el jefe de equipo', 'o chefe de equipa', 'the foreman'],
        ['le collègue', 'el compañero', 'o colega', 'the colleague'], ['le stagiaire', 'el alumno', 'o formando', 'the trainee'], ['la formation', 'la formación', 'a formação', 'the training'],
        ['la pause', 'el descanso', 'a pausa', 'the break'], ['le repas', 'la comida', 'a refeição', 'the meal'], ['l\'horaire', 'el horario', 'o horário', 'the working hours'],
        ['le contrat', 'el contrato', 'o contrato', 'the contract'], ['le salaire', 'el sueldo', 'o salário', 'the wages'], ['le vestiaire', 'el vestuario', 'o balneário', 'the changing room'],
        ['l\'outil', 'la herramienta', 'a ferramenta', 'the tool'], ['le camion', 'el camión', 'o camião', 'the lorry'], ['la grue', 'la grúa', 'a grua', 'the crane'],
        ['commencer', 'empezar', 'começar', 'to start'], ['finir', 'terminar', 'acabar', 'to finish'], ['aider', 'ayudar', 'ajudar', 'to help'],
        ['expliquer', 'explicar', 'explicar', 'to explain'], ['montrer', 'enseñar', 'mostrar', 'to show'], ['comprendre', 'entender', 'perceber', 'to understand']
      ],
      p: [
        ['On commence à quelle heure ?', '¿A qué hora empezamos?', 'A que horas começamos?', 'What time do we start?'],
        ['On fait une pause de quinze minutes.', 'Hacemos una pausa de quince minutos.', 'Fazemos uma pausa de quinze minutos.', 'We\'re taking a fifteen-minute break.'],
        ['Je vais vous montrer.', 'Les voy a enseñar.', 'Vou mostrar-vos.', 'I\'m going to show you.'],
        ['Vous avez compris ?', '¿Lo han entendido?', 'Perceberam?', 'Have you understood?'],
        ['Regardez bien.', 'Miren bien.', 'Vejam bem.', 'Watch carefully.'],
        ['À vous de faire.', 'Ahora les toca a ustedes.', 'Agora é a vossa vez.', 'Now it\'s your turn.'],
        ['Bon travail !', '¡Buen trabajo!', 'Bom trabalho!', 'Good job!'],
        ['Demain, rendez-vous à sept heures sur le chantier.', 'Mañana, nos vemos a las siete en la obra.', 'Amanhã, encontramo-nos às sete na obra.', 'Tomorrow, meet at seven o\'clock on site.']
      ] }
  ]
};
