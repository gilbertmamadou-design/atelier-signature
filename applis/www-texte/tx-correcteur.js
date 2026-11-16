/* Texte — correcteur de français (Grammalecte, hors ligne, module commun correcteur/correcteur.js) branché sur l'éditeur :
   le texte des paragraphes (y compris dans les tableaux) est lu dans le document ProseMirror, chaque correction est une
   transaction normale (annulable par Ctrl+Z, suivie si le suivi des modifications est actif). Révision › Grammaire et
   orthographe, ou F7. */
(function () {
  'use strict';
  const TX = window.Texte, A = window.TexteApp = window.TexteApp || {};
  const { TextSelection } = PM.state;
  const OBJ = '￼';   // objet (image, forme, champ) : un caractère, pour garder les positions
  /** Adaptateur pour MagCorrecteur : texte du document et correspondance avec les positions ProseMirror */
  TX.correcteurAdapter = function (getView) {
    let map = [];
    function build() {
      const v = getView(), doc = v.state.doc; let txt = '', first = true; map = [];
      doc.descendants((node, pos) => {
        if (!node.isTextblock) return true;
        if (!first) txt += '\n'; first = false;
        node.forEach((ch, off) => {
          const p = pos + 1 + off;
          if (ch.isText) { map.push([txt.length, p, ch.text.length]); txt += ch.text; }
          else { map.push([txt.length, p, 1, ch.nodeSize]); txt += OBJ; }
        });
        map.push([txt.length, pos + node.nodeSize - 1, 0]);   // fin du paragraphe
        return false;
      });
      return txt;
    }
    function toPm(o) {
      for (let i = 0; i < map.length; i++) { const m = map[i]; if (o >= m[0] && o <= m[0] + m[2]) return m[3] ? (o === m[0] ? m[1] : m[1] + m[3]) : m[1] + (o - m[0]); }
      return null;
    }
    return {
      label: 'Document',
      getText: build,
      replace(s, e, t) {
        build(); const v = getView(), a = toPm(s), b = toPm(e); if (a == null || b == null) return;
        const tr = v.state.tr.insertText(t, a, b); tr.setSelection(TextSelection.create(tr.doc, a + t.length));
        v.dispatch(tr.scrollIntoView().setMeta('tx-label', 'Correction')); v.focus();
      },
      select(s, e) {
        build(); const v = getView(), a = toPm(s), b = toPm(e); if (a == null || b == null) return;
        try { v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, a, b)).scrollIntoView()); } catch (x) { }
      }
    };
  };
  A.correcteur = function () {
    const M = window.MagCorrecteur;
    if (!M) { window.Office && Office.toast && Office.toast('Correcteur indisponible dans cette version.', { bad: true }); return; }
    const sel = A.ed && A.ed.view.state.selection;
    M.open(TX.correcteurAdapter(() => A.ed.view), { title: 'Grammaire et orthographe' });
    void sel;
  };
  // F7 dans le document : l'adaptateur ProseMirror (pas le champ modifiable brut) ; pas de petit bouton flottant dans Texte
  document.addEventListener('DOMContentLoaded', () => {
    document.body.setAttribute('data-mgc', 'off');
    if (window.MagCorrecteur) MagCorrecteur.hotkey(() => (A.ed && document.activeElement && A.ed.view.dom.contains(document.activeElement) ? TX.correcteurAdapter(() => A.ed.view) : null));
  });
  A.dictionnaire = function () {
    const M = window.MagCorrecteur; if (!M) return;
    const v = A.ed && A.ed.view, s = v ? v.state.doc.textBetween(v.state.selection.from, v.state.selection.to, ' ').trim().split(/\s+/)[0] : '';
    M.dico(s || '');
  };
})();
