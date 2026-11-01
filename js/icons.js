// Свои SVG-иконки (24×24, линии). ic('name') — для HTML, Icons.badge() — для карты.
const ICON_PATHS = {
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  gem: '<path d="M6.5 3.5h11L22 9.5 12 21 2 9.5z"/><path d="M2 9.5h20M12 21 8.5 9.5l3.5-6 3.5 6z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><path d="M12 9.5v5"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.6a4.6 4.6 0 0 1-.5 9.9z"/>',
  cloudOff: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.6a4.6 4.6 0 0 1-.5 9.9z"/><path d="M3 3l18 18"/>',
  sync: '<path d="M20.5 12a8.5 8.5 0 0 1-15 5.5M3.5 12a8.5 8.5 0 0 1 15-5.5"/><path d="M18.5 2.5v4h-4M5.5 21.5v-4h4"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  leaf: '<path d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15z"/><path d="M5 19l8-8"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14c2.9 0 5 2 5 5"/>',
  flag: '<path d="M5 21V3.5"/><path d="M5 4h12l-2.5 4.5L17 13H5"/>',
  school: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-5M21.5 9.5v5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5a3.5 3.5 0 0 0 3.8 4M16 6h3.5a3.5 3.5 0 0 1-3.8 4M12 13v4M8 21h8M9.5 17h5"/>',
  store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9v11h16V9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M10 20v-5h4v5"/>',
  swords: '<path d="M3 3l10.5 10.5M3 3h4l9 9M3 3v4l9 9M21 3 10.5 13.5M21 3h-4l-3 3M21 3v4l-3 3M6.5 14.5l3 3M17.5 14.5l-3 3M3.5 20.5l3.5-3.5M20.5 20.5 17 17"/>',
  crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 20V8M7 13l5-5 5 5M4 4h16"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  gift: '<rect x="4" y="11" width="16" height="10" rx="1"/><rect x="3" y="7" width="18" height="4" rx="1"/><path d="M12 7v14M12 7C10 3.5 6.5 4 7.5 7M12 7c2-3.5 5.5-3 4.5 0"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6M20 16V6"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/>',
  peace: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 12l-6.4 6.4M12 12l6.4 6.4"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  book: '<path d="M5 4a1 1 0 0 1 1-1h13v16H6a1 1 0 0 0-1 1z"/><path d="M5 20a1 1 0 0 0 1 1h13M9 7h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  dead: '<path d="M5 11a7 7 0 0 1 14 0v4l-2 1v3H7v-3l-2-1z"/><circle cx="9" cy="11.5" r="1.4" fill="currentColor"/><circle cx="15" cy="11.5" r="1.4" fill="currentColor"/><path d="M10.5 19v-2M13.5 19v-2"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6zM12 10c0-4 3-6 7-6 0 4-3 6-7 6z"/>',
  power: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  // постройки
  gen: '<path d="M3 21V11l5 3v-3l5 3V8l5 3V3h3v18z"/><path d="M7 17.5h2M12 17.5h2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  mine: '<path d="M2 20.5 9 8l4 6 3-4 6 10.5z"/><path d="M9.5 20.5v-3.5a2 2 0 0 1 4 0v3.5"/>',
  fort: '<path d="M4 21V5h3v2.5h2V5h2v4h2V5h2v2.5h2V5h3v16z"/><path d="M10 21v-5h4v5"/>',
  obs: '<path d="M3 20.5h18M5 20.5v-5a7 7 0 0 1 14 0v5"/><path d="M11 9.5l6.5-6 1.8 2-6.4 5.5"/>',
  cosmo: '<path d="M12 2.5c4 3 5.2 8 4.2 12.5H7.8C6.8 10.5 8 5.5 12 2.5z"/><circle cx="12" cy="9.5" r="1.8"/><path d="M7.8 15 5 19h3.5M16.2 15 19 19h-3.5M10 19l2 3 2-3"/>',
  port: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 10.5h8M4.5 13H3a9 9 0 0 0 18 0h-1.5"/>',
  bank: '<path d="M3 10l9-6 9 6z"/><path d="M5.5 10v8M10 10v8M14 10v8M18.5 10v8M3 21h18"/>',
  oil: '<path d="M8 21l4-17 4 17M9.6 14.5h4.8M10.6 9.5h2.8M5 21h14"/>',
  barracks: '<path d="M2 20 12 4l10 16z"/><path d="M12 4v16M8.5 20l3.5-5 3.5 5"/>',
  // события
  meteor: '<circle cx="15" cy="15" r="4.5"/><path d="M3 3l8 8M7.5 3l5 5M3 7.5l5 5"/>',
  virus: '<circle cx="12" cy="12" r="5"/><path d="M12 2.5V7M12 17v4.5M2.5 12H7M17 12h4.5M5.3 5.3l2.9 2.9M15.8 15.8l2.9 2.9M18.7 5.3l-2.9 2.9M5.3 18.7l2.9-2.9"/><circle cx="10.5" cy="11" r="1" fill="currentColor"/><circle cx="13.5" cy="13.5" r="1" fill="currentColor"/>',
  wave: '<path d="M2 15.5c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3M2 20.5c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3M7 12.5c0-5 4-8.5 9.5-8.5-3 2-4.5 4.5-4.5 8.5"/>',
  revolt: '<path d="M12 2c3 4 5 6.5 5 10.5a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-9z"/><path d="M12 17.5V22"/>',
  ally: '<path d="M9.5 14.5l5-5"/><path d="M10.5 6.5l2-2a4.2 4.2 0 0 1 6 6l-2 2M13.5 17.5l-2 2a4.2 4.2 0 0 1-6-6l2-2"/>',
  gold: '<ellipse cx="12" cy="6.5" rx="8" ry="3"/><path d="M4 6.5v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5M4 11.5v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5"/>',
  hurricane: '<circle cx="12" cy="12" r="2.2"/><path d="M5 12a7 7 0 0 1 11.5-5.4M19 12a7 7 0 0 1-11.5 5.4M12 3a9 9 0 0 0-8.4 5.8M12 21a9 9 0 0 0 8.4-5.8"/>',
  ufo: '<path d="M2.5 13c0 2 4.3 3.6 9.5 3.6s9.5-1.6 9.5-3.6-4.3-3.6-9.5-3.6S2.5 11 2.5 13z"/><path d="M7 10.2a5 5 0 0 1 10 0M7 18.5l-1 2.5M12 19.5v2.5M17 18.5l1 2.5"/>',
};

function ic(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

// Значки для карты: цветной кружок с белой иконкой, нарисованные заранее в canvas
const Icons = {
  cache: {},
  onload: null,
  badge(name, color) {
    const key = name + color;
    if (this.cache[key]) return this.cache[key].ready ? this.cache[key].cv : null;
    const S = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const entry = { cv, ready: false };
    this.cache[key] = entry;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${S}" height="${S}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name].replace(/currentColor/g, '#fff')}</svg>`;
    const img = new Image();
    img.onload = () => {
      const c = cv.getContext('2d');
      c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2);
      c.fillStyle = color; c.fill();
      c.lineWidth = 4; c.strokeStyle = '#fff'; c.stroke();
      c.drawImage(img, S * 0.2, S * 0.2, S * 0.6, S * 0.6);
      entry.ready = true;
      this.onload && this.onload();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return null;
  },
};
