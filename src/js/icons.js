'use strict';
/* File-extension -> icon. To add a type, add one line to the list below. */
(function (TM) {
  const ICONS = new Map(
    Object.entries({
      // documents
      doc: '📘', docx: '📘', pdf: '📕', txt: '📝', md: '📝', rtf: '📝', odt: '📘',
      xls: '📗', xlsx: '📗', csv: '📗', ppt: '📙', pptx: '📙',
      // images
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', bmp: '🖼️', svg: '🖼️', webp: '🖼️', ico: '🖼️', psd: '🎨',
      // audio / video
      mp3: '🎵', wav: '🎵', flac: '🎵', m3u: '🎶', m4a: '🎵', ogg: '🎵',
      mp4: '🎬', mkv: '🎬', avi: '🎬', mov: '🎬', webm: '🎬',
      // archives / programs
      zip: '🗜️', rar: '🗜️', '7z': '🗜️', tar: '🗜️', gz: '🗜️', iso: '💿',
      exe: '⚙️', msi: '📦', apk: '📦', bat: '⚙️', sh: '⚙️',
      // settings
      ini: '🔧', cfg: '🔧', conf: '🔧', json: '🔧', yml: '🔧', yaml: '🔧', xml: '🔧', env: '🔧', toml: '🔧',
      // code
      py: '🐍', js: '📜', ts: '📜', jsx: '📜', tsx: '📜', html: '🌐', htm: '🌐', css: '🎨', php: '📜',
      java: '☕', c: '📜', cpp: '📜', cs: '📜', go: '📜', rs: '📜', sql: '🗄️', db: '🗄️',
      // misc
      log: '🧾', lock: '🔒', key: '🔑', dll: '🧩',
    })
  );

  const FOLDER = '📁';
  const DEFAULT_FILE = '📄';

  function fileIcon(name) {
    const i = name.lastIndexOf('.');
    if (i <= 0 && !name.startsWith('.')) return DEFAULT_FILE;
    // Map lookup (not a plain object) so names like "x.constructor" can never hit inherited properties.
    return ICONS.get(name.slice(i + 1).toLowerCase()) || DEFAULT_FILE;
  }

  TM.icons = { fileIcon, FOLDER };
})(window.TM);
