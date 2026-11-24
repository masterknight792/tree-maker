'use strict';
/*
 * Main process. Everything here is security-sensitive, so it is kept small:
 *  - one locked-down window (sandbox, context isolation, no Node in the page)
 *  - no network at all (every http/https/ws request is cancelled)
 *  - no permissions (camera, mic, geolocation, notifications ... all denied)
 *  - no navigation, no new windows, no <webview>
 *  - only 6 IPC channels, each one checks WHO is calling and WHAT it sent
 */

const { app, BrowserWindow, ipcMain, dialog, clipboard, session, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { scanFolder, rootName, cleanName } = require('./scanner');
const creator = require('./creator');

app.enableSandbox();

const INDEX_PATH = path.join(__dirname, 'src', 'index.html');
const INDEX_URL = pathToFileURL(INDEX_PATH).href.toLowerCase();

const MAX_FILE = 25_000_000; // bytes/chars accepted for import, export and the autosave file
const MAX_CLIP = 5_000_000;

let mainWindow = null;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

// Only our own index.html may talk to the main process.
function isTrusted(event) {
  try {
    const url = event && event.senderFrame && event.senderFrame.url;
    if (typeof url !== 'string') return false;
    return url.split(/[?#]/)[0].toLowerCase() === INDEX_URL;
  } catch {
    return false;
  }
}

function safeFileName(name, fallback) {
  let s = String(name == null ? '' : name)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 120);
  if (!s || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(s)) s = fallback;
  return s;
}

const FILE_KINDS = {
  txt: { ext: '.txt', bom: true, filters: [{ name: 'Text file', extensions: ['txt'] }], title: 'Save tree as text' },
  json: { ext: '.json', bom: false, filters: [{ name: 'Backup file', extensions: ['json'] }], title: 'Save backup' },
};

/* ------------------------------------------------------------------ *
 * Autosave file (second copy of the library, next to the browser storage)
 * ------------------------------------------------------------------ */

let pendingDb = null;
let dbTimer = null;

function dbPaths() {
  const dir = app.getPath('userData');
  return { dir, file: path.join(dir, 'trees.json'), bak: path.join(dir, 'trees.backup.json'), tmp: path.join(dir, 'trees.json.tmp') };
}

function writeDbNow() {
  if (pendingDb === null) return;
  const data = pendingDb;
  pendingDb = null;
  clearTimeout(dbTimer);
  dbTimer = null;
  try {
    const p = dbPaths();
    fs.mkdirSync(p.dir, { recursive: true });
    fs.writeFileSync(p.tmp, data, { encoding: 'utf8', mode: 0o600 });
    try {
      if (fs.existsSync(p.file)) fs.copyFileSync(p.file, p.bak);
    } catch { /* backup is best effort */ }
    fs.renameSync(p.tmp, p.file); // atomic replace: a crash never leaves a half-written file
  } catch (err) {
    console.error('autosave failed:', err && err.message);
  }
}

function readDb() {
  const p = dbPaths();
  for (const f of [p.file, p.bak]) {
    try {
      const st = fs.statSync(f);
      if (!st.isFile() || st.size > MAX_FILE) continue;
      return fs.readFileSync(f, 'utf8');
    } catch { /* try next */ }
  }
  return null;
}

ipcMain.on('db:load', (event) => {
  event.returnValue = isTrusted(event) ? readDb() : null;
});

ipcMain.on('db:save', (event, json) => {
  if (!isTrusted(event) || typeof json !== 'string' || json.length > MAX_FILE) return;
  pendingDb = json;
  clearTimeout(dbTimer);
  dbTimer = setTimeout(writeDbNow, 250);
});

// Synchronous variant, used while the page is closing so nothing is lost.
ipcMain.on('db:save-now', (event, json) => {
  if (isTrusted(event) && typeof json === 'string' && json.length <= MAX_FILE) {
    pendingDb = json;
    writeDbNow();
  }
  event.returnValue = true;
});

/* ------------------------------------------------------------------ *
 * File dialogs and clipboard (the page never touches the disk itself)
 * ------------------------------------------------------------------ */

ipcMain.handle('file:save', async (event, payload) => {
  try {
    if (!isTrusted(event) || !payload || typeof payload !== 'object') return { ok: false, error: 'rejected' };
    const { name, content, kind } = payload;
    const k = Object.prototype.hasOwnProperty.call(FILE_KINDS, kind) ? FILE_KINDS[kind] : null;
    if (!k || typeof content !== 'string' || content.length > MAX_FILE) return { ok: false, error: 'rejected' };

    const base = safeFileName(name, 'folder-map').replace(/\.(txt|json)$/i, '') + k.ext;
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showSaveDialog(win, {
      title: k.title,
      defaultPath: path.join(app.getPath('documents'), base),
      filters: k.filters,
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };

    let target = res.filePath;
    if (path.extname(target).toLowerCase() !== k.ext) target += k.ext;
    await fs.promises.writeFile(target, (k.bom ? '﻿' : '') + content, { encoding: 'utf8' });
    return { ok: true, name: path.basename(target) };
  } catch (err) {
    return { ok: false, error: 'write-failed' };
  }
});

ipcMain.handle('file:open-json', async (event) => {
  try {
    if (!isTrusted(event)) return { ok: false, error: 'rejected' };
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win, {
      title: 'Open backup',
      properties: ['openFile'],
      filters: [{ name: 'Backup file', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
    const f = res.filePaths[0];
    const st = await fs.promises.stat(f);
    if (!st.isFile() || st.size > MAX_FILE) return { ok: false, error: 'too-large' };
    return { ok: true, text: await fs.promises.readFile(f, 'utf8') };
  } catch {
    return { ok: false, error: 'read-failed' };
  }
});

// The page can't choose a path: the user picks the folder in the system dialog,
// and only names (never full paths) go back to the page.
let scanning = false;
ipcMain.handle('folder:scan', async (event, opts) => {
  if (scanning) return { ok: false, error: 'busy' };
  scanning = true;
  try {
    if (!isTrusted(event)) return { ok: false, error: 'rejected' };
    const skipHeavy = !(opts && typeof opts === 'object' && opts.skipHeavy === false);
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win, { title: 'Choose a folder', properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
    const folder = res.filePaths[0];
    const r = await scanFolder(folder, { skipHeavy });
    return { ok: true, name: cleanName(rootName(folder)).slice(0, 255) || 'Folder', text: r.text, count: r.count, truncated: r.truncated };
  } catch {
    return { ok: false, error: 'scan-failed' };
  } finally {
    scanning = false;
  }
});

/*
 * Create the tree as real folders and empty files.
 * Two steps so the page never supplies a path: (1) "pick": the page sends only names, the user
 * chooses the place in the system dialog, the main process checks everything and keeps the plan;
 * (2) "run": after the user confirmed in the page, the kept plan is executed (once, within 2 minutes).
 * Nothing is ever overwritten or deleted (see creator.js).
 */
let pendingCreate = null;
let lastCreated = null;
let creating = false;

ipcMain.handle('tree:create-pick', async (event, payload) => {
  try {
    if (!isTrusted(event) || creating) return { ok: false, error: 'rejected' };
    pendingCreate = null;
    if (!payload || typeof payload !== 'object' || typeof payload.root !== 'string') return { ok: false, error: 'rejected' };

    const rootWhy = creator.checkName(payload.root);
    if (rootWhy) return { ok: false, error: 'bad-root', why: rootWhy };
    try {
      creator.checkShape(payload.tree);
    } catch (e) {
      return { ok: false, error: e && e.message === 'too-many' ? 'too-many' : 'rejected' };
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose where to create the folders and files',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };

    const finalPath = path.join(res.filePaths[0], payload.root);
    if (finalPath.length > creator.LIMITS.MAX_PATH) return { ok: false, error: 'path-too-long' };

    let exists = false;
    try {
      const st = await fs.promises.lstat(finalPath);
      exists = true;
      if (!st.isDirectory() || st.isSymbolicLink()) return { ok: false, error: 'root-conflict' };
    } catch (e) {
      if (e.code !== 'ENOENT') return { ok: false, error: 'failed' };
    }

    const built = creator.buildOps(finalPath, payload.tree);
    pendingCreate = { finalPath, ops: built.ops, expires: Date.now() + 120000 };
    return {
      ok: true,
      finalPath, // shown to the user in the confirmation (it is the place they just chose)
      exists,
      folders: built.folders,
      files: built.files,
      invalid: built.invalid,
      invalidCount: built.invalidCount,
      tooLong: built.tooLong,
    };
  } catch {
    return { ok: false, error: 'failed' };
  }
});

ipcMain.handle('tree:create-run', async (event) => {
  if (!isTrusted(event) || creating) return { ok: false, error: 'rejected' };
  const plan = pendingCreate;
  pendingCreate = null;
  if (!plan || Date.now() > plan.expires) return { ok: false, error: 'expired' };
  creating = true;
  try {
    const r = await creator.execute(plan.finalPath, plan.ops);
    lastCreated = plan.finalPath;
    return Object.assign({ ok: true }, r);
  } catch (e) {
    return { ok: false, error: e && e.message === 'root-conflict' ? 'root-conflict' : 'failed' };
  } finally {
    creating = false;
  }
});

ipcMain.handle('tree:create-cancel', (event) => {
  if (isTrusted(event)) pendingCreate = null;
  return true;
});

// Opens the folder that was just created (the path is remembered here, never taken from the page).
ipcMain.handle('tree:create-open', async (event) => {
  if (!isTrusted(event) || !lastCreated) return false;
  return (await shell.openPath(lastCreated)) === '';
});

ipcMain.handle('clipboard:write', (event, text) => {
  if (!isTrusted(event) || typeof text !== 'string' || text.length > MAX_CLIP) return false;
  clipboard.writeText(text);
  return true;
});

/* ------------------------------------------------------------------ *
 * Hardening
 * ------------------------------------------------------------------ */

function hardenSession(ses) {
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  if (typeof ses.setDevicePermissionHandler === 'function') ses.setDevicePermissionHandler(() => false);
  // The app is 100% offline: cancel anything that is not a local file.
  ses.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] },
    (_details, callback) => callback({ cancel: true })
  );
}

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (e) => e.preventDefault());
  contents.on('will-redirect', (e) => e.preventDefault());
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

/* ------------------------------------------------------------------ *
 * Window
 * ------------------------------------------------------------------ */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: '#0f1115',
    title: 'Folder Tree Maker',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
    writeDbNow();
  });
  mainWindow.loadFile(INDEX_PATH);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    hardenSession(session.defaultSession);
    if (app.isPackaged) Menu.setApplicationMenu(null); // no menu bar, no dev shortcuts in the shipped app
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', writeDbNow);
  app.on('will-quit', writeDbNow);
  app.on('window-all-closed', () => {
    writeDbNow();
    app.quit();
  });
}
