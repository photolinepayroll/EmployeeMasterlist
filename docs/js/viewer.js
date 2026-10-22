/* Document preview dialog: zoom, rotate, previous/next, images + PDF.
   openViewer(items, startIndex, loader)
     items:  [{ id, label, name }]
     loader: item => Promise<{ blob, name, mime }>                                  */
Object.assign(ICONS, {
  zoomIn: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3M11 8v6M8 11h6',
  zoomOut: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3M8 11h6',
  rotCw: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  rotCcw: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  chevL: 'M15 18l-6-6 6-6',
  chevR: 'M9 18l6-6-6-6'
});

function openViewer(items, startIndex, loader) {
  if (!items || !items.length) return;
  const opener = document.activeElement;
  const Z_MIN = 0.25, Z_MAX = 4;
  let i = Math.max(0, Math.min(startIndex || 0, items.length - 1));
  let zoom = 1, rot = 0, x = 0, y = 0, kind = '', cur = null, url = '', seq = 0;
  const ptrs = new Map();
  let pinch0 = 0, zoom0 = 1, swipe0 = null, drag0 = null;

  const root = document.createElement('div');
  root.className = 'viewer';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Document preview');
  const btn = (id, ic, label, cls) => '<button type="button" class="vbtn ' + (cls || '') + '" id="' + id + '" aria-label="' + label + '" title="' + label + '">' + icon(ic) + '</button>';
  root.innerHTML =
    '<div class="viewer-top"><div class="viewer-title"><b id="v_name"></b><span id="v_count" class="mute"></span></div>' +
    btn('v_dl', 'download', 'Download') + btn('v_close', 'x', 'Close preview (Esc)') + '</div>' +
    '<div class="viewer-stage" id="v_stage">' + btn('v_prev2', 'chevL', 'Previous document', 'viewer-arrow left') + btn('v_next2', 'chevR', 'Next document', 'viewer-arrow right') +
    '<div class="viewer-msg" id="v_msg" role="status"></div></div>' +
    '<div class="viewer-bar" role="toolbar" aria-label="Preview controls">' +
    btn('v_prev', 'chevL', 'Previous document (Left arrow)') + btn('v_zout', 'zoomOut', 'Zoom out (-)') +
    '<button type="button" class="vbtn vzoom" id="v_fit" aria-label="Reset zoom to fit (0)" title="Reset zoom to fit (0)">100%</button>' +
    btn('v_zin', 'zoomIn', 'Zoom in (+)') + btn('v_rl', 'rotCcw', 'Rotate left') + btn('v_rr', 'rotCw', 'Rotate right') +
    btn('v_next', 'chevR', 'Next document (Right arrow)') + '</div>' +
    '<div class="sr-only" id="v_live" aria-live="polite"></div>';
  document.body.appendChild(root);
  document.body.classList.add('noscroll');
  const q = id => root.querySelector('#' + id);
  const stage = q('v_stage');

  function revoke() { if (url) { URL.revokeObjectURL(url); url = ''; } }
  function clearMedia() { Array.from(stage.querySelectorAll('.vmedia')).forEach(n => n.remove()); }

  function fitScale(img) {
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const swap = Math.abs(rot) % 180 === 90;
    const w = swap ? img.naturalHeight : img.naturalWidth, h = swap ? img.naturalWidth : img.naturalHeight;
    return Math.min(sw / w, sh / h, 1) || 1;
  }
  function apply(animate) {
    const img = stage.querySelector('img.vmedia');
    q('v_fit').textContent = Math.round(zoom * 100) + '%';
    q('v_zout').disabled = zoom <= Z_MIN; q('v_zin').disabled = zoom >= Z_MAX;
    const isImg = kind === 'image';
    q('v_rl').disabled = q('v_rr').disabled = !isImg;
    if (!isImg) { q('v_rl').title = 'Rotate is available for images only'; q('v_rr').title = 'Rotate is available for images only'; }
    else { q('v_rl').title = 'Rotate left'; q('v_rr').title = 'Rotate right'; }
    q('v_zout').disabled = q('v_zin').disabled = kind === 'pdf';
    q('v_fit').disabled = kind === 'pdf';
    if (!img) return;
    img.style.transition = animate ? '' : 'none';
    const s = fitScale(img) * zoom;
    img.style.transform = 'translate(-50%,-50%) translate(' + x + 'px,' + y + 'px) rotate(' + rot + 'deg) scale(' + s + ')';
    stage.classList.toggle('zoomed', zoom > 1);
  }
  function setZoom(z, animate) {
    zoom = Math.max(Z_MIN, Math.min(Z_MAX, z));
    if (zoom <= 1) { x = 0; y = 0; }
    apply(animate !== false);
  }
  function rotate(d) { rot = (rot + d) % 360; x = 0; y = 0; apply(true); }

  function nav(d) {
    const n = i + d;
    if (n < 0 || n >= items.length) return;
    i = n; show();
  }

  function show() {
    const item = items[i], my = ++seq;
    zoom = 1; rot = 0; x = 0; y = 0; kind = '';
    clearMedia(); revoke();
    q('v_name').textContent = item.label;
    q('v_count').textContent = ' ' + (i + 1) + ' of ' + items.length;
    q('v_live').textContent = 'Document ' + (i + 1) + ' of ' + items.length + ': ' + item.label;
    const first = i === 0, last = i === items.length - 1;
    ['v_prev', 'v_prev2'].forEach(id => { q(id).disabled = first; });
    ['v_next', 'v_next2'].forEach(id => { q(id).disabled = last; });
    q('v_dl').disabled = true;
    const msg = q('v_msg');
    msg.className = 'viewer-msg'; msg.innerHTML = '<span class="spin"></span> Loading…';
    apply(false);
    Promise.resolve(loader(item)).then(f => {
      if (my !== seq) return;
      cur = f;
      kind = /^image\//.test(f.mime) ? 'image' : f.mime === 'application/pdf' ? 'pdf' : 'other';
      url = URL.createObjectURL(f.blob);
      q('v_dl').disabled = false;
      if (kind === 'image') {
        const img = new Image();
        img.className = 'vmedia'; img.alt = item.label; img.draggable = false;
        img.onload = () => { msg.className = 'viewer-msg hide'; apply(false); };
        img.onerror = () => fail(my, item);
        img.src = url;
        stage.appendChild(img);
      } else if (kind === 'pdf') {
        msg.className = 'viewer-msg hide';
        const o = document.createElement('object');
        o.className = 'vmedia vpdf'; o.type = 'application/pdf'; o.data = url; o.setAttribute('aria-label', item.label);
        o.innerHTML = '<p class="viewer-msg-inner">This browser cannot show the PDF here. Use Download.</p>';
        stage.appendChild(o);
        apply(false);
      } else {
        msg.className = 'viewer-msg'; msg.textContent = 'No preview for this file type. Use Download.';
        apply(false);
      }
    }).catch(() => fail(my, item));
  }
  function fail(my, item) {
    if (my !== seq) return;
    const msg = q('v_msg');
    msg.className = 'viewer-msg';
    msg.innerHTML = 'Could not load this file. <button type="button" class="btn sm" id="v_retry">Retry</button>';
    q('v_retry').onclick = () => show();
  }

  function close() {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    seq++; revoke();
    root.classList.remove('open');
    setTimeout(() => root.remove(), 160);
    document.body.classList.remove('noscroll');
    if (opener && opener.focus) opener.focus();
  }
  function onResize() { apply(false); }

  function onKey(e) {
    const k = e.key;
    if (k === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
    if (k === 'Tab') {
      const f = Array.from(root.querySelectorAll('button:not([disabled])')).filter(b => b.offsetParent !== null);
      if (!f.length) return;
      const a = document.activeElement, idx = f.indexOf(a);
      if (e.shiftKey && (idx <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (idx === f.length - 1 || idx < 0)) { e.preventDefault(); f[0].focus(); }
      return;
    }
    if (k === 'ArrowLeft') { e.preventDefault(); nav(-1); }
    else if (k === 'ArrowRight') { e.preventDefault(); nav(1); }
    else if (kind === 'image' && (k === '+' || k === '=')) { e.preventDefault(); setZoom(zoom + 0.25); }
    else if (kind === 'image' && (k === '-' || k === '_')) { e.preventDefault(); setZoom(zoom - 0.25); }
    else if (kind === 'image' && k === '0') { e.preventDefault(); setZoom(1); }
    else if (kind === 'image' && (k === 'r' || k === 'R')) { e.preventDefault(); rotate(e.shiftKey ? -90 : 90); }
  }

  /* pointer: drag-pan, pinch-zoom, swipe, double-click */
  stage.addEventListener('pointerdown', e => {
    if (kind !== 'image' || e.target.closest('button')) return;
    stage.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const p = Array.from(ptrs.values());
      pinch0 = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); zoom0 = zoom; swipe0 = null; drag0 = null;
    } else {
      swipe0 = { x: e.clientX, y: e.clientY, t: Date.now() };
      drag0 = { x: e.clientX, y: e.clientY, ox: x, oy: y };
    }
  });
  stage.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pinch0) {
      const p = Array.from(ptrs.values());
      zoom = Math.max(Z_MIN, Math.min(Z_MAX, zoom0 * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / pinch0));
      apply(false);
    } else if (drag0 && zoom > 1) {
      x = drag0.ox + (e.clientX - drag0.x); y = drag0.oy + (e.clientY - drag0.y); apply(false);
    }
  });
  const endPtr = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size === 0 && swipe0 && zoom <= 1 && e.type === 'pointerup') {
      const dx = e.clientX - swipe0.x, dy = e.clientY - swipe0.y;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && Date.now() - swipe0.t < 600) nav(dx < 0 ? 1 : -1);
    }
    if (ptrs.size < 2) pinch0 = 0;
    if (ptrs.size === 0) { swipe0 = null; drag0 = null; if (zoom < 1) setZoom(1); }
  };
  stage.addEventListener('pointerup', endPtr);
  stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('dblclick', e => { if (kind === 'image' && !e.target.closest('button')) setZoom(zoom > 1 ? 1 : 2); });
  stage.addEventListener('wheel', e => {
    if (kind !== 'image') return;
    e.preventDefault();
    setZoom(zoom + (e.deltaY < 0 ? 0.25 : -0.25), false);
  }, { passive: false });
  stage.addEventListener('click', e => { if (e.target === stage) close(); });

  q('v_close').onclick = close;
  q('v_prev').onclick = q('v_prev2').onclick = () => nav(-1);
  q('v_next').onclick = q('v_next2').onclick = () => nav(1);
  q('v_zin').onclick = () => setZoom(zoom + 0.25);
  q('v_zout').onclick = () => setZoom(zoom - 0.25);
  q('v_fit').onclick = () => setZoom(1);
  q('v_rl').onclick = () => rotate(-90);
  q('v_rr').onclick = () => rotate(90);
  q('v_dl').onclick = () => { if (cur) downloadBlob(cur.name || items[i].name, cur.mime, cur.blob); };

  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => root.classList.add('open'));
  show();
  q('v_close').focus();
}
