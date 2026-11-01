// Общие помощники: даты, хранилище, DOM, уведомления
const U = {
  MONTHS: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  MONTHS_GEN: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  WEEKDAYS: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
  WD_SHORT: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],

  pad: n => String(n).padStart(2, '0'),
  ymd(d) { return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`; },
  parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
  today() { return U.ymd(new Date()); },
  addDays(s, n) { const d = U.parse(s); d.setDate(d.getDate() + n); return U.ymd(d); },
  toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; },
  fmtMin(m) { return `${U.pad(Math.floor(m / 60) % 24)}:${U.pad(m % 60)}`; },
  at(s, t) { const d = U.parse(s); const m = U.toMin(t); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d; },
  // понедельник = 0
  wd(s) { return (U.parse(s).getDay() + 6) % 7; },
  human(s) { const d = U.parse(s); return `${d.getDate()} ${U.MONTHS_GEN[d.getMonth()]}`; },
  stamp(t) {
    const d = new Date(t);
    return `${U.pad(d.getDate())}.${U.pad(d.getMonth() + 1)} ${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`;
  },
  plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b >= 2 && b <= 4) return few;
    return many;
  },

  load(key, def) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  save(key, val) {
    if (typeof Sync !== 'undefined' && Sync.applying) return; // идёт загрузка данных с другого устройства
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn('save failed', e); }
    if (typeof Sync !== 'undefined') Sync.touch(key);
  },

  esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  $(sel, root = document) { return root.querySelector(sel); },
  $$(sel, root = document) { return [...root.querySelectorAll(sel)]; },

  toast(msg) {
    const t = U.$('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(U._tt);
    U._tt = setTimeout(() => t.classList.remove('show'), 2600);
  },

  // Модальное окно: html — содержимое, onMount(root) — навесить обработчики
  modal(html, onMount, cls = '') {
    const ov = U.$('#overlay');
    ov.innerHTML = `<div class="modal ${cls}">${html}</div>`;
    ov.classList.remove('hidden');
    const root = ov.firstElementChild;
    ov.onclick = e => { if (e.target === ov) U.closeModal(); };
    U.$$('[data-close]', root).forEach(b => b.onclick = () => U.closeModal());
    onMount && onMount(root);
    return root;
  },
  closeModal() {
    const ov = U.$('#overlay');
    ov.classList.add('hidden');
    ov.innerHTML = '';
    U.onModalClose && U.onModalClose();
    U.onModalClose = null;
  },
  confirm(text, yes) {
    U.modal(`<h2>${U.esc(text)}</h2>
      <div class="actions"><button class="btn grow" data-close>Отмена</button><button class="btn danger grow" id="cf-yes">Да</button></div>`,
      r => U.$('#cf-yes', r).onclick = () => { U.closeModal(); yes(); });
  },
};
