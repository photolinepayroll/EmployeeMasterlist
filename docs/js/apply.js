(function () {
  const TOKEN = new URLSearchParams(location.search).get('t') || '';
  $('#chrome').innerHTML = topbar('Employee Information Form');
  $('#done > div').innerHTML = icon('check').replace('class="i"', 'class="i" style="width:1.4em;height:1.4em"');

  let S = null, step = 1, data = {}, files = {}, consent = false;

  function fatal(msg) {
    $('#loading').classList.add('hide');
    const f = $('#fatal'); f.classList.remove('hide');
    f.innerHTML = '<h2>Unable to open the form</h2><p>' + esc(msg) + '</p><p class="mute">Please contact HR for a new link.</p>';
  }
  if (!TOKEN) { fatal('This link is missing its access code.'); return; }

  call('getApplicationByToken', TOKEN).then(r => {
    S = r; data = r.data; files = r.files; consent = r.consent;
    $('#loading').classList.add('hide'); $('#app').classList.remove('hide');
    if (r.remarks) {
      const b = $('#returned'); b.classList.remove('hide');
      b.innerHTML = icon('alert') + '<div><b>HR needs corrections:</b><br>' + esc(r.remarks) + '</div>';
    }
    if (!r.editable) $('#locked').classList.remove('hide');
    render();
  }).catch(e => fatal(e.message));

  const total = () => S.steps.length;
  const specFor = n => S.spec.filter(f => f.step === n);
  const textSpec = list => list.filter(f => f.type !== 'file' && f.type !== 'files');

  function collect() {
    const sp = textSpec(specFor(step));
    if (sp.length) Object.assign(data, readFields($('#panel'), sp));
  }

  function render() {
    $('#stepName').textContent = S.steps[step - 1];
    $('#stepCount').textContent = 'Step ' + step + ' of ' + total();
    $('#bar').style.width = Math.round((step / total()) * 100) + '%';
    $('#steps').innerHTML = S.steps.map((s, i) =>
      '<li class="' + (i + 1 === step ? 'on' : i + 1 < step ? 'done' : '') + '"' + (i + 1 === step ? ' aria-current="step"' : '') + '>' + (i + 1) + '. ' + esc(s) + '</li>').join('');

    const p = $('#panel');
    let h = '<h2>' + esc(S.steps[step - 1]) + '</h2>';
    if (step === 1 && S.invitedName) h += '<p class="mute" style="margin:4px 0 0">Invited as ' + esc(S.invitedName) + '. Use your full legal name.</p>';

    if (step === total()) {
      h += reviewHtml() +
        '<div class="notice info" style="margin-top:16px">' + icon('shield') + '<div><b>Data Privacy Notice (RA 10173).</b> ' + esc(S.company) +
        ' collects your personal and government ID information only for employment, payroll, statutory contributions and legal compliance. It is stored securely; only authorized HR staff can view it in full, and payroll staff see only your name and payroll account.</div></div>' +
        '<label style="display:flex;gap:10px;align-items:flex-start;font-size:.95rem"><input type="checkbox" id="consent"' + (consent ? ' checked' : '') + '> <span>I have read the notice, consent to this processing, and confirm my information is true and correct.</span></label>' +
        '<div class="err" data-err="consent" role="alert"></div>';
    } else {
      h += '<div class="grid">';
      specFor(step).forEach(f => {
        if (f.type === 'file') h += fileFieldHtml(f);
        else if (f.type === 'files') h += otherDocsHtml(f);
        else h += fieldHtml(f, data[f.k], S.lists);
      });
      h += '</div>';
    }
    p.innerHTML = h;
    wireBlurValidation(p, textSpec(specFor(step)));
    wireFiles();
    if (!S.editable) $$('input,select,textarea', p).forEach(el => { el.disabled = true; });
    $('#prev').innerHTML = icon('back') + ' Back';
    $('#prev').classList.toggle('hide', step === 1);
    const last = step === total();
    $('#next').innerHTML = last ? icon('send') + ' Submit to HR' : 'Next ' + icon('next');
    $('#next').classList.toggle('hide', last && !S.editable);
    window.scrollTo({ top: 0 });
  }

  function dropzone(field, multi) {
    return S.editable
      ? '<label class="file" data-drop="' + field + '"><span aria-hidden="true">' + icon('upload') + '</span><span><b>Choose a file</b> or drop it here<br><small class="mute">PDF, JPG or PNG, max 5 MB' + (multi ? ' each' : '') + '</small></span>' +
        '<input type="file" data-up="' + field + '" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"></label>'
      : '';
  }
  function fileFieldHtml(f) {
    const cur = files[f.k];
    return '<div class="fld full"><label>' + esc(f.label) + (f.req ? ' <span class="req" aria-hidden="true">*</span>' : '') + '</label>' +
      '<div id="cur_' + f.k + '">' + curFile(cur) + '</div>' + dropzone(f.k, false) + '<div class="err" role="alert" data-err="' + f.k + '"></div></div>';
  }
  function curFile(c) { return c ? '<span class="chip" style="cursor:default">' + icon('check') + ' ' + esc(c.name) + '</span>' : '<span class="mute" style="font-size:.88rem">No file uploaded yet</span>'; }
  function otherDocsHtml(f) {
    return '<div class="fld full"><label>' + esc(f.label) + '</label><div id="docs">' + docsList() + '</div>' + dropzone('OtherDocs', true) +
      '<div class="hint">' + esc(f.hint || '') + '</div><div class="err" role="alert" data-err="OtherDocs"></div></div>';
  }
  function docsList() {
    if (!files.OtherDocs || !files.OtherDocs.length) return '<span class="mute" style="font-size:.88rem">No documents uploaded</span>';
    return files.OtherDocs.map(d => '<span class="chip" style="cursor:default">' + icon('file') + ' ' + esc(d.name) +
      (S.editable ? ' <button type="button" aria-label="Remove ' + esc(d.name) + '" data-rm="' + esc(d.id) + '">' + icon('x') + '</button>' : '') + '</span>').join('');
  }

  function uploadSelected(field, file, inputEl) {
    const errEl = $('[data-err="' + field + '"]');
    errEl.textContent = '';
    if (['application/pdf', 'image/jpeg', 'image/png'].indexOf(file.type) < 0) { errEl.textContent = 'Only PDF, JPG or PNG files are allowed.'; return; }
    if (file.size > S.limits.maxBytes) { errEl.textContent = 'File is larger than 5 MB.'; return; }
    const zone = $('[data-drop="' + field + '"]');
    zone.style.opacity = '.6'; errEl.style.color = 'var(--ink-2)'; errEl.textContent = 'Uploading…';
    readAsBase64(file).then(b64 => call('uploadFile', TOKEN, field, file.name, file.type, b64)).then(r => {
      errEl.textContent = '';
      if (field === 'OtherDocs') { files.OtherDocs = r.docs; $('#docs').innerHTML = docsList(); }
      else { files[field] = r.file; $('#cur_' + field).innerHTML = curFile(r.file); }
      wireFiles();
    }).catch(e => { errEl.textContent = e.message; })
      .then(() => { errEl.style.color = ''; zone.style.opacity = ''; if (inputEl) inputEl.value = ''; });
  }

  function wireFiles() {
    $$('[data-up]').forEach(inp => {
      inp.onchange = () => { if (inp.files[0]) uploadSelected(inp.dataset.up, inp.files[0], inp); };
    });
    $$('[data-drop]').forEach(z => {
      ['dragenter', 'dragover'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.remove('drag'); }));
      z.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) uploadSelected(z.dataset.drop, f); });
    });
    $$('[data-rm]').forEach(b => {
      b.onclick = () => call('removeOtherDoc', TOKEN, b.dataset.rm)
        .then(r => { files.OtherDocs = r.docs; $('#docs').innerHTML = docsList(); wireFiles(); })
        .catch(e => toast(e.message));
    });
  }

  function reviewHtml() {
    let h = '<p class="mute">Please review your answers. Use Back to correct anything.</p><dl class="kv">';
    textSpec(S.spec).forEach(f => { h += '<dt>' + esc(f.label) + '</dt><dd>' + esc(data[f.k] || '—') + '</dd>'; });
    const miss = '<b style="color:var(--danger)">Missing</b>';
    h += '<dt>Medical scan</dt><dd>' + (files.MedicalFileId ? esc(files.MedicalFileId.name) : miss) + '</dd>';
    h += '<dt>NBI scan</dt><dd>' + (files.NBIFileId ? esc(files.NBIFileId.name) : miss) + '</dd>';
    h += '<dt>Other documents</dt><dd>' + ((files.OtherDocs || []).length || 'None') + '</dd></dl>';
    return h;
  }

  function saveDraftQuiet() {
    if (!S.editable) return Promise.resolve();
    $('#saved').textContent = 'Saving…';
    return call('saveDraft', TOKEN, data).then(() => { $('#saved').textContent = 'Draft saved'; }).catch(() => { $('#saved').textContent = ''; });
  }

  $('#prev').addEventListener('click', () => { collect(); step--; saveDraftQuiet(); render(); });

  $('#next').addEventListener('click', () => {
    const btn = $('#next');
    if (step < total()) {
      collect();
      if (S.editable) {
        const v = validateSpec($('#panel'), textSpec(specFor(step)));
        let missingFile = false;
        specFor(step).forEach(f => {
          if (f.type === 'file' && f.req && !files[f.k]) { setErr($('#panel'), f.k, f.label + ' is required.'); missingFile = true; }
        });
        if (!v.ok || missingFile) return;
      }
      step++; saveDraftQuiet(); render(); return;
    }
    consent = $('#consent').checked;
    if (!consent) { setErr($('#panel'), 'consent', 'You must accept the Data Privacy notice.'); return; }
    busy(btn, true, 'Submitting…');
    call('submitApplication', TOKEN, data, consent).then(() => {
      $('#app').classList.add('hide'); $('#done').classList.remove('hide'); window.scrollTo({ top: 0 });
    }).catch(e => {
      busy(btn, false);
      if (e.fields) {
        const keys = Object.keys(e.fields);
        const f = S.spec.find(x => keys.indexOf(x.k) >= 0);
        if (f) { step = f.step; render(); showErrors($('#panel'), e.fields); }
        else if (e.fields.consent) setErr($('#panel'), 'consent', e.fields.consent);
        toast('Please fix the highlighted fields.');
      } else toast(e.message);
    });
  });
})();
