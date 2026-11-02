// Мини-библиотека графиков на SVG: линии, столбцы, бублики, тепловые карты, плитки
const PAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const SEQ = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
const UP = '#0a7d0a', DOWN = '#d03b3b', MID = '#f0efec';

const Ch = {
  fmt: v => {
    if (v == null || Number.isNaN(v)) return '—';
    const a = Math.abs(v);
    if (a >= 10000) return (v / 1000).toFixed(0) + 'k';
    if (a >= 1000) return (v / 1000).toFixed(1) + 'k';
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  },
  esc: s => U.esc(s),
  tip: (s) => `data-tip="${U.esc(s)}"`,
  seq(t) { // 0..1 -> цвет синей шкалы
    if (t == null) return '#eeeeea';
    const i = Math.max(0, Math.min(SEQ.length - 1, Math.round(t * (SEQ.length - 1))));
    return SEQ[i];
  },
  mix(a, b, t) {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const A = p(a), B = p(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  },
  // зелёный — рост, красный — падение, серый — без изменений
  div(t) { return t > 0 ? this.mix(MID, UP, Math.min(1, t)) : t < 0 ? this.mix(MID, DOWN, Math.min(1, -t)) : MID; },

  delta(v, suffix = '', invert = false) {
    if (v == null || Number.isNaN(v)) return '';
    if (!v) return `<span class="dl zero">0${suffix}</span>`;
    const good = invert ? v < 0 : v > 0;
    return `<span class="dl ${good ? 'up' : 'down'}">${ic(v > 0 ? 'up' : 'down')}${v > 0 ? '+' : '−'}${this.fmt(Math.abs(v))}${suffix}</span>`;
  },
  kpi(label, value, opts = {}) {
    return `<div class="kpi" ${opts.tip ? this.tip(opts.tip) : ''}>
      <div class="kl">${opts.icon ? ic(opts.icon) : ''}${this.esc(label)}</div>
      <div class="kv">${value}</div>
      ${opts.delta != null ? `<div class="kd">${this.delta(opts.delta, opts.suffix || '', opts.invert)} <span>${this.esc(opts.dlabel || '')}</span></div>` : opts.sub ? `<div class="kd"><span>${opts.sub}</span></div>` : ''}
    </div>`;
  },
  empty(msg = 'Пока мало данных — поиграй и загляни позже') { return `<div class="ch-empty">${ic('clock')} ${msg}</div>`; },
  legend(items) {
    return `<div class="lg">${items.map(i => `<span><i style="background:${i.color}"></i>${this.esc(i.name)}</span>`).join('')}</div>`;
  },

  // линии: series [{name,color,values}], labels [...]
  line({ series, labels, h = 180, yfmt = this.fmt, area = false, zero = true }) {
    const n = labels.length;
    if (n < 2 || !series.length) return this.empty();
    const W = 600, padL = 40, padB = 22, padT = 8, padR = 8;
    const all = series.flatMap(s => s.values).filter(v => v != null);
    let max = Math.max(...all), min = zero ? Math.min(0, ...all) : Math.min(...all);
    if (max === min) max = min + 1;
    const X = i => padL + (W - padL - padR) * i / (n - 1);
    const Y = v => padT + (h - padT - padB) * (1 - (v - min) / (max - min));
    let g = '';
    for (let i = 0; i <= 3; i++) {
      const v = min + (max - min) * i / 3, y = Y(v);
      g += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" class="grid"/><text x="${padL - 6}" y="${y + 4}" class="ax" text-anchor="end">${yfmt(v)}</text>`;
    }
    const step = Math.ceil(n / 6);
    labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) g += `<text x="${X(i)}" y="${h - 6}" class="ax" text-anchor="middle">${this.esc(l)}</text>`; });
    let paths = '';
    series.forEach(s => {
      const pts = s.values.map((v, i) => v == null ? null : [X(i), Y(v)]).filter(Boolean);
      if (!pts.length) return;
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
      if (area && series.length === 1) paths += `<path d="${d}L${pts[pts.length - 1][0]} ${Y(Math.max(min, 0))}L${pts[0][0]} ${Y(Math.max(min, 0))}Z" fill="${s.color}" opacity=".12"/>`;
      paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      const last = pts[pts.length - 1];
      paths += `<circle cx="${last[0]}" cy="${last[1]}" r="4" fill="${s.color}" stroke="#fcfcfb" stroke-width="2"/>`;
    });
    let hit = '';
    const bw = (W - padL - padR) / (n - 1);
    labels.forEach((l, i) => {
      const tip = `${l}: ` + series.map(s => `${s.name} ${yfmt(s.values[i])}`).join(' · ');
      hit += `<rect x="${X(i) - bw / 2}" y="0" width="${bw}" height="${h - padB}" class="hit" ${this.tip(tip)}/>`;
    });
    return `${series.length > 1 ? this.legend(series) : ''}<svg viewBox="0 0 ${W} ${h}" class="ch">${g}${paths}${hit}</svg>`;
  },

  // вертикальные столбцы: items [{label,value,color?}]
  bars({ items, h = 170, fmt = this.fmt, color = PAL[0] }) {
    if (!items.length || items.every(i => !i.value)) return this.empty();
    const W = 600, padL = 34, padB = 22, padT = 14;
    const max = Math.max(...items.map(i => i.value), 1);
    const bw = (W - padL) / items.length;
    let s = '';
    for (let i = 0; i <= 2; i++) {
      const v = max * i / 2, y = padT + (h - padT - padB) * (1 - i / 2);
      s += `<line x1="${padL}" x2="${W}" y1="${y}" y2="${y}" class="grid"/><text x="${padL - 6}" y="${y + 4}" class="ax" text-anchor="end">${fmt(v)}</text>`;
    }
    const step = Math.ceil(items.length / 14);
    items.forEach((it, i) => {
      const bh = (h - padT - padB) * it.value / max, x = padL + i * bw + 1, y = h - padB - bh;
      const w = Math.max(2, bw - 2);
      s += `<path d="${this.roundTop(x, y, w, bh)}" fill="${it.color || color}"/>`;
      s += `<rect x="${x}" y="${padT}" width="${w}" height="${h - padT - padB}" class="hit" ${this.tip(`${it.label}: ${fmt(it.value)}`)}/>`;
      if (i % step === 0) s += `<text x="${x + w / 2}" y="${h - 6}" class="ax" text-anchor="middle">${this.esc(it.label)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${h}" class="ch">${s}</svg>`;
  },
  roundTop(x, y, w, h) {
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
  },

  // столбцы с наложением (stacked): series [{name,color,values}]
  stack({ labels, series, h = 180, fmt = this.fmt }) {
    const tot = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
    if (!tot.some(Boolean)) return this.empty();
    const W = 600, padL = 34, padB = 22, padT = 10;
    const max = Math.max(...tot, 1), bw = (W - padL) / labels.length;
    let s = '';
    for (let i = 0; i <= 2; i++) {
      const y = padT + (h - padT - padB) * (1 - i / 2);
      s += `<line x1="${padL}" x2="${W}" y1="${y}" y2="${y}" class="grid"/><text x="${padL - 6}" y="${y + 4}" class="ax" text-anchor="end">${fmt(max * i / 2)}</text>`;
    }
    const step = Math.ceil(labels.length / 12);
    labels.forEach((l, i) => {
      let y = h - padB;
      const x = padL + i * bw + 1, w = Math.max(2, bw - 2);
      series.forEach(se => {
        const v = se.values[i] || 0; if (!v) return;
        const bh = (h - padT - padB) * v / max;
        s += `<rect x="${x}" y="${y - bh + 1}" width="${w}" height="${Math.max(0, bh - 2)}" fill="${se.color}" rx="2" ${this.tip(`${l} · ${se.name}: ${fmt(v)}`)}/>`;
        y -= bh;
      });
      if (i % step === 0) s += `<text x="${x + w / 2}" y="${h - 6}" class="ax" text-anchor="middle">${this.esc(l)}</text>`;
    });
    return `${this.legend(series)}<svg viewBox="0 0 ${W} ${h}" class="ch">${s}</svg>`;
  },

  // горизонтальные полосы: items [{label, value, color?, pre?}]
  hbars({ items, fmt = this.fmt, color = PAL[0], max }) {
    if (!items.length) return this.empty();
    const m = max || Math.max(...items.map(i => Math.abs(i.value)), 1);
    return `<div class="hb">${items.map(i => `<div class="hr" ${this.tip(`${i.label}: ${fmt(i.value)}`)}>
      <span class="hl">${i.pre || ''}${this.esc(i.label)}</span>
      <span class="ht"><i style="width:${Math.max(1, Math.abs(i.value) / m * 100)}%;background:${i.color || color}"></i></span>
      <span class="hv">${fmt(i.value)}</span></div>`).join('')}</div>`;
  },
  // расходящиеся полосы: рост зелёный вправо, падение красное влево
  diverge({ items, fmt = this.fmt }) {
    if (!items.length) return this.empty();
    const m = Math.max(...items.map(i => Math.abs(i.value)), 1);
    return `<div class="hb dv">${items.map(i => {
      const w = Math.abs(i.value) / m * 50;
      return `<div class="hr" ${this.tip(`${i.label}: ${i.value > 0 ? '+' : ''}${fmt(i.value)}`)}>
        <span class="hl">${i.pre || ''}${this.esc(i.label)}</span>
        <span class="ht"><b></b><i style="${i.value >= 0 ? `left:50%;width:${w}%;background:${UP}` : `left:${50 - w}%;width:${w}%;background:${DOWN}`}"></i></span>
        <span class="hv ${i.value > 0 ? 'up' : i.value < 0 ? 'down' : ''}">${i.value > 0 ? '+' : i.value < 0 ? '−' : ''}${fmt(Math.abs(i.value))}</span></div>`;
    }).join('')}</div>`;
  },

  donut({ items, fmt = this.fmt, center = '' }) {
    const tot = items.reduce((a, i) => a + i.value, 0);
    if (!tot) return this.empty();
    const R = 60, r = 38, cx = 70, cy = 70;
    let a0 = -Math.PI / 2, s = '';
    items.forEach(i => {
      if (!i.value) return;
      const a1 = a0 + Math.PI * 2 * i.value / tot;
      const gap = items.filter(x => x.value).length > 1 ? 0.02 : 0;
      const p = (a, rr) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
      const [x0, y0] = p(a0 + gap, R), [x1, y1] = p(a1 - gap, R), [x2, y2] = p(a1 - gap, r), [x3, y3] = p(a0 + gap, r);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const d = i.value === tot
        ? `M${cx} ${cy - R}A${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R}L${cx - 0.01} ${cy - r}A${r} ${r} 0 1 0 ${cx} ${cy - r}Z`
        : `M${x0} ${y0}A${R} ${R} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${large} 0 ${x3} ${y3}Z`;
      s += `<path d="${d}" fill="${i.color}" ${this.tip(`${i.label}: ${fmt(i.value)} (${Math.round(i.value / tot * 100)}%)`)}/>`;
      a0 = a1;
    });
    return `<div class="dn"><svg viewBox="0 0 140 140">${s}<text x="70" y="68" text-anchor="middle" class="dctr">${center || fmt(tot)}</text><text x="70" y="84" text-anchor="middle" class="ax">всего</text></svg>
      <div class="lg col">${items.map(i => `<span><i style="background:${i.color}"></i>${this.esc(i.label)} <b>${fmt(i.value)}</b> <em>${Math.round(i.value / tot * 100)}%</em></span>`).join('')}</div></div>`;
  },

  // календарная тепловая карта (как на GitHub): values {ymd: число}
  calHeat({ values, weeks = 26, unit = '' }) {
    const today = U.parse(U.today());
    const start = new Date(today); start.setDate(start.getDate() - (weeks * 7 - 1) - U.wd(U.today()));
    const max = Math.max(1, ...Object.values(values));
    const c = 13, g = 3;
    let s = '';
    for (let w = 0; w < weeks + 1; w++) for (let d = 0; d < 7; d++) {
      const day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
      if (day > today) continue;
      const k = U.ymd(day), v = values[k] || 0;
      s += `<rect x="${24 + w * (c + g)}" y="${d * (c + g)}" width="${c}" height="${c}" rx="3" fill="${v ? this.seq(0.15 + 0.85 * v / max) : '#eeeeea'}" ${this.tip(`${U.human(k)}: ${this.fmt(v)}${unit}`)}/>`;
    }
    ['Пн', 'Ср', 'Пт'].forEach((l, i) => s += `<text x="0" y="${i * 2 * (c + g) + 10}" class="ax">${l}</text>`);
    const w = 24 + (weeks + 1) * (c + g);
    return `<svg viewBox="0 0 ${w} ${7 * (c + g)}" class="ch cal" style="max-width:${w * 1.4}px">${s}</svg>`;
  },

  // матрица: rows × cols
  matrix({ rows, cols, values, unit = '' }) {
    const max = Math.max(1, ...values.flat());
    const cw = 22, chh = 18, lw = 26;
    let s = '';
    rows.forEach((r, i) => {
      s += `<text x="0" y="${i * (chh + 2) + 13}" class="ax">${r}</text>`;
      cols.forEach((c, j) => {
        const v = values[i][j];
        s += `<rect x="${lw + j * (cw + 2)}" y="${i * (chh + 2)}" width="${cw}" height="${chh}" rx="3" fill="${v ? this.seq(0.12 + 0.88 * v / max) : '#eeeeea'}" ${this.tip(`${r}, ${c}:00 — ${this.fmt(v)}${unit}`)}/>`;
      });
    });
    cols.forEach((c, j) => { if (j % 3 === 0) s += `<text x="${lw + j * (cw + 2) + cw / 2}" y="${rows.length * (chh + 2) + 12}" class="ax" text-anchor="middle">${c}</text>`; });
    const w = lw + cols.length * (cw + 2);
    return `<svg viewBox="0 0 ${w} ${rows.length * (chh + 2) + 16}" class="ch" style="max-width:${w * 1.6}px">${s}</svg>`;
  },

  // тепловая карта мира на canvas: colorFn(k) -> цвет или null (океан)
  world(id, colorFn, tipFn) {
    return { id, colorFn, tipFn, html: `<div class="wm"><canvas id="${id}"></canvas></div>` };
  },
  drawWorld(spec) {
    const cv = document.getElementById(spec.id);
    if (!cv) return;
    const S = 3;
    cv.width = Game.W * S; cv.height = Game.H * S;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fbf9f1'; ctx.fillRect(0, 0, cv.width, cv.height);
    for (let k = 0; k < Game.own.length; k++) {
      const col = spec.colorFn(k);
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect((k % Game.W) * S, ((k / Game.W) | 0) * S, S, S);
    }
    if (spec.tipFn) {
      cv.onmousemove = e => {
        const r = cv.getBoundingClientRect();
        const x = Math.floor((e.clientX - r.left) / r.width * Game.W), y = Math.floor((e.clientY - r.top) / r.height * Game.H);
        const t = spec.tipFn(y * Game.W + x);
        Tip.show(t, e);
      };
      cv.onmouseleave = () => Tip.hide();
    }
  },
  scale(lo, hi, kind = 'seq') {
    const stops = kind === 'seq' ? [0, 0.25, 0.5, 0.75, 1].map(t => this.seq(t)) : [-1, -0.5, 0, 0.5, 1].map(t => this.div(t));
    return `<div class="sc"><span>${lo}</span><i style="background:linear-gradient(90deg,${stops.join(',')})"></i><span>${hi}</span></div>`;
  },
};

// Общая всплывающая подсказка для всех графиков
const Tip = {
  el: null,
  init() {
    this.el = document.createElement('div');
    this.el.className = 'tip';
    document.body.appendChild(this.el);
    document.addEventListener('mouseover', e => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t && t.dataset.tipUp) this.showAbove(t.dataset.tip, t);
      else if (t) this.show(t.dataset.tip, e); else if (!e.target.closest('canvas')) this.hide();
    });
    document.addEventListener('mousemove', e => { if (this.el.style.opacity === '1' && !this.pinned) this.move(e); });
  },
  // подсказка над элементом (не следует за мышью)
  showAbove(text, el) {
    this.pinned = true;
    this.el.textContent = text;
    this.el.style.opacity = '1';
    const r = el.getBoundingClientRect(), w = this.el.offsetWidth, h = this.el.offsetHeight;
    this.el.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    this.el.style.top = Math.max(8, r.top - h - 8) + 'px';
  },
  show(text, e) {
    this.pinned = false;
    if (!text) return this.hide();
    this.el.textContent = text;
    this.el.style.opacity = '1';
    this.move(e);
  },
  move(e) {
    const w = this.el.offsetWidth;
    this.el.style.left = Math.min(window.innerWidth - w - 8, e.clientX + 12) + 'px';
    this.el.style.top = (e.clientY + 14) + 'px';
  },
  hide() { if (this.el) { this.el.style.opacity = '0'; this.pinned = false; } },
};
