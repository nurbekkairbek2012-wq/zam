// Сбор статистики для аналитики: счётчики, история по времени, горячие точки
const Stats = {
  SNAP_MS: 6 * HOUR,
  MAX_SNAPS: 240,   // ~60 дней
  flips: null,      // сколько раз клетка меняла владельца

  init() {
    const s = Game.s;
    s.st = s.st || { tot: {}, daily: {}, ev: [], hist: [], lastSnap: 0 };
    this.flips = s.flips ? Uint8Array.from(atob(s.flips), c => c.charCodeAt(0)) : new Uint8Array(Game.own.length);
    if (!s.st.hist.length) this.snapshot(true);
  },
  get st() { return Game.s.st; },
  day() { return U.ymd(new Date(Game.t)); },

  bump(key, n = 1) {
    if (!n) return;
    const st = this.st;
    st.tot[key] = (st.tot[key] || 0) + n;
    const d = this.day();
    const row = st.daily[d] || (st.daily[d] = {});
    row[key] = (row[key] || 0) + n;
  },
  // смена владельца клетки
  cell(k, from, to) {
    const land = o => o !== OCEAN && o < FLOOD;
    if (land(from) && land(to)) this.flips[k] = Math.min(255, this.flips[k] + 1);
    const P = Game.player;
    if (to === P && from !== P) { this.bump('gained'); this.bump('gained_' + (Game.cause || 'war')); }
    if (from === P && to !== P) { this.bump('lost'); this.bump('lost_' + (Game.cause || 'war')); }
  },
  event(type, cell) {
    this.bump('ev_' + type);
    this.st.ev.push({ t: Game.t, type, c: cell ?? null });
    if (this.st.ev.length > 600) this.st.ev = this.st.ev.slice(-600);
  },

  // снимок мира раз в 6 часов
  snapshot(force) {
    const st = this.st;
    if (!force && Game.t - st.lastSnap < this.SNAP_MS) return;
    st.lastSnap = Game.t;
    const n = Game.countries.length;
    const arr = new Uint16Array(n);
    for (let i = 1; i < n; i++) arr[i] = Game.countries[i] ? Game.cells(i) : 0;
    const bytes = new Uint8Array(arr.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    st.hist.push({ t: Game.t, c: btoa(bin), d: Game.s.diamonds, g: Game.s.gold, r: Game.rank(), p: Math.round(Game.eff(Game.player)) });
    if (st.hist.length > this.MAX_SNAPS) st.hist = st.hist.slice(-this.MAX_SNAPS);
  },
  // текущее состояние в том же виде, что и снимок (последняя точка на графиках)
  current() {
    const n = Game.countries.length, arr = new Uint16Array(n);
    for (let i = 1; i < n; i++) arr[i] = Game.countries[i] ? Game.cells(i) : 0;
    const h = { t: Date.now(), d: Game.s.diamonds, g: Game.s.gold, r: Game.rank(), p: Math.round(Game.eff(Game.player)) };
    Object.defineProperty(h, '_c', { value: arr, enumerable: false });
    return h;
  },
  decode(h) {
    if (!h._c) {
      const b = Uint8Array.from(atob(h.c), c => c.charCodeAt(0));
      Object.defineProperty(h, '_c', { value: new Uint16Array(b.buffer), enumerable: false });
    }
    return h._c;
  },
  // клеток у страны i примерно `ago` мс назад (null, если истории ещё нет)
  cellsAgo(i, ago) {
    const target = Date.now() - ago;
    const h = this.st.hist;
    if (!h.length || h[0].t > target + this.SNAP_MS) return null;
    let best = h[0];
    for (const x of h) if (x.t <= target) best = x;
    return this.decode(best)[i] || 0;
  },
  snapAgo(ago) {
    const target = Date.now() - ago, h = this.st.hist;
    if (!h.length || h[0].t > target + this.SNAP_MS) return null;
    let best = h[0];
    for (const x of h) if (x.t <= target) best = x;
    return best;
  },

  beforeSave() {
    let bin = '';
    for (let i = 0; i < this.flips.length; i += 8192) bin += String.fromCharCode.apply(null, this.flips.subarray(i, i + 8192));
    Game.s.flips = btoa(bin);
  },
};
