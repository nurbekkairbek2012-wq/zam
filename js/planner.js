// Задачи, школа, награды и штрафы
const TYPES = {
  normal:   { name: 'Обычная', icon: 'note' },
  long:     { name: 'Долгосрочная', icon: 'target' },
  deadline: { name: 'Дедлайн', icon: 'flag' },
  rest:     { name: 'Отдых', icon: 'leaf' },
  meet:     { name: 'Встреча', icon: 'users' },
};
const IMPORTANCE = {
  yellow: 'Не срочно',
  orange: 'Важно',
  red: 'Очень важно',
};

const Planner = {
  DIAMONDS_PER_HOUR: 5,
  GOAL_BONUS: 50,
  CELLS_LOST_PER_HOUR: 2,
  GOAL_FAIL_CELLS: 15,
  GRACE_MS: 24 * 3600e3, // сутки после конца задачи, чтобы успеть отметить её выполненной

  tasks: [],
  settings: { schoolOn: true, schoolStart: '08:00', schoolEnd: '16:00', summerOff: true, notify: false },

  load() {
    this.tasks = U.load('plan.tasks', []);
    this.tasks.forEach(t => { t.paid = t.paid || {}; });
    Object.assign(this.settings, U.load('plan.settings', {}));
  },
  save() { U.save('plan.tasks', this.tasks); },
  saveSettings() { U.save('plan.settings', this.settings); },

  add(t) {
    t.id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    t.createdAt = Date.now();
    t.done = {}; t.missed = {}; t.paid = {};
    this.tasks.push(t);
    this.save();
    return t;
  },
  update(id, patch) {
    Object.assign(this.get(id), patch);
    this.save();
  },
  remove(id) {
    this.tasks.forEach(t => { if (t.parent === id) delete t.parent; }); // задачи цели остаются сами по себе
    this.tasks = this.tasks.filter(t => t.id !== id);
    this.save();
  },
  get(id) { return this.tasks.find(t => t.id === id); },

  color(t) {
    if (t.type === 'normal') return t.importance || 'yellow';
    return { long: 'blue', rest: 'green', meet: 'gray', deadline: 'black' }[t.type];
  },
  timeText(t) {
    if (t.allDay) return 'весь день';
    if (t.type === 'deadline') return `до ${t.end}`;
    return `${t.start}–${t.end}`;
  },

  occurrencesOn(date) {
    const key = t => t.allDay ? -1 : U.toMin(t.type === 'deadline' ? t.end : t.start);
    return this.tasks.filter(t => t.dates.includes(date)).sort((a, b) => key(a) - key(b));
  },
  isRestDay(date) { return this.tasks.some(t => t.type === 'rest' && t.dates.includes(date)); },
  hasSchool(date) {
    const s = this.settings;
    if (!s.schoolOn) return false;
    if (U.wd(date) > 4) return false;
    const m = U.parse(date).getMonth();
    if (s.summerOff && m >= 5 && m <= 7) return false;
    return !this.isRestDay(date);
  },

  hours(t) {
    if (t.type === 'deadline') return +t.hours || 1;
    return Math.max(0, U.toMin(t.end) - U.toMin(t.start)) / 60;
  },
  reward(t) { return t.type === 'rest' ? 0 : Math.round(this.DIAMONDS_PER_HOUR * this.hours(t)); },

  // ---------- задачи внутри долгосрочной цели ----------
  children(goal) { return this.tasks.filter(t => t.parent === goal.id); },
  goals() { return this.tasks.filter(t => t.type === 'long' && !t.goalDone && !t.goalMissed); },
  // прогресс цели: её дни + все задачи внутри неё
  goalProgress(goal) {
    let done = Object.keys(goal.done).length, total = goal.dates.length;
    for (const c of this.children(goal)) { total += c.dates.length; done += Object.keys(c.done).length; }
    return { done, total };
  },
  overlapH(a, b) {
    if (a.type === 'deadline' || b.type === 'deadline' || a.allDay || b.allDay) return 0;
    return Math.max(0, Math.min(U.toMin(a.end), U.toMin(b.end)) - Math.max(U.toMin(a.start), U.toMin(b.start))) / 60;
  },
  // алмазы не складываются: часы, уже оплаченные целью или её задачей в тот же день, второй раз не платятся
  paidOverlap(t, date) {
    let h = 0;
    if (t.parent) {
      const g = this.get(t.parent);
      if (g && g.done[date]) h += this.overlapH(t, g);
    }
    if (t.type === 'long') for (const c of this.children(t)) if (c.done[date]) h += this.overlapH(t, c);
    return Math.min(this.hours(t), h);
  },
  rewardFor(t, date) {
    if (t.type === 'rest') return 0;
    return Math.round(this.DIAMONDS_PER_HOUR * Math.max(0, this.hours(t) - this.paidOverlap(t, date)));
  },
  startOf(t, date) {
    if (t.type === 'deadline') return new Date(t.createdAt);
    return U.at(date, t.allDay ? '00:00' : t.start);
  },
  endOf(t, date) { return t.allDay ? U.at(U.addDays(date, 1), '00:00') : U.at(date, t.end); },
  // задачи, созданные задним числом, не дают ни наград, ни штрафов
  counts(t, date) { return t.type !== 'rest' && this.endOf(t, date).getTime() > t.createdAt; },

  status(t, date) {
    if (t.done[date]) return 'done';
    if (t.missed[date]) return 'missed';
    return 'open';
  },

  canMarkDone(t, date) {
    if (!this.counts(t, date)) return { ok: false, why: 'Задача в прошлом — без наград' };
    if (t.missed[date]) return { ok: false, why: 'Просрочено — территорию уже отобрали' };
    if (Date.now() < this.startOf(t, date).getTime()) return { ok: false, why: 'Можно отметить, когда задача начнётся' };
    return { ok: true };
  },

  toggleDone(t, date) {
    if (t.done[date]) {
      const r = t.paid[date] ?? this.reward(t);
      delete t.done[date]; delete t.paid[date];
      Game.addDiamonds(-r, `Отмена выполнения «${t.title}»: −${r} алм.`, 'reward', 'undo');
    } else {
      const c = this.canMarkDone(t, date);
      if (!c.ok) { U.toast(c.why); return false; }
      const base = this.rewardFor(t, date);
      const r = Game.taskReward(base);
      const cut = this.reward(t) - base;
      t.done[date] = Date.now();
      t.paid[date] = r;
      if (r > base) { Stats.bump('earn_task', base - r); Stats.bump('earn_oil', r - base); }
      Game.addDiamonds(r, `Выполнено «${t.title}» (${this.hours(t)} ч): +${r} алм.${r > base ? ` (нефть +${r - base})` : ''}${cut > 0 ? ` (−${cut}: эти часы уже оплачены в цели)` : ''}`, 'reward', 'check');
    }
    this.save();
    return true;
  },

  completeGoal(t) {
    if (t.goalDone) return;
    t.goalDone = Date.now();
    Game.addDiamonds(this.GOAL_BONUS, `Цель достигнута «${t.title}»: +${this.GOAL_BONUS} алм.`, 'reward', 'trophy', 'goal');
    this.save();
  },

  // Проверка просрочек: за каждую невыполненную задачу соседи отбирают клетки
  checkMissed() {
    const now = Date.now();
    let changed = false;
    for (const t of this.tasks) {
      if (t.type === 'rest') continue;
      for (const date of t.dates) {
        if (t.done[date] || t.missed[date] || !this.counts(t, date)) continue;
        if (now > this.endOf(t, date).getTime() + this.GRACE_MS) {
          t.missed[date] = now;
          changed = true;
          const cells = Math.max(1, Math.ceil(this.hours(t) * this.CELLS_LOST_PER_HOUR));
          Game.penalty(cells, t.type === 'deadline'
            ? `сорван дедлайн «${t.title}» (${U.human(date)})`
            : `не выполнена задача «${t.title}» (${U.human(date)})`);
        }
      }
      if (t.type === 'long' && !t.goalDone && !t.goalMissed && t.dates.length) {
        const last = [...t.dates].sort().pop();
        if (now > this.endOf(t, last).getTime() + this.GRACE_MS + 12 * 3600e3) {
          t.goalMissed = now;
          changed = true;
          Game.penalty(this.GOAL_FAIL_CELLS, `провалена цель «${t.title}»`);
        }
      }
    }
    if (changed) this.save();
    return changed;
  },
};
