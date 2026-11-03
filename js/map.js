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
    U.$('#btn-diplo').onclick = () => this.diplomacy();
    U.$('#btn-army').onclick = () => Military.open();
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
    U.$('#chat-log').addEventListener('click', e => {
      const g = e.target.closest('.goto');
      if (!g) return;
      if (App.tab !== 'map') App.show('map');
      U.$('#chat').classList.remove('open');
      this.focusCell(+g.dataset.cell);
    });
    setInterval(() => this.skirmish(), 1800);
  },

  shown() {
    const now = performance.now();
    this.pending.forEach((f, i) => { f.t0 = now + i * 120; this.fx.push(f); });
    this.pending = [];
    this.animate();
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

    // укреплённые клетки: в углу число ударов, которые клетка выдержит
    if (Game.s.armor && s >= 7) {
      const r = Math.max(5, s * 0.26);
      ctx.font = `700 ${Math.round(r * 1.2)}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const key in Game.s.armor) {
        const k = +key, [ax, ay] = Game.xy(k);
        const px = X(ax + 1) - r - 1, py = Y(ay) + r + 1;
        if (!onScreen(px, py, 10)) continue;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = own[k] === Game.player ? '#0b4f8a' : '#374151'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillText(Game.s.armor[key], px, py + 0.5);
      }
    } else if (Game.s.armor && s >= 3) {
      ctx.fillStyle = '#0b4f8a';
      for (const key in Game.s.armor) {
        const k = +key; if (own[k] !== Game.player) continue;
        const [ax, ay] = Game.xy(k);
        ctx.fillRect(X(ax + 0.55), Y(ay + 0.1), s * 0.35, s * 0.35);
      }
    }

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

    // следы морских высадок (держатся сутки)
    for (const tr of Game.s.trails || []) {
      const age = (Date.now() - tr.t) / DAY;
      if (age >= 1) continue;
      const [ax, ay] = Game.xy(tr.a), [bx, by] = Game.xy(tr.b);
      const x1 = X(ax + 0.5), y1 = Y(ay + 0.5), x2 = X(bx + 0.5), y2 = Y(by + 0.5);
      if (Math.max(x1, x2) < -50 || Math.min(x1, x2) > this.cw + 50 || Math.max(y1, y2) < -50 || Math.min(y1, y2) > this.ch + 50) continue;
      const mine = tr.o === Game.player;
      ctx.globalAlpha = 0.85 * (1 - age) + 0.1;
      ctx.strokeStyle = mine ? '#0b4f8a' : '#0369a1';
      ctx.lineWidth = mine ? 2.5 : 1.5;
      ctx.setLineDash([6, 5]);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.18;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      const ang = Math.atan2(y2 - my, x2 - mx), L = Math.max(6, Math.min(12, s * 0.6));
      ctx.beginPath(); ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - L * Math.cos(ang - 0.45), y2 - L * Math.sin(ang - 0.45));
      ctx.lineTo(x2 - L * Math.cos(ang + 0.45), y2 - L * Math.sin(ang + 0.45));
      ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
      ctx.globalAlpha = 1;
    }

    // предупреждения обсерватории
    if (Buildings.count('obs', Game.player)) {
      for (const p of Game.s.pending) {
        const [px0, py0] = Game.xy(p.cell);
        const px = X(px0 + 0.5), py = Y(py0 + 0.5);
        ctx.beginPath(); ctx.arc(px, py, Math.max(10, 4 * s), 0, Math.PI * 2);
        ctx.setLineDash([6, 4]); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
        this.badge(ctx, EVENTS[p.type].icon, '#dc2626', px, py, bs);
        const left = Math.max(0, Math.ceil((p.at - Date.now()) / HOUR));
        ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(`через ${left} ч`, px, py + bs / 2 + 2);
        ctx.fillStyle = '#b91c1c'; ctx.fillText(`через ${left} ч`, px, py + bs / 2 + 2);
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
      // главные здания видны всегда, на любом зуме
      const main = b.type !== 'shield' && b.type !== 'gen' && (b.type !== 'hq' || mine);
      if (main || s >= 7 || (mine && s >= 3.5)) {
        this.badge(ctx, b.type, def.color, px, py, main && s < 7 ? Math.max(11, s * 2.4) : bs);
        if (mine && Buildings.hasReward(b)) {
          const sz = main && s < 7 ? Math.max(11, s * 2.4) : bs;
          ctx.beginPath(); ctx.arc(px + sz * 0.38, py - sz * 0.38, Math.max(4, sz * 0.2), 0, Math.PI * 2);
          ctx.fillStyle = '#facc15'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
        }
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

    this.drawFx(ctx, X, Y, s);

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
    if (this.mode === 'move') {
      const err = Buildings.move(this.moveB, k);
      if (err) U.toast(err); else { U.toast('Здание перемещено'); this.setMode(null); }
      return;
    }
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
      h += `<div class="muted">${ic('power')} Военная база ур. ${Military.level(o)}${Military.auxBonus(o) ? `, вспомогательные +${Math.round(Military.auxBonus(o) * 100)}%` : ''}${Military.hungry(o) ? ' · <b style="color:#b91c1c">армия голодает</b>' : ''}</div>`;
      if (Game.sick(o)) h += `<div class="tag purple">${ic('virus')} Эпидемия: сила −40%</div>`;
      Game.alliesOf(o).forEach(a => { h += `<div class="tag blue">${ic('ally')} Союз с ${this.chip(a)} до ${U.stamp(Game.allyUntil(o, a))}</div>`; });
      if (c.kind === 'alien') h += `<div class="tag green">${ic('ufo')} Сильны в атаке, слабы в обороне</div>`;
      Diplo.warsOf(o).forEach(w => { const e = Diplo.enemy(w, o); h += `<div class="tag red">${ic('swords')} Война с ${this.chip(e)} до ${U.stamp(w.until)}</div>`; });
      if (!me) { const tr = Diplo.truce(Game.player, o); if (tr) h += `<div class="tag blue">${ic('peace')} Перемирие с тобой до ${U.stamp(tr.until)}</div>`; }
      if (!me && Game.angry(o)) h += `<div class="tag red">${ic('alert')} Обижена на тебя и мстит</div>`;
      if (!me && c.kind !== 'alien' && !Game.allied(o, Game.player)) h += Diplo.atWar(o, Game.player)
        ? `<button class="btn primary" style="margin-top:8px;width:100%" data-dip="wars" data-c="${o}">${ic('peace')} Предложить мир</button>`
        : `<button class="btn" style="margin-top:8px;width:100%" data-dip="allies" data-c="${o}">${ic('ally')} Предложить союз</button>`;
      const bl = Buildings.owned(o);
      if (bl.length) {
        const cnt = {};
        bl.forEach(b => cnt[b.type] = (cnt[b.type] || 0) + 1);
        h += `<div class="bl">${Object.entries(cnt).map(([t, n]) => `<button data-btype="${t}" data-bo="${o}" data-tip-up="1" data-tip="${U.esc(this.buildingTip(t, n, o))}" style="background:${BUILDINGS[t].color}">${ic(t)}${n}</button>`).join('')}</div>`;
      }
      const arm = Game.armorOf(k);
      if (me) h += `<div class="armor">${ic('shield')} Укрепление клетки: <b>${arm}</b> ${U.plural(arm, 'удар', 'удара', 'ударов')}<small>Включи «Захват» и нажми на эту клетку — каждый заряд добавляет +1 удар, который она выдержит</small></div>`;
      else if (arm) h += `<div class="armor">${ic('shield')} Клетка укреплена: выдержит <b>${arm}</b> ${U.plural(arm, 'удар', 'удара', 'ударов')}</div>`;
      const b = Buildings.at(k);
      if (b) {
        let extra = BUILDINGS[b.type].desc;
        if (b.type === 'shield') extra = `${b.hp}/${BUILDINGS.shield.hp} HP. ` + extra;
        if (['gen', 'mine', 'barracks'].includes(b.type)) extra += `. Следующий доход через ${Math.ceil((DAY - (Date.now() - b.builtAt) % DAY) / HOUR)} ч`;
        h += `<div class="muted" style="margin-top:6px"><b>${BUILDINGS[b.type].name}:</b> ${extra}</div>`;
        h += `<button class="btn ${me ? 'primary' : ''}" data-open-b="${b.id}" style="margin-top:8px;width:100%">${ic(b.type)} ${me ? 'Зайти в здание' : 'Подробнее о здании'}${me && Buildings.hasReward(b) ? ' · есть награда' : ''}</button>`;
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
    U.$$('[data-dip]', box).forEach(b => b.onclick = () => this.diplomacy(b.dataset.dip, +b.dataset.c));
    U.$$('[data-btype]', box).forEach(b => b.onclick = () => this.openType(+b.dataset.bo, b.dataset.btype));
    U.$$('[data-open-b]', box).forEach(b => b.onclick = () => this.openBuilding(+b.dataset.openB));
  },

  // короткая подсказка для значка постройки
  buildingTip(type, n, o) {
    const def = BUILDINGS[type];
    const short = def.desc.split('. ')[0];
    let extra = '';
    if (type === 'hq') extra = ` · ур. ${Military.level(o)}`;
    if (o === Game.player) {
      const ready = Buildings.owned(o).filter(b => b.type === type && Buildings.hasReward(b)).length;
      if (ready) extra += ' · есть награда';
    }
    return `${def.name} × ${n}${extra} — ${short}. Нажми, чтобы открыть`;
  },

  // ---------- окна зданий ----------
  // все здания одного типа у страны (по клику на значок в карточке)
  openType(o, type) {
    const def = BUILDINGS[type], me = o === Game.player;
    const list = Buildings.owned(o).filter(b => b.type === type);
    U.modal(`<h2><span class="sic" style="background:${def.color}">${ic(type)}</span> ${def.name} <button class="x" data-close>${ic('x')}</button></h2>
      <div class="hint">${def.desc}</div>
      <div class="hint">${this.chip(o)} — ${list.length} шт.${!def.special ? ` · лимит ${Buildings.limit(type, o)}` : ''}</div>
      <div class="blist">${list.map((b, j) => `<button class="item" data-b="${b.id}"><span class="name">${def.name} №${j + 1}</span><span class="t">${me && Buildings.hasReward(b) ? 'есть награда · ' : ''}${b.lvl ? 'ур. ' + b.lvl + ' · ' : ''}${b.hp != null ? b.hp + ' HP · ' : ''}показать</span></button>`).join('')}</div>`, root => {
      U.$$('[data-b]', root).forEach(el => el.onclick = () => { const b = Game.s.buildings.find(x => x.id === +el.dataset.b); U.closeModal(); this.focusCell(b.cell); this.openBuilding(b.id); });
    });
  },
  focusCell(k) {
    const [x, y] = Game.xy(k);
    this.cam.s = Math.max(this.cam.s, 16);
    this.cam.x = x + 0.5 - this.cw / 2 / this.cam.s;
    this.cam.y = y + 0.5 - this.ch / 2 / this.cam.s;
    this.clamp(); this.sel = k; this.draw();
  },
  // окно одного здания: награда, перемещение, детали
  openBuilding(id) {
    const draw = root => {
      const b = Game.s.buildings.find(x => x.id === id);
      if (!b) { U.closeModal(); return; }
      const def = BUILDINGS[b.type], o = Game.own[b.cell], me = o === Game.player;
      let h = `<div class="hint">${def.desc}</div><div class="hint">Владелец: ${this.chip(o)}</div>`;
      if (['gen', 'mine', 'barracks'].includes(b.type)) {
        const next = Math.ceil((DAY - (Date.now() - b.builtAt) % DAY) / HOUR);
        h += `<div class="milcard"><div class="lh">${ic('gift')} Внутри: ${me ? (Buildings.storeText(b.store) || 'пусто') : 'неизвестно'}</div>
          <div class="hint">Следующий доход через ${next} ч. Награда копится, пока не заберёшь. Если здание захватят — всё внутри пропадёт.</div>
          ${me ? `<button class="btn primary" data-collect style="width:100%;margin-top:6px" ${Buildings.hasReward(b) ? '' : 'disabled'}>Забрать награду</button>` : ''}</div>`;
      }
      if (b.type === 'hq') {
        h += `<div class="milsum"><div><small>Уровень</small><b>${Military.level(o)}</b></div><div><small>Сила</small><b class="big">${Math.round(Game.eff(o))}</b></div><div><small>Вспомогательные</small><b>+${Math.round(Military.auxBonus(o) * 100)}%</b></div><div><small>Армия</small><b>${Military.hungry(o) ? 'голодает' : 'сыта'}</b></div></div>`;
        if (me) h += `<div class="milcard"><div class="lh">${ic('tiyn', 'tiyn')} Налог в базе: ${Math.floor(Game.s.taxStore)} тиын</div><div class="hint">${Game.cells(o)} клеток × ${Military.TAX} тиын в сутки.</div>
          <div class="actions"><button class="btn primary grow" data-collect ${Buildings.hasReward(b) ? '' : 'disabled'}>Забрать налог</button><button class="btn grow" data-army>${ic('power')} Армия: прокачка и корм</button></div></div>`;
      }
      if (b.type === 'aux') h += `<div class="milcard"><div class="lh">${ic('aux')} Ур. ${b.lvl} · +${Math.round(b.lvl * Military.AUX_STEP * 100)}% к силе${!(b.fedUntil > Date.now()) ? ' · голодает' : ''}</div>${me ? `<button class="btn" data-army style="width:100%;margin-top:6px">${ic('power')} Прокачать и покормить</button>` : ''}</div>`;
      if (b.type === 'port') {
        const lvl = b.lvl || 1, max = lvl >= Buildings.PORT_MAX;
        h += `<div class="milcard"><div class="lh">${ic('port')} Порт ур. ${lvl} · дальность ${Buildings.portReach(b)} клеток</div>
          <div class="hint">Морской десант достаёт до клеток в этом радиусе. От порта до места высадки сутки виден след.</div>
          ${me ? (max ? '<div class="hint">Максимальный уровень</div>' : `<button class="btn primary" data-port-up style="width:100%;margin-top:6px">${ic('up')} Ур. ${lvl + 1}: дальность ${Buildings.portReach({ lvl: lvl + 1 })} · ${Buildings.portUpCost(b)} тиын</button>`) : ''}</div>`;
      }
      if (b.type === 'shield') h += `<div class="hint">Прочность: ${b.hp}/${def.hp} HP, радиус ${b.r}</div>`;
      if (b.type === 'cosmo') h += `<div class="hint">${Buildings.cosmoReady(o) ? 'Готов к удару' : 'Перезаряжается'}</div>`;
      if (me) {
        const can = Buildings.canMoveToday();
        h += `<div class="milcard"><div class="lh">${ic('crosshair')} Переместить</div><div class="hint">Одно здание в день можно перенести на любую свою свободную клетку. ${can ? 'Сегодня ещё можно.' : 'Сегодня уже переносил — завтра снова можно.'}</div>
          <button class="btn" data-move style="width:100%;margin-top:6px" ${can ? '' : 'disabled'}>Выбрать новое место</button></div>`;
      }
      U.$('#bld-body', root).innerHTML = h;
      U.$('#bld-title', root).innerHTML = `<span class="sic" style="background:${def.color}">${ic(b.type)}</span> ${def.name}`;
    };
    U.modal(`<h2><span id="bld-title"></span> <button class="x" data-close>${ic('x')}</button></h2><div id="bld-body"></div>`, root => {
      draw(root);
      root.onclick = e => {
        const b = Game.s.buildings.find(x => x.id === id);
        if (!b) return;
        if (e.target.closest('[data-port-up]')) { const err = Buildings.upgradePort(b); U.toast(err || 'Порт улучшен'); Game.changed(); draw(root); return; }
        if (e.target.closest('[data-collect]')) { const err = Buildings.collect(b); U.toast(err || 'Забрано!'); Game.changed(); draw(root); }
        else if (e.target.closest('[data-army]')) { U.closeModal(); Military.open(); }
        else if (e.target.closest('[data-move]')) { U.closeModal(); this.moveB = b; this.setMode('move'); }
      };
    }, 'wide');
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
    U.$('#mode-text').innerHTML = m === 'move'
      ? `${ic(this.moveB.type)} Нажми на свою свободную клетку, куда перенести: ${BUILDINGS[this.moveB.type].name.toLowerCase()}`
      : m === 'capture'
      ? `${ic('swords')} Чужая клетка — захват (${Game.s.level} кл.), своя — укрепить (+1 удар)`
      : `${ic(m)} Нажми на свою клетку, чтобы поставить: ${BUILDINGS[m].name.toLowerCase()}`;
    bar.classList.remove('hidden');
  },

  renderStats() {
    const P = Game.player, n = Game.cells(P);
    U.$('#army-lvl').textContent = Math.round(Game.eff(P));
    U.$('#btn-army').classList.toggle('alert', Military.hungry(P));
    const unread = Diplo.unread(), mc = U.$('#mail-count');
    mc.textContent = unread; mc.classList.toggle('hidden', !unread);
    U.$('#btn-diplo').classList.toggle('alert', Diplo.warsOf(P).length > 0);
    const dRank = Stats.rankDelta(P, Stats.ranksNow(), Stats.ranksDayAgo());
    U.$('#my-rank').innerHTML = '#' + Game.rank() + (dRank ? ` <span class="mv ${dRank > 0 ? 'up' : 'down'}">${ic(dRank > 0 ? 'up' : 'down')}${Math.abs(dRank)}</span>` : '');
    const land = Game.countries.reduce((a, c) => a + (c && c.kind === 'nation' ? c.init : 0), 0);
    U.$('#map-stats').innerHTML = `${Game.flag(P)}<b>${U.esc(Game.name(P))}: ${n} кл.</b> · ${(n / land * 100).toFixed(1)}% мира · место #${Game.rank()}<br>
      Сила ${Math.round(Game.eff(P))} · ур. ${Game.s.level} · заряды ${Game.s.charges} · построек ${Buildings.owned(P).length}${Game.sick(P) ? ' · <span style="color:#9333ea">болеет</span>' : ''}`;
  },

  // ---------- анимации ----------
  fx: [],
  pending: [],
  FX_MS: { gain: 1400, lost: 1800, battle: 1100, block: 1000, fortify: 1100, repel: 1000, skirmish: 1300, meteor: 2600, wave: 2400 },
  addFx(type, cell, extra) {
    const f = { type, cell, extra, t0: performance.now(), dur: this.FX_MS[type] || 1200 };
    const visible = App.tab === 'map' && !document.hidden;
    if (!visible) {
      if (type === 'lost' || type === 'gain' || type === 'block') { this.pending.push(f); if (this.pending.length > 40) this.pending.shift(); }
      return;
    }
    if (type === 'battle' && this.fx.length > 60) return;
    this.fx.push(f);
    if (type === 'lost') this.flashEdge = performance.now();
    this.animate();
  },
  animate() {
    if (this.animating) return;
    this.animating = true;
    let last = 0;
    const loop = ts => {
      const now = performance.now();
      this.fx = this.fx.filter(f => now - f.t0 < f.dur);
      const edge = this.flashEdge && now - this.flashEdge < 900;
      if (!this.fx.length && !edge) { this.animating = false; this.render(); return; }
      if (ts - last > 30) { last = ts; this.render(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
  // пограничные перестрелки — чтобы мир не был тихим (на землю не влияют)
  skirmish() {
    if (App.tab !== 'map' || document.hidden || Math.random() < 0.25) return;
    const c = this.cam, W = Game.W;
    const inView = Math.random() < 0.7;
    for (let i = 0; i < 40; i++) {
      let k;
      if (inView) {
        const x = Math.floor(c.x + Math.random() * this.cw / c.s), y = Math.floor(c.y + Math.random() * this.ch / c.s);
        if (x < 0 || y < 0 || x >= W || y >= Game.H) continue;
        k = y * W + x;
      } else k = (Math.random() * Game.own.length) | 0;
      const o = Game.own[k];
      if (!Game.isLand(k) || o === Game.player) continue;
      const nb = Game.nbrs(k).find(n => Game.isLand(n) && Game.own[n] !== o && Game.own[n] !== Game.player && !Game.allied(o, Game.own[n]));
      if (nb == null) continue;
      this.addFx('skirmish', k);
      return;
    }
  },
  drawFx(ctx, X, Y, s) {
    const now = performance.now();
    const cs = Math.max(s, 3);
    for (const f of this.fx) {
      const p = Math.max(0, (now - f.t0) / f.dur);
      if (p <= 0 && now < f.t0) continue;
      const [x, y] = Game.xy(f.cell);
      const cx = X(x + 0.5), cy = Y(y + 0.5);
      if (cx < -80 || cy < -80 || cx > this.cw + 80 || cy > this.ch + 80) continue;
      const fade = 1 - p;
      const ring = (color, r0, r1, w) => {
        ctx.beginPath(); ctx.arc(cx, cy, r0 + (r1 - r0) * p, 0, Math.PI * 2);
        ctx.strokeStyle = color; ctx.globalAlpha = fade; ctx.lineWidth = w; ctx.stroke(); ctx.globalAlpha = 1;
      };
      const cell = (color, a) => { ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fillRect(X(x), Y(y), s, s); ctx.globalAlpha = 1; };
      const float = (text, color) => {
        ctx.font = `800 ${Math.max(13, Math.min(22, s * 0.8))}px system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = Math.min(1, fade * 1.6);
        ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
        const ty = cy - cs * 0.6 - p * Math.max(24, s * 1.4);
        ctx.strokeText(text, cx, ty); ctx.fillStyle = color; ctx.fillText(text, cx, ty);
        ctx.globalAlpha = 1;
      };
      const pop = (icon, color, size) => {
        const img = Icons.badge(icon, color);
        if (!img) return;
        const sc = p < 0.2 ? p / 0.2 : 1;
        const sz = size * (0.6 + 0.4 * sc);
        ctx.globalAlpha = Math.min(1, fade * 1.5);
        ctx.drawImage(img, cx - sz / 2, cy - sz / 2, sz, sz);
        ctx.globalAlpha = 1;
      };
      switch (f.type) {
        case 'gain':
          cell('#22c55e', 0.85 * fade);
          ring('#16a34a', cs * 0.4, cs * 2.4, 3);
          float('+1', '#15803d');
          break;
        case 'lost': {
          const blink = 0.5 + 0.5 * Math.sin(p * Math.PI * 8);
          cell('#ef4444', 0.9 * fade * blink);
          ring('#dc2626', cs * 0.4, cs * 3, 3);
          float('−1', '#b91c1c');
          break;
        }
        case 'battle':
          cell('#f97316', 0.6 * fade);
          ring('#ea580c', cs * 0.3, cs * 1.6, 2);
          break;
        case 'block':
          ring('#2563eb', cs * 0.3, cs * 1.8, 3);
          pop('shield', '#2563eb', Math.max(16, Math.min(30, s * 1.2)));
          break;
        case 'repel':
          ring('#6b7280', cs * 0.3, cs * 1.8, 3);
          float('отбито', '#374151');
          break;
        case 'fortify':
          ring('#0b4f8a', cs * 1.6, cs * 0.3, 2.5);
          float('+1', '#0b4f8a');
          break;
        case 'skirmish':
          pop('swords', '#b91c1c', Math.max(12, Math.min(26, s * 1.1)));
          ring('rgba(185,28,28,.8)', cs * 0.2, cs * 1.2, 1.5);
          break;
        case 'meteor':
          ctx.beginPath(); ctx.arc(cx, cy, cs * (1 + 5 * p), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(249,115,22,${0.35 * fade})`; ctx.fill();
          ring('#b45309', cs, cs * 7, 4);
          pop('meteor', '#b45309', Math.max(20, Math.min(40, s * 1.6)));
          break;
        case 'wave':
          ring('#0284c7', cs, cs * 8, 4);
          ring('#38bdf8', cs * 0.5, cs * 5, 2);
          pop('wave', '#0284c7', Math.max(20, Math.min(40, s * 1.6)));
          break;
      }
    }
    // красная подсветка краёв, когда у тебя отнимают землю
    if (this.flashEdge) {
      const q = (now - this.flashEdge) / 900;
      if (q < 1) {
        const g = ctx.createRadialGradient(this.cw / 2, this.ch / 2, Math.min(this.cw, this.ch) * 0.35, this.cw / 2, this.ch / 2, Math.max(this.cw, this.ch) * 0.75);
        g.addColorStop(0, 'rgba(220,38,38,0)');
        g.addColorStop(1, `rgba(220,38,38,${0.35 * (1 - q)})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, this.cw, this.ch);
      }
    }
  },

  // топ-10 стран по площади; если тебя нет в топе — 11-я строка с твоим местом
  renderLeaderboard() {
    const el = U.$('#lb');
    U.$('#btn-lb').classList.toggle('on', !!this.lbOpen);
    el.classList.toggle('hidden', !this.lbOpen);
    if (!this.lbOpen) return;
    const rows = Game.countries.map((c, i) => [i, c ? Game.cells(i) : 0]).filter(([i, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const P = Game.player;
    const now = Stats.ranksNow(), dayAgo = Stats.ranksDayAgo(), cellsDay = Stats.countsDayAgo();
    const dc = i => {
      const d = Stats.cellsDelta(i, cellsDay);
      return !d ? '<span class="dcell zero">0</span>' : `<span class="dcell ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</span>`;
    };
    const mv = i => {
      const d = Stats.rankDelta(i, now, dayAgo);
      if (!d) return '<span class="mv zero">–</span>';
      return `<span class="mv ${d > 0 ? 'up' : 'down'}" title="${d > 0 ? 'поднялась' : 'опустилась'} на ${Math.abs(d)} за сутки">${ic(d > 0 ? 'up' : 'down')}${Math.abs(d)}</span>`;
    };
    const row = ([i, n], r) => `<tr class="${i === P ? 'me' : ''}"><td>${r}</td><td>${mv(i)}</td><td>${Game.flag(i)}</td><td>${U.esc(Game.name(i))}</td><td>${n}</td><td>${dc(i)}</td></tr>`;
    const myRank = rows.findIndex(([i]) => i === P);
    const old = U.$('.lb-scroll', el);
    const scroll = old ? old.scrollTop : 0;
    el.innerHTML = `<div class="lb-head">${ic('trophy')} Страны по площади <button id="lb-x">${ic('x')}</button></div>
      <div class="lb-sub">Стрелка — на сколько мест страна сдвинулась за сутки, «24 ч» — сколько клеток получила или потеряла. Листай вниз, чтобы увидеть всех</div>
      <div class="lb-scroll"><table><thead><tr><th>#</th><th></th><th></th><th>Страна</th><th>Клеток</th><th title="Сколько клеток страна получила или потеряла за сутки">24 ч</th></tr></thead><tbody>${rows.map((x, r) => row(x, r + 1)).join('')}</tbody></table></div>
      ${myRank >= 10 ? `<table class="lb-me"><tbody>${row(rows[myRank], myRank + 1)}</tbody></table>` : ''}`;
    U.$('.lb-scroll', el).scrollTop = scroll;
    U.$('#lb-x').onclick = () => { this.lbOpen = false; this.renderLeaderboard(); };
  },

  renderChat() {
    const kinds = { all: null, me: ['me', 'reward', 'loss', 'shop'], war: ['war'], event: ['event'] }[this.filter];
    const list = Game.s.log.filter(m => !kinds || kinds.includes(m.kind)).slice(-200);
    const el = U.$('#chat-log');
    el.innerHTML = list.map(m => {
      const text = U.esc(m.text).replace(/\[\[c:(\d+)\]\]/g, (_, i) => this.chip(+i)).replace(/\[\[k:(\d+)\]\]/g, (_, k) => `<button class="goto" data-cell="${k}">${ic('crosshair')} показать на карте</button>`);
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
        h += ['aux', 'shield', 'fort', 'barracks', 'port', 'cosmo'].map(item).join('');
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

  // ---------- дипломатия ----------
  diplomacy(tab = 'mail', focus = null) {
    const P = Game.player;
    const offerForm = (kind, i) => `<div class="row offer">
        <input class="input" type="number" min="0" placeholder="Алмазы" data-d>
        <input class="input" type="number" min="0" placeholder="Золото" data-g>
        <button class="btn primary" data-act="${kind}" data-c="${i}">${kind === 'peace' ? ic('peace') + ' Мир' : ic('ally') + ' Союз'}</button></div>`;
    const draw = root => {
      U.$$('.stabs button', root).forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      let h = '';
      if (tab === 'mail') {
        const list = [...Game.s.mail].reverse();
        h = list.map(m => {
          const act = m.status === 'new' && ['peace', 'alliance', 'gift'].includes(m.kind);
          const kindName = { peace: 'Мир', alliance: 'Союз', gift: 'Подарок', war: 'Объявление войны', letter: 'Письмо' }[m.kind] || 'Письмо';
          const st = { accepted: 'принято', declined: 'отклонено', expired: 'истекло' }[m.status];
          return `<div class="letter ${m.status} k-${m.kind}"><div class="lh">${this.chip(m.from)}<span class="lk">${kindName}</span><time>${U.stamp(m.t)}</time></div>
            <div class="lt">${U.esc(m.text)}</div>
            ${m.offer && (m.offer.give || m.offer.ask) ? `<div class="lo">${U.esc(Diplo.offerText(m.offer))}</div>` : ''}
            ${act ? `<div class="actions"><button class="btn primary grow" data-ans="${m.id}" data-yes="1">${m.kind === 'gift' ? 'Принять подарок' : 'Принять'}</button>${m.kind !== 'gift' ? `<button class="btn grow" data-ans="${m.id}">Отклонить</button>` : ''}</div>${m.until ? `<div class="hint">Действует до ${U.stamp(m.until)}</div>` : ''}` : st ? `<div class="hint">${st}</div>` : ''}
          </div>`;
        }).join('') || '<div class="empty">Писем пока нет. Страны пишут сами: предлагают мир, союз, присылают подарки или угрожают.</div>';
        Game.s.mail.forEach(m => { if (m.status === 'new' && !['peace', 'alliance', 'gift'].includes(m.kind)) m.status = 'read'; });
      }
      if (tab === 'wars') {
        const ws = Diplo.warsOf(P);
        h = ws.map(w => {
          const e = Diplo.enemy(w, P);
          return `<div class="warcard ${focus === e ? 'focus' : ''}"><div class="lh">${ic('swords')} Война с ${this.chip(e)}<time>до ${U.stamp(w.until)}</time></div>
            <div class="hint">Причина: ${U.esc(w.reason)}. Ты взял ${Diplo.won(w, P)} кл., враг — ${Diplo.won(w, e)} кл. Сила врага ${Math.round(Game.eff(e))}, твоя ${Math.round(Game.eff(P))}.</div>
            <div class="hint">Предложи алмазы или золото (1 золото ≈ ${GOLD_VALUE} алм.). Чем сильнее враг и чем лучше у него дела на войне, тем больше он попросит. Если согласится — перемирие на ${Diplo.TRUCE_DAYS} дня, нападать друг на друга нельзя.</div>
            ${offerForm('peace', e)}</div>`;
        }).join('') || '<div class="empty">Ты ни с кем не воюешь в долгой войне. Война начинается, если страна сильно обиделась на твои нападения или решила напасть сама.</div>';
        const tr = Game.s.truces.filter(x => (x.a === P || x.b === P) && x.until > Date.now());
        if (tr.length) h += '<h4 class="dh">Перемирия</h4>' + tr.map(x => `<div class="dep">${this.chip(x.a === P ? x.b : x.a)}<small>до ${U.stamp(x.until)}</small></div>`).join('');
      }
      if (tab === 'allies') {
        const allies = Diplo.myAllies();
        h = allies.length
          ? allies.map(a => `<div class="warcard"><div class="lh">${ic('ally')} Союзник: ${this.chip(a)}<time>до ${U.stamp(Game.allyUntil(P, a))}</time></div></div>`).join('') + '<div class="hint">Союзники не нападают на тебя, а соседний союзник помогает в твоих атаках.</div>'
          : '<div class="hint">Союзников нет. Союзник не нападает на тебя и помогает захватывать.</div>';
        if (Diplo.canAllyMore()) {
          h += `<h4 class="dh">Предложить союз (можно до ${Diplo.MAX_ALLIES} союзников, на 2 дня)</h4><div class="hint">Укажи плату. Чем сильнее страна, тем больше она попросит; обиженные на тебя просят вдвое больше.</div>`;
          const can = i => !Diplo.atWar(i, P) && !Game.allied(i, P) && Game.countries[i].kind !== 'alien';
          const nb = Diplo.neighbours(P).filter(can);
          if (focus != null && Game.countries[focus] && can(focus) && !nb.includes(focus)) nb.unshift(focus);
          nb.sort((a, b) => (b === focus) - (a === focus));
          h += nb.map(i => `<div class="warcard ${focus === i ? 'focus' : ''}"><div class="lh">${this.chip(i)}<time>сила ${Math.round(Game.eff(i))}${Game.angry(i) ? ' · обижена' : ''}</time></div>${offerForm('alliance', i)}</div>`).join('');
          const all = Game.countries.map((c, i) => i).filter(i => Game.ai(i) && can(i) && !nb.includes(i)).sort((a, b) => Game.name(a).localeCompare(Game.name(b), 'ru'));
          h += `<div class="warcard"><div class="lh">${ic('globe')} Любая другая страна</div>
            <select class="input" id="ally-any" style="margin-top:8px">${all.map(i => `<option value="${i}">${U.esc(Game.name(i))} · сила ${Math.round(Game.eff(i))}</option>`).join('')}</select>
            ${offerForm('alliance', 'any')}</div>`;
        } else h += `<div class="hint">У тебя уже ${Diplo.MAX_ALLIES} союзника — новый можно, когда закончится один из союзов.</div>`;
      }
      if (tab === 'world') {
        const ws = Game.s.wars.filter(w => w.a !== P && w.b !== P);
        h = ws.map(w => `<div class="dep">${this.chip(w.a)} ${ic('swords')} ${this.chip(w.b)}<small>${w.sa}:${w.sb} · до ${U.stamp(w.until)}</small></div>`).join('') || '<div class="empty">Сейчас в мире нет долгих войн</div>';
      }
      U.$('#dip-body', root).innerHTML = h;
      U.$('[data-tab="mail"] em', root).textContent = Diplo.unread() || '';
      U.$('[data-tab="wars"] em', root).textContent = Diplo.warsOf(P).length || '';
      U.$('#dip-d', root).textContent = Game.s.diamonds;
      U.$('#dip-g', root).textContent = Game.s.gold;
      this.renderStats();
    };
    U.modal(`<h2>${ic('mail')} Дипломатия <button class="x" data-close>${ic('x')}</button></h2>
      <div class="stabs"><button data-tab="mail">${ic('mail')} Почта <em></em></button><button data-tab="wars">${ic('swords')} Мои войны <em></em></button><button data-tab="allies">${ic('ally')} Союзы</button><button data-tab="world">${ic('globe')} Войны мира</button></div>
      <div class="balance"><span>${ic('gem', 'gem')} <b id="dip-d"></b></span><span>${ic('coin', 'coin')} <b id="dip-g"></b></span></div>
      <div id="dip-body"></div>`, root => {
      draw(root);
      root.onclick = e => {
        const tb = e.target.closest('[data-tab]');
        if (tb) { tab = tb.dataset.tab; draw(root); return; }
        const an = e.target.closest('[data-ans]');
        if (an) {
          const err = Diplo.answer(+an.dataset.ans, !!an.dataset.yes);
          if (err) U.toast(err);
          draw(root);
          return;
        }
        const ac = e.target.closest('[data-act]');
        if (ac) {
          const row = ac.closest('.offer');
          const d = +U.$('[data-d]', row).value || 0, g = +U.$('[data-g]', row).value || 0;
          const target = ac.dataset.c === 'any' ? +U.$('#ally-any', root).value : +ac.dataset.c;
          const r = ac.dataset.act === 'peace' ? Diplo.offerPeace(target, d, g) : Diplo.offerAlliance(target, d, g);
          U.toast(r.err || r.text);
          Game.changed();
          draw(root);
        }
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
