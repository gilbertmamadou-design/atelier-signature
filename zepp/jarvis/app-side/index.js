/*
 * Side Service de Jarvis : tourne dans l'appli Zepp du téléphone. Il reçoit les demandes de la montre (zml,
 * Bluetooth) et les transmet à Majordome par http://127.0.0.1:<port> avec le jeton (voir shared/proto.js).
 * L'audio arrive en binaire (« JVA1 » + Opus), part en base64 vers Majordome qui le reconnaît avec Vosk.
 */
import { BaseSideService, settingsLib } from '@zeppos/zml/base-side'
import { createClient } from '../shared/proto'

const client = createClient({
  fetch: (o) => fetch(o),
  get: (k) => settingsLib.getItem(k),
  set: (k, v) => settingsLib.setItem(k, v),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
})

AppSideService(
  BaseSideService({
    onInit() {},
    onRun() {},
    onDestroy() {},
    onRequest(req, res) {
      const binaire = req instanceof ArrayBuffer || (req && req.byteLength !== undefined && !req.method)
      const travail = binaire ? client.audio(req) : client.handle(req && req.method, (req && req.params) || {})
      travail.then((r) => res(null, r)).catch((e) => res(null, { ok: false, texte: 'Erreur du téléphone : ' + String(e && e.message ? e.message : e) }))
    },
    // Réglages de Jarvis (appli Zepp) : « Jumeler le pont Hue » écrit huePair ; on tente alors le jumelage
    onSettingsChange({ key, newValue }) {
      if (key === 'huePair' && newValue) client.huePair()
    },
  }),
)
