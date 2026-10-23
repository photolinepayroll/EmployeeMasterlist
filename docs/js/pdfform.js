/**
 * pdfform.js — builds the HR "application PDF" in the browser with pdf-lib:
 * filled form, attachment requirements checklist, then the uploaded documents (images and PDFs).
 * Used by admin.js; nothing is sent to the server except the per-document fetches HR already makes.
 */
function loadPdfLib() {
  return new Promise((res, rej) => {
    if (window.PDFLib) return res(window.PDFLib);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
    s.onload = () => res(window.PDFLib); s.onerror = () => rej(new Error('PDF library failed to load. Check your connection and try again.'));
    document.head.appendChild(s);
  });
}

/**
 * @param {Object} B    adminBootstrap data (applicantSpec, adminSpec, steps)
 * @param {Object} cur  getApplication result (record, files, Status, EmpStatus...)
 * @param {Function} loadFile  admin.js loader: item -> Promise<{blob, mime, name}>
 * @param {Function} onProgress  (done, total, text)
 * @return {Promise<Blob>}
 */
async function buildApplicationPdf(B, cur, loadFile, onProgress) {
  const L = await loadPdfLib();
  const { PDFDocument, StandardFonts, rgb } = L;
  const progress = onProgress || function () {};
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 44;
  const BLUE = rgb(0.06, 0.3, 0.51), INK = rgb(0.1, 0.12, 0.16), GREY = rgb(0.42, 0.45, 0.5), RED = rgb(0.72, 0.1, 0.1), GREEN = rgb(0.08, 0.5, 0.25);
  const own = [];   // pages drawn here (they get the footer)
  const rec = cur.record || {};

  const safe = s => String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
  function wrap(text, f, size, maxW) {
    const out = [];
    safe(text).split(/\r?\n/).forEach(par => {
      let line = '';
      par.split(/\s+/).forEach(word => {
        while (f.widthOfTextAtSize(word, size) > maxW) {   // break very long tokens
          let n = word.length; while (n > 1 && f.widthOfTextAtSize(word.slice(0, n), size) > maxW) n--;
          if (line) { out.push(line); line = ''; }
          out.push(word.slice(0, n)); word = word.slice(n);
        }
        const t = line ? line + ' ' + word : word;
        if (line && f.widthOfTextAtSize(t, size) > maxW) { out.push(line); line = word; } else line = t;
      });
      out.push(line);
    });
    return out;
  }

  let logo = null;
  try {
    const r = await fetch('img/logo.png');
    if (r.ok) logo = await doc.embedPng(await r.arrayBuffer());
  } catch (e) { /* header works without the logo */ }

  let page, y;
  function newPage(title) {
    page = doc.addPage([W, H]); own.push(page);
    let x = M;
    if (logo) { const k = 30 / logo.height; page.drawImage(logo, { x: M, y: H - M - 30, width: logo.width * k, height: 30 }); x = M + logo.width * k + 10; }
    page.drawText('Photoline HR Portal', { x, y: H - M - 12, size: 13, font: bold, color: BLUE });
    page.drawText(safe(title || 'Employee Application Form'), { x, y: H - M - 27, size: 9, font, color: GREY });
    page.drawLine({ start: { x: M, y: H - M - 38 }, end: { x: W - M, y: H - M - 38 }, thickness: 1, color: BLUE });
    y = H - M - 56;
  }
  const need = h => { if (y - h < M + 24) newPage(); };
  function heading(text) {
    need(40);
    page.drawRectangle({ x: M, y: y - 17, width: W - 2 * M, height: 20, color: rgb(0.9, 0.94, 0.98) });
    page.drawText(safe(text), { x: M + 8, y: y - 11, size: 10.5, font: bold, color: BLUE });
    y -= 30;
  }
  function pair(label, value) {
    const lines = wrap(value === '' || value == null ? '-' : value, font, 10, W - 2 * M - 170);
    need(lines.length * 13 + 4);
    wrap(label, font, 9, 150).slice(0, 2).forEach((l, i) => page.drawText(l, { x: M + 4, y: y - i * 11, size: 9, font, color: GREY }));
    lines.forEach((l, i) => page.drawText(l, { x: M + 170, y: y - i * 13, size: 10, font, color: INK }));
    y -= Math.max(lines.length * 13, 13) + 5;
  }

  /* ---------- 1. form ---------- */
  const name = [rec.FirstName, rec.MiddleName, rec.LastName, rec.Suffix].filter(Boolean).join(' ');
  newPage('Employee Application Form');
  page.drawText(safe(name || '(name not filled in)'), { x: M, y, size: 16, font: bold, color: INK }); y -= 20;
  const meta = ['Reference ' + cur.AppID, rec.BioID ? 'Bio ID ' + rec.BioID : '', 'Application status: ' + cur.Status,
    cur.Status === 'APPROVED' ? 'Employment: ' + (cur.EmpStatus || 'ACTIVE') + (cur.EmpStatusDate ? ' (' + cur.EmpStatusDate + ')' : '') : '',
    'Printed ' + todayStr()].filter(Boolean).join('   |   ');
  wrap(meta, font, 9, W - 2 * M).forEach(l => { page.drawText(l, { x: M, y, size: 9, font, color: GREY }); y -= 12; });
  y -= 8;

  const plain = B.applicantSpec.filter(f => f.type !== 'file' && f.type !== 'files');
  (B.steps || []).forEach((stepName, i) => {
    const fields = plain.filter(f => f.step === i + 1);
    if (!fields.length) return;
    heading(stepName);
    fields.forEach(f => pair(f.label, rec[f.k]));
    y -= 4;
  });
  heading('HR admin entry');
  B.adminSpec.forEach(f => pair(f.label, rec[f.k]));
  y -= 14;
  need(70);
  [['Applicant signature', M], ['HR officer', M + 180], ['Date', M + 360]].forEach(([t, x]) => {
    page.drawLine({ start: { x, y: y - 28 }, end: { x: x + 150, y: y - 28 }, thickness: 0.7, color: GREY });
    page.drawText(t, { x, y: y - 40, size: 8.5, font, color: GREY });
  });
  y -= 56;

  /* ---------- 2. attachment requirements ---------- */
  const fileSpecs = B.applicantSpec.filter(f => f.type === 'file' || f.type === 'files');
  const listOf = f => { const v = (cur.files || {})[f.k]; return Array.isArray(v) ? v : (v ? [v] : []); };
  const specLabel = k => { const s = B.applicantSpec.find(x => x.k === k); return s ? s.label : k; };
  let missing = 0;
  newPage('Attachment requirements');
  heading('Attachment requirements checklist');
  const rows = fileSpecs.map(f => {
    const got = listOf(f), required = !!f.req || !!(f.reqIf && rec[f.reqIf]);
    const reqText = f.req ? 'Required' : f.reqIf ? 'Required if ' + specLabel(f.reqIf) + ' is entered' : 'Optional';
    const lost = required && !got.length;
    if (lost) missing++;
    return { f, got, reqText, lost };
  });
  page.drawText(missing ? missing + ' required attachment' + (missing === 1 ? '' : 's') + ' MISSING' : 'All required attachments submitted',
    { x: M, y, size: 11, font: bold, color: missing ? RED : GREEN });
  y -= 22;
  [['Document', M + 4], ['Requirement', M + 215], ['Status', M + 335]].forEach(([t, x]) => page.drawText(t, { x, y, size: 9, font: bold, color: GREY }));
  y -= 6; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: GREY }); y -= 14;
  rows.forEach(r => {
    const nameLines = wrap(r.f.label, font, 9.5, 205), reqLines = wrap(r.reqText, font, 9, 110);
    const stat = r.got.length ? 'Submitted (' + r.got.length + ')' : (r.lost ? 'MISSING' : 'Not submitted');
    const fileLines = r.got.length ? r.got.flatMap(d => wrap(d.name || 'file', font, 8, W - M - (M + 335))) : [];
    const h = Math.max(nameLines.length * 12, reqLines.length * 11, 12 + fileLines.length * 10) + 8;
    need(h);
    nameLines.forEach((l, i) => page.drawText(l, { x: M + 4, y: y - i * 12, size: 9.5, font, color: INK }));
    reqLines.forEach((l, i) => page.drawText(l, { x: M + 215, y: y - i * 11, size: 9, font, color: GREY }));
    page.drawText(stat, { x: M + 335, y, size: 9.5, font: bold, color: r.lost ? RED : r.got.length ? GREEN : GREY });
    fileLines.forEach((l, i) => page.drawText(l, { x: M + 335, y: y - 11 - i * 10, size: 8, font, color: GREY }));
    y -= h;
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: W - M, y: y + 3 }, thickness: 0.25, color: rgb(0.85, 0.87, 0.9) });
  });

  /* ---------- 3. attachments ---------- */
  const items = [];
  rows.forEach(r => r.got.forEach(d => items.push({ id: d.id, name: d.name, label: r.f.label })));
  const indexPages = [];
  let idx = null;
  if (items.length) { newPage('Attachments index'); idx = page; indexPages.push(page); }

  const fetched = new Array(items.length);
  let done = 0, next = 0;
  progress(0, items.length, items.length ? 'Fetching documents 0/' + items.length + '…' : 'Building PDF…');
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try { fetched[i] = { f: await loadFile(items[i]) }; } catch (e) { fetched[i] = { err: e.message || 'Could not load the file.' }; }
      progress(++done, items.length, 'Fetching documents ' + done + '/' + items.length + '…');
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  const ranges = [];
  function placeholder(it, why) {
    newPage('Attachment: ' + it.label);
    page.drawText(safe(it.label), { x: M, y, size: 13, font: bold, color: INK }); y -= 20;
    wrap(it.name + ' could not be added to this PDF: ' + why + ' Open it from the HR record to view it.', font, 10, W - 2 * M)
      .forEach(l => { page.drawText(l, { x: M, y, size: 10, font, color: RED }); y -= 14; });
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i], got = fetched[i], start = doc.getPageCount() + 1;
    progress(items.length, items.length, 'Building PDF… ' + (i + 1) + '/' + items.length);
    if (got.err) placeholder(it, got.err);
    else {
      const bytes = await got.f.blob.arrayBuffer(), mime = got.f.mime || '';
      try {
        if (mime === 'application/pdf') {
          const src = await PDFDocument.load(bytes);
          const pages = await doc.copyPages(src, src.getPageIndices());
          pages.forEach(p => doc.addPage(p));
        } else if (mime === 'image/png' || mime === 'image/jpeg') {
          const img = mime === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
          newPage('Attachment: ' + it.label);
          page.drawText(safe(it.label + ' - ' + it.name).slice(0, 110), { x: M, y, size: 10, font: bold, color: INK });
          y -= 12;
          const availW = W - 2 * M, availH = y - M - 24, k = Math.min(availW / img.width, availH / img.height, 1.5);
          page.drawImage(img, { x: M + (availW - img.width * k) / 2, y: y - img.height * k, width: img.width * k, height: img.height * k });
        } else placeholder(it, 'unsupported file type.');
      } catch (e) {
        placeholder(it, /encrypt|password/i.test(String(e.message)) ? 'the PDF is password-protected.' : 'the file could not be read.');
      }
    }
    ranges.push([start, doc.getPageCount()]);
  }
  if (idx) {
    page = idx; y = H - M - 56;
    page.drawText('Attached documents', { x: M, y, size: 12, font: bold, color: BLUE }); y -= 20;
    const lh = Math.min(15, (y - M - 30) / Math.max(items.length, 1));
    items.forEach((it, i) => {
      const r = ranges[i], pg = r[0] === r[1] ? 'page ' + r[0] : 'pages ' + r[0] + '-' + r[1];
      page.drawText(safe(it.label + ': ' + it.name).slice(0, 88), { x: M + 4, y, size: lh < 12 ? 8 : 9.5, font, color: INK });
      page.drawText(pg, { x: W - M - 70, y, size: lh < 12 ? 8 : 9.5, font, color: GREY });
      y -= lh;
    });
  }

  /* ---------- footer on the pages drawn here ---------- */
  const total = doc.getPageCount();
  own.forEach(p => {
    const n = doc.getPages().indexOf(p) + 1;
    p.drawText('Confidential - HR use only - ' + safe(cur.AppID), { x: M, y: 22, size: 8, font, color: GREY });
    p.drawText('Page ' + n + ' of ' + total, { x: W - M - 55, y: 22, size: 8, font, color: GREY });
  });
  doc.setTitle('Application ' + cur.AppID);
  doc.setProducer('Photoline HR Portal');
  const out = await doc.save();
  return new Blob([out], { type: 'application/pdf' });
}
