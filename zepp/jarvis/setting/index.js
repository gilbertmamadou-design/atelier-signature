/*
 * Réglages de Jarvis, dans l'appli Zepp du téléphone (Profil › la montre › Jarvis › Réglages).
 * Le jeton vient de Majordome › Réglages › Montre connectée (bouton « Copier »), il est gardé ici, sur le téléphone.
 */
AppSettingsPage({
  build(props) {
    const s = props.settingsStorage
    const get = (k) => s.getItem(k) || ''
    const champ = (cle, label, aide) =>
      TextInput({
        label,
        placeholder: aide,
        value: get(cle),
        onChange: (v) => s.setItem(cle, String(v || '').trim()),
      })
    const petit = (t) => Text({ paragraph: true, style: { fontSize: '12px', color: '#666', marginTop: '4px' } }, t)
    const jeton = get('jeton').replace(/[\s-]/g, '')
    const secours = get('hueSecours') === 'true'
    const blocs = [
      Text({ bold: true, paragraph: true }, 'Jarvis · liaison avec Majordome'),
      petit('Dans Majordome : Réglages › Montre connectée › activez l\'option, puis « Copier » le jeton et collez-le ici.'),
      champ('jeton', 'Jeton de Majordome', 'XXXX-XXXX-XXXX-XXXX-XXXX'),
      petit(jeton.length >= 16 ? 'Jeton enregistré (' + jeton.length + ' caractères).' : 'Pas encore de jeton : Jarvis ne peut rien demander à Majordome.'),
      champ('port', 'Port (le même que dans Majordome)', '47615'),
      petit('Jarvis ne parle qu\'à Majordome sur ce téléphone (adresse 127.0.0.1) : rien ne sort sur internet.'),
      Toggle({
        label: 'Secours lumières : pont Hue en direct si Majordome ne répond pas',
        value: secours,
        onChange: (v) => s.setItem('hueSecours', v ? 'true' : 'false'),
      }),
    ]
    if (secours) {
      blocs.push(
        champ('hueIp', 'Adresse IP du pont Hue', '192.168.1.20'),
        petit('Appuyez sur le bouton rond du pont Hue, puis touchez « Jumeler » dans les 30 secondes. Le secours utilise l\'API v1 du pont en http, sur le Wi-Fi de la maison seulement.'),
        Button({ label: 'Jumeler le pont Hue', onClick: () => s.setItem('huePair', String(Date.now())) }),
        petit(get('huePairMsg') || (get('hueKey') ? 'Pont jumelé pour le secours.' : 'Pas encore jumelé.')),
        Button({ label: 'Oublier la clé du pont', onClick: () => { s.setItem('hueKey', ''); s.setItem('huePairMsg', 'Clé oubliée.') } }),
      )
    }
    return View({ style: { padding: '12px 20px' } }, blocs)
  },
})
