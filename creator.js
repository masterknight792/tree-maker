'use strict';
/*
 * Creates real folders and (empty) files on the disk from the tree.
 * Plain Node code (no Electron) so it can be tested on its own.
 *
 * Safety rules:
 *  - NEVER overwrites, replaces or deletes anything: files are created with the "wx" flag
 *    (fails if the name already exists) and existing folders are only reused.
 *  - names are checked against Windows rules (illegal characters, reserved names such as
 *    CON / NUL / COM1, trailing dot or space, length). A bad name is skipped together with
 *    everything inside it, and reported.
 *  - names can't contain a path separator or "..", and every final path is checked to be
 *    inside the chosen folder.
 *  - existing links / junctions are never written through.
 *  - hard limits on entries, depth and path length.
 */
const fs = require('node:fs');
const path = require('node:path');

const LIMITS = Object.freeze({ MAX_ENTRIES: 20000, MAX_DEPTH: 40, MAX_PATH: 250, MAX_NAME: 255 });
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

// Returns null when the name is fine, otherwise a short reason code.
function checkName(name) {
  if (typeof name !== 'string' || !name.trim()) return 'empty';
  if (name.length > LIMITS.MAX_NAME) return 'too-long';
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(name)) return 'illegal';
  if (/[. ]$/.test(name)) return 'ends-dot-space';
  if (RESERVED.test(name)) return 'reserved';
  return null;
}

// The tree arrives from the page, so its shape and size are checked first. Returns the entry count.
function checkShape(nodes) {
  let total = 0;
  const walk = (list, depth) => {
    if (!Array.isArray(list) || depth > LIMITS.MAX_DEPTH) throw new Error('bad-shape');
    for (const n of list) {
      if (!n || typeof n !== 'object' || typeof n.name !== 'string' || typeof n.dir !== 'boolean') throw new Error('bad-shape');
      if (++total > LIMITS.MAX_ENTRIES) throw new Error('too-many');
      if (n.children !== undefined) walk(n.children, depth + 1);
    }
  };
  walk(nodes, 1);
  return total;
}

// Turns the tree into a flat, ordered list of things to create (parents before children).
function buildOps(rootPath, nodes) {
  checkShape(nodes);
  const ops = [];
  const invalid = [];
  let invalidCount = 0;
  let tooLong = 0;

  const walk = (list, dir) => {
    for (const n of list) {
      const why = checkName(n.name);
      if (why) {
        invalidCount++;
        if (invalid.length < 20) invalid.push({ name: n.name.slice(0, 60), why });
        continue;
      }
      const full = path.join(dir, n.name);
      if (!full.startsWith(rootPath + path.sep)) { // can't happen with checked names; belt and braces
        invalidCount++;
        if (invalid.length < 20) invalid.push({ name: n.name.slice(0, 60), why: 'illegal' });
        continue;
      }
      if (full.length > LIMITS.MAX_PATH) {
        tooLong++;
        continue;
      }
      ops.push({ full, dir: n.dir });
      if (n.dir && Array.isArray(n.children)) walk(n.children, full);
    }
  };
  walk(nodes, rootPath);

  const folders = ops.filter((o) => o.dir).length;
  return { ops, invalid, invalidCount, tooLong, folders, files: ops.length - folders };
}

const isRealDir = (st) => st.isDirectory() && !st.isSymbolicLink();

// Makes the main folder. Reuses it if it is already a real folder; throws otherwise.
async function ensureRoot(rootPath) {
  try {
    await fs.promises.mkdir(rootPath);
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    if (!isRealDir(await fs.promises.lstat(rootPath))) throw new Error('root-conflict');
    return false;
  }
}

async function execute(rootPath, ops) {
  const res = { rootCreated: false, createdFolders: 0, createdFiles: 0, existed: 0, conflicts: 0, failed: 0 };
  res.rootCreated = await ensureRoot(rootPath);
  const blocked = new Set(); // folders that could not be made/used: their content is skipped

  for (const op of ops) {
    if (blocked.has(path.dirname(op.full))) {
      res.failed++;
      if (op.dir) blocked.add(op.full);
      continue;
    }
    try {
      if (op.dir) {
        try {
          await fs.promises.mkdir(op.full);
          res.createdFolders++;
        } catch (e) {
          if (e.code !== 'EEXIST') throw e;
          if (isRealDir(await fs.promises.lstat(op.full))) res.existed++;
          else { res.conflicts++; blocked.add(op.full); } // a file or a link has this name
        }
      } else {
        let handle = null;
        try {
          handle = await fs.promises.open(op.full, 'wx'); // fails if anything already has this name
          res.createdFiles++;
        } catch (e) {
          if (e.code !== 'EEXIST') throw e;
          if ((await fs.promises.lstat(op.full)).isFile()) res.existed++;
          else res.conflicts++;
        } finally {
          if (handle) await handle.close();
        }
      }
    } catch {
      res.failed++;
      if (op.dir) blocked.add(op.full);
    }
  }
  return res;
}

module.exports = { checkName, checkShape, buildOps, execute, LIMITS };
