'use strict';
/* Small UI pieces: confirm dialog, toast message, save-status label, trees counter. */
(function (TM) {
  const $ = TM.$;

  /* ----- confirm dialog ----- */
  let modalResolve = null;

  // opts.single: only an OK button (a notice). opts.detail: extra text shown in a code box (paths, lists).
  function ask(title, msg, okLabel, danger = true, opts = {}) {
    return new Promise((resolve) => {
      modalResolve = resolve;
      $('mTitle').textContent = title;
      $('mMsg').textContent = msg;
      const detail = $('mDetail');
      detail.textContent = opts.detail || '';
      detail.hidden = !opts.detail;
      const ok = $('mOk');
      ok.textContent = okLabel;
      ok.className = danger ? 'danger' : 'primary';
      $('mCancel').hidden = !!opts.single;
      $('overlay').classList.add('show');
      (opts.single ? ok : $('mCancel')).focus();
    });
  }

  function closeModal(value) {
    $('overlay').classList.remove('show');
    if (modalResolve) {
      modalResolve(value);
      modalResolve = null;
    }
  }

  $('mOk').addEventListener('click', () => closeModal(true));
  $('mCancel').addEventListener('click', () => closeModal(false));
  $('overlay').addEventListener('mousedown', (e) => { if (e.target === $('overlay')) closeModal(false); });
  document.addEventListener('keydown', (e) => {
    if (!$('overlay').classList.contains('show')) return;
    if (e.key === 'Escape') return closeModal(false);
    if (e.key === 'Tab') { // keep keyboard focus inside the dialog
      e.preventDefault();
      ($('mOk') === document.activeElement ? $('mCancel') : $('mOk')).focus();
    }
  });

  /* ----- toast (optional undo button) ----- */
  let toastTimer = null;

  function toast(msg, actionLabel, action) {
    const t = $('toast');
    t.replaceChildren();
    const span = document.createElement('span');
    span.textContent = msg;
    t.appendChild(span);
    if (actionLabel) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = actionLabel;
      b.addEventListener('click', () => { t.classList.remove('show'); action(); });
      t.appendChild(b);
    }
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), actionLabel ? 7000 : 1600);
  }

  /* ----- save status + counter ----- */
  function setStatus(ok, note) {
    const s = $('status');
    const b = document.createElement('b');
    s.replaceChildren();
    if (ok) {
      const t = new Date().toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
      s.className = 'status ok';
      b.textContent = '✔';
      s.append(b, ' محفوظ تلقائيًا · ' + t);
    } else {
      s.className = 'status bad';
      b.textContent = '⚠️';
      s.append(b, ' ' + (note || 'تعذّر الحفظ'));
    }
  }

  const setCount = (n) => { $('count').textContent = String(n); };

  TM.ui = { ask, toast, setStatus, setCount };
})(window.TM);
