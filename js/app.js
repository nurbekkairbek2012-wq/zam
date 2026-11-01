// Запуск: вход, вкладки, настройки, таймеры, напоминания
const App = {
  tab: 'calendar',

  start() {
    U.$$("[data-ic]").forEach(el => el.outerHTML = ic(el.dataset.ic, el.dataset.cls || ""));
    if (Sync.isLogged()) return this.load();
    document.body.classList.add('locked');
    U.modal(`
      <h2>${ic("lock")} Вход</h2>
      <p style="margin-top:0;color:var(--muted)">Введи пароль один раз — дальше на этом устройстве будет входить само.</p>
      <input type="password" class="input" id="pw" inputmode="numeric" autocomplete="current-password" placeholder="Пароль">
      <div class="actions"><button class="btn primary grow" id="pw-go">Войти</button></div>
    `, root => {
      const go = () => {
        if (!Sync.login(U.$('#pw', root).value)) { U.toast('Неверный пароль'); U.$('#pw', root).select(); return; }
        U.closeModal();
        document.body.classList.remove('locked');
        this.load();
      };
      U.$('#pw-go', root).onclick = go;
      U.$('#pw', root).onkeydown = e => { if (e.key === 'Enter') go(); };
      setTimeout(() => U.$('#pw', root).focus(), 50);
    });
    U.$('#overlay').onclick = null; // окно входа не закрывается кликом мимо
  },

  async load() {
    U.toast('Загрузка…');
    await Sync.pull();
    this.boot();
  },

  boot() {
    Planner.load();
    Game.init();
    Cal.init();
    MapView.init();
    Game.listeners.push(() => this.wallet());

    U.$$('.tab').forEach(b => b.onclick = () => this.show(b.dataset.tab));
    U.$('#btn-settings').onclick = () => this.settings();

    Game.update();
    Planner.checkMissed();
    this.refresh();
    Sync.start();

    this.day = U.today();
    setInterval(() => this.heartbeat(), 15000);
    Tip.init();
    if (location.hash === '#map' || location.hash === '#dash') this.show(location.hash.slice(1));
  },

  heartbeat() {
    if (document.hidden) return; // мир «живёт», только когда сайт открыт
    Game.update();
    const missed = Planner.checkMissed();
    if (missed || this.day !== U.today()) { this.day = U.today(); this.refresh(); }
    this.notifyCheck();
  },

  show(tab) {
    this.tab = tab;
    U.$$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    U.$$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + tab));
    history.replaceState(null, '', tab === 'calendar' ? '#' : '#' + tab);
    if (tab === 'map') MapView.shown();
    if (tab === 'dash') Dash.render();
  },

  wallet() {
    U.$('#w-diamonds').textContent = Game.s.diamonds;
    U.$('#w-gold').textContent = Game.s.gold;
  },

  refresh() {
    this.wallet();
    Cal.render();
  },

  // ---------- напоминания (работают, пока сайт открыт) ----------
  notifyCheck() {
    if (!Planner.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    const now = Date.now(), today = U.today();
    const sent = U.load('plan.notified', {});
    for (const t of Planner.occurrencesOn(today)) {
      if (t.allDay || t.type === 'rest') continue;
      const key = t.id + today;
      const start = U.at(today, t.start).getTime();
      if (sent[key] || start - now > 10 * 60e3 || start < now - 60e3) continue;
      sent[key] = 1;
      new Notification(t.title, { body: `Начало в ${t.start}`, icon: 'icon.svg' });
    }
    localStorage.setItem('plan.notified', JSON.stringify(sent));
  },

  // ---------- настройки ----------
  settings() {
    const s = Planner.settings;
    U.modal(`
      <h2>${ic("settings")} Настройки <button class="x" data-close>${ic("x")}</button></h2>
      <div class="field"><label class="check"><input type="checkbox" id="s-school"> Школа по будням</label></div>
      <div class="field row">
        <div><label>Начало школы</label><input type="time" class="input" id="s-start"></div>
        <div><label>Конец школы</label><input type="time" class="input" id="s-end"></div>
      </div>
      <div class="field"><label class="check"><input type="checkbox" id="s-summer"> Летом (июнь–август) школы нет</label>
        <div class="hint">Каникулы в учебном году отмечай как «Отдых» — в этот день школа не показывается.</div></div>
      <div class="field"><label class="check"><input type="checkbox" id="s-notify"> Напоминать за 10 минут до задачи</label>
        <div class="hint">Работает, пока сайт открыт (вкладка или приложение на телефоне).</div></div>
      <div class="actions"><button class="btn primary grow" id="s-save">Сохранить</button></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
      <div class="hint" style="margin-bottom:8px">Синхронизация: <span id="s-sync"></span></div>
      <div class="actions">
        <button class="btn grow" id="s-export">${ic("download")} Скачать копию</button>
        <label class="btn grow" style="text-align:center">${ic("upload")} Загрузить копию<input type="file" id="s-import" accept=".json" hidden></label>
      </div>
      <div class="actions">
        <button class="btn grow" id="s-logout">${ic("logout")} Выйти</button>
        <button class="btn danger grow" id="s-reset">${ic("reset")} Начать игру заново</button>
      </div>
    `, root => {
      const $ = q => U.$(q, root);
      $('#s-school').checked = s.schoolOn;
      $('#s-start').value = s.schoolStart;
      $('#s-end').value = s.schoolEnd;
      $('#s-summer').checked = s.summerOff;
      $('#s-notify').checked = s.notify;
      $('#s-sync').textContent = Sync.online ? 'включена — данные общие для ноута и телефона' : 'нет связи с сервером, данные хранятся только на этом устройстве';
      $('#s-notify').onchange = async () => {
        if ($('#s-notify').checked && 'Notification' in window && Notification.permission !== 'granted') {
          const p = await Notification.requestPermission();
          if (p !== 'granted') { $('#s-notify').checked = false; U.toast('Браузер не разрешил уведомления'); }
        }
      };
      $('#s-save').onclick = () => {
        Object.assign(s, {
          schoolOn: $('#s-school').checked, schoolStart: $('#s-start').value || '08:00',
          schoolEnd: $('#s-end').value || '16:00', summerOff: $('#s-summer').checked, notify: $('#s-notify').checked,
        });
        Planner.saveSettings();
        U.closeModal(); this.refresh(); U.toast('Сохранено');
      };
      $('#s-export').onclick = () => {
        const data = {};
        Sync.KEYS.forEach(k => data[k] = localStorage.getItem(k));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'moy-plan', at: Date.now(), data })], { type: 'application/json' }));
        a.download = `moy-plan-${U.today()}.json`;
        a.click();
      };
      $('#s-import').onchange = async e => {
        try {
          const j = JSON.parse(await e.target.files[0].text());
          if (j.app !== 'moy-plan') throw 0;
          Sync.KEYS.forEach(k => j.data[k] != null && localStorage.setItem(k, j.data[k]));
          localStorage.setItem('sync.updated', Date.now());
          location.reload();
        } catch { U.toast('Это не файл копии'); }
      };
      $('#s-logout').onclick = () => Sync.logout();
      $('#s-reset').onclick = () => U.confirm('Сбросить карту, алмазы и постройки? Задачи останутся.', () => Game.reset());
    });
  },
};

App.start();
