'use strict';
/* The library screen: cards for every saved tree, search, backup and import. */
(function (TM) {
  const $ = TM.$;
  const store = TM.store;

  function openProject(id) {
    store.flush();
    store.setCurrent(id);
    store.persist();
    TM.editor.load();
    TM.app.show('editor');
  }

  function button(label, cls, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }

  async function deleteProject(p) {
    const yes = await TM.ui.ask('حذف الشجرة دي؟', '"' + (p.root || 'Folder') + '" هتتحذف نهائيًا من المكتبة.', 'آه، احذف');
    if (!yes) return;
    store.flush();
    const info = store.remove(p);
    if (!info) return;
    if (info.currentChanged) TM.editor.load();
    store.persist();
    render();
    TM.ui.toast('تم الحذف', 'تراجع', () => {
      store.restore(info);
      TM.editor.load();
      store.persist();
      render();
    });
  }

  function card(p, currentId) {
    const c = document.createElement('div');
    c.className = 'tcard' + (p.id === currentId ? ' current' : '');
    c.addEventListener('click', () => openProject(p.id));

    const top = document.createElement('div');
    top.className = 'top';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = '📁 ' + (p.root || 'Folder');
    name.title = p.root;
    top.appendChild(name);
    if (p.id === currentId) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'الحالية';
      top.appendChild(tag);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent =
      TM.tree.countNodes(TM.tree.parse(p.text)) + ' عنصر · آخر تعديل ' +
      new Date(p.updated).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });

    const pre = document.createElement('pre');
    pre.textContent = TM.tree.buildLines(p).slice(0, 8).join('\n');

    const acts = document.createElement('div');
    acts.className = 'acts';
    acts.append(
      button('فتح', 'primary', () => openProject(p.id)),
      button('تكرار', '', () => {
        store.flush();
        store.duplicate(p);
        store.persist();
        render();
        TM.ui.toast('تم التكرار ✔');
      }),
      button('حذف', 'ghost-danger', () => deleteProject(p))
    );

    c.append(top, meta, pre, acts);
    return c;
  }

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const list = store
      .projects()
      .slice()
      .sort((a, b) => b.updated - a.updated)
      .filter((p) => !q || p.root.toLowerCase().includes(q) || p.text.toLowerCase().includes(q));
    const grid = $('grid');
    grid.replaceChildren();
    if (!list.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      const msg = document.createElement('p');
      msg.textContent = q ? 'مفيش نتايج للبحث ده.' : 'المكتبة فاضية.';
      e.appendChild(msg);
      if (!q) e.appendChild(button('➕ شجرة جديدة', 'primary', () => TM.app.newTree()));
      grid.appendChild(e);
      return;
    }
    const currentId = store.current() && store.current().id;
    list.forEach((p) => grid.appendChild(card(p, currentId)));
  }

  $('search').addEventListener('input', render);

  $('export').addEventListener('click', async () => {
    store.flush();
    const r = await TM.platform.saveFile('tree-maker-backup', store.exportText(), 'json');
    if (r.ok) TM.ui.toast('تم حفظ النسخة الاحتياطية ✔');
    else if (!r.canceled) TM.ui.toast('تعذّر حفظ النسخة الاحتياطية');
  });

  $('import').addEventListener('click', async () => {
    const r = await TM.platform.openJson();
    if (!r.ok) {
      if (!r.canceled) TM.ui.toast(r.error === 'too-large' ? 'الملف كبير أوي' : 'تعذّر فتح الملف');
      return;
    }
    try {
      store.flush();
      const n = store.importText(r.text);
      TM.editor.load();
      store.persist();
      render();
      TM.ui.toast('تم استيراد ' + n + ' شجرة ✔');
    } catch {
      TM.ui.toast('الملف ده مش نسخة احتياطية صحيحة');
    }
  });

  TM.library = { render };
})(window.TM);
