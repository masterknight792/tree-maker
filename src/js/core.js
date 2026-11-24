'use strict';
/* Shared namespace, limits and tiny helpers. Loaded first. */
(function (g) {
  const TM = (g.TM = g.TM || {});

  TM.$ = (id) => document.getElementById(id);

  // Hard limits: they keep the app fast and stop a hostile or broken backup file
  // from freezing it (huge text, endless nesting, thousands of trees...).
  TM.limits = Object.freeze({
    MAX_TEXT: 500000,
    MAX_LINES: 20000,
    MAX_DEPTH: 40,
    MAX_NAME: 255,
    MAX_ROOT: 255,
    MAX_PROJECTS: 300,
    MAX_DB: 20000000,
    MAX_FILE: 20000000,
    MAX_COLLAPSED: 20000,
  });

  // Random ids from the browser's crypto generator.
  TM.uid = () =>
    Array.from(g.crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
})(window);
