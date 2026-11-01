// Вход по паролю и синхронизация ноут ⇄ телефон через функцию Netlify.
// Основное хранилище — localStorage; сервер хранит общую копию.
const Sync = {
  PASS: '123456',
  URL: '/api/sync',
  KEYS: ['plan.tasks', 'plan.settings', 'game.state'],
  applying: false,
  dirty: false,
  pushing: false,
  online: false,

  isLogged() { return localStorage.getItem('auth.ok') === '1'; },
  login(p) {
    if (p !== this.PASS) return false;
    localStorage.setItem('auth.ok', '1');
    return true;
  },
  logout() { localStorage.removeItem('auth.ok'); location.reload(); },

  available() { return location.protocol.startsWith('http'); },
  updated() { return +localStorage.getItem('sync.updated') || 0; },

  setStatus(s) {
    this.status = s;
    const el = document.getElementById('sync-status');
    if (!el) return;
    el.innerHTML = ic({ ok: 'cloud', busy: 'sync', off: 'cloudOff', err: 'alert' }[s]);
    el.className = 'sync ' + s;
    el.title = { ok: 'Синхронизировано', busy: 'Синхронизация…', off: 'Без синхронизации (данные только на этом устройстве)', err: 'Ошибка синхронизации — данные сохранены локально' }[s];
  },

  async req(method, body) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10000);
    try {
      return await fetch(this.URL, {
        method, signal: ctl.signal, cache: 'no-store',
        headers: { 'x-pass': this.PASS, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } finally { clearTimeout(t); }
  },

  touch(key) {
    if (!this.KEYS.includes(key) || this.applying) return;
    localStorage.setItem('sync.updated', Date.now());
    this.dirty = true;
    // задачи отправляем сразу, а игру (она меняется каждую минуту) — не чаще раза в 20 с
    const delay = key === 'game.state' ? 20000 : 1500;
    const at = Date.now() + delay;
    if (this._t && this._at <= at) return;
    clearTimeout(this._t);
    this._at = at;
    this._t = setTimeout(() => { this._t = null; this.push(); }, delay);
  },

  apply(srv) {
    this.applying = true;
    for (const k of this.KEYS) {
      if (srv.data && srv.data[k] != null) localStorage.setItem(k, srv.data[k]);
      else localStorage.removeItem(k);
    }
    localStorage.setItem('sync.updated', srv.updatedAt);
  },

  // при старте: забрать свежие данные с сервера, если они новее
  async pull() {
    if (!this.available()) return this.setStatus('off');
    this.setStatus('busy');
    try {
      const r = await this.req('GET');
      if (!r.ok) { this.online = false; return this.setStatus('off'); }
      const srv = await r.json();
      this.online = true;
      if (srv.updatedAt && srv.updatedAt > this.updated()) {
        this.apply(srv);
        this.applying = false;
        this.setStatus('ok');
        return 'applied';
      }
      this.setStatus('ok');
      if (!srv.updatedAt || srv.updatedAt < this.updated()) this.dirty = true;
      return 'same';
    } catch {
      this.online = false;
      this.setStatus('off');
    }
  },

  async push() {
    if (!this.online || this.applying) return;
    if (this.pushing) { this.again = true; return; }
    this.pushing = true; this.dirty = false;
    this.setStatus('busy');
    try {
      const data = {};
      for (const k of this.KEYS) data[k] = localStorage.getItem(k);
      const r = await this.req('POST', { updatedAt: this.updated(), data });
      if (r.status === 409) {
        // на другом устройстве данные новее — берём их
        this.apply(await r.json());
        this.reload();
        return;
      }
      this.setStatus(r.ok ? 'ok' : 'err');
      if (!r.ok) this.dirty = true;
    } catch {
      this.dirty = true;
      this.setStatus('err');
    } finally {
      this.pushing = false;
      if (this.again) { this.again = false; this.push(); }
    }
  },

  // проверка: не изменилось ли что-то на другом устройстве
  async check() {
    if (!this.online || this.pushing || this.applying) return;
    if (this.dirty) return this.push();
    try {
      const r = await this.req('GET');
      if (!r.ok) return;
      const srv = await r.json();
      if (srv.updatedAt && srv.updatedAt > this.updated()) {
        if (!document.getElementById('overlay').classList.contains('hidden')) return; // не мешаем, пока открыто окно
        this.apply(srv);
        this.reload();
      }
    } catch { /* нет сети — попробуем позже */ }
  },

  reload() {
    sessionStorage.setItem('sync.reloaded', '1');
    location.reload();
  },

  start() {
    if (this.dirty) this.push();
    setInterval(() => this.check(), 45000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { if (this.dirty) this.push(); }
      else this.check();
    });
    if (sessionStorage.getItem('sync.reloaded')) {
      sessionStorage.removeItem('sync.reloaded');
      setTimeout(() => U.toast('Загружены изменения с другого устройства'), 300);
    }
  },
};
