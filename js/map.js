// Отрисовка карты «как в тетради», зум/перемещение, магазин, банк, хроника
const MapView = {
  cam: { x: 0, y: 0, s: 6 },
  mode: null,      // null | 'capture' | тип постройки
  filter: 'all',
  needDraw: false,
  labels: null,
  PAPER: [251, 249, 241],
  CRATER_RGB: [92, 70, 54],
  FLOOD_RGB: [120, 170, 215],

  init() {
    this.canvas = U.$('#map');
    this.ctx = this.canvas.getContext('2d');
    this.wrap = U.$('#map-wrap');
    this.base = document.createElement('canvas');
    this.base.width = Game.W; this.base.height = Game.H;
    this.bctx = this.base.getContext('2d');
    this.img = this.bctx.createImageData(Game.W, Game.H);
    for (let k = 0; k < Game.own.length; k++) this.paintCell(k);
    this.bctx.putImageData(this.img, 0, 0);
    Icons.onload = () => this.draw();

    new ResizeObserver(() => this.resize()).observe(this.wrap);
    this.bindInput();
    U.$('#btn-shop').onclick = () => this.shop();
    U.$('#btn-capture').onclick = () => this.setMode(this.mode === 'capture' ? null : 'capture');
    U.$('#btn-home').onclick = () => this.focusPlayer();
    U.$('#btn-zin').onclick = () => this.zoomAt(this.cw / 2, this.ch / 2, this.cam.s * 1.4);
    U.$('#btn-zout').onclick = () => this.zoomAt(this.cw / 2, this.ch / 2, this.cam.s / 1.4);
    U.$('#btn-chat').onclick = () => U.$('#chat').classList.toggle('open');
    U.$('#btn-lb').onclick = () => { this.lbOpen = !this.lbOpen; this.renderLeaderboard(); };
    U.$('#mode-cancel').onclick = () => this.setMode(null);
    U.$('#chat-filter').onclick = e => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      this.filter = b.dataset.f;
      U.$$('#chat-filter button').forEach(x => x.classList.toggle('active', x === b));
      this.renderChat();
    };
    Game.listeners.push(() => this.onGameChange());
    this.onGameChange();
  },

  shown() {
    this.resize();
    if (!this.placed) { this.placed = true; this.focusPlayer(); }
    this.renderChat();
  },

  paintCell(k) {
    const o = Game.own[k];
    const c = o === OCEAN ? this.PAPER : o === CRATER ? this.CRATER_RGB : o === FLOOD ? this.FLOOD_RGB : Game.countries[o].rgb;
    const i = k * 4;
    this.img.data[i] = c[0]; this.img.data[i + 1] = c[1]; this.img.data[i + 2] = c[2]; this.img.data[i + 3] = 255;
  },

  onGameChange() {
    if (Game.dirtyCells.length) {
      Game.dirtyCells.forEach(k => this.paintCell(k));
      Game.dirtyCells = [];
      this.bctx.putImageData(this.img, 0, 0);
      this.labels = null;
    }
    this.renderStats();
    this.renderLeaderboard();
    if (App.tab === 'map') this.renderChat();
    if (this.mode === 'capture' && Game.s.charges <= 0) this.setMode(null);
    U.$('#charges').textContent = Game.s.charges;
    this.draw();
  },

  resize() {
    const r = this.wrap.getBoundingClientRect();
    if (!r.width) return;
    this.dpr = window.devicePixelRatio || 1;
    this.cw = r.width; this.ch = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.clamp();
    this.draw(true);
  },

  minScale() { return Math.min(this.cw / Game.W, this.ch / Game.H) * 0.95; },
  clamp() {
    const c = this.cam;
    c.s = Math.max(this.minScale(), Math.min(64, c.s));
    const vw = this.cw / c.s, vh = this.ch / c.s;
    c.x = vw >= Game.W ? (Game.W - vw) / 2 : Math.max(-vw * 0.3, Math.min(Game.W - vw * 0.7, c.x));
    c.y = vh >= Game.H ? (Game.H - vh) / 2 : Math.max(-vh * 0.3, Math.min(Game.H - vh * 0.7, c.y));
  },
  zoomAt(px, py, s) {
    const c = this.cam;
    const wx = c.x + px / c.s, wy = c.y + py / c.s;
    c.s = Math.max(this.minScale(), Math.min(64, s));
    c.x = wx - px / c.s; c.y = wy - py / c.s;
    this.clamp(); this.draw();
  },
  focusPlayer() {
    const L = Game.lists[Game.player];
    if (!L.length) return;
    let sx = 0, sy = 0;
    L.forEach(k => { const [x, y] = Game.xy(k); sx += x; sy += y; });
    this.cam.s = Math.max(this.minScale(), Math.min(this.cw, this.ch) / 40);
    this.cam.x = sx / L.length + 0.5 - this.cw / 2 / this.cam.s;
    this.cam.y = sy / L.length + 0.5 - this.ch / 2 / this.cam.s;
    this.clamp(); this.draw();
  },

  draw(now) {
    if (now) return this.render();
    if (this.needDraw) return;
    this.needDraw = true;
    requestAnimationFrame(() => { this.needDraw = false; this.render(); });
  },

  computeLabels() {
    this.labels = [];
    Game.countries.forEach((c, i) => {
      const L = Game.lists[i];
      if (!c || !L || !L.length) return;
      let sx = 0, sy = 0;
      L.forEach(k => { sx += k % Game.W; sy += (k / Game.W) | 0; });
      const mx = sx / L.length, my = sy / L.length;
      let best = L[0], bd = 1e9;
      for (const k of L) {
        const d = (k % Game.W - mx) ** 2 + (((k / Game.W) | 0) - my) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      this.labels.push({ i, x: best % Game.W + 0.5, y: ((best / Game.W) | 0) + 0.5, size: Math.sqrt(L.length) });
    });
  },

  badge(ctx, name, color, px, py, size) {
    const img = Icons.badge(name, color);
    if (img) ctx.drawImage(img, px - size / 2, py - size / 2, size, size);
  },

  render() {
    if (!this.cw || App.tab !== 'map') return;
    const ctx = this.ctx, c = this.cam, s = c.s, W = Game.W, H = Game.H, own = Game.own;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#fbf9f1';
    ctx.fillRect(0, 0, this.cw, this.ch);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, -c.x * s, -c.y * s, W * s, H * s);

    const x0 = Math.max(0, Math.floor(c.x)), y0 = Math.max(0, Math.floor(c.y));
    const x1 = Math.min(W, Math.ceil(c.x + this.cw / s)), y1 = Math.min(H, Math.ceil(c.y + this.ch / s));
    const X = x => (x - c.x) * s, Y = y => (y - c.y) * s;
    const onScreen = (px, py, m = 60) => px > -m && py > -m && px < this.cw + m && py < this.ch + m;

    // тетрадная сетка
    if (s >= 3.5) {
      ctx.strokeStyle = `rgba(120,160,210,${Math.min(0.45, (s - 3) / 14)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const gx0 = Math.floor(c.x), gx1 = Math.ceil(c.x + this.cw / s);
      const gy0 = Math.floor(c.y), gy1 = Math.ceil(c.y + this.ch / s);
      for (let x = gx0; x <= gx1; x++) { const px = Math.round(X(x)) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, this.ch); }
      for (let y = gy0; y <= gy1; y++) { const py = Math.round(Y(y)) + 0.5; ctx.moveTo(0, py); ctx.lineTo(this.cw, py); }
      ctx.stroke();
    }

    // границы стран
    if (s >= 1.5) {
      const other = new Path2D(), mine = new Path2D(), P = Game.player;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const k = y * W + x, a = own[k];
        if (x + 1 < W && a !== own[k + 1]) {
          const p = (a === P || own[k + 1] === P) ? mine : other;
          p.moveTo(X(x + 1), Y(y)); p.lineTo(X(x + 1), Y(y + 1));
        }
        if (y + 1 < H && a !== own[k + W]) {
          const p = (a === P || own[k + W] === P) ? mine : other;
          p.moveTo(X(x), Y(y + 1)); p.lineTo(X(x + 1), Y(y + 1));
        }
      }
      ctx.lineCap = 'square';
      ctx.strokeStyle = 'rgba(45,45,60,.55)';
      ctx.lineWidth = Math.max(0.6, Math.min(2, s * 0.1));
      ctx.stroke(other);
      ctx.strokeStyle = '#0b4f8a';
      ctx.lineWidth = Math.max(1.4, Math.min(3.5, s * 0.22));
      ctx.stroke(mine);
    }

    const bs = Math.max(16, Math.min(36, s * 1.6)); // размер значков

    // кратеры и затопления
    for (const sc of Game.s.scars) {
      const [cx, cy] = Game.xy(sc.center);
      const px = X(cx + 0.5), py = Y(cy + 0.5);
      if (onScreen(px, py)) this.badge(ctx, sc.kind === 'crater' ? 'meteor' : 'wave', sc.kind === 'crater' ? EVENTS.meteor.color : EVENTS.tsunami.color, px, py, bs);
    }

    // следы ураганов
    for (const h of Game.s.hurricanes) {
      const active = Game.t <= h.end;
      ctx.beginPath();
      h.path.forEach(([hx, hy], i) => i ? ctx.lineTo(X(hx + 0.5), Y(hy + 0.5)) : ctx.moveTo(X(hx + 0.5), Y(hy + 0.5)));
      ctx.strokeStyle = active ? 'rgba(15,118,110,.75)' : 'rgba(15,118,110,.35)';
      ctx.lineWidth = Math.max(2, s * 0.35);
      ctx.setLineDash([Math.max(4, s), Math.max(3, s * 0.6)]);
      ctx.lineCap = 'round';
      ctx.stroke(); ctx.setLineDash([]);
      if (active) {
        const px = X(h.x + 0.5), py = Y(h.y + 0.5);
        ctx.beginPath(); ctx.arc(px, py, 1.8 * s, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15,118,110,.15)'; ctx.fill();
        this.badge(ctx, 'hurricane', EVENTS.hurricane.color, px, py, bs * 1.2);
      }
    }

    // предупреждения обсерватории
    if (Buildings.count('obs', Game.player)) {
      for (const p of Game.s.pending) {
        const [px0, py0] = Game.xy(p.cell);
        const px = X(px0 + 0.5), py = Y(py0 + 0.5);
        ctx.beginPath(); ctx.arc(px, py, Math.max(10, 4 * s), 0, Math.PI * 2);
        ctx.setLineDash([6, 4]); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
        this.badge(ctx, EVENTS[p.type].icon, '#dc2626', px, py, bs);
      }
    }

    // щиты (зоны)
    for (const b of Game.s.buildings) {
      if (b.type !== 'shield' && b.type !== 'fort') continue;
      if (own[b.cell] !== Game.player && s < (b.type === 'fort' ? 16 : 10)) continue;
      const [bx, by] = Game.xy(b.cell);
      const px = X(bx + 0.5), py = Y(by + 0.5);
      if (!onScreen(px, py, 6 * s)) continue;
      ctx.beginPath();
      ctx.arc(px, py, (b.type === 'shield' ? b.r : 2.1) * s, 0, Math.PI * 2);
      ctx.fillStyle = b.type === 'shield' ? 'rgba(80,140,255,.12)' : 'rgba(146,64,14,.1)'; ctx.fill();
      ctx.setLineDash([6, 4]); ctx.strokeStyle = b.type === 'shield' ? 'rgba(30,90,220,.75)' : 'rgba(146,64,14,.6)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    }

    // постройки
    for (const b of Game.s.buildings) {
      const [bx, by] = Game.xy(b.cell);
      const px = X(bx + 0.5), py = Y(by + 0.5);
      if (!onScreen(px, py)) continue;
      const def = BUILDINGS[b.type];
      const mine = own[b.cell] === Game.player;
      if (s >= 7 || (mine && s >= 3.5)) {
        this.badge(ctx, b.type, def.color, px, py, bs);
        if (b.type === 'shield' && s >= 10) {
          ctx.font = `700 ${Math.min(12, s * 0.45)}px system-ui`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillStyle = '#1e3a8a'; ctx.fillText(`${b.hp} HP`, px, py + bs / 2 + 1);
        }
      } else if (s >= 2.5) {
        ctx.fillStyle = def.color;
        ctx.beginPath(); ctx.arc(px, py, Math.max(1.5, s * 0.3), 0, Math.PI * 2); ctx.fill();
      }
    }

    // золотые жилы
    for (const g of Game.s.goldrush) {
      const [gx, gy] = Game.xy(g.cell);
      const px = X(gx + 0.5), py = Y(gy + 0.5);
      if (onScreen(px, py)) this.badge(ctx, 'gold', EVENTS.goldrush.color, px, py, bs);
    }

    // подписи стран + значок болезни
    if (!this.labels) this.computeLabels();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of this.labels) {
      const w = l.size * s;
      const px = X(l.x), py = Y(l.y);
      if (!onScreen(px, py, 100)) continue;
      const sick = Game.sick(l.i);
      const showName = w >= 46;
      const txt = Game.name(l.i);
      let tw = 0;
      if (showName) {
        const fs = Math.max(10, Math.min(18, w / 9));
        const isMe = l.i === Game.player;
        ctx.font = `${isMe ? 800 : 600} ${fs}px system-ui, sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.85)';
        ctx.strokeText(txt, px, py);
        ctx.fillStyle = isMe ? '#0b3d6b' : 'rgba(30,30,40,.85)';
        ctx.fillText(txt, px, py);
        tw = ctx.measureText(txt).width;
      }
      if (sick && (showName || s >= 2)) this.badge(ctx, 'virus', EVENTS.epidemic.color, px + (tw ? tw / 2 + 11 : 0), py, Math.max(14, Math.min(22, bs * 0.8)));
    }

    // выбранная клетка
    if (this.sel != null) {
      const [sx, sy] = Game.xy(this.sel);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
      ctx.strokeRect(X(sx), Y(sy), s, s);
    }
  },

  bindInput() {
    const cv = this.canvas, ptrs = new Map();
    let drag = null, pinch = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, pos(e));
      if (ptrs.size === 1) {
        const [x, y] = pos(e);
        drag = { x, y, cx: this.cam.x, cy: this.cam.y, moved: false };
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: this.cam.s };
        drag = null;
      }
    });
    cv.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, pos(e));
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        this.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, pinch.s * d / pinch.d);
      } else if (drag) {
        const [x, y] = pos(e);
        if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > 6) { drag.moved = true; cv.classList.add('dragging'); }
        if (drag.moved) {
          this.cam.x = drag.cx - (x - drag.x) / this.cam.s;
          this.cam.y = drag.cy - (y - drag.y) / this.cam.s;
          this.clamp(); this.draw();
        }
      }
    });
    const end = e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      cv.classList.remove('dragging');
      if (drag && !drag.moved && e.type === 'pointerup') this.tap(...pos(e));
      if (ptrs.size < 2) pinch = null;
      if (ptrs.size === 0) drag = null;
      else if (ptrs.size === 1) {
        const [p] = [...ptrs.values()];
        drag = { x: p[0], y: p[1], cx: this.cam.x, cy: this.cam.y, moved: true };
      }
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const [x, y] = pos(e);
      this.zoomAt(x, y, this.cam.s * Math.pow(1.0018, -e.deltaY));
    }, { passive: false });
  },

  cellAt(px, py) {
    const x = Math.floor(this.cam.x + px / this.cam.s), y = Math.floor(this.cam.y + py / this.cam.s);
    if (x < 0 || y < 0 || x >= Game.W || y >= Game.H) return null;
    return y * Game.W + x;
  },

  tap(px, py) {
    const k = this.cellAt(px, py);
    if (k == null) return;
    if (this.mode === 'capture') { Game.playerCapture(k); return; }
    if (this.mode) {
      Game.t = Date.now();
      const err = Buildings.build(this.mode, Game.player, k);
      if (err) U.toast(err); else this.setMode(null);
      return;
    }
    this.sel = k;
    this.showInfo(k);
    this.draw();
  },

  chip(i) {
    const c = Game.countries[i];
    return c ? `<span class="cn">${Game.flag(i)}${U.esc(Game.name(i))}</span>` : '?';
  },

  showInfo(k) {
    const box = U.$('#cell-info');
    const o = Game.own[k];
    let h = '';
    if (o === OCEAN) {
      h = `<h4>${ic('wave')} Океан</h4><div class="muted">Тут никто не живёт</div>`;
    } else if (o === CRATER || o === FLOOD) {
      const sc = Game.s.scars.find(c => c.cells.includes(k));
      const i = sc ? sc.cells.indexOf(k) : -1;
      const left = i >= 0 ? Math.max(1, Math.ceil((sc.at[i] - Date.now()) / HOUR)) : 0;
      h = `<h4>${ic(o === CRATER ? 'meteor' : 'wave')} ${o === CRATER ? 'Кратер' : 'Затоплено'}</h4>
        <div class="muted">Клетка вернётся к ${this.chip(sc ? sc.prev[i] : 0)} через ~${left} ч</div>`;
    } else {
      const c = Game.countries[o], n = Game.cells(o), st = Game.s.cs[o] || {};
      const me = o === Game.player;
      h = `<h4>${this.chip(o)}${me ? ' (ты)' : ''}</h4>
        <div>Клеток: <b>${n}</b> (было ${c.init}) · Сила: <b>${Math.round(Game.eff(o))}</b></div>`;
      if (Game.sick(o)) h += `<div class="tag purple">${ic('virus')} Эпидемия: сила −40%</div>`;
      if (st.ally != null && st.allyUntil > Date.now()) h += `<div class="tag blue">${ic('ally')} Союз с ${this.chip(st.ally)}</div>`;
      if (c.kind === 'alien') h += `<div class="tag green">${ic('ufo')} Сильны в атаке, слабы в обороне</div>`;
      const bl = Buildings.owned(o);
      if (bl.length) {
        const cnt = {};
        bl.forEach(b => cnt[b.type] = (cnt[b.type] || 0) + 1);
        h += `<div class="bl">${Object.entries(cnt).map(([t, n]) => `<span title="${BUILDINGS[t].name}" style="background:${BUILDINGS[t].color}">${ic(t)}${n}</span>`).join('')}</div>`;
      }
      const b = Buildings.at(k);
      if (b) {
        let extra = BUILDINGS[b.type].desc;
        if (b.type === 'shield') extra = `${b.hp}/${BUILDINGS.shield.hp} HP. ` + extra;
        if (['gen', 'mine', 'barracks'].includes(b.type)) extra += `. Следующий доход через ${Math.ceil((DAY - (Date.now() - b.builtAt) % DAY) / HOUR)} ч`;
        h += `<div class="muted" style="margin-top:6px"><b>${BUILDINGS[b.type].name}:</b> ${extra}</div>`;
      }
      if (!me) {
        const reach = Game.reach(k);
        if (Game.fortGuard(k)) h += `<div class="muted">Под защитой крепости</div>`;
        else if (reach) {
          const ch = Math.round((0.35 + 0.65 * Game.eff(Game.player) / (Game.eff(Game.player) + Game.defense(o))) * 100);
          h += `<div class="muted" style="margin-top:4px">Можно атаковать${reach === 'port' ? ' с моря' : reach === 'cosmo' ? ' с космодрома' : ''}: шанс ~${ch}%. За полный захват: +${Game.killReward(o)} алм.</div>`;
        }
      }
    }
    box.innerHTML = `<button class="close" id="ci-x">${ic('x')}</button>${h}`;
    box.classList.remove('hidden');
    U.$('#ci-x').onclick = () => { box.classList.add('hidden'); this.sel = null; this.draw(); };
  },

  setMode(m) {
    this.mode = m;
    const bar = U.$('#mode-bar');
    this.canvas.classList.toggle('mode', !!m);
    U.$('#btn-capture').classList.toggle('on', m === 'capture');
    U.$('#cell-info').classList.add('hidden');
    this.sel = null;
    if (!m) { bar.classList.add('hidden'); this.draw(); return; }
    if (m === 'capture' && Game.s.charges <= 0) {
      this.mode = null; U.$('#btn-capture').classList.remove('on'); bar.classList.add('hidden');
      U.toast('Нет зарядов захвата — купи в магазине');
      return;
    }
    U.$('#mode-text').innerHTML = m === 'capture'
      ? `${ic('swords')} Нажми на чужую клетку у своей границы (${Game.s.level} кл. за заряд)`
      : `${ic(m)} Нажми на свою клетку, чтобы поставить: ${BUILDINGS[m].name.toLowerCase()}`;
    bar.classList.remove('hidden');
  },

  renderStats() {
    const P = Game.player, n = Game.cells(P);
    const land = Game.countries.reduce((a, c) => a + (c && c.kind === 'nation' ? c.init : 0), 0);
    U.$('#map-stats').innerHTML = `${Game.flag(P)}<b>${U.esc(Game.name(P))}: ${n} кл.</b> · ${(n / land * 100).toFixed(1)}% мира · место #${Game.rank()}<br>
      Сила ${Math.round(Game.eff(P))} · ур. ${Game.s.level} · заряды ${Game.s.charges} · построек ${Buildings.owned(P).length}${Game.sick(P) ? ' · <span style="color:#9333ea">болеет</span>' : ''}`;
  },

  // топ-10 стран по площади; если тебя нет в топе — 11-я строка с твоим местом
  renderLeaderboard() {
    const el = U.$('#lb');
    U.$('#btn-lb').classList.toggle('on', !!this.lbOpen);
    el.classList.toggle('hidden', !this.lbOpen);
    if (!this.lbOpen) return;
    const rows = Game.countries.map((c, i) => [i, c ? Game.cells(i) : 0]).filter(([i, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const P = Game.player;
    const row = ([i, n], r) => `<tr class="${i === P ? 'me' : ''}"><td>${r}</td><td>${Game.flag(i)}</td><td>${U.esc(Game.name(i))}</td><td>${n}</td></tr>`;
    let body = rows.slice(0, 10).map((x, r) => row(x, r + 1)).join('');
    const myRank = rows.findIndex(([i]) => i === P);
    if (myRank >= 10) body += `<tr class="gap"><td colspan="4">⋯</td></tr>` + row(rows[myRank], myRank + 1);
    el.innerHTML = `<div class="lb-head">${ic('trophy')} Топ стран по площади <button id="lb-x">${ic('x')}</button></div><table><thead><tr><th>#</th><th></th><th>Страна</th><th>Клеток</th></tr></thead><tbody>${body}</tbody></table>`;
    U.$('#lb-x').onclick = () => { this.lbOpen = false; this.renderLeaderboard(); };
  },

  renderChat() {
    const kinds = { all: null, me: ['me', 'reward', 'loss', 'shop'], war: ['war'], event: ['event'] }[this.filter];
    const list = Game.s.log.filter(m => !kinds || kinds.includes(m.kind)).slice(-200);
    const el = U.$('#chat-log');
    el.innerHTML = list.map(m => {
      const text = U.esc(m.text).replace(/\[\[c:(\d+)\]\]/g, (_, i) => this.chip(+i));
      return `<div class="msg ${m.kind}"><span class="mi">${ic(m.icon || 'info')}</span><div><time>${U.stamp(m.t)}</time>${text}</div></div>`;
    }).join('') || '<div class="empty">Пока пусто</div>';
    el.scrollTop = el.scrollHeight;
  },

  // ---------- магазин ----------
  shop(tab = 'army') {
    const P = Game.player;
    const item = (type) => {
      const d = BUILDINGS[type], have = Buildings.count(type, P), lim = Buildings.limit(type, P);
      return `<div class="shop-item"><div class="sic" style="background:${d.color}">${ic(type)}</div><div class="info"><b>${d.name}</b>
        <small>${d.desc}</small><small class="lim">Есть: ${have} / лимит ${lim}</small></div>
        <div class="buy"><button class="btn primary" data-build="${type}" ${have >= lim ? 'disabled' : ''}>${d.cost.d} ${ic('gem', 'gem')}${d.cost.g ? ` + ${d.cost.g} ${ic('coin', 'coin')}` : ''}</button></div></div>`;
    };
    const draw = root => {
      const s = Game.s, up = Game.upgradeCost();
      U.$$('.stabs button', root).forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      let h = `<div class="balance"><span>${ic('gem', 'gem')} ${s.diamonds}</span><span>${ic('coin', 'coin')} ${s.gold}</span><span>${ic('swords')} ${s.charges}</span></div><div class="shop-list">`;
      if (tab === 'army') {
        h += `<div class="shop-item"><div class="sic" style="background:#b91c1c">${ic('swords')}</div><div class="info"><b>Заряд захвата</b>
            <small>${Game.COST.capture} алм. за заряд. Один заряд = ${s.level} ${U.plural(s.level, 'клетка', 'клетки', 'клеток')}. Сильные страны чаще отбиваются</small></div>
            <div class="buy">
              <button class="btn primary" data-buy="capture" data-q="1">×1 · ${Game.COST.capture}</button>
              <button class="btn" data-buy="capture" data-q="5">×5 · ${Game.COST.capture * 5}</button>
              <button class="btn" data-buy="capture" data-q="10">×10 · ${Game.COST.capture * 10}</button>
            </div></div>
          <div class="shop-item"><div class="sic" style="background:#7c2d12">${ic('up')}</div><div class="info"><b>Улучшить силу → ур. ${s.level + 1}</b>
            <small>Сейчас за заряд берёшь ${s.level} кл., после — ${s.level + 1}. Сила в бою растёт на 10%</small></div>
            <div class="buy"><button class="btn blue" data-buy="upgrade">${up.d} ${ic('gem', 'gem')} + ${up.g} ${ic('coin', 'coin')}</button></div></div>`;
        h += ['shield', 'fort', 'barracks', 'port', 'cosmo'].map(item).join('');
      }
      if (tab === 'eco') h += ['mine', 'gen', 'oil', 'bank', 'obs'].map(item).join('');
      if (tab === 'bank') h += this.bankHtml();
      U.$('#shop-body', root).innerHTML = h + '</div>';
    };
    U.modal(`<h2>${ic('store')} Магазин <button class="x" data-close>${ic('x')}</button></h2>
      <div class="stabs"><button data-tab="army">${ic('swords')} Армия</button><button data-tab="eco">${ic('gem')} Экономика</button><button data-tab="bank">${ic('bank')} Банк</button></div>
      <div id="shop-body"></div>`, root => {
      draw(root);
      root.onclick = e => {
        const tb = e.target.closest('[data-tab]');
        if (tb) { tab = tb.dataset.tab; draw(root); return; }
        const b = e.target.closest('[data-buy]');
        if (b) { if (Game.buy(b.dataset.buy, +b.dataset.q || 1)) { U.toast('Куплено!'); draw(root); } return; }
        const bb = e.target.closest('[data-build]');
        if (bb) {
          const c = BUILDINGS[bb.dataset.build].cost;
          if (Game.s.diamonds < c.d || Game.s.gold < (c.g || 0)) return U.toast('Не хватает ресурсов');
          U.closeModal();
          this.setMode(bb.dataset.build);
          return;
        }
        const act = e.target.closest('[data-bank]');
        if (act) {
          const a = act.dataset.bank;
          let err;
          if (a === 'dia') err = Bank.depositDia(+U.$('#bk-amount', root).value, +U.$('#bk-days', root).value);
          if (a === 'claim') err = Bank.claim(+act.dataset.id);
          if (a === 'gin') err = Bank.depositGold(+U.$('#bk-gold', root).value);
          if (a === 'gout') err = Bank.withdrawGold(+U.$('#bk-gold', root).value);
          if (err) U.toast(err); else draw(root);
        }
      };
      root.oninput = e => {
        if (e.target.id !== 'bk-amount' && e.target.id !== 'bk-days') return;
        const a = +U.$('#bk-amount', root).value || 0, d = +U.$('#bk-days', root).value;
        U.$('#bk-calc', root).textContent = a >= 10 ? `Через ${d} ${U.plural(d, 'день', 'дня', 'дней')} получишь ${Math.round(a * (1 + Bank.rate(a, d)))} алм. (${Math.round(Bank.rate(a, d) * 100)}%)` : 'Минимум 10 алмазов';
      };
    }, 'wide');
  },

  bankHtml() {
    const b = Game.s.bank, has = Bank.has();
    Bank.accrue(Date.now());
    const deps = b.deps.map(d => {
      const ready = Date.now() >= d.until;
      return `<div class="dep"><span>${d.amount} алм. → ${Math.round(d.amount * (1 + d.rate))} (${Math.round(d.rate * 100)}%, ${d.days} дн.)</span>
        ${ready ? `<button class="btn primary" data-bank="claim" data-id="${d.id}">Забрать</button>` : `<small>ещё ${Cal.untilText(d.until - Date.now()).replace('через ', '')}</small>`}</div>`;
    }).join('');
    return `<div class="bank">
      ${has ? '' : `<div class="hint warn">${ic('alert')} У тебя нет банка — построй его во вкладке «Экономика», чтобы открывать вклады. Забрать старые вклады можно и без банка.</div>`}
      <h4>${ic('gem', 'gem')} Вклад алмазами</h4>
      <div class="hint">Деньги блокируются на срок. Чем больше кладёшь и чем дольше срок, тем выше процент: 1 день — 3%, 3 дня — 10%, 7 дней — 25%, плюс 1% за каждые 50 алмазов (до +10%).</div>
      <div class="row" style="margin-top:8px">
        <input class="input" type="number" id="bk-amount" min="10" placeholder="Сколько алмазов">
        <select class="input" id="bk-days"><option value="1">1 день</option><option value="3">3 дня</option><option value="7" selected>7 дней</option></select>
        <button class="btn primary" data-bank="dia" ${has ? '' : 'disabled'}>Положить</button>
      </div>
      <div class="hint" id="bk-calc"></div>
      ${deps ? `<div class="deps">${deps}</div>` : ''}
      <h4 style="margin-top:16px">${ic('coin', 'coin')} Золотой счёт: ${b.gold.toFixed(2)}</h4>
      <div class="hint">+${Bank.GOLD_RATE * 100}% в сутки. Кладёшь и снимаешь когда хочешь.</div>
      <div class="row" style="margin-top:8px">
        <input class="input" type="number" id="bk-gold" min="1" placeholder="Сколько золота">
        <button class="btn primary" data-bank="gin" ${has ? '' : 'disabled'}>Положить</button>
        <button class="btn" data-bank="gout">Снять</button>
      </div>
    </div>`;
  },
};
