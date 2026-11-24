'use strict';
/*
 * Everything that touches the outside world (clipboard, files, disk copy of the library).
 * Inside the desktop app it goes through the safe bridge from preload.js (window.api).
 * Opened in a normal browser (handy while developing) it falls back to browser features.
 */
(function (TM) {
  const api = window.api && window.api.isDesktop ? window.api : null;

  async function copyText(text) {
    if (api) return api.copyText(text);
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  // kind: 'txt' | 'json'. Resolves { ok, canceled?, name? }
  async function saveFile(name, content, kind) {
    if (api) return api.saveFile({ name, content, kind });
    const ext = kind === 'json' ? '.json' : '.txt';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([kind === 'txt' ? '﻿' + content : content], { type: 'text/plain;charset=utf-8' }));
    a.download = String(name).replace(/\.(txt|json)$/i, '').replace(/[\\/:*?"<>|]/g, '_') + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return { ok: true, name: a.download };
  }

  // Resolves { ok, text } or { ok:false, canceled? , error? }
  function openJson() {
    if (api) return api.openJson();
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async () => {
        const f = input.files && input.files[0];
        if (!f) return resolve({ ok: false, canceled: true });
        if (f.size > TM.limits.MAX_FILE) return resolve({ ok: false, error: 'too-large' });
        try {
          resolve({ ok: true, text: await f.text() });
        } catch {
          resolve({ ok: false, error: 'read-failed' });
        }
      };
      input.click();
    });
  }

  // Opens the system folder picker and reads the chosen folder (desktop only).
  // Resolves { ok, name, text, count, truncated } or { ok:false, canceled?, error? }
  async function scanFolder(opts) {
    if (!api) return { ok: false, error: 'unsupported' };
    return api.scanFolder({ skipHeavy: !!(opts && opts.skipHeavy) });
  }

  // Create the tree as real folders and files (desktop only). The page only sends names;
  // the place is chosen in the system dialog and everything is checked in the main process.
  const UNSUPPORTED = { ok: false, error: 'unsupported' };
  const pickCreateTarget = async (payload) => (api ? api.pickCreateTarget(payload) : UNSUPPORTED);
  const runCreate = async () => (api ? api.runCreate() : UNSUPPORTED);
  const cancelCreate = async () => (api ? api.cancelCreate() : true);
  const openCreated = async () => (api ? api.openCreated() : false);

  // Disk copy of the library (desktop only). Safe to call when not available.
  const loadStored = () => (api ? api.loadStored() : null);
  const saveStored = (json) => { if (api) api.saveStored(json); };
  const saveStoredNow = (json) => { if (api) api.saveStoredNow(json); };

  TM.platform = { isDesktop: !!api, copyText, saveFile, openJson, scanFolder, pickCreateTarget, runCreate, cancelCreate, openCreated, loadStored, saveStored, saveStoredNow };
})(window.TM);
