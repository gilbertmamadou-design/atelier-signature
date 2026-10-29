/* =====================================================================
   Suite MAG — annuler / rétablir sans limite pratique (instantanés partagés).
   const h = Office.History({ parts: () => ['…json…', …], restore: (parts, label) => {}, onChange })
   parts() découpe l'état en morceaux JSON (ex. une chaîne par diapositive) : un morceau inchangé
   n'est pas recopié en mémoire d'un instantané à l'autre, ce qui permet de garder des milliers d'étapes.
   h.commit(libellé) · h.undo() · h.redo() · h.canUndo() · h.canRedo() · h.undoLabel() · h.reset()
   ===================================================================== */
(function () {
  'use strict';
  const O = window.Office;
  O.History = function (cfg) {
    const H = { past: [], future: [], max: cfg.max || 5000 };
    let cur = null;
    function snap() {
      const p = cfg.parts();
      if (cur) for (let i = 0; i < p.length; i++) { const j = cur.parts.indexOf(p[i]); if (j >= 0) p[i] = cur.parts[j]; }
      return p;
    }
    function same(a, b) { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
    H.reset = function () { H.past = []; H.future = []; cur = { parts: snap(), label: '' }; cfg.onChange && cfg.onChange(); };
    /** Enregistre l'état actuel comme nouvelle étape (rien si inchangé) */
    H.commit = function (label) {
      const p = snap();
      if (cur && same(p, cur.parts)) return false;
      if (cur) H.past.push(cur);
      if (H.past.length > H.max) H.past.shift();
      cur = { parts: p, label: label || '' };
      H.future = [];
      cfg.onChange && cfg.onChange();
      return true;
    };
    H.undo = function () {
      if (!H.past.length) return false;
      // l'état courant non enregistré est d'abord gardé (frappe en cours)
      const p = snap(); if (cur && !same(p, cur.parts)) { H.past.push(cur); cur = { parts: p, label: 'Saisie' }; }
      H.future.push(cur); cur = H.past.pop();
      cfg.restore(cur.parts.slice(), H.future[H.future.length - 1].label);
      cfg.onChange && cfg.onChange();
      return true;
    };
    H.redo = function () {
      if (!H.future.length) return false;
      H.past.push(cur); cur = H.future.pop();
      cfg.restore(cur.parts.slice(), cur.label);
      cfg.onChange && cfg.onChange();
      return true;
    };
    H.canUndo = () => H.past.length > 0;
    H.canRedo = () => H.future.length > 0;
    H.undoLabel = () => cur && H.past.length ? cur.label : '';
    H.redoLabel = () => H.future.length ? H.future[H.future.length - 1].label : '';
    H.size = () => H.past.length;
    return H;
  };
})();
