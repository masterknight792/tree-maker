'use strict';
/*
 * The library: all saved trees. Saved in two places at once (desktop app):
 *   1) browser storage inside the app, 2) a trees.json file in the app's data folder.
 * On start the newest copy wins. Everything that comes from storage or from an
 * imported backup is cleaned field by field, so a damaged or hostile file can't
 * inject anything or break the app.
 */
(function (TM) {
  const L = TM.limits;
  const KEY = 'tree-maker-v2';
  const OLD_KEY = 'tree-maker-v1';

  const EXAMPLE = `Documents
  Work
    project.docx
    notes.txt
  Personal
    diary.txt
  report.pdf
Pictures
  Vacation
    image01.jpg
    image02.png
  Wallpapers
    background.jpg
Downloads
  setup.exe
  archive.zip
  installer.msi
Games
  Minecraft
    Mods
    Saves
  Survival
    config.ini
Music
  Rock
  Classical
  Playlist.m3u
Backup
  old_files
  settings
  backup_2026.zip`;

  let db = { projects: [], currentId: null };

  /* ----- cleaning ----- */
  const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);

  function newProject(extra) {
    return Object.assign(
      { id: TM.uid(), root: 'My_Project', text: '', icons: true, folderFirst: false, ascii: false, collapsed: [], updated: Date.now() },
      extra
    );
  }

  // Copies only the known fields, with the right types and sizes. Returns null if unusable.
  function cleanProject(p) {
    if (!p || typeof p !== 'object' || typeof p.text !== 'string') return null;
    return {
      id: typeof p.id === 'string' && /^[a-z0-9]{1,40}$/.test(p.id) ? p.id : TM.uid(),
      root: typeof p.root === 'string' ? p.root.slice(0, L.MAX_ROOT) : 'Imported',
      text: p.text.slice(0, L.MAX_TEXT),
      icons: p.icons !== false,
      folderFirst: p.folderFirst === true,
      ascii: p.ascii === true,
      collapsed: Array.isArray(p.collapsed)
        ? p.collapsed.filter((k) => typeof k === 'string').slice(0, L.MAX_COLLAPSED).map((k) => k.slice(0, 2000))
        : [],
      updated: isFiniteNumber(p.updated) && p.updated >= 0 && p.updated <= 8.64e15 ? p.updated : Date.now(),
    };
  }

  function cleanList(list, existingIds) {
    const seen = new Set(existingIds || []);
    const out = [];
    for (const item of list.slice(0, L.MAX_PROJECTS)) {
      const c = cleanProject(item);
      if (!c) continue;
      while (seen.has(c.id)) c.id = TM.uid();
      seen.add(c.id);
      out.push(c);
    }
    return out;
  }

  function parseDb(raw) {
    if (typeof raw !== 'string' || !raw || raw.length > L.MAX_DB * 1.5) return null;
    try {
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || !Array.isArray(d.projects)) return null;
      return {
        projects: cleanList(d.projects),
        currentId: typeof d.currentId === 'string' ? d.currentId : null,
        savedAt: isFiniteNumber(d.savedAt) ? d.savedAt : 0,
      };
    } catch {
      return null;
    }
  }

  /* ----- load / save ----- */
  function load() {
    const candidates = [];
    try { candidates.push(localStorage.getItem(KEY)); } catch { /* storage blocked */ }
    try { candidates.push(TM.platform.loadStored()); } catch { /* no disk copy */ }

    let best = null;
    for (const raw of candidates) {
      const d = parseDb(raw);
      if (d && (!best || d.savedAt > best.savedAt)) best = d;
    }

    if (best) {
      db = { projects: best.projects, currentId: best.currentId };
    } else {
      // first run (or upgrade from the single-page version)
      let old = null;
      try { old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null'); } catch { /* ignore */ }
      if (old && typeof old.t === 'string') {
        db.projects = [newProject({ root: typeof old.r === 'string' ? old.r.slice(0, L.MAX_ROOT) : 'My_Project', text: old.t.slice(0, L.MAX_TEXT) })];
      } else {
        db.projects = [newProject({ root: 'My_Random_Folder', text: EXAMPLE })];
      }
    }
    // An empty library is allowed (the user may delete every tree): no placeholder tree is invented.
    if (!db.projects.some((p) => p.id === db.currentId)) db.currentId = db.projects.length ? db.projects[0].id : null;
    persist();
  }

  function serialize() {
    return JSON.stringify({ v: 2, savedAt: Date.now(), currentId: db.currentId, projects: db.projects });
  }

  function persist() {
    const json = serialize();
    TM.ui.setCount(db.projects.length);
    if (json.length > L.MAX_DB) {
      TM.ui.setStatus(false, 'المكتبة كبيرة أوي - امسح أو احذف شوية');
      return false;
    }
    let ok = false;
    try { localStorage.setItem(KEY, json); ok = true; } catch { /* quota or blocked */ }
    if (TM.platform.isDesktop) { TM.platform.saveStored(json); ok = true; }
    TM.ui.setStatus(ok);
    return ok;
  }

  // Instant save, used when the window is closing or the page is hidden.
  function flush() {
    if (TM.editor) TM.editor.sync();
    const json = serialize();
    if (json.length > L.MAX_DB) return;
    try { localStorage.setItem(KEY, json); } catch { /* ignore */ }
    TM.platform.saveStoredNow(json);
  }

  /* ----- library operations ----- */
  const projects = () => db.projects;
  const current = () => db.projects.find((p) => p.id === db.currentId);

  function setCurrent(id) {
    if (db.projects.some((p) => p.id === id)) db.currentId = id;
  }

  function add(extra, makeCurrent) {
    const p = newProject(extra);
    db.projects.push(p);
    if (makeCurrent) db.currentId = p.id;
    return p;
  }

  function duplicate(p) {
    const copy = Object.assign({}, p, { id: TM.uid(), root: (p.root + ' (نسخة)').slice(0, L.MAX_ROOT), collapsed: p.collapsed.slice(), updated: Date.now() });
    db.projects.push(copy);
    return copy;
  }

  // Returns what is needed to undo the removal.
  function remove(p) {
    const index = db.projects.indexOf(p);
    if (index < 0) return null;
    db.projects.splice(index, 1);
    const currentChanged = !db.projects.some((x) => x.id === db.currentId);
    if (currentChanged) db.currentId = db.projects.length ? db.projects[0].id : null;
    return { removed: p, index, currentChanged };
  }

  function restore(info) {
    db.projects.splice(Math.min(info.index, db.projects.length), 0, info.removed);
    if (!db.projects.some((x) => x.id === db.currentId)) db.currentId = info.removed.id;
  }

  function exportText() {
    return JSON.stringify({ v: 2, exportedAt: Date.now(), projects: db.projects }, null, 2);
  }

  // Throws if the text is not a valid backup. Returns how many trees were added.
  function importText(text) {
    if (typeof text !== 'string' || text.length > L.MAX_FILE) throw new Error('bad file');
    const d = JSON.parse(text);
    if (!d || typeof d !== 'object' || !Array.isArray(d.projects)) throw new Error('bad file');
    const room = Math.max(0, L.MAX_PROJECTS - db.projects.length);
    const added = cleanList(d.projects, db.projects.map((p) => p.id)).slice(0, room);
    db.projects.push(...added);
    if (!current() && added.length) db.currentId = added[0].id;
    return added.length;
  }

  TM.store = { EXAMPLE, load, persist, flush, projects, current, setCurrent, add, duplicate, remove, restore, exportText, importText };
})(window.TM);
