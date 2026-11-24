'use strict';
/* Turns the typed, indented text into a tree and draws it as rows / text lines. No DOM here. */
(function (TM) {
  const L = TM.limits;

  // Control characters and text-direction overrides can make a name look like something else
  // (for example "photo‮gpj.exe" displays as "photoexe.jpg"), so they are removed.
  const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g;
  const clean = (s) => String(s).replace(CONTROL_RE, '').trim();

  /*
   * Line rules:
   *   2 spaces of indent = one level deeper
   *   name/   -> folder          name*  -> file (even without a dot)
   *   otherwise: no dot in the name = folder, a dot = file
   * Drawing characters from an already drawn tree (├── └── │ |-- etc.) at the start are ignored.
   */
  function parse(text) {
    const root = { name: '', children: [], explicitFolder: true, explicitFile: false };
    const stack = [{ node: root, indent: -1 }];
    let count = 0;

    for (let raw of String(text).split('\n')) {
      if (count >= L.MAX_LINES) break;
      raw = raw.replace(/\t/g, '  ').replace(/\r/g, '');
      if (!raw.trim()) continue;

      const indent = raw.match(/^ */)[0].length;
      let name = raw.trim().replace(/^(?:[│├└─\s]|[`+\\|]-{2}\s?|\|\s)+/, '').replace(/^(📁|📂|📄)\s*/, '');
      name = clean(name);
      if (!name) continue;

      const explicitFolder = name.endsWith('/') || name.endsWith('\\');
      name = name.replace(/[\/\\]+$/, '');
      const explicitFile = !explicitFolder && name.endsWith('*');
      if (explicitFile) name = name.replace(/\*+$/, '');
      name = name.slice(0, L.MAX_NAME);
      if (!name) continue;

      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      while (stack.length > L.MAX_DEPTH) stack.pop(); // cap the nesting depth

      const node = { name, children: [], explicitFolder, explicitFile };
      stack[stack.length - 1].node.children.push(node);
      stack.push({ node, indent });
      count++;
    }
    return root;
  }

  const isFolder = (n) => n.children.length > 0 || n.explicitFolder || (!n.explicitFile && !n.name.includes('.'));
  const countNodes = (n) => n.children.reduce((s, c) => s + 1 + countNodes(c), 0);

  /*
   * The drawn tree as data, in display order (all folders open).
   * p = { root, text, icons, folderFirst, ascii }
   * Each row: { prefix, icon, name, folder, hasKids, key, depth }
   *   key = path of names, used to remember which folders are closed.
   * folderKeys = keys of every folder that has something inside (the ones that can be closed).
   */
  function buildRows(p) {
    const T = p.ascii
      ? { mid: '+-- ', last: '\\-- ', pipe: '|   ', blank: '    ' }
      : { mid: '├── ', last: '└── ', pipe: '│   ', blank: '    ' };
    const tree = parse(p.text);
    const rows = [];
    const folderKeys = [];

    const walk = (node, prefix, keyPrefix, depth) => {
      const kids = node.children.slice();
      if (p.folderFirst) kids.sort((a, b) => isFolder(b) - isFolder(a));
      kids.forEach((k, i) => {
        const last = i === kids.length - 1;
        const folder = isFolder(k);
        const key = keyPrefix + '/' + k.name;
        const hasKids = k.children.length > 0;
        rows.push({
          prefix: prefix + (last ? T.last : T.mid),
          icon: p.icons ? (folder ? TM.icons.FOLDER : TM.icons.fileIcon(k.name)) : '',
          name: k.name,
          folder,
          hasKids,
          key,
          depth,
        });
        if (hasKids) folderKeys.push(key);
        walk(k, prefix + (last ? T.blank : T.pipe), key, depth + 1);
      });
    };
    walk(tree, '', '', 0);

    return {
      rootIcon: p.icons ? TM.icons.FOLDER : '',
      rootName: clean(p.root) || 'Folder',
      rows,
      folderKeys,
    };
  }

  // The full tree (every folder open) as plain text lines. Used for copy, save and library previews.
  function buildLines(p) {
    const m = buildRows(p);
    return [
      (m.rootIcon ? m.rootIcon + ' ' : '') + m.rootName,
      ...m.rows.map((r) => r.prefix + (r.icon ? r.icon + ' ' : '') + r.name),
    ];
  }

  // The whole tree (closed folders included) as plain nested data, for creating real folders/files.
  // A node is a folder or a file by exactly the same rule used to draw its icon.
  function toPlan(p) {
    const conv = (n) => ({ name: n.name, dir: isFolder(n), children: n.children.map(conv) });
    const tree = parse(p.text);
    return { root: clean(p.root) || 'Folder', nodes: tree.children.map(conv), count: countNodes(tree) };
  }

  TM.tree = { parse, buildRows, buildLines, toPlan, countNodes, clean };
})(window.TM);
