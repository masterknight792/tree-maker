'use strict';
/* The editor screen: typing box, options, live tree (folders open/close), copy / save buttons. */
(function (TM) {
  const $ = TM.$;
  const store = TM.store;
  const L = TM.limits;
  const input = $('input');
  const out = $('out');
  const rootEl = $('root');
  const optIcons = $('icons');
  const optFolderFirst = $('folderFirst');
  const optAscii = $('ascii');

  // editor controls -> current project
  function sync() {
    const p = store.current();
    if (!p) return;
    p.text = input.value.slice(0, L.MAX_TEXT);
    p.root = rootEl.value.slice(0, L.MAX_ROOT);
    p.icons = optIcons.checked;
    p.folderFirst = optFolderFirst.checked;
    p.ascii = optAscii.checked;
  }

  // current project -> editor controls (or the "no trees" message when the library is empty)
  function load() {
    const p = store.current();
    $('viewEditor').classList.toggle('is-empty', !p);
    $('editorEmpty').hidden = !!p;
    if (!p) {
      input.value = '';
      rootEl.value = '';
      out.replaceChildren();
      return;
    }
    input.value = p.text;
    rootEl.value = p.root;
    optIcons.checked = p.icons;
    optFolderFirst.checked = p.folderFirst;
    optAscii.checked = p.ascii;
    renderNow();
  }

  /* ----- the interactive tree ----- */
  function span(cls, text) {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  }

  function makeRow(r, closed) {
    const d = document.createElement('div');
    d.className = 'tr' + (r.hasKids ? ' fold' : '');
    d.setAttribute('role', 'treeitem');
    if (r.hasKids) {
      d.dataset.key = r.key;
      d.tabIndex = 0;
      d.setAttribute('aria-expanded', closed ? 'false' : 'true');
    }
    d.append(
      span('pfx', r.prefix),
      span('chev', (r.hasKids ? (closed ? '▸' : '▾') : ' ') + ' '),
      span('ico', r.icon ? r.icon + ' ' : ''),
      span('nm', r.name)
    );
    return d;
  }

  let renderQueued = false;
  function renderNow() {
    renderQueued = false;
    const p = store.current();
    if (!p) {
      out.replaceChildren();
      return;
    }
    const m = TM.tree.buildRows(p);
    const closedKeys = new Set(p.collapsed);
    const frag = document.createDocumentFragment();

    const rootRow = document.createElement('div');
    rootRow.className = 'tr root';
    rootRow.setAttribute('role', 'treeitem');
    rootRow.append(span('ico', m.rootIcon ? m.rootIcon + ' ' : ''), span('nm', m.rootName));
    frag.appendChild(rootRow);

    let hideBelow = -1; // while >= 0, rows deeper than this belong to a closed folder
    for (const r of m.rows) {
      if (hideBelow >= 0) {
        if (r.depth > hideBelow) continue;
        hideBelow = -1;
      }
      const closed = r.hasKids && closedKeys.has(r.key);
      frag.appendChild(makeRow(r, closed));
      if (closed) hideBelow = r.depth;
    }
    out.replaceChildren(frag);
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(renderNow);
  }

  function toggle(key) {
    const p = store.current();
    if (!p) return;
    const s = new Set(p.collapsed);
    if (s.has(key)) s.delete(key);
    else s.add(key);
    p.collapsed = Array.from(s).slice(0, L.MAX_COLLAPSED); // always a new array (copies of a tree never share it)
    const hadFocus = out.contains(document.activeElement);
    store.persist();
    renderNow();
    if (hadFocus) {
      const el = Array.from(out.children).find((c) => c.dataset.key === key);
      if (el) el.focus();
    }
  }

  out.addEventListener('click', (e) => {
    if (String(getSelection()).length) return; // the user is selecting text, not clicking
    const row = e.target.closest('.tr.fold');
    if (row) toggle(row.dataset.key);
  });
  out.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest && e.target.closest('.tr.fold');
    if (!row) return;
    e.preventDefault();
    toggle(row.dataset.key);
  });

  $('expandAll').addEventListener('click', () => {
    const p = store.current();
    if (!p) return;
    p.collapsed = [];
    store.persist();
    renderNow();
  });
  $('collapseAll').addEventListener('click', () => {
    const p = store.current();
    if (!p) return;
    p.collapsed = TM.tree.buildRows(p).folderKeys.slice(0, L.MAX_COLLAPSED);
    store.persist();
    renderNow();
  });

  /* ----- editing ----- */
  // every change: update the project, save immediately, redraw
  function onEdit() {
    const p = store.current();
    if (!p) return;
    sync();
    p.updated = Date.now();
    store.persist();
    scheduleRender();
  }

  [input, rootEl].forEach((el) => el.addEventListener('input', onEdit));
  [optIcons, optFolderFirst, optAscii].forEach((el) => el.addEventListener('change', onEdit));

  // Tab / Shift+Tab indent the selected lines
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const s = input.selectionStart;
    const en = input.selectionEnd;
    const v = input.value;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    let le = v.indexOf('\n', en);
    if (le === -1) le = v.length;
    const block = v.slice(ls, le).split('\n');
    const nv = block.map((l) => (e.shiftKey ? l.replace(/^ {1,2}/, '') : '  ' + l)).join('\n');
    const single = block.length === 1;
    input.value = v.slice(0, ls) + nv + v.slice(le);
    if (s === en && single) {
      const removed = e.shiftKey ? Math.min(2, v.slice(ls).match(/^ */)[0].length) : 0;
      input.selectionStart = input.selectionEnd = Math.max(ls, s + (e.shiftKey ? -removed : 2));
    } else {
      input.selectionStart = ls;
      input.selectionEnd = ls + nv.length;
    }
    onEdit();
  });

  /* ----- undo support: what the tree looked like before a big change ----- */
  const snapshot = () => ({ text: input.value, root: rootEl.value, collapsed: store.current().collapsed.slice() });
  function applySnapshot(s) {
    input.value = s.text;
    rootEl.value = s.root;
    store.current().collapsed = s.collapsed.slice();
    onEdit();
  }

  /* ----- buttons ----- */
  $('example').addEventListener('click', async () => {
    if (input.value.trim()) {
      const yes = await TM.ui.ask('استبدال الكتابة الحالية؟', 'المثال الجاهز هيحل مكان الكلام المكتوب دلوقتي في الشجرة دي.', 'آه، استبدل');
      if (!yes) return;
    }
    const before = snapshot();
    rootEl.value = 'My_Random_Folder';
    input.value = store.EXAMPLE;
    store.current().collapsed = [];
    onEdit();
    if (before.text.trim()) TM.ui.toast('تم تحميل المثال', 'تراجع', () => applySnapshot(before));
  });

  $('clear').addEventListener('click', async () => {
    if (!input.value.trim()) return;
    const yes = await TM.ui.ask('مسح كل الكتابة؟', 'هتتمسح كل الأسماء المكتوبة في الشجرة دي.', 'آه، امسح');
    if (!yes) return;
    const before = snapshot();
    input.value = '';
    store.current().collapsed = [];
    onEdit();
    input.focus();
    TM.ui.toast('تم المسح', 'تراجع', () => applySnapshot(before));
  });

  /* ----- tree from a real folder (desktop app only) ----- */
  const scanBtn = $('scan');
  $('scanRow').hidden = !TM.platform.isDesktop;
  let scanning = false;

  scanBtn.addEventListener('click', async () => {
    if (scanning) return;
    scanning = true;
    const label = scanBtn.textContent;
    scanBtn.disabled = true;
    scanBtn.textContent = '⏳ جاري قراءة المجلد...';
    try {
      const r = await TM.platform.scanFolder({ skipHeavy: $('skipHeavy').checked });
      if (!r || !r.ok) {
        if (!(r && r.canceled)) TM.ui.toast('تعذّر قراءة المجلد');
        return;
      }
      if (typeof r.text !== 'string' || typeof r.name !== 'string') return TM.ui.toast('تعذّر قراءة المجلد');

      if (input.value.trim()) {
        const yes = await TM.ui.ask('استبدال الكتابة الحالية؟', 'هتتحط شجرة المجلد "' + r.name + '" مكان الكتابة الحالية واسم المجلد الرئيسي.', 'آه، استبدل');
        if (!yes) return;
      }
      const before = snapshot();
      rootEl.value = TM.tree.clean(r.name).slice(0, L.MAX_ROOT);
      input.value = r.text.slice(0, L.MAX_TEXT);
      sync();
      // every folder starts closed; the user opens what they want to see
      const p = store.current();
      p.collapsed = TM.tree.buildRows(p).folderKeys.slice(0, L.MAX_COLLAPSED);
      onEdit();

      const msg = r.truncated
        ? 'المجلد كبير - اتقرا أول ' + r.count + ' عنصر بس'
        : 'تم قراءة ' + r.count + ' عنصر ✔';
      if (before.text.trim()) TM.ui.toast(msg, 'تراجع', () => applySnapshot(before));
      else TM.ui.toast(msg);
    } finally {
      scanning = false;
      scanBtn.disabled = false;
      scanBtn.textContent = label;
    }
  });

  /* ----- create the tree as real folders and files (desktop app only) ----- */
  const createBtn = $('create');
  createBtn.hidden = !TM.platform.isDesktop;
  let creating = false;

  const WHY = {
    illegal: 'فيه رموز ممنوعة في ويندوز',
    'ends-dot-space': 'آخره نقطة أو مسافة',
    reserved: 'اسم محجوز في ويندوز',
    'too-long': 'طويل أوي',
    empty: 'فاضي',
  };
  const notice = (title, msg, detail) => TM.ui.ask(title, msg, 'تمام', false, { single: true, detail });

  createBtn.addEventListener('click', async () => {
    const p = store.current();
    if (!p || creating) return;
    sync();
    const plan = TM.tree.toPlan(p); // the WHOLE tree, even folders that are closed on screen
    if (!plan.nodes.length) return TM.ui.toast('الشجرة فاضية - اكتب أسماء الأول');

    creating = true;
    createBtn.disabled = true;
    try {
      // 1) the user picks the place in the system dialog; the program checks the names
      const pick = await TM.platform.pickCreateTarget({ root: plan.root, tree: plan.nodes });
      if (!pick || !pick.ok) {
        const e = pick && pick.error;
        if (pick && pick.canceled) return;
        if (e === 'bad-root') return notice('اسم المجلد الرئيسي مش مقبول', 'الاسم "' + plan.root + '" (' + (WHY[pick.why] || pick.why) + '). غيّره من خانة اسم المجلد الرئيسي وجرّب تاني.');
        if (e === 'too-many') return notice('الشجرة كبيرة أوي', 'الشجرة فيها أكتر من ' + TM.limits.MAX_LINES + ' عنصر.');
        if (e === 'path-too-long') return notice('المكان طويل أوي', 'مسار المكان اللي اخترته طويل أوي. اختار مكان أقصر.');
        if (e === 'root-conflict') return notice('الاسم متكرر', 'فيه ملف أو اختصار بنفس اسم المجلد الرئيسي في المكان ده. اختار مكان تاني أو غيّر الاسم.');
        return TM.ui.toast('تعذّر إنشاء الشجرة');
      }

      // 2) the user sees exactly what will happen and confirms
      let msg = 'هيتعمل المجلد "' + plan.root + '" وجواه ' + pick.folders + ' مجلد و ' + pick.files + ' ملف فاضي، في المكان ده:';
      let detail = pick.finalPath;
      if (pick.exists) msg += '\n\nالمجلد ده موجود بالفعل: هيتضاف الناقص بس، ومفيش ملف هيتمسح أو يتغيّر.';
      const skipped = pick.invalidCount + pick.tooLong;
      if (skipped) {
        msg += '\n\nهيتم تخطي ' + skipped + ' اسم (ومحتواه) عشان ويندوز مايقبلهوش:';
        const lines = pick.invalid.map((i) => i.name + '  —  ' + (WHY[i.why] || i.why));
        if (pick.tooLong) lines.push(pick.tooLong + ' × المسار طويل أوي');
        if (pick.invalidCount > pick.invalid.length) lines.push('...');
        detail += '\n\n' + lines.join('\n');
      }
      const yes = await TM.ui.ask('إنشاء المجلدات والملفات على جهازك؟', msg, 'آه، أنشئ', false, { detail });
      if (!yes) {
        await TM.platform.cancelCreate();
        return;
      }

      // 3) create
      const r = await TM.platform.runCreate();
      if (!r || !r.ok) {
        if (r && r.error === 'root-conflict') return notice('الاسم متكرر', 'فيه ملف أو اختصار بنفس اسم المجلد الرئيسي في المكان ده، ومفيش حاجة اتعملت.');
        return notice('تعذّر الإنشاء', 'حصلت مشكلة وماقدرتش أكمل. ممكن يكون فيه صلاحيات ناقصة في المكان ده.');
      }
      const done = 'تم إنشاء ' + r.createdFolders + ' مجلد و ' + r.createdFiles + ' ملف ✔';
      const problems = r.failed + r.conflicts;
      if (problems) {
        let m = done + '\n';
        if (r.existed) m += '\n' + r.existed + ' كانوا موجودين فاتخطّيتهم.';
        if (r.conflicts) m += '\n' + r.conflicts + ' اسم فيه ملف أو مجلد أو اختصار بنفس الاسم من نوع مختلف فاتخطّيته.';
        if (r.failed) m += '\n' + r.failed + ' ماتعملوش (غالبًا صلاحيات).';
        await notice('تم الإنشاء مع تنبيهات', m, pick.finalPath);
      } else {
        TM.ui.toast(done + (r.existed ? ' (' + r.existed + ' كانوا موجودين)' : ''), 'فتح المكان', () => TM.platform.openCreated());
      }
    } finally {
      creating = false;
      createBtn.disabled = false;
    }
  });

  // Copy and save always use the FULL tree, whatever is open or closed on screen.
  const fullText = () => {
    const p = store.current();
    return p ? TM.tree.buildLines(p).join('\n') : '';
  };

  $('copy').addEventListener('click', async () => {
    const ok = await TM.platform.copyText(fullText());
    TM.ui.toast(ok ? 'تم النسخ ✔' : 'تعذّر النسخ');
  });

  $('save').addEventListener('click', async () => {
    const r = await TM.platform.saveFile(rootEl.value.trim() || 'folder-map', fullText(), 'txt');
    if (r.ok) TM.ui.toast('تم الحفظ ✔');
    else if (!r.canceled) TM.ui.toast('تعذّر حفظ الملف');
  });

  TM.editor = { sync, load, focus: () => input.focus() };
})(window.TM);
