/* =====================================================================
   Suite MAG — export PDF commun (jsPDF 2.5.1, MIT, vendorisé : jspdf.umd.min.js).
   Office.Pdf.pages(images, {w, h, title})            une page par image (taille de page = format de l'image, en points)
   Office.Pdf.handouts(images, {perPage, notes, title, footer, numbers, date, orientation})
        perPage : 1, 2, 3 (avec lignes pour prendre des notes), 4, 6, 9 ; perPage 'notes' : diapo + commentaires dessous
   Office.Pdf.safe(texte)                             caractères gardés lisibles avec les polices standard du PDF
   images : [{src (data: URL JPEG/PNG), w, h}]
   ===================================================================== */
(function () {
  'use strict';
  const O = window.Office;
  const P = O.Pdf = { src: 'jspdf.umd.min.js' };   // relatif à O.vendor
  P.load = async function () { if (!(window.jspdf && window.jspdf.jsPDF)) await O.loadScript(O.vendor + P.src); return window.jspdf.jsPDF; };
  // jsPDF (polices standard) n'écrit que le jeu Windows-1252 : les autres signes sont remplacés par un équivalent
  const MAP = { '→': '->', '←': '<-', '⇒': '=>', '✔': 'v', '✓': 'v', '✗': 'x', '✘': 'x', '➤': '>', '►': '>', '▶': '>', '◆': '*', '★': '*', '☆': '*', '●': '•', '○': 'o', '■': '•', '□': 'o', '≤': '<=', '≥': '>=', '≠': '!=', '×': 'x', '÷': '/', ' ': ' ', ' ': ' ', ' ': ' ', '​': '' };
  P.safe = (s) => String(s || '').replace(/[^\x00-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, (c) => MAP[c] != null ? MAP[c] : '?');
  P.pages = async function (images, opt) {
    opt = opt || {};
    const J = await P.load();
    const w0 = opt.w || 960, h0 = opt.h || 540;
    const pw = 720, ph = pw * h0 / w0;   // 10 pouces de large (comme une diapo 4:3 / 16:9 imprimée)
    const doc = new J({ orientation: pw >= ph ? 'landscape' : 'portrait', unit: 'pt', format: [pw, ph], compress: true });
    images.forEach((im, i) => { if (i) doc.addPage([pw, ph], pw >= ph ? 'landscape' : 'portrait'); doc.addImage(im.src, fmt(im.src), 0, 0, pw, ph, undefined, 'FAST'); });
    meta(doc, opt);
    return doc.output('blob');
  };
  function fmt(src) { return /^data:image\/png/.test(src) ? 'PNG' : 'JPEG'; }
  function meta(doc, opt) { doc.setProperties({ title: P.safe(opt.title || ''), subject: P.safe(opt.subject || ''), author: P.safe(opt.author || ''), creator: 'Suite MAG' }); }
  P.handouts = async function (images, opt) {
    opt = opt || {};
    const J = await P.load();
    const per = opt.perPage || 3, land = opt.orientation === 'landscape' && per !== 'notes' && per !== 3;
    const doc = new J({ orientation: land ? 'landscape' : 'portrait', unit: 'pt', format: 'a4', compress: true });
    const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 36;
    const ratio = (opt.h || 540) / (opt.w || 960);
    const head = (page, total) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110);
      if (opt.header) doc.text(P.safe(opt.header), M, 22);
      if (opt.date) doc.text(P.safe(opt.date), PW - M, 22, { align: 'right' });
      if (opt.footer) doc.text(P.safe(opt.footer), M, PH - 16);
      if (opt.numbers !== false) doc.text(page + ' / ' + total, PW - M, PH - 16, { align: 'right' });
    };
    const box = (im, x, y, w, h) => { doc.addImage(im.src, fmt(im.src), x, y, w, h, undefined, 'FAST'); doc.setDrawColor(170); doc.setLineWidth(0.6); doc.rect(x, y, w, h); };
    const N = images.length;
    if (per === 'notes') {
      images.forEach((im, i) => {
        if (i) doc.addPage();
        const w = PW - 2 * M, h = w * ratio; box(im, M, M + 12, w, h);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(30);
        const notes = P.safe((opt.notes && opt.notes[i]) || '');
        const lines = doc.splitTextToSize(notes, w);
        let y = M + 12 + h + 24; const lh = 15;
        lines.forEach((l) => { if (y > PH - M - 10) { doc.addPage(); y = M + 12; } doc.text(l, M, y); y += lh; });
        head(i + 1, N);
      });
    } else {
      const layout = {
        1: { cols: 1, rows: 1 }, 2: { cols: 1, rows: 2 }, 3: { cols: 1, rows: 3, lines: true }, 4: { cols: 2, rows: 2 }, 6: { cols: 2, rows: 3 }, 9: { cols: 3, rows: 3 }
      }[per] || { cols: 1, rows: 3, lines: true };
      const pages = Math.ceil(N / (layout.cols * layout.rows));
      const top = M + 14, bottom = PH - M - 6, avW = PW - 2 * M, avH = bottom - top;
      const cellW = layout.lines ? avW * 0.48 : avW / layout.cols, cellH = avH / layout.rows;
      let w = cellW - 18, h = w * ratio; if (h > cellH - 18) { h = cellH - 18; w = h / ratio; }
      for (let p = 0; p < pages; p++) {
        if (p) doc.addPage();
        for (let r = 0; r < layout.rows; r++) for (let c = 0; c < layout.cols; c++) {
          const i = p * layout.cols * layout.rows + r * layout.cols + c; if (i >= N) break;
          const x = M + c * cellW + (cellW - w) / 2 * (layout.lines ? 0 : 1), y = top + r * cellH + (cellH - h) / 2;
          box(images[i], layout.lines ? M : x, y, w, h);
          if (layout.lines) {
            doc.setDrawColor(190); doc.setLineWidth(0.5);
            const lx = M + w + 24, n = Math.max(3, Math.floor(h / 22));
            for (let k = 1; k <= n; k++) { const ly = y + k * (h / n); doc.line(lx, ly, PW - M, ly); }
          }
          if (opt.notesUnder && opt.notes && opt.notes[i]) { doc.setFontSize(8); doc.setTextColor(60); const ls = doc.splitTextToSize(P.safe(opt.notes[i]), w).slice(0, 3); ls.forEach((l, k) => doc.text(l, layout.lines ? M : x, y + h + 10 + k * 9)); }
        }
        head(p + 1, pages);
      }
    }
    meta(doc, opt);
    return doc.output('blob');
  };
  /** Texte simple sur plusieurs pages (rapports, listes) — utile à Texte et à Tableur */
  P.textDoc = async function (blocks, opt) {
    opt = opt || {};
    const J = await P.load();
    const doc = new J({ unit: 'pt', format: 'a4', compress: true });
    const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 50;
    let y = M;
    blocks.forEach((b) => {
      const size = b.size || 11; doc.setFont('helvetica', b.bold ? 'bold' : 'normal'); doc.setFontSize(size);
      const ls = doc.splitTextToSize(P.safe(b.text || ''), PW - 2 * M);
      ls.forEach((l) => { if (y > PH - M) { doc.addPage(); y = M; } doc.text(l, M, y); y += size * 1.35; });
      y += b.after || 6;
    });
    meta(doc, opt);
    return doc.output('blob');
  };
})();
