'use strict';
/* Start-up and top-bar navigation. Loaded last. */
(function (TM) {
  const $ = TM.$;
  const store = TM.store;

  function show(view) {
    const lib = view === 'library';
    $('viewEditor').classList.toggle('show', !lib);
    $('viewLibrary').classList.toggle('show', lib);
    $('navLib').classList.toggle('active', lib);
    $('navEdit').classList.toggle('active', !lib);
    if (lib) TM.library.render();
    else TM.editor.focus();
  }

  function newTree() {
    TM.editor.sync();
    const p = store.current();
    // an untouched empty tree is reused instead of piling up blank ones
    if (p && !p.text.trim() && p.root === 'My_Project') {
      show('editor');
      TM.ui.toast('الشجرة فاضية وجاهزة للكتابة');
      return;
    }
    store.add({}, true);
    store.persist();
    TM.editor.load();
    show('editor');
    TM.ui.toast('تم إنشاء شجرة جديدة ✔');
  }

  $('navLib').addEventListener('click', () => { store.flush(); show('library'); });
  $('navEdit').addEventListener('click', () => show('editor'));
  $('navNew').addEventListener('click', newTree);
  $('emptyNew').addEventListener('click', newTree);

  // Instant save when the window closes, hides, or the app is killed.
  window.addEventListener('beforeunload', store.flush);
  window.addEventListener('pagehide', store.flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flush();
  });

  TM.app = { show, newTree };

  store.load();
  TM.editor.load();
})(window.TM);
