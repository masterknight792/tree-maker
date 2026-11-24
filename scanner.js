'use strict';
/*
 * Reads a folder from the disk and returns it as indented text that the editor understands.
 * Plain Node code (no Electron) so it can be tested on its own.
 *
 * Safety rules:
 *  - it never follows shortcuts/links/junctions, so a link loop can't run forever
 *  - hard limits on entries, depth, text size and time, so a huge drive can't freeze the app
 *  - unreadable folders are skipped silently
 *  - names are cleaned of control and direction-override characters (look-alike file-name tricks)
 *  - only names are returned, never full paths
 *
 * Output format: one name per line, 2 spaces per level.
 *   folders end with "/"        (so empty folders are still folders)
 *   files without a dot end "*" (so "Makefile" is still a file; "*" can't be part of a Windows name)
 */
const fs = require('node:fs');
const path = require('node:path');

const HEAVY = new Set([
  'node_modules', '.git', '.svn', '.hg', '__pycache__', '.venv', 'venv',
  '.idea', '.vs', '.gradle', '.next', '.cache',
]);

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g;

const cleanName = (n) => String(n).replace(CONTROL_RE, ' ').trim();

function rootName(p) {
  const base = path.basename(p);
  return base || p.replace(/[\\/]+$/, '') || 'Folder';
}

async function scanFolder(rootPath, options) {
  const o = Object.assign(
    { skipHeavy: true, maxEntries: 20000, maxDepth: 40, maxChars: 450000, timeoutMs: 20000 },
    options
  );
  const deadline = Date.now() + o.timeoutMs;
  const lines = [];
  let chars = 0;
  let count = 0;
  let truncated = false;
  let unreadable = 0;

  const stop = () => {
    if (truncated) return true;
    if (count >= o.maxEntries || chars >= o.maxChars || Date.now() > deadline) truncated = true;
    return truncated;
  };

  async function walk(dir, depth) {
    const entries = [];
    try {
      const handle = await fs.promises.opendir(dir);
      for await (const e of handle) {
        entries.push(e);
        if (entries.length > o.maxEntries) { truncated = true; break; }
      }
    } catch {
      unreadable++;
      return;
    }

    entries.sort((a, b) => {
      const da = a.isDirectory();
      const db = b.isDirectory();
      if (da !== db) return da ? -1 : 1;
      return collator.compare(a.name, b.name);
    });

    for (const e of entries) {
      if (stop()) return;
      const name = cleanName(e.name);
      if (!name) continue;
      const indent = '  '.repeat(depth);

      if (e.isDirectory()) { // false for links, so links are never followed
        const line = indent + name + '/';
        lines.push(line);
        chars += line.length + 1;
        count++;
        const heavy = o.skipHeavy && HEAVY.has(name.toLowerCase());
        if (!heavy) {
          if (depth + 1 < o.maxDepth) await walk(path.join(dir, e.name), depth + 1);
          else truncated = true;
        }
      } else {
        const line = indent + (name.includes('.') ? name : name + '*');
        lines.push(line);
        chars += line.length + 1;
        count++;
      }
    }
  }

  await walk(rootPath, 0);
  return { text: lines.join('\n'), count, truncated, unreadable };
}

module.exports = { scanFolder, rootName, cleanName };
