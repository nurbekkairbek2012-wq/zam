// Школьное расписание: уроки, кабинеты, суммативки (до конца семестра)
const School = {
  FROM: '2026-11-02',
  UNTIL: '2026-12-27',
  TIMES: [['08:00', '09:00'], ['09:05', '10:05'], ['10:10', '11:10'], ['11:15', '12:15'], ['12:20', '13:20'], ['13:25', '14:25'], ['14:30', '15:30']],
  ROOMS: { 'Өнер': '331', 'Химия': '233', 'Физика': '133', 'АКТ': '201', 'ДШ': 'спортзал' },
  // Пн..Пт, 7 уроков
  WEEK: [
    ['Математика', 'ДШ', 'Өнер', 'Шаңырақ', 'Ағылшын', 'Қазақ тілі', 'АКТ'],
    ['Химия', 'Физика', 'Математика', 'Шаңырақ', 'Қазақ тілі', 'Ағылшын', 'Әлем тарихы'],
    ['Өнер', 'Математика', 'География', 'Шаңырақ', 'Қазақстан', 'Орыс тілі', 'Биология'],
    ['География', 'АКТ', 'Химия', 'Шаңырақ', 'ДШ', 'Математика', 'Физика'],
    ['Орыс тілі', 'Қазақ тілі', 'Ағылшын', 'Шаңырақ', 'Қазақстан', 'Биология', 'Экономика'],
  ],
  // замены уроков в отдельные дни: { дата: { номер урока (с 0): предмет } }
  SWAPS: {
    '2026-11-04': { 2: 'Экономика' },
    '2026-11-18': { 2: 'Экономика' },
    '2026-12-02': { 2: 'Экономика' },
  },
  // дни без уроков
  OFF: ['2026-12-16'],
  // суммативки по датам
  SUM: {
    '2026-11-06': ['Қазақ тілі'],
    '2026-11-12': ['Химия'],
    '2026-11-13': ['Қазақ тілі'],
    '2026-11-16': ['Математика'],
    '2026-11-18': ['Өнер', 'Орыс тілі'],
    '2026-11-19': ['ДШ', 'Физика', 'АКТ'],
    '2026-11-20': ['Биология'],
    '2026-11-26': ['ДШ', 'Химия'],
    '2026-11-30': ['АКТ'],
    '2026-12-01': ['Математика', 'Әлем тарихы'],
    '2026-12-02': ['Өнер'],
    '2026-12-03': ['Экономика', 'ДШ'],
    '2026-12-08': ['Қазақ тілі', 'Ағылшын'],
    '2026-12-10': ['ДШ', 'Физика'],
    '2026-12-11': ['Қазақ тілі', 'Биология'],
    '2026-12-14': ['Өнер'],
    '2026-12-15': ['Өнер'],
    '2026-12-17': ['Математика', 'АКТ'],
    '2026-12-18': ['Орыс тілі'],
  },

  until() { return (Planner.settings.timetableUntil || this.UNTIL); },
  // действует ли расписание уроков в этот день
  covers(date) { return date >= this.FROM && date <= this.until(); },
  title(name) { return this.ROOMS[name] ? `${name} (${this.ROOMS[name]})` : name; },
  marks() { return Planner.settings.sumMarks || (Planner.settings.sumMarks = {}); },
  isSum(date, name) {
    const m = this.marks()[date];
    if (m && name in m) return m[name];
    return (this.SUM[date] || []).includes(name);
  },
  // уроки дня: [{ n, name, title, start, end, sum }]
  lessons(date) {
    if (!this.covers(date) || U.wd(date) > 4 || this.OFF.includes(date)) return [];
    const day = this.WEEK[U.wd(date)].slice();
    Object.entries(this.SWAPS[date] || {}).forEach(([i, name]) => day[i] = name);
    return day.map((name, n) => ({ n, name, title: this.title(name), start: this.TIMES[n][0], end: this.TIMES[n][1], sum: this.isSum(date, name) }));
  },
  // все суммативки дня (и те, у которых нет урока в этот день)
  sumsOn(date) {
    if (!Planner.hasSchool(date) && !this.covers(date)) return [];
    const set = new Set(this.SUM[date] || []);
    Object.entries(this.marks()[date] || {}).forEach(([name, on]) => on ? set.add(name) : set.delete(name));
    return [...set];
  },
  // суммативки без урока в этот день — показываем отдельной плашкой
  sumsWithoutLesson(date) {
    const names = this.lessons(date).map(l => l.name);
    return this.sumsOn(date).filter(s => !names.includes(s));
  },
  toggleSum(date, name) {
    const m = this.marks();
    m[date] = m[date] || {};
    m[date][name] = !this.isSum(date, name);
    Planner.saveSettings();
  },
};
