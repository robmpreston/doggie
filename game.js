/* ============================================================
   Doggie & Friends — "The Stroll Home"
   A cozy storybook platformer starring Doggie, Bear & Dearie.
   Plain canvas + JS, no dependencies. Drawn-with-love sprites.
   ============================================================ */
(() => {
'use strict';

// ------------------------------------------------------------ setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const VW = 960, VH = 540, TILE = 48;
const LW = 196, LH = 15;
const WORLD_W = LW * TILE, WORLD_H = LH * TILE;
const TAU = Math.PI * 2;
const DPR_MAX = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
const RS_STEPS = [1, 1.25, 1.5, 1.75, 2].filter(s => s <= DPR_MAX + 0.001);
let rsIdx = RS_STEPS.length - 1;
let RS = RS_STEPS[rsIdx];
function applyRS() {
  canvas.width = Math.round(VW * RS);
  canvas.height = Math.round(VH * RS);
}
applyRS();

const qs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const shotMode = qs.get('shot');
const poseMode = qs.get('pose');

// ------------------------------------------------------------ utils
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}
const SHADE_CACHE = new Map();
function shade(hex, k, a) { // darken (k<1) or lighten (k>1) a #rrggbb colour — memoized
  const key = hex + '|' + k + '|' + a;
  let v = SHADE_CACHE.get(key);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * k), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * k), 0, 255);
  const b = clamp(Math.round((n & 255) * k), 0, 255);
  v = a === undefined ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  SHADE_CACHE.set(key, v);
  return v;
}

// hand-made paper grain, drawn multiply over the finished frame
let paperTex = null;
let bands = [], soilPat = null, grassStrip = null;
let GRAD = {}; // per-level cache of gradient objects (cleared on theme change)
function cachedGrad(key, make) {
  let g = GRAD[key];
  if (!g) { g = make(); GRAD[key] = g; }
  return g;
}
function makePaper() {
  if (typeof document === 'undefined' || !document.createElement) return;
  const c = document.createElement('canvas');
  if (!c || !c.getContext) return;
  c.width = VW; c.height = VH;
  const p = c.getContext('2d');
  if (!p || !p.fillRect) return;
  p.fillStyle = '#ffffff'; p.fillRect(0, 0, VW, VH);
  for (let i = 0; i < 46; i++) { // mottled washes
    const x = Math.random() * VW, y = Math.random() * VH, r = 40 + Math.random() * 120;
    const g = p.createRadialGradient(x, y, r * 0.15, x, y, r);
    const v = 242 + Math.floor(Math.random() * 9);
    g.addColorStop(0, 'rgba(' + v + ',' + (v - 4) + ',' + (v - 13) + ',0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    p.fillStyle = g; p.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 1600; i++) { // speckles
    p.fillStyle = 'rgba(118,94,68,' + (0.025 + Math.random() * 0.05) + ')';
    p.fillRect(Math.random() * VW, Math.random() * VH, Math.random() < 0.85 ? 1 : 2, 1);
  }
  p.strokeStyle = 'rgba(128,104,78,0.05)'; p.lineWidth = 1;
  for (let i = 0; i < 140; i++) { // fibers
    const x = Math.random() * VW, y = Math.random() * VH, ang = Math.random() * TAU, l = 6 + Math.random() * 18;
    p.beginPath(); p.moveTo(x, y); p.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); p.stroke();
  }
  paperTex = c;
}

function RR(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function E(x, y, rx, ry, fill, rot) {
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fillStyle = fill; ctx.fill(); ctx.restore();
}
function EO(x, y, rx, ry, fill, rot) { // ellipse with soft ink outline
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = 'rgba(80,54,36,.42)'; ctx.lineWidth = 2.3; ctx.stroke();
  ctx.restore();
}
let plushGrad = null;
function plushShade(x, y, rx, ry) { // soft top-light / under-shadow for plush volume
  if (!plushGrad) {
    plushGrad = ctx.createRadialGradient(-0.35, -0.45, 0.1, 0, 0, 1.12);
    plushGrad.addColorStop(0, 'rgba(255,252,240,.3)');
    plushGrad.addColorStop(0.55, 'rgba(255,252,240,0)');
    plushGrad.addColorStop(0.8, 'rgba(92,62,40,0)');
    plushGrad.addColorStop(1, 'rgba(92,62,40,.24)');
  }
  ctx.save();
  ctx.translate(x, y); ctx.scale(rx, ry);
  ctx.fillStyle = plushGrad;
  ctx.beginPath(); ctx.arc(0, 0, 1.12, 0, TAU); ctx.fill();
  ctx.restore();
}
function limb(x0, y0, x1, y1, wd, col, capCol, capR) {
  ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  if (capCol) E(x1, y1, capR, capR * 0.82, capCol);
}
function furRing(x, y, r, n, len, color, seed, lw) {
  ctx.strokeStyle = color; ctx.lineWidth = lw || 2; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = TAU * (i + 0.5) / n;
    const j = hash(seed + i);
    const rr = r * (0.94 + j * 0.12);
    const l = len * (0.6 + j * 0.8);
    const wob = Math.sin(a * 3 + seed * 7) * 0.25;
    ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    ctx.lineTo(x + Math.cos(a + wob) * (rr + l), y + Math.sin(a + wob) * (rr + l));
  }
  ctx.stroke();
}
function heartPath(x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.5, y - s * 0.15, x - s * 0.75, y - s * 1.15, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.75, y - s * 1.15, x + s * 1.5, y - s * 0.15, x, y + s * 0.9);
  ctx.closePath();
}
function starPath(x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
function text(str, x, y, size, color, align, style, alpha) {
  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  ctx.font = (style || '') + ' ' + size + 'px Georgia, "Times New Roman", serif';
  ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y); ctx.restore();
}

// ------------------------------------------------------------ palette
const PAL = {
  ink: '#5d4434',
  skyTop: '#fff3d6', skyBot: '#ffdcab',
  sun: '#ffd978', cloud: '#fffaf0',
  hillFar: '#d3e5b0', hillFar2: '#c0d89b', hillMid: '#a9d089',
  grass: '#8cc26b', grassDark: '#74ab55', soil: '#c2885a', soilDark: '#a87046',
  water: '#9ed2ea', waterDeep: '#5f9fc6',
  bookCols: ['#e58f8f', '#8fb3dd', '#ecc77a', '#9fcf9f', '#c9a3d8'],
  dog: { body: '#99a2ad', light: '#b9c4d1', dark: '#7d8694', nose: '#1d1d20' },
  bear: { body: '#c28e52', light: '#ddae6e', dark: '#a3763c', nose: '#412b18', muzzle: '#e8c68d' },
  deer: { body: '#a9764c', light: '#bd8a5d', muzzle: '#b98a5e', belly: '#b3a39b', inner: '#b6c0cf', antler: '#4a2f1c', nose: '#6e4526' },
  bunny: '#b6b0a9', bunnyLight: '#d2ccc4',
  pillow: '#eba7b7', pillowDark: '#d98a9e',
  wall: '#f7e8c9', timber: '#8a5c3b', roof: '#c98a4e', roofDark: '#b0743c', door: '#7a4a2a', glow: '#ffd76b'
};

// per-chapter looks: sunny meadow, dusk forest, warm desert
const THEMES = [
  { // 1 — sunlit meadow
    skyTop: '#f9efd3', skyBot: '#f6d9a4', cloud: '#fdf8ec', cloudA: 0.85, orb: 'sun',
    hillFar: '#d2e2aa', hillFar2: '#bad28f', hillMid: '#9bc673', band: 'village',
    grass: '#92c168', grassDark: '#6fa14e', soil: '#ad7a4e', soilDark: '#8c5e3a',
    water: '#9bcfe4', waterDeep: '#5b97bd', tree: 'apple', ambient: 'butterfly',
    plats: ['book', 'log'],
    foliage: ['#88b061', '#8fbc68', '#9cc472'], fruit: '#d9534c',
    flowers: ['#eda7b6', '#a3c3ea', '#f3da8c', '#dfb3da'],
    haze: '252,242,219', rays: '255,228,158', mote: '255,243,205', tint: null
  },
  { // 2 — dusk forest
    skyTop: '#73889b', skyBot: '#dcc093', cloud: '#cfc9ba', cloudA: 0.45, orb: 'moon',
    hillFar: '#83a07f', hillFar2: '#698a66', hillMid: '#517750', band: 'pines',
    grass: '#67975f', grassDark: '#4d7a48', soil: '#84604a', soilDark: '#6c4d38',
    water: '#76aac2', waterDeep: '#3f7493', tree: 'pine', ambient: 'firefly',
    plats: ['log', 'cap'],
    foliage: ['#3c6143', '#456d4c', '#4e7a55'], fruit: null,
    flowers: ['#b29ed1', '#88a8cc', '#ded8c8', '#c08aab'],
    haze: '168,190,200', rays: '212,228,246', mote: '205,224,234', tint: 'rgba(46,56,86,.10)'
  },
  { // 3 — golden dunes
    skyTop: '#fbe9c2', skyBot: '#f4c98b', cloud: '#fdf4e2', cloudA: 0.7, orb: 'sun',
    hillFar: '#e9d2a0', hillFar2: '#dbbc83', hillMid: '#cba869', band: 'desert',
    grass: '#dec384', grassDark: '#bd9c5e', soil: '#c39455', soilDark: '#a87c41',
    water: '#8fd8d4', waterDeep: '#4fb3ae', tree: 'cactus', ambient: 'butterfly',
    plats: ['stone', 'book'],
    foliage: ['#7a9a5a', '#8aaa68', '#9aba78'], fruit: null,
    flowers: ['#dd5f50', '#f3da8c', '#e3a3b4', '#efc189'],
    haze: '250,226,182', rays: '255,206,138', mote: '255,226,176', tint: null
  },
  { // 4 — autumn orchard
    skyTop: '#f7e6bf', skyBot: '#eebf7e', cloud: '#fbf2e0', cloudA: 0.8, orb: 'sun',
    hillFar: '#d6c28d', hillFar2: '#c4a96c', hillMid: '#ab8b52', band: 'village',
    grass: '#c9a258', grassDark: '#a88340', soil: '#9c6a40', soilDark: '#825434',
    water: '#9cc4d8', waterDeep: '#5e92ae', tree: 'apple', ambient: 'butterfly',
    plats: ['log', 'book'],
    foliage: ['#b06a36', '#cc8040', '#e09a50'], fruit: '#c44d3a',
    flowers: ['#e09a50', '#d97f56', '#f0c070', '#c98a8a'],
    haze: '247,228,190', rays: '255,212,142', mote: '255,228,188', tint: 'rgba(150,90,30,.05)'
  },
  { // 5 — snowy peaks (slippery!)
    skyTop: '#dfe9f2', skyBot: '#f6ead8', cloud: '#ffffff', cloudA: 0.8, orb: 'sun',
    hillFar: '#e9eff5', hillFar2: '#d4e0ec', hillMid: '#bacde0', band: 'pines',
    grass: '#f2f6fa', grassDark: '#c2d3e2', soil: '#8a7868', soilDark: '#70604f',
    water: '#a8d4e8', waterDeep: '#6298b8', tree: 'pine', ambient: 'none',
    plats: ['ice', 'log'],
    foliage: ['#3f5d4d', '#4a6a59', '#567a67'], fruit: null,
    flowers: ['#cfdded', '#e8eef6', '#b8cce0', '#dde6f0'],
    haze: '238,244,250', rays: '240,248,255', mote: '255,255,255', tint: 'rgba(120,160,200,.06)',
    snow: true, ice: true, weather: 'snow', lily: '#e3ecf4', splashWord: 'Brrr!'
  },
  { // 6 — petal gardens
    skyTop: '#fdeef0', skyBot: '#f9d9bb', cloud: '#fff6f4', cloudA: 0.85, orb: 'sun',
    hillFar: '#d4e4b6', hillFar2: '#c0d69e', hillMid: '#a8ca88', band: 'village',
    grass: '#92c06f', grassDark: '#74a455', soil: '#b98a60', soilDark: '#9c7048',
    water: '#a8d8e0', waterDeep: '#62a4b4', tree: 'apple', ambient: 'butterfly',
    plats: ['leaf', 'book'], spring: 'flower',
    foliage: ['#d893ae', '#eaa9c0', '#f6c4d4'], fruit: '#fff2f6',
    flowers: ['#f6b8cc', '#f3da8c', '#d8a8e0', '#ffd8e4'],
    haze: '253,238,236', rays: '255,224,212', mote: '255,230,238', tint: null, weather: 'petals'
  },
  { // 7 — sandy shores
    skyTop: '#cfe8f0', skyBot: '#fdeec9', cloud: '#ffffff', cloudA: 0.85, orb: 'sun',
    hillFar: '#c2e0e6', hillFar2: '#8cc6d4', hillMid: '#e8d8a8', band: 'sea',
    grass: '#e6d493', grassDark: '#c4ac68', soil: '#dabc88', soilDark: '#ba9c64',
    water: '#7fcfd8', waterDeep: '#3f9fb8', tree: 'palm', ambient: 'butterfly',
    plats: ['drift', 'leaf'],
    foliage: ['#7aa86a', '#8ab878', '#9cc888'], fruit: null,
    flowers: ['#f3a6b8', '#f3da8c', '#a3d3e8', '#ffcf9c'],
    haze: '224,242,244', rays: '255,244,200', mote: '255,248,220', tint: null, lily: '#eee8cc'
  },
  { // 8 — glowshroom hollow
    skyTop: '#5d5878', skyBot: '#c08aa0', cloud: '#9a8aa8', cloudA: 0.4, orb: 'moon',
    hillFar: '#7a6a92', hillFar2: '#665880', hillMid: '#52466b', band: 'shroom',
    grass: '#6a9070', grassDark: '#507458', soil: '#5e4a58', soilDark: '#4a3a46',
    water: '#6a8ac0', waterDeep: '#48598e', tree: 'shroom', ambient: 'firefly',
    plats: ['cap', 'book'],
    foliage: ['#8a5a88', '#a06a98', '#b87aa8'], fruit: null,
    flowers: ['#c8a0e0', '#88c8d8', '#e8d8a0', '#a8b8e8'],
    haze: '150,140,180', rays: '198,178,236', mote: '222,202,255', tint: 'rgba(70,50,110,.12)',
    lily: '#8a78b8'
  },
  { // 9 — ember canyon
    skyTop: '#4f3540', skyBot: '#e8784a', cloud: '#7a5450', cloudA: 0.45, orb: 'sun',
    hillFar: '#7a4a40', hillFar2: '#653a34', hillMid: '#52302c', band: 'ember',
    grass: '#8a5e48', grassDark: '#6e4636', soil: '#5e3830', soilDark: '#4a2c26',
    water: '#ffb058', waterDeep: '#e85820', tree: 'dead', ambient: 'none',
    plats: ['stone', 'stone'],
    foliage: ['#6e4636', '#7a5240', '#8a5e48'], fruit: null,
    flowers: ['#e87848', '#f0a050', '#d05838', '#f3c060'],
    haze: '120,70,55', rays: '255,140,80', mote: '255,160,100', tint: 'rgba(120,40,20,.08)',
    weather: 'embers', lily: null, noReeds: true, splashWord: 'Sizzle!'
  },
  { // 10 — the starlit stroll
    skyTop: '#2e3a5e', skyBot: '#7a6888', cloud: '#5e6480', cloudA: 0.35, orb: 'moon',
    hillFar: '#4a5a72', hillFar2: '#3c4c64', hillMid: '#2e3e54', band: 'pines',
    grass: '#5a7a68', grassDark: '#42604f', soil: '#4e4456', soilDark: '#3c3444',
    water: '#5a7ab0', waterDeep: '#3a5288', tree: 'pine', ambient: 'firefly',
    plats: ['cloud', 'book'],
    foliage: ['#27413a', '#2e4c43', '#36584d'], fruit: null,
    flowers: ['#a8b8d8', '#c8b8e0', '#8aa8c8', '#e8e0c0'],
    haze: '90,110,150', rays: '170,190,230', mote: '210,220,250', tint: 'rgba(20,30,62,.13)',
    lily: '#5a7a68'
  }
];
let THEME = THEMES[0];

// ------------------------------------------------------------ audio (tiny synth, no assets)
let actx = null, master = null, musicNext = 0, musicBeat = 0;
let muted = false;
try { muted = (typeof localStorage !== 'undefined') && localStorage.getItem('doggie_muted') === '1'; } catch (e) {}
function ensureAudio() {
  const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return;
  if (actx) { if (actx.state === 'suspended') { try { actx.resume(); } catch (e) {} } return; }
  try {
    actx = new AC();
    master = actx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(actx.destination);
    musicNext = actx.currentTime + 0.15;
  } catch (e) { actx = null; }
}
function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  try { localStorage.setItem('doggie_muted', muted ? '1' : '0'); } catch (e) {}
}
function blip(f0, f1, d, type, g, delay) {
  if (!actx || !master) return;
  const t0 = actx.currentTime + (delay || 0);
  try {
    const o = actx.createOscillator(), gn = actx.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(Math.max(30, f0), t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + d);
    gn.gain.setValueAtTime(g || 0.07, t0);
    gn.gain.exponentialRampToValueAtTime(0.0008, t0 + d);
    o.connect(gn); gn.connect(master);
    o.start(t0); o.stop(t0 + d + 0.03);
  } catch (e) {}
}
const sfx = {
  jump:   () => blip(340, 560, 0.14, 'triangle', 0.055),
  launch: () => { blip(200, 980, 0.42, 'sawtooth', 0.045); blip(420, 1400, 0.4, 'sine', 0.05, 0.04); },
  button: () => { blip(880, 1318, 0.09, 'sine', 0.07); blip(1318, 1760, 0.12, 'sine', 0.05, 0.06); },
  heart:  () => { blip(660, 660, 0.1, 'sine', 0.06); blip(830, 830, 0.12, 'sine', 0.06, 0.08); blip(990, 990, 0.2, 'sine', 0.06, 0.16); },
  stomp:  () => blip(260, 70, 0.18, 'triangle', 0.09),
  hurt:   () => blip(300, 130, 0.3, 'triangle', 0.08),
  splash: () => blip(520, 90, 0.35, 'sine', 0.07),
  bounce: () => blip(180, 660, 0.2, 'square', 0.04),
  check:  () => { blip(660, 660, 0.12, 'sine', 0.06); blip(880, 880, 0.14, 'sine', 0.06, 0.1); blip(1108, 1108, 0.22, 'sine', 0.06, 0.2); }
};
function sfxWin() {
  [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => blip(f, f, 0.22, 'sine', 0.07, i * 0.13));
}
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
const ARP = [0, 1, 2, 3, 2, 3, 1, 2];
function musicTick() {
  if (!actx || !master) return;
  const STEP = 0.33;
  while (musicNext < actx.currentTime + 0.4) {
    const chord = CHORDS[Math.floor(musicBeat / 8) % 4];
    const note = chord[ARP[musicBeat % 8]];
    blip(midi(note), midi(note), 0.5, 'sine', 0.028, musicNext - actx.currentTime);
    blip(midi(note + 12), midi(note + 12), 0.4, 'sine', 0.012, musicNext - actx.currentTime);
    if (musicBeat % 8 === 0) blip(midi(chord[0] - 12), midi(chord[0] - 12), 0.9, 'triangle', 0.04, musicNext - actx.currentTime);
    musicBeat++; musicNext += STEP;
  }
}

// ------------------------------------------------------------ input
const keys = {};
const pressed = new Set();
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyX', 'KeyE', 'KeyC', 'KeyF', 'KeyV', 'KeyZ', 'KeyG', 'KeyP', 'KeyR', 'KeyM', 'Enter', 'Escape']);
let touchUI = (typeof matchMedia === 'function') && matchMedia('(pointer: coarse)').matches;
const touch = { left: false, right: false, jump: false };
const activePointers = new Map();
const SWAPBTN = { x: VW - 192, y: 70, w: 174, h: 30 };
const MUTEBTN = { x: VW - 168, y: 112, w: 150, h: 28 };

// --- kid-friendly tablet controls ---
// floating run pad (left half) + big plush action buttons (right corner arc)
const stick = { active: false, id: null, ox: 0, oy: 0, dx: 0 };
let ballDrag = null;       // drag from the ⚾ button to aim
const btnHeld = {};        // button id -> pointerId while held
function actionButtons() {
  const list = [
    { id: 'jump', x: VW - 104, y: VH - 100, r: 60 },
    { id: 'stack', x: VW - 248, y: VH - 78, r: 46 }
  ];
  if (upg.ball) list.push({ id: 'ball', x: VW - 120, y: VH - 232, r: 46 });
  if (upg.dash) list.push({ id: 'dash', x: VW - 234, y: VH - 186, r: 44 });
  if (upg.yarn) list.push({ id: 'yarn', x: VW - 352, y: VH - 96, r: 42 });
  return list;
}
const TOUCH_SIGN = {
  'Run with ← →  ·  Jump with Space': 'Slide the paw pad to run!',
  '(hold Space for higher hops!)': '(hold the big button for high hops!)',
  'A big cliff! Press X:': 'A big cliff! Tap the stack button:',
  'Press X — Stuffie Stack!': 'Tap the stack button to launch!',
  'with X to launch!': 'tap the stack button to launch!',
  'Stuffie Stack with X!': 'Tap the stack button to launch!'
};

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('keydown', e => {
    const c = e.code;
    if (PREVENT.has(c) && e.preventDefault) e.preventDefault();
    ensureAudio();
    keys[c] = true;
    if (!e.repeat) pressed.add(c);
    if (state === 'shop') {
      if (!e.repeat) {
        const ROWS = SHOP_ITEMS.length + 1;
        if (c === 'ArrowUp' || c === 'KeyW') { shopSel = (shopSel + ROWS - 1) % ROWS; blip(700, 700, 0.05, 'sine', 0.03); }
        if (c === 'ArrowDown' || c === 'KeyS') { shopSel = (shopSel + 1) % ROWS; blip(640, 640, 0.05, 'sine', 0.03); }
        if (c === 'Space' || c === 'Enter' || c === 'KeyX' || c === 'KeyE') buySelected();
        if (c === 'Escape' || c === 'KeyQ') closeShop();
      }
      return;
    }
    if (state === 'title' && !shotMode) { startPlay(); return; }
    if (state === 'chapter') { if (chapterT > 0.6 && !e.repeat) nextLevel(); return; }
    if (!e.repeat) {
      if (c === 'KeyM') toggleMute();
      if (c === 'KeyC' && state === 'play') cycleHero();
      if (c === 'KeyP' && state === 'play') paused = !paused;
      if (c === 'KeyR' && (state === 'play' || state === 'win' || state === 'over')) {
        if (state === 'win') startNewGame();
        else if (state === 'over') respawnFromCheckpoint();
        else { resetLevel(); state = 'play'; }
        paused = false;
      }
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
}
function canvasPoint(e) {
  let rx = 0, ry = 0;
  try {
    const r = canvas.getBoundingClientRect();
    rx = (e.clientX - r.left) * (VW / r.width);
    ry = (e.clientY - r.top) * (VH / r.height);
  } catch (err) {}
  return { x: rx, y: ry };
}
const inBtn = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
if (canvas.addEventListener) {
  canvas.addEventListener('pointerdown', e => {
    ensureAudio();
    if (e.pointerType === 'touch') touchUI = true;
    try { if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (state === 'shop') {
      const p2 = canvasPoint(e);
      const cw2 = 640, chh = 500;
      const cx2 = (VW - cw2) / 2, cy2 = (VH - chh) / 2;
      if (p2.x < cx2 || p2.x > cx2 + cw2 || p2.y < cy2 || p2.y > cy2 + chh) { closeShop(); return; }
      const row = Math.floor((p2.y - (cy2 + 50)) / 41);
      if (row >= 0 && row <= SHOP_ITEMS.length) {
        if (shopSel === row) buySelected();
        else { shopSel = row; blip(700, 700, 0.05, 'sine', 0.03); }
      }
      return;
    }
    if (state === 'title') { startPlay(); return; }
    if (state === 'chapter') { if (chapterT > 0.6) nextLevel(); return; }
    if (state === 'win') { startNewGame(); return; }
    if (state === 'over') { respawnFromCheckpoint(); return; }
    const p = canvasPoint(e);
    if (inBtn(p, SWAPBTN)) { cycleHero(); if (e.preventDefault) e.preventDefault(); return; }
    if (touchUI && inBtn(p, MUTEBTN)) { toggleMute(); if (e.preventDefault) e.preventDefault(); return; }
    activePointers.set(e.pointerId, p);
    // tap the shop stall (when the trio is browsing nearby)
    const wx = p.x + camX, wy = p.y + camY;
    let stallHit = false;
    shops.forEach(sh => {
      if (Math.abs(wx - sh.x) < 52 && wy > sh.y - 104 && wy < sh.y + 8 && Math.abs(player.x - sh.x) < 70) {
        sh.tapBuy = true; stallHit = true;
      }
    });
    if (stallHit) { if (e.preventDefault) e.preventDefault(); return; }
    // big plush action buttons
    let hit = null;
    if (touchUI) {
      for (const bb of actionButtons()) {
        if ((p.x - bb.x) * (p.x - bb.x) + (p.y - bb.y) * (p.y - bb.y) < bb.r * bb.r * 1.3) { hit = bb; break; }
      }
    }
    if (hit) {
      btnHeld[hit.id] = e.pointerId;
      if (hit.id === 'jump') pressed.add('Space');
      else if (hit.id === 'stack') pressed.add('KeyX');
      else if (hit.id === 'dash') pressed.add('KeyZ');
      else if (hit.id === 'yarn') pressed.add('KeyG');
      else if (hit.id === 'ball') ballDrag = { id: e.pointerId, x0: p.x, y0: p.y, moved: false };
    } else if (touchUI && p.x < VW * 0.45 && state === 'play') {
      // floating run pad appears right under the thumb
      stick.active = true; stick.id = e.pointerId;
      stick.ox = p.x; stick.oy = clamp(p.y, 80, VH - 70); stick.dx = 0;
    } else if (upg.ball && state === 'play' && (!touchUI || e.pointerType === 'mouse')) {
      aiming = true; aimId = e.pointerId; aimPt = p;
      if (canvas.style) canvas.style.cursor = 'none';
    }
    if (e.preventDefault) e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, canvasPoint(e));
    if (stick.active && e.pointerId === stick.id) {
      stick.dx = clamp(canvasPoint(e).x - stick.ox, -64, 64);
    }
    if (ballDrag && e.pointerId === ballDrag.id) {
      const q = canvasPoint(e);
      const ddx = q.x - ballDrag.x0, ddy = q.y - ballDrag.y0;
      if (Math.hypot(ddx, ddy) > 22) {
        ballDrag.moved = true;
        aiming = true; aimId = null; // button-drag aim
        const psx = player.x - camX, psy = player.y - 36 - camY;
        aimPt = { x: psx + ddx * 2.6, y: psy + ddy * 2.6 };
      }
    }
    if (aiming && e.pointerId === aimId) aimPt = canvasPoint(e);
  });
  const lift = e => {
    activePointers.delete(e.pointerId);
    if (ballDrag && e.pointerId === ballDrag.id) {
      if (ballDrag.moved) { throwAimed(); aiming = false; }
      else pressed.add('KeyF'); // quick tap = straight throw
      ballDrag = null;
    }
    if (stick.id === e.pointerId) { stick.active = false; stick.id = null; stick.dx = 0; }
    for (const k in btnHeld) if (btnHeld[k] === e.pointerId) delete btnHeld[k];
    if (aiming && e.pointerId === aimId) {
      aiming = false; aimId = null;
      if (canvas.style) canvas.style.cursor = '';
      throwAimed();
    }
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
}
function pollTouch() {
  touch.left = touch.right = false;
  if (stick.active) {
    if (stick.dx > 12) touch.right = true;
    else if (stick.dx < -12) touch.left = true;
  }
  touch.jump = 'jump' in btnHeld;
}

// ------------------------------------------------------------ gamepad
// A jump · B dash · X throw · Y stuffie stack · LB swap hero · RB/RT yarn
// left stick / d-pad run · right stick aims the baseball · Start pauses
const gpad = { left: false, right: false, jump: false };
let gpPrev = [], gpConnected = false, gpAimOn = false, gpNavY = 0, gpRef = null;
function rumble(strong, weak, ms) {
  try {
    if (gpRef && gpRef.vibrationActuator && gpRef.vibrationActuator.playEffect) {
      gpRef.vibrationActuator.playEffect('dual-rumble', {
        duration: ms, strongMagnitude: strong, weakMagnitude: weak
      });
    }
  } catch (e) {}
}
function pollGamepad() {
  gpad.left = gpad.right = gpad.jump = false;
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
  let gp = null;
  try {
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
    }
  } catch (e) { return; }
  gpRef = gp;
  if (!gp) { gpConnected = false; gpPrev = []; return; }
  if (!gpConnected) {
    gpConnected = true;
    if (state === 'play') popup(player.x, player.y - 88, 'gamepad ready!');
  }
  const bDown = i => !!(gp.buttons && gp.buttons[i] && gp.buttons[i].pressed);
  const edges = {};
  const nBtn = gp.buttons ? gp.buttons.length : 0;
  for (let i = 0; i < nBtn; i++) {
    const now = bDown(i);
    if (now && !gpPrev[i]) edges[i] = true;
    gpPrev[i] = now;
  }
  const ed = i => !!edges[i];
  const lx = (gp.axes && gp.axes[0]) || 0;
  const ly = (gp.axes && gp.axes[1]) || 0;
  const rx = (gp.axes && gp.axes[2]) || 0;
  const ry = (gp.axes && gp.axes[3]) || 0;

  if (state === 'title') { if (ed(9) || ed(0)) { ensureAudio(); startPlay(); } return; }
  if (state === 'chapter') { if ((ed(9) || ed(0)) && chapterT > 0.6) nextLevel(); return; }
  if (state === 'win') { if (ed(9) || ed(0)) startNewGame(); return; }
  if (state === 'over') { if (ed(9) || ed(0)) respawnFromCheckpoint(); return; }
  if (state === 'shop') {
    const ROWS = SHOP_ITEMS.length + 1;
    let navY = 0;
    if (bDown(13) || ry > 0.5 || ly > 0.5) navY = 1;
    else if (bDown(12) || ry < -0.5 || ly < -0.5) navY = -1;
    if (navY !== 0 && navY !== gpNavY) {
      shopSel = (shopSel + (navY > 0 ? 1 : ROWS - 1)) % ROWS;
      blip(680, 680, 0.05, 'sine', 0.03);
    }
    gpNavY = navY;
    if (ed(0)) buySelected();
    if (ed(1) || ed(9)) closeShop();
    return;
  }
  if (paused) { if (ed(9)) paused = false; return; }
  if (ed(9)) { paused = true; return; }

  // running + jumping
  gpad.left = lx < -0.35 || bDown(14);
  gpad.right = lx > 0.35 || bDown(15);
  gpad.jump = bDown(0);
  if (ed(0)) pressed.add('Space');
  if (ed(3)) pressed.add('KeyX');           // Y — stuffie stack
  if (ed(1)) pressed.add('KeyZ');           // B — dash
  if (ed(5) || ed(7)) pressed.add('KeyG');  // RB / RT — yarn zinger
  if (ed(4)) cycleHero();                   // LB — swap hero
  if (ed(13)) pressed.add('ArrowDown');     // d-pad down — browse the stall

  // right stick aims the baseball, X throws
  const mag = Math.hypot(rx, ry);
  if (upg.ball && mag > 0.35) {
    gpAimOn = true;
    aiming = true; aimId = 'gamepad';
    const nx2 = rx / mag, ny2 = ry / mag;
    const reach = 180 + mag * 170;
    aimPt = { x: (player.x - camX) + nx2 * reach, y: (player.y - 36 - camY) + ny2 * reach };
  } else if (gpAimOn) {
    gpAimOn = false;
    if (aimId === 'gamepad') { aiming = false; aimId = null; }
  }
  if (ed(2) && upg.ball) {
    if (aiming) throwAimed();
    else pressed.add('KeyF');
  }
}

// ------------------------------------------------------------ level data
const solids = new Uint8Array(LW * LH);
const S = (x, y) => (x < 0 || x >= LW) ? 1 : (y < 0 || y >= LH) ? 0 : solids[y * LW + x];
function fillGround(x0, x1, top) { for (let x = x0; x <= x1; x++) for (let y = top; y < LH; y++) solids[y * LW + x] = 1; }
function groundTopAt(col) { col = Math.floor(col); for (let y = 0; y < LH; y++) if (S(col, y)) return y; return null; }

const platforms = [];   // one-way book platforms {x,y,w,c}
const mushrooms = [];   // bouncy {x,capY,squish}
const SPEC = { btn: [], heart: [], enemy: [], sign: [], pillow: [], tree: [], fence: [], shop: [], mover: [], crumb: [], pulse: [], geyser: [], wind: [], roller: [], apple: [] };
let pondCols = null;
let GOAL = null, COTTAGE = null;
let buttonsTotal = 0;

function plat(col, row, wTiles) {
  const kinds = THEME.plats || ['book'];
  platforms.push({
    x: col * TILE, y: row * TILE, w: wTiles * TILE,
    c: PAL.bookCols[platforms.length % PAL.bookCols.length],
    k: kinds[Math.floor(hash((platforms.length + 1) * 7.31) * kinds.length)]
  });
}
function shroom(col) {
  const top = groundTopAt(col);
  mushrooms.push({ x: col * TILE + TILE / 2, capY: top * TILE - 36, squish: 0 });
}
function btn(col, row) { SPEC.btn.push({ x: col * TILE + TILE / 2, y: row * TILE }); }
function btnRow(c0, c1, row) { for (let c = c0; c <= c1; c++) btn(c, row); }
function heartPickup(col, row) { SPEC.heart.push({ x: col * TILE, y: row * TILE }); }
function rhino(col, topRow) { SPEC.enemy.push({ type: 'rhino', x: col * TILE + TILE / 2, y: topRow * TILE }); }
function tiger(col, topRow) { SPEC.enemy.push({ type: 'tiger', x: col * TILE + TILE / 2, y: topRow * TILE }); }
function rawr(col, topRow) { SPEC.enemy.push({ type: 'rawr', x: col * TILE + TILE / 2, y: topRow * TILE }); }
function bird(col, row) { SPEC.enemy.push({ type: 'bird', x: col * TILE + TILE / 2, y: row * TILE }); }
function sign(col, lines) { const t = groundTopAt(col); SPEC.sign.push({ x: col * TILE + TILE / 2, y: t * TILE, lines }); }
function pillow(col) { const t = groundTopAt(col); SPEC.pillow.push({ x: col * TILE + TILE / 2, y: t * TILE }); }
function shop(col) { const t = groundTopAt(col); SPEC.shop.push({ x: col * TILE + TILE / 2, y: t * TILE }); }
function trees(cols) {
  cols.forEach(c => {
    const t = groundTopAt(c);
    if (t !== null) SPEC.tree.push({ x: c * TILE + TILE / 2, y: t * TILE, s: 0.8 + hash(c) * 0.5 });
  });
}
function mover(col, row, wTiles, axis, rangeTiles, period, phase, kind) {
  SPEC.mover.push({
    x: col * TILE, y: row * TILE, w: wTiles * TILE, axis,
    range: rangeTiles * TILE, period, phase: phase || 0,
    k: kind || (THEME.plats || ['book'])[0],
    c: PAL.bookCols[(SPEC.mover.length + 2) % PAL.bookCols.length]
  });
}
function crumb(col, row, wTiles, kind) {
  SPEC.crumb.push({ x: col * TILE, y: row * TILE, w: wTiles * TILE, k: kind || 'pages', c: PAL.bookCols[SPEC.crumb.length % PAL.bookCols.length] });
}
function pulse(col, row, wTiles, period, phase) {
  SPEC.pulse.push({ x: col * TILE, y: row * TILE, w: wTiles * TILE, period, phase });
}
function geyser(col, period, phase) { SPEC.geyser.push({ x: col * TILE, period, phase: phase || 0 }); }
function windZone(c0, r0, c1, r1, fx, fy, sand) {
  SPEC.wind.push({ x: c0 * TILE, y: r0 * TILE, w: (c1 - c0) * TILE, h: (r1 - r0) * TILE, fx: fx || 0, fy: fy || 0, sand: !!sand });
}
function rollerZone(kind, trigCol, startCol, endCol, period) {
  SPEC.roller.push({ kind, trig: trigCol * TILE, start: startCol * TILE, end: endCol * TILE, period: period || 4 });
}
function appleZone(c0, c1, period) { SPEC.apple.push({ x0: c0 * TILE, x1: c1 * TILE, period }); }
function tide(amp, period) { levelTide = { amp, period }; }

function goalBook(col) {
  const t = groundTopAt(col);
  GOAL = { type: 'book', x: col * TILE - 34, y: t * TILE - 104, w: 68, h: 104 };
}
function goalHome(col) {
  const t = groundTopAt(col);
  COTTAGE = { x: col * TILE, y: t * TILE, w: 7 * TILE };
  GOAL = { type: 'home', x: COTTAGE.x + 138, y: t * TILE - 92, w: 60, h: 92 };
}

// ---- Chapter 1: The Meadow
function buildL1() {
  fillGround(0, 30, 12);
  fillGround(31, 36, 11); fillGround(37, 42, 10); fillGround(43, 52, 11);
  fillGround(56, 70, 12);
  fillGround(74, 88, 12);
  fillGround(89, 108, 7);            // the big cliff — Stuffie Stack country
  fillGround(109, 112, 9); fillGround(113, 116, 11); fillGround(117, 126, 12);
  fillGround(129, 129, 13);          // pond stepping-stone island
  fillGround(132, 150, 12);
  fillGround(153, 160, 12);
  fillGround(164, 195, 12);

  plat(58.6, 7, 2);
  mover(71.5, 10, 2, 'h', 1.1, 5, 0);
  plat(97, 4.5, 2);
  plat(134, 9.5, 2); plat(137.5, 7.5, 2); plat(141, 5.5, 2);
  plat(161, 10.5, 3);
  shroom(60); shroom(129);

  btnRow(15, 20, 10.8);
  btn(33, 9.6); btn(35, 9.0); btn(39, 8.6); btn(41, 8.6);
  btnRow(57, 59, 10.8);
  btn(59.1, 6.2); btn(60.1, 6.2);
  btn(71.7, 9.2); btn(72.7, 9.2);
  btnRow(80, 84, 10.8);
  btnRow(92, 95, 5.8);
  btn(97.5, 3.7); btn(98.5, 3.7);
  btnRow(100, 103, 5.8);
  btnRow(119, 121, 10.8);
  btn(134.5, 8.7); btn(135.5, 8.7); btn(138, 6.7); btn(139, 6.7); btn(141.5, 4.7); btn(142.5, 4.7);
  btnRow(145, 148, 10.8);
  btnRow(155, 158, 10.8);
  btn(161.7, 9.7); btn(162.7, 9.7);
  btnRow(166, 169, 10.8);
  btnRow(176, 179, 10.8);

  heartPickup(59.6, 5.9);
  heartPickup(90.8, 5.4);
  heartPickup(142, 4.4);
  // sky shelf — stack-launch from the high meadow
  plat(97.5, 1.2, 2); plat(101.5, -0.3, 2);
  btn(98, 0.4); btn(99, 0.4); btn(102, -1.1); btn(103, -1.1);
  heartPickup(102.5, -1.6);

  rhino(63, 12); rhino(78, 12); rhino(104, 7); rhino(140, 12); rhino(173, 12);
  tiger(47, 11); tiger(96, 7); tiger(120, 12); tiger(156, 12);
  rawr(82, 12); rawr(147, 12);
  bird(34, 7.5); bird(160, 8);

  sign(8, ['Run with ← →  ·  Jump with Space', '(hold Space for higher hops!)']);
  sign(86, ['A big cliff! Press X:', 'Stuffie Stack launch!']);
  sign(170, ['The chapter gate is near!']);
  pillow(69.5); pillow(124.5);
  shop(110.5);
  trees([12, 24, 58, 77, 99, 117, 139, 157, 168, 177, 191]);
  SPEC.fence.push([1, 6], [175, 180]);
  goalBook(186);
}

// ---- Chapter 2: The Whispering Woods
function buildL2() {
  fillGround(0, 18, 12);
  fillGround(19, 26, 11); fillGround(27, 34, 10);
  fillGround(38, 52, 11);
  fillGround(55, 68, 12);
  fillGround(84, 99, 7);             // high woods, beyond the book staircase
  fillGround(100, 103, 9);           // the shop ledge
  fillGround(104, 107, 11); fillGround(108, 118, 12);
  fillGround(119, 134, 8);           // second Stuffie Stack cliff
  fillGround(135, 138, 10); fillGround(139, 150, 12);
  fillGround(152, 152, 13);          // pond stepping stone
  fillGround(154, 162, 12);
  fillGround(165, 195, 12);

  plat(35.5, 8, 2);                  // pond hop
  plat(39.5, 6, 2);                  // above the spring
  plat(70, 10, 2); plat(73.5, 8, 2); plat(77, 6, 2); plat(80.5, 4, 2); // staircase over the big pond
  plat(163, 10, 2);
  shroom(41); shroom(152);

  btnRow(8, 12, 10.8);
  btn(20, 9.8); btn(23, 9.6); btn(29, 8.8); btn(32, 8.8);
  btn(36, 7.2); btn(37, 7.2);
  btnRow(43, 47, 9.8);
  btn(40, 5.2); btn(41, 5.2);
  btnRow(60, 64, 10.8);
  btn(70.5, 9.2); btn(71.5, 9.2); btn(74, 7.2); btn(75, 7.2);
  btn(77.5, 5.2); btn(78.5, 5.2); btn(81, 3.2); btn(82, 3.2);
  btnRow(88, 91, 5.8); btnRow(94, 96, 5.8);
  btn(101, 7.8); btn(102.5, 7.8);
  btnRow(112, 116, 10.8);
  btnRow(123, 127, 6.8);
  btnRow(141, 145, 10.8);
  btn(152.5, 11);
  btn(163.5, 9.2); btn(164.5, 9.2);
  btnRow(170, 174, 10.8);
  btnRow(184, 187, 10.8);

  heartPickup(40.5, 5);
  heartPickup(81.5, 3.2);
  heartPickup(120.5, 6.4);
  mover(88, 5, 2, 'v', 1.3, 7, 0);
  mover(94, 3.8, 2, 'v', 1.3, 7, 2);
  btn(88.5, 2.4); btn(89.5, 2.4); btn(94.5, 1.2); btn(95.5, 1.2);

  rhino(46, 11); rhino(62, 12); rhino(115, 12); rhino(126, 8); rhino(144, 12);
  tiger(22, 11); tiger(90, 7); tiger(93, 7); tiger(131, 8); tiger(170, 12);
  rawr(66, 12); rawr(158, 12);
  bird(53.5, 8.5); bird(122, 5);

  sign(6, ['Chapter 2: The Whispering Woods', 'Mind the ponds — books float!']);
  sign(116, ['Another big cliff!', 'Press X — Stuffie Stack!']);
  sign(180, ['The chapter gate is near!']);
  pillow(57); pillow(110);
  shop(101.5);
  trees([3, 9, 30, 44, 58, 86, 92, 97, 111, 121, 129, 137, 146, 158, 167, 175, 183, 191]);
  SPEC.fence.push([1, 5], [171, 176]);
  goalBook(189);
}

// ---- Chapter 3: The Last Stroll
function buildL3() {
  fillGround(0, 14, 12);
  fillGround(15, 20, 11); fillGround(21, 26, 10); fillGround(27, 32, 9);  // up the hill
  fillGround(33, 38, 10); fillGround(39, 44, 11);                          // and down
  fillGround(48, 60, 12);
  fillGround(61, 74, 8);             // first cliff
  fillGround(75, 88, 4);             // second cliff — stack twice!
  fillGround(89, 92, 7); fillGround(93, 96, 10); fillGround(97, 108, 12);
  fillGround(111, 111, 13);          // pond stepping stone
  fillGround(114, 126, 12);
  fillGround(127, 150, 12);
  fillGround(153, 160, 12);
  fillGround(163, 195, 12);

  plat(45.5, 9, 2);                  // pond hop
  plat(52.5, 7, 2);                  // above the spring
  plat(128, 9.5, 2); plat(131.5, 7.5, 2); plat(135, 5.5, 2); // cloud shelf
  shroom(54); shroom(111);

  btnRow(8, 11, 10.8);
  btn(16, 9.8); btn(19, 9.6); btn(22, 8.8); btn(25, 8.6); btn(29, 7.8);
  btn(31, 7.8); btn(35, 8.6); btn(37, 8.8); btn(41, 9.6); btn(43, 9.8);
  btn(46, 8.2); btn(47, 8.2);
  btnRow(50, 53, 10.8); btnRow(56, 59, 10.8);
  btnRow(65, 70, 6.8);
  btnRow(78, 82, 2.8);
  btn(90, 5.8); btn(91, 5.8);
  btn(94.5, 8.8); btn(95.5, 8.8);
  btnRow(102, 106, 10.8);
  btn(111.5, 11);
  btnRow(116, 120, 10.8);
  btn(128.5, 8.7); btn(129.5, 8.7); btn(132, 6.7); btn(133, 6.7); btn(135.5, 4.7); btn(136.5, 4.7);
  btnRow(143, 147, 10.8);
  btnRow(155, 158, 10.8);
  btnRow(167, 170, 10.8);
  btnRow(175, 178, 10.8);

  heartPickup(53.5, 6);
  heartPickup(62.5, 6.4);
  heartPickup(136, 4.4);
  windZone(50, 11, 58, 12.4, 0, 0, true);
  windZone(116, 11, 124, 12.4, 0, 0, true);
  rollerZone('tumble', 0, 97, 108, 4);
  rollerZone('tumble', 0, 142, 158, 4.5);
  sign(49, ['Soft sand ahead —', 'hop to stay on top!']);

  rhino(57, 12); rhino(68, 8); rhino(105, 12); rhino(118, 12); rhino(141, 12); rhino(170, 12);
  tiger(24, 10); tiger(36, 10); tiger(80, 4); tiger(123, 12); tiger(133, 12);
  rawr(86, 4); rawr(155, 12);
  bird(42, 7); bird(131, 6.5);

  sign(5, ['Chapter 3: The Golden Dunes', 'Mind the hot sand!']);
  sign(58, ['Two big cliffs ahead!', 'Stack, recharge, stack again!']);
  sign(172, ['The chapter gate is near!']);
  pillow(50); pillow(99);
  shop(94.5);
  trees([5, 18, 40, 50, 66, 85, 101, 116, 131, 146, 157, 165, 174, 192]);
  SPEC.fence.push([1, 5], [166, 171], [176, 181]);
  goalBook(187);
}

// ---- Chapter 4: Orchard Lane (autumn)
function buildL4() {
  fillGround(0, 16, 12); fillGround(17, 22, 11); fillGround(23, 28, 10);
  fillGround(32, 40, 11);
  fillGround(42, 42, 13);
  fillGround(44, 56, 12);
  fillGround(57, 62, 10); fillGround(63, 68, 9);
  fillGround(69, 84, 5);             // stack cliff
  fillGround(85, 88, 7); fillGround(89, 96, 9); fillGround(97, 100, 11);
  fillGround(101, 118, 12);
  fillGround(121, 121, 13); fillGround(125, 125, 13); fillGround(129, 129, 13);
  fillGround(132, 150, 12);
  fillGround(154, 162, 12);
  fillGround(165, 195, 12);
  plat(29.5, 8.5, 2); plat(33.5, 6, 2); plat(151, 10, 3);
  shroom(35); shroom(42); shroom(125);
  btnRow(6, 10, 10.8); btn(19, 9.6); btn(25, 8.6);
  btn(30, 7.6); btn(31, 7.6); btn(34, 5.2); btn(35, 5.2);
  btnRow(46, 50, 10.8); btnRow(59, 61, 8.8); btnRow(64, 67, 7.8);
  btnRow(72, 78, 3.8); btn(81, 3.8); btn(83, 3.8);
  btnRow(90, 94, 7.6); btnRow(104, 108, 10.8); btnRow(112, 116, 10.8);
  btn(121.5, 11); btn(125.5, 11); btn(129.5, 11);
  btnRow(135, 139, 10.8); btnRow(143, 147, 10.8);
  btn(151.7, 9.2); btn(152.7, 9.2);
  btnRow(156, 160, 10.8); btnRow(168, 172, 10.8); btnRow(176, 180, 10.8);
  heartPickup(34.5, 4.8); heartPickup(72, 2.8); heartPickup(125, 8.5);
  plat(75, 0.8, 2); plat(79, -0.6, 2);
  btn(75.5, 0); btn(76.5, 0); btn(79.5, -1.4); btn(80.5, -1.4);
  heartPickup(80, -2);
  appleZone(44, 56, 2.2);
  appleZone(132, 150, 2);
  windZone(119, 8, 131, 12.6, 170, 0);
  sign(43, ['Apples are dropping!', 'Mind your noggin!']);
  rawr(53, 12); rhino(74, 5); tiger(78, 5); bird(75, 2);
  rhino(104, 12); tiger(108, 12); rawr(112, 12); bird(123, 9);
  rhino(136, 12); tiger(141, 12); rhino(146, 12); tiger(158, 12); rawr(170, 12);
  sign(6, ['Chapter 4: Orchard Lane', 'Leaves are falling — so are you!']);
  sign(66, ['Big cliff! Stuffie Stack', 'with X to launch!']);
  sign(181, ['The chapter gate is near!']);
  pillow(50); pillow(116);
  shop(94.5);
  trees([4, 14, 26, 37, 48, 60, 75, 82, 92, 106, 138, 148, 158, 170, 178, 191]);
  SPEC.fence.push([1, 5], [174, 179]);
  goalBook(187);
}

// ---- Chapter 5: The Snowy Peaks (slippery!)
function buildL5() {
  fillGround(0, 14, 12); fillGround(15, 20, 10); fillGround(21, 26, 8);
  fillGround(30, 38, 7);
  fillGround(39, 52, 3);             // stack cliff to the high ridge
  fillGround(53, 56, 6); fillGround(57, 60, 9); fillGround(61, 66, 11);
  fillGround(67, 80, 12);
  fillGround(83, 83, 13); fillGround(86, 86, 13);
  fillGround(90, 93, 12); fillGround(94, 97, 10);
  fillGround(98, 118, 12);
  fillGround(134, 150, 5);           // high snowfield after the book climb
  fillGround(151, 154, 8); fillGround(155, 158, 10);
  fillGround(161, 195, 12);
  plat(27, 6.5, 2);
  crumb(120, 10, 2, 'ice'); crumb(123.5, 8, 2, 'ice'); crumb(127, 6, 2, 'ice'); crumb(130.5, 4, 2, 'ice');
  shroom(86);
  btnRow(5, 9, 10.8); btn(17, 8.8); btn(23, 6.8);
  btnRow(32, 36, 5.8); btnRow(41, 46, 1.8); btn(49, 1.8); btn(51, 1.8);
  btn(54, 4.8); btn(58, 7.8); btnRow(62, 65, 9.8);
  btnRow(70, 76, 10.8); btn(83.5, 11); btn(86.5, 11);
  btnRow(100, 104, 10.8); btnRow(108, 112, 10.8);
  btn(120.5, 9.2); btn(124, 7.2); btn(127.5, 5.2); btn(131, 3.2);
  btnRow(137, 143, 3.8); btnRow(146, 149, 3.8);
  btn(152, 6.8); btn(156, 8.8);
  btnRow(165, 169, 10.8); btnRow(174, 178, 10.8);
  heartPickup(27.5, 5); heartPickup(48, 1.6); heartPickup(131.5, 2.6);
  rollerZone('snow', 68, 64, 86);
  sign(66, ['Uh oh… SNOWBALL!', 'Run, friends, run!']);
  sign(118, ['Cracking ice ahead —', 'keep hopping, don\'t linger!']);
  bird(34, 4.5); tiger(44, 3); tiger(65, 11);
  rhino(70, 12); rhino(76, 12); bird(84, 9);
  tiger(102, 12); rawr(107, 12); rhino(113, 12); bird(126, 5);
  tiger(140, 5); rhino(145, 5); rawr(165, 12); tiger(172, 12);
  sign(6, ['Chapter 5: The Snowy Peaks', 'Careful — the snow is slippery!']);
  sign(36, ['A frosty cliff!', 'Stuffie Stack with X!']);
  sign(182, ['The chapter gate is near!']);
  pillow(63); pillow(116);
  shop(95.5);
  trees([4, 12, 24, 33, 44, 50, 58, 72, 78, 92, 103, 110, 139, 147, 157, 168, 176, 191]);
  SPEC.fence.push([1, 5], [175, 180]);
  goalBook(187);
}

// ---- Chapter 6: Petal Gardens
function buildL6() {
  fillGround(0, 12, 12); fillGround(13, 20, 11);
  fillGround(25, 34, 11);
  fillGround(54, 62, 12);
  fillGround(63, 78, 12);
  fillGround(79, 94, 7);             // stack cliff
  fillGround(95, 98, 9); fillGround(99, 102, 11);
  fillGround(103, 122, 12);
  fillGround(126, 126, 13); fillGround(130, 130, 13); fillGround(134, 134, 13);
  fillGround(138, 154, 12);
  fillGround(158, 166, 12);
  fillGround(169, 195, 12);
  plat(21, 9.5, 2); plat(26.5, 6.5, 2);
  plat(36, 9.5, 2); plat(39.5, 8, 2); plat(43, 9.5, 2); plat(46.5, 7.5, 2); plat(50, 9, 2);
  plat(155, 10, 3);
  shroom(28); shroom(130);
  btnRow(4, 8, 10.8); btn(15, 9.8); btn(18, 9.8);
  btn(21.5, 8.7); btn(22.5, 8.7); btn(27, 5.7); btn(28, 5.7);
  btn(36.5, 8.7); btn(40, 7.2); btn(43.5, 8.7); btn(47, 6.7); btn(50.5, 8.2);
  btnRow(56, 60, 10.8); btnRow(66, 70, 10.8);
  btnRow(82, 88, 5.8); btn(91, 5.8);
  btn(96.5, 7.8); btnRow(106, 110, 10.8); btnRow(114, 118, 10.8);
  btn(126.5, 11); btn(130.5, 11); btn(134.5, 11);
  btnRow(141, 146, 10.8); btnRow(149, 152, 10.8);
  btn(155.7, 9.2); btn(157, 9.2);
  btnRow(160, 164, 10.8); btnRow(172, 176, 10.8); btnRow(180, 184, 10.8);
  heartPickup(27.5, 5.4); heartPickup(81, 5.4); heartPickup(130, 8.5);
  plat(85, 1.6, 2); plat(89, 0.2, 2);
  btn(85.5, 0.8); btn(86.5, 0.8); btn(89.5, -0.6); btn(90.5, -0.6);
  heartPickup(90, -1.2);
  windZone(38, 5, 40.5, 12, 0, -1500);
  windZone(47, 5, 49.5, 12, 0, -1500);
  sign(34, ['Petal breezes lift you!', 'Float up, up, up!']);
  tiger(31, 11); bird(41, 6); bird(48, 6.5);
  rawr(59, 12); rhino(67, 12); tiger(73, 12);
  bird(85, 4); tiger(90, 7);
  rhino(106, 12); rawr(111, 12); tiger(116, 12); rhino(120, 12);
  bird(128, 9); bird(133, 9.5);
  tiger(142, 12); rhino(147, 12); rawr(151, 12); tiger(162, 12); rawr(173, 12);
  sign(5, ['Chapter 6: Petal Gardens', 'Hop the books over the ponds!']);
  sign(76, ['Another tall cliff —', 'Stuffie Stack time!']);
  sign(185, ['The chapter gate is near!']);
  pillow(56); pillow(114);
  shop(96.5);
  trees([3, 10, 17, 30, 57, 65, 74, 86, 100, 108, 119, 143, 152, 161, 172, 182, 191]);
  SPEC.fence.push([1, 5], [177, 182]);
  goalBook(188);
}

// ---- Chapter 7: Sandy Shores
function buildL7() {
  fillGround(0, 10, 12); fillGround(11, 16, 11);
  fillGround(19, 19, 13); fillGround(22, 22, 13); fillGround(25, 25, 13);
  fillGround(28, 36, 12);
  fillGround(39, 39, 13); fillGround(43, 43, 13); fillGround(47, 47, 13);
  fillGround(50, 58, 12);
  fillGround(59, 72, 12);
  fillGround(73, 88, 7);             // stack cliff
  fillGround(89, 92, 9); fillGround(93, 96, 11);
  fillGround(116, 126, 12);
  fillGround(129, 129, 13); fillGround(133, 133, 13); fillGround(137, 137, 13); fillGround(140, 140, 13);
  fillGround(142, 160, 12);
  fillGround(164, 195, 12);
  plat(31.5, 7, 2);
  plat(98, 9.5, 2); plat(101.5, 8, 2); plat(105, 9.5, 2); plat(108.5, 7.5, 2); plat(112, 9, 2);
  plat(161, 10, 3);
  shroom(33); shroom(133);
  btnRow(3, 7, 10.8); btn(13, 9.8);
  btn(19.5, 11); btn(22.5, 11); btn(25.5, 11);
  btn(32, 6.2); btn(33, 6.2);
  btn(39.5, 11); btn(43.5, 11); btn(47.5, 11);
  btnRow(52, 56, 10.8); btnRow(62, 68, 10.8);
  btnRow(76, 82, 5.8); btn(85, 5.8);
  btn(90.5, 7.8); btn(98.5, 8.7); btn(102, 7.2); btn(105.5, 8.7); btn(109, 6.7); btn(112.5, 8.2);
  btnRow(118, 124, 10.8);
  btn(129.5, 11); btn(133.5, 11); btn(137.5, 11);
  btnRow(145, 150, 10.8); btnRow(153, 157, 10.8);
  btn(161.7, 9.2); btn(163, 9.2);
  btnRow(167, 171, 10.8); btnRow(176, 180, 10.8);
  heartPickup(32.5, 6); heartPickup(75, 5.4); heartPickup(108.5, 6.4);
  tide(55, 10);
  mover(100, 11.2, 2, 'h', 6, 12, 0, 'drift');
  sign(17, ['The tide rises and falls…', 'cross when the sand shows!']);
  bird(21, 9); tiger(31, 12); bird(44, 9);
  rawr(55, 12); rhino(62, 12); rhino(68, 12);
  tiger(78, 7); bird(82, 4.5); rawr(85, 7);
  bird(103, 6); bird(110, 6);
  tiger(122, 12); rawr(125, 12); bird(135, 9);
  rhino(146, 12); tiger(151, 12); rhino(156, 12);
  rawr(168, 12); tiger(173, 12);
  sign(5, ['Chapter 7: Sandy Shores', 'Hop the sandbars, mind the surf!']);
  sign(70, ['A seaside cliff!', 'Stuffie Stack with X!']);
  sign(182, ['The chapter gate is near!']);
  pillow(52); pillow(118);
  shop(90.5);
  trees([3, 9, 30, 53, 60, 70, 80, 91, 119, 144, 154, 166, 174, 183, 192]);
  SPEC.fence.push([1, 5], [175, 180]);
  goalBook(188);
}

// ---- Chapter 8: Glowshroom Hollow
function buildL8() {
  fillGround(0, 10, 12); fillGround(11, 18, 11);
  fillGround(21, 21, 13); fillGround(26, 26, 13); fillGround(30, 30, 13);
  fillGround(32, 44, 12);
  fillGround(45, 58, 12);
  fillGround(59, 66, 12);
  fillGround(67, 82, 7);             // stack cliff
  fillGround(85, 85, 13); fillGround(89, 89, 13);
  fillGround(94, 97, 9);
  fillGround(98, 118, 12);
  fillGround(136, 152, 12);
  fillGround(155, 162, 12);
  fillGround(166, 195, 12);
  plat(41.5, 7, 2);
  pulse(47, 8.5, 2, 2.6, 0); pulse(51, 6.5, 2, 2.6, 0.33); pulse(55, 8.5, 2, 2.6, 0.66);
  plat(87, 5.5, 2);
  pulse(120, 9.5, 2, 2.8, 0); pulse(124, 7.5, 2, 2.8, 0.25); pulse(128, 9.5, 2, 2.8, 0.5); pulse(132, 7.5, 2, 2.8, 0.75);
  plat(163, 10, 3);
  shroom(14); shroom(21); shroom(26); shroom(85); shroom(89);
  btnRow(3, 7, 10.8); btn(13, 9.8); btn(16, 9.8);
  btn(21.5, 10); btn(26.5, 10); btn(30.5, 11);
  btnRow(34, 38, 10.8); btn(42, 6.2); btn(43, 6.2);
  btn(47.5, 7.7); btn(51.5, 5.7); btn(55.5, 7.7);
  btnRow(61, 64, 10.8);
  btnRow(70, 76, 5.8); btn(79, 5.8);
  btn(85.5, 9.5); btn(87.5, 4.7); btn(88.5, 4.7); btn(89.5, 9.5);
  btn(95.5, 7.8);
  btnRow(101, 106, 10.8); btnRow(110, 115, 10.8);
  btn(120.5, 8.7); btn(124.5, 6.7); btn(128.5, 8.7); btn(132.5, 6.7);
  btnRow(139, 144, 10.8); btnRow(147, 150, 10.8);
  btn(163.7, 9.2); btn(165, 9.2);
  btnRow(169, 173, 10.8); btnRow(178, 182, 10.8);
  heartPickup(42.5, 5.8); heartPickup(70, 5.4); heartPickup(88, 3.4);
  plat(75, 1.4, 2); plat(79, 0, 2);
  btn(75.5, 0.6); btn(76.5, 0.6); btn(79.5, -0.8); btn(80.5, -0.8);
  heartPickup(80, -1.4);
  sign(45, ['Glow-shelves blink to', 'the hollow\'s heartbeat!']);
  bird(24, 8); tiger(36, 12); rawr(40, 12);
  rhino(49, 12); tiger(55, 12); bird(52, 5);
  rawr(64, 12);
  rhino(72, 7); bird(76, 3.5); tiger(80, 7); bird(88, 4);
  tiger(102, 12); rawr(106, 12); rhino(111, 12); tiger(115, 12);
  bird(122, 6); bird(130, 5.5);
  rhino(140, 12); rawr(145, 12); tiger(149, 12); tiger(158, 12); rawr(170, 12);
  sign(5, ['Chapter 8: Glowshroom Hollow', 'Bouncy mushrooms light the way!']);
  sign(64, ['A glowing cliff!', 'Stuffie Stack with X!']);
  sign(184, ['The chapter gate is near!']);
  pillow(60); pillow(117);
  shop(95.5);
  trees([4, 12, 34, 46, 53, 62, 74, 81, 100, 109, 141, 150, 158, 170, 180, 191]);
  SPEC.fence.push([1, 5], [176, 181]);
  goalBook(188);
}

// ---- Chapter 9: Ember Canyon
function buildL9() {
  fillGround(0, 9, 12); fillGround(10, 15, 11);
  fillGround(18, 18, 13); fillGround(21, 21, 12); fillGround(24, 24, 13); fillGround(27, 27, 12);
  fillGround(31, 40, 12);
  fillGround(41, 54, 7);             // stack cliff one
  fillGround(55, 68, 2);             // stack cliff two!
  fillGround(69, 72, 5); fillGround(73, 76, 8); fillGround(77, 80, 10);
  fillGround(81, 88, 12);
  fillGround(91, 91, 13); fillGround(94, 94, 12); fillGround(97, 97, 13); fillGround(100, 100, 12);
  fillGround(102, 105, 10);
  fillGround(106, 124, 12);
  fillGround(142, 158, 12);
  fillGround(160, 160, 13); fillGround(162, 162, 13);
  fillGround(164, 195, 12);
  plat(34.5, 7, 2);
  plat(126, 9.5, 2); plat(129.5, 7.5, 2); crumb(133, 5.5, 2, 'stone'); crumb(136.5, 7.5, 2, 'stone'); plat(140, 9.5, 2);
  shroom(36);
  btnRow(3, 7, 10.8); btn(12, 9.8);
  btn(18.5, 11) ; btn(21.5, 10); btn(24.5, 11); btn(27.5, 10);
  btnRow(33, 38, 10.8); btn(35, 6.2); btn(36, 6.2);
  btnRow(43, 49, 5.8); btn(52, 5.8);
  btnRow(58, 64, 0.8); btn(66, 0.8);
  btn(70, 3.8); btn(74, 6.8); btn(78, 8.8);
  btnRow(83, 86, 10.8);
  btn(91.5, 11); btn(94.5, 10); btn(97.5, 11); btn(100.5, 10);
  btn(103.5, 8.8);
  btnRow(108, 113, 10.8); btnRow(117, 122, 10.8);
  btn(126.5, 8.7); btn(130, 6.7); btn(133.5, 4.7); btn(137, 6.7); btn(140.5, 8.7);
  btnRow(145, 150, 10.8); btnRow(153, 156, 10.8);
  btn(160.5, 11); btn(162.5, 11);
  btnRow(167, 171, 10.8); btnRow(176, 180, 10.8);
  heartPickup(35.5, 5.8); heartPickup(60, 0.6); heartPickup(133.5, 4.4);
  tide(45, 11);
  geyser(22.5, 5, 0.3);
  geyser(92.5, 4.5, 0); geyser(98.5, 4.5, 0.5);
  sign(15, ['Geysers go WHOOSH!', 'Ride them up — mind the swell!']);
  bird(23, 9); rhino(34, 12); tiger(38, 12);
  tiger(45, 7); rawr(49, 7); bird(52, 4);
  tiger(63, 2);
  rawr(86, 12); bird(95, 9); bird(99, 8);
  rhino(109, 12); tiger(113, 12); rawr(117, 12); rhino(121, 12);
  bird(131, 4.5); bird(138, 6);
  tiger(146, 12); rhino(151, 12); rawr(155, 12);
  tiger(168, 12); rhino(172, 12);
  sign(5, ['Chapter 9: Ember Canyon', 'Hot lava! Hop the stones quick!']);
  sign(38, ['Two cliffs ahead —', 'stack, recharge, stack again!']);
  sign(182, ['The chapter gate is near!']);
  pillow(82); pillow(123);
  shop(103.5);
  trees([3, 12, 33, 44, 51, 60, 75, 84, 108, 116, 144, 153, 167, 178, 191]);
  SPEC.fence.push([1, 5], [176, 181]);
  goalBook(188);
}

// ---- Chapter 10: The Starlit Stroll (home!)
function buildL10() {
  fillGround(0, 12, 12); fillGround(13, 18, 11); fillGround(19, 24, 10);
  fillGround(28, 38, 11);
  fillGround(41, 41, 13); fillGround(44, 44, 13); fillGround(47, 47, 13);
  fillGround(50, 60, 12);
  fillGround(61, 76, 7);             // one last stack cliff
  fillGround(77, 80, 9); fillGround(81, 84, 11);
  fillGround(85, 88, 9);
  fillGround(89, 108, 12);
  fillGround(124, 140, 12);
  fillGround(141, 143, 12);
  fillGround(144, 156, 12);
  fillGround(159, 195, 12);
  mover(25.5, 8.5, 2, 'h', 1, 5, 0, 'cloud'); plat(29.5, 6.5, 2);
  plat(110, 9.5, 2); pulse(113.5, 7.5, 2, 3, 0); plat(117, 9.5, 2); pulse(120.5, 7.5, 2, 3, 0.5);
  crumb(157, 10, 2, 'pages');
  shroom(31); shroom(44);
  btnRow(4, 8, 10.8); btn(15, 9.8); btn(21, 8.8);
  btn(25.5, 7.7); btn(26.5, 7.7); btn(30, 5.7); btn(31, 5.7);
  btnRow(33, 37, 9.8);
  btn(41.5, 11); btn(44.5, 11); btn(47.5, 11);
  btnRow(52, 57, 10.8);
  btnRow(64, 70, 5.8); btn(73, 5.8);
  btn(78, 7.8); btn(86, 7.8);
  btnRow(92, 97, 10.8); btnRow(101, 106, 10.8);
  btn(110.5, 8.7); btn(114, 6.7); btn(117.5, 8.7); btn(121, 6.7);
  btnRow(127, 132, 10.8); btnRow(135, 138, 10.8);
  btnRow(146, 151, 10.8);
  btn(157.5, 9.2); btn(158.5, 9.2);
  btnRow(162, 166, 10.8); btnRow(170, 174, 10.8);
  heartPickup(30.5, 5.4); heartPickup(64, 5.4); heartPickup(120.5, 6.4);
  plat(69, 1.4, 2); plat(73, 0, 2);
  btn(69.5, 0.6); btn(70.5, 0.6); btn(73.5, -0.8); btn(74.5, -0.8);
  heartPickup(74, -1.4);
  sign(24, ['Everything you learned —', 'one starlit stroll home!']);
  tiger(35, 11); bird(43, 8);
  rawr(56, 12); rhino(59, 12);
  tiger(66, 7); bird(70, 4); rawr(73, 7);
  rhino(92, 12); tiger(97, 12); rawr(101, 12); tiger(105, 12);
  bird(115, 6); bird(121, 6);
  rhino(128, 12); rawr(133, 12); tiger(137, 12);
  tiger(148, 12); rhino(152, 12);
  rawr(163, 12); tiger(168, 12);
  sign(6, ['Chapter 10: The Starlit Stroll', 'Home is under the stars ♥']);
  sign(58, ['One last cliff, friends!', 'Stuffie Stack with X!']);
  sign(172, ['Almost home, friends!']);
  pillow(52); pillow(107);
  shop(86.5);
  trees([4, 11, 22, 34, 54, 64, 74, 90, 100, 126, 136, 149, 161, 170, 192]);
  SPEC.fence.push([1, 5], [174, 179]);
  goalHome(183);
}

const LEVELS = [
  { name: 'The Meadow', build: buildL1 },
  { name: 'The Whispering Woods', build: buildL2 },
  { name: 'The Golden Dunes', build: buildL3 },
  { name: 'Orchard Lane', build: buildL4 },
  { name: 'The Snowy Peaks', build: buildL5 },
  { name: 'Petal Gardens', build: buildL6 },
  { name: 'Sandy Shores', build: buildL7 },
  { name: 'Glowshroom Hollow', build: buildL8 },
  { name: 'Ember Canyon', build: buildL9 },
  { name: 'The Starlit Stroll', build: buildL10 }
];

function buildLevel(n) {
  solids.fill(0);
  platforms.length = 0; mushrooms.length = 0;
  SPEC.btn = []; SPEC.heart = []; SPEC.enemy = []; SPEC.sign = [];
  SPEC.pillow = []; SPEC.tree = []; SPEC.fence = []; SPEC.shop = [];
  SPEC.mover = []; SPEC.crumb = []; SPEC.pulse = []; SPEC.geyser = []; SPEC.wind = []; SPEC.roller = []; SPEC.apple = [];
  levelTide = null;
  GOAL = null; COTTAGE = null;
  butterflies.length = 0;
  THEME = THEMES[n];
  GRAD = {};
  makeTerrain();
  makeBands();
  LEVELS[n].build();
  // pond columns (no land anywhere in the column)
  pondCols = new Array(LW).fill(false);
  for (let x = 0; x < LW; x++) {
    let any = false;
    for (let y = 0; y < LH; y++) if (S(x, y)) { any = true; break; }
    pondCols[x] = !any;
  }
  buttonsTotal = SPEC.btn.length;
}

// ------------------------------------------------------------ runtime state
let state = 'title';          // title | play | chapter | win | over
let paused = false;
let simT = 0, timeSec = 0, winT = 0, overT = 0, chapterT = 0;
let camX = 0, camY = WORLD_H - VH;
let hearts = 3, buttons = 0;
let curLevel = 0, levelStartButtons = 0, buttonsCollected = 0, levelBannerT = 0;
let shops = [];
let upg = { maxHearts: 3, speed: false, djump: false, dash: false, ball: false, ball2: false, ball3: false, yarn: false };
let balls = [], ballCd = 0;
let aiming = false, aimId = null, aimPt = { x: 0, y: 0 };
let yarnCd = 0, yarn = null; // { phase: 'out'|'pull'|'retract', dir, len, pt, ax, ay }

function fireYarn() {
  if (!upg.yarn || yarnCd > 0 || state !== 'play' || yarn) return;
  yarnCd = 1.1;
  yarn = { phase: 'out', dir: player.face, len: 0, pt: 0, ax: 0, ay: 0 };
  blip(360, 620, 0.12, 'triangle', 0.05);
}

function updateYarn(dt) {
  const dir = yarn.dir;
  const ox = player.x + dir * 12, oy = player.y - 36;
  if (yarn.phase === 'out') {
    yarn.len += 950 * dt; // unspools at a watchable pace
    const tipX = ox + dir * yarn.len;
    if (yarn.len >= 350 || S(Math.floor(tipX / TILE), Math.floor(oy / TILE))) {
      yarn.phase = 'retract';
      blip(480, 360, 0.1, 'triangle', 0.035);
      return;
    }
    for (const en of enemies) {
      if (en.gone) continue;
      const hw2 = en.type === 'rhino' ? 33 : en.type === 'rawr' ? 32 : en.type === 'bird' ? 17 : 19;
      const hh2 = en.type === 'rhino' ? 34 : en.type === 'rawr' ? 40 : en.type === 'bird' ? 32 : 40;
      if (Math.abs(tipX - en.x) < hw2 + 8 && Math.abs((en.y - hh2 * 0.5) - oy) < hh2 * 0.5 + 30) {
        yarn.phase = 'pull'; yarn.pt = 0;
        yarn.ax = en.x; yarn.ay = en.y - 24;
        poofEnemy(en);
        popup(en.x, en.y - 54, 'zip!');
        player.invuln = Math.max(player.invuln, 0.55);
        player.squash = -0.3;
        blip(660, 1100, 0.18, 'square', 0.05);
        return;
      }
    }
  } else if (yarn.phase === 'retract') {
    yarn.len -= 1500 * dt;
    if (yarn.len <= 0) yarn = null;
  }
}

function drawYarn() {
  if (!yarn || state !== 'play') return;
  const dir = yarn.dir;
  const ox = player.x + dir * 12, oy = player.y - 36;
  let tx2, ty2;
  if (yarn.phase === 'pull') { tx2 = yarn.ax; ty2 = yarn.ay; }
  else { tx2 = ox + dir * yarn.len; ty2 = oy + Math.min(10, yarn.len * 0.03); }
  const sag = yarn.phase === 'pull' ? 3 : Math.min(24, yarn.len * 0.08);
  ctx.save();
  ctx.globalAlpha = yarn.phase === 'retract' ? 0.55 : 0.9;
  ctx.strokeStyle = '#d23b2f'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const tt = i / 10;
    const lx = ox + (tx2 - ox) * tt;
    const ly = oy + (ty2 - oy) * tt + Math.sin(Math.PI * tt) * sag + Math.sin(tt * 8 + simT * 26) * 1.4;
    if (i) ctx.lineTo(lx, ly); else ctx.moveTo(lx, ly);
  }
  ctx.stroke();
  // little yarn ball at the tip
  E(tx2, ty2, 6, 6, '#e25d52');
  ctx.strokeStyle = 'rgba(255,235,225,.85)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(tx2, ty2, 3.8, 0.4, 2.6); ctx.stroke();
  ctx.beginPath(); ctx.arc(tx2, ty2, 5, 2.8, 4.6); ctx.stroke();
  ctx.restore();
}

function throwAimed() {
  if (!upg.ball || ballCd > 0 || state !== 'play') return;
  const wx = aimPt.x + camX, wy = aimPt.y + camY;
  player.face = wx >= player.x ? 1 : -1;
  const ox = player.x + player.face * 14, oy = player.y - 34;
  let dx = wx - ox, dy = wy - oy;
  const d = Math.hypot(dx, dy);
  if (d < 8) { dx = player.face; dy = -0.35; }
  const dd = Math.max(1, Math.hypot(dx, dy));
  const spd = upg.ball2 ? 660 : 440;
  ballCd = 0.45;
  balls.push({
    x: ox, y: oy,
    vx: dx / dd * spd + player.vx * 0.2,
    vy: dy / dd * spd,
    grav: upg.ball2 ? 1000 : 1500,
    gold: upg.ball3,
    bounces: 0, life: upg.ball2 ? 2.3 : 1.6, rot: 0
  });
  blip(500, 320, 0.1, 'triangle', 0.05);
}

function drawAim() {
  if (!aiming || !upg.ball || state !== 'play') return;
  const wx = aimPt.x + camX, wy = aimPt.y + camY;
  const ox = player.x + player.face * 14, oy = player.y - 34;
  let dx = wx - ox, dy = wy - oy;
  const dd = Math.max(1, Math.hypot(dx, dy));
  const spd = upg.ball2 ? 660 : 440;
  let vx2 = dx / dd * spd + player.vx * 0.2, vy2 = dy / dd * spd;
  const grav = upg.ball2 ? 1000 : 1500;
  const ready = ballCd <= 0;
  ctx.save();
  // dotted flight path
  let x = ox, y = oy;
  const step = 1 / 60;
  for (let i = 0; i < 66; i++) {
    vy2 += grav * step;
    x += vx2 * step; y += vy2 * step;
    if (i % 4 === 1) {
      const k = 1 - i / 72;
      ctx.globalAlpha = (ready ? 0.8 : 0.28) * k;
      E(x, y, 3 * k + 1, 3 * k + 1, '#fff6e0');
      ctx.strokeStyle = 'rgba(86,60,40,.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 3 * k + 1, 0, TAU); ctx.stroke();
    }
    if (S(Math.floor(x / TILE), Math.floor(y / TILE))) break;
  }
  // crosshair
  ctx.globalAlpha = ready ? 0.9 : 0.35;
  ctx.strokeStyle = '#d23b2f'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(wx, wy, 9, 0, TAU); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(wx - 14, wy); ctx.lineTo(wx - 5, wy);
  ctx.moveTo(wx + 5, wy); ctx.lineTo(wx + 14, wy);
  ctx.moveTo(wx, wy - 14); ctx.lineTo(wx, wy - 5);
  ctx.moveTo(wx, wy + 5); ctx.lineTo(wx, wy + 14);
  ctx.stroke();
  E(wx, wy, 1.8, 1.8, '#d23b2f');
  ctx.restore();
}
let shopSel = 0;
const SHOP_ITEMS = [
  { id: 'heal', name: 'Plush heart', desc: 'restore one heart', price: 10 },
  { id: 'maxhp', name: 'Bigger heart pouch', desc: '+1 max heart (up to 5)', price: 25 },
  { id: 'speed', name: 'Zoomy slippers', desc: 'run a whole lot faster', price: 20 },
  { id: 'djump', name: 'Cloud bounce', desc: 'jump again in mid-air!', price: 30 },
  { id: 'dash', name: 'Wind ribbon', desc: 'press Z or Shift — dash forward, even mid-air', price: 25 },
  { id: 'ball', name: 'Lucky baseball', desc: 'press F to throw — 2 bonks poofs a foe', price: 30 },
  { id: 'ball2', name: 'Fastball stitch', desc: 'baseball flies faster and farther', price: 35 },
  { id: 'ball3', name: 'Golden baseball', desc: 'one bonk poofs any foe!', price: 50 },
  { id: 'yarn', name: 'Yarn zinger', desc: 'press G — zip a yarn line that poofs a foe and pulls you to it', price: 45 }
];
const TIER = () => Math.min(3, Math.floor(curLevel / 3));
let checkpoint = null;
let special = null, specialCd = 0, airHintT = 0;
let autopilot = false, apJumpT = 0.6;
let deathFade = 0;

const player = {
  x: 0, y: 0, vx: 0, vy: 0, w: 30, h: 44, face: 1,
  grounded: false, coyote: 0, jumpBuf: 0, run: 0, airJumps: 1, pBot: 0,
  airDash: 1, dashT: 0, dashCd: 0,
  squash: 0, invuln: 0, idleT: 0, launchT: 0, splashed: false
};
let hist = [];
const CHARS = ['doggie', 'bear', 'dearie'];
const NAMES = { doggie: 'Doggie', bear: 'Bear', dearie: 'Dearie' };
let heroIdx = 0;
try { heroIdx = clamp(parseInt(localStorage.getItem('doggie_hero') || '0', 10) || 0, 0, 2); } catch (e) {}
const comps = [
  { char: 'bear', x: 0, y: 0, face: 1, run: 0, g: true, vy: 0, hop: 0 },
  { char: 'dearie', x: 0, y: 0, face: 1, run: 0, g: true, vy: 0, hop: 0 }
];
function setHero(i) {
  heroIdx = i;
  const others = [0, 1, 2].filter(k => k !== i);
  comps[0].char = CHARS[others[0]];
  comps[1].char = CHARS[others[1]];
}
setHero(heroIdx);
function cycleHero() {
  setHero((heroIdx + 1) % 3);
  try { localStorage.setItem('doggie_hero', String(heroIdx)); } catch (e) {}
  if (state === 'play') {
    popup(player.x, player.y - 88, NAMES[CHARS[heroIdx]] + ' leads!');
    spawnParts(player.x, player.y - 30, 'star', 8, { speed: 110, life: 0.6, color: '#ffd978' });
    comps.forEach(c => spawnParts(c.x, c.y - 26, 'puff', 4, { speed: 60, life: 0.4, color: '#efe6d6' }));
  }
  blip(660, 990, 0.12, 'sine', 0.06);
}
let items = { btn: [], heart: [] };
let enemies = [];
let levelTide = null;
let movers = [], crumbs = [], pulses = [], geysers = [], winds = [], rollerZones = [], rollers = [], appleZones = [], apples = [];
function surfY() {
  return WORLD_H - 64 - (levelTide ? Math.sin(simT * TAU / levelTide.period) * levelTide.amp : 0);
}
function pulseOn(pu) { return ((simT / pu.period + pu.phase) % 1) < 0.55; }
let particles = [], popups = [];
const butterflies = [];

const MS = 290, ACC = 2300, FRICTION = 2600, AIRACC = 1700;
const JUMP = 600, GRAV_HOLD = 1150, GRAV_DOWN = 2050, FALLCAP = 960;
const LAUNCH = 880, BOUNCE = 1030;

function resetLevel() {
  player.x = 3.5 * TILE; player.y = 12 * TILE;
  player.vx = 0; player.vy = 0; player.face = 1;
  player.grounded = true; player.coyote = 0; player.jumpBuf = 0;
  player.squash = 0; player.invuln = 0; player.idleT = 1; player.launchT = 0; player.splashed = false;
  player.airJumps = 1; player.airDash = 1; player.dashT = 0; player.dashCd = 0;
  hist = [];
  comps[0].x = player.x - 40; comps[0].y = player.y; comps[0].face = 1; comps[0].hop = 0;
  comps[1].x = player.x - 76; comps[1].y = player.y; comps[1].face = 1; comps[1].hop = 0;
  hearts = upg.maxHearts; buttons = levelStartButtons; winT = 0; overT = 0; chapterT = 0; deathFade = 0;
  balls = []; ballCd = 0;
  yarnCd = 0; yarn = null;
  levelBannerT = 2.8;
  checkpoint = { x: player.x, y: player.y };
  special = null; specialCd = 0;
  items.btn = SPEC.btn.map(b => ({ x: b.x, y: b.y, got: false }));
  items.heart = SPEC.heart.map(h => ({ x: h.x, y: h.y, got: false }));
  shops = SPEC.shop.map(s => ({ x: s.x, y: s.y, hopT: 0, near: false, tapBuy: false }));
  movers = SPEC.mover.map(s => Object.assign({}, s, { x0: s.x, y0: s.y, dx: 0, dy: 0 }));
  crumbs = SPEC.crumb.map(s => Object.assign({}, s, { state: 'idle', t: 0 }));
  pulses = SPEC.pulse.slice();
  geysers = SPEC.geyser.map(s => Object.assign({}, s, { h: 0, erupt: false, warn: false }));
  winds = SPEC.wind.slice();
  rollerZones = SPEC.roller.map(s => Object.assign({}, s, { active: null, cd: 0, t: 0 }));
  rollers = [];
  appleZones = SPEC.apple.map(s => Object.assign({}, s, { t: hash(s.x0) * s.period }));
  apples = [];
  player.onMover = null; player.sandT = 0;
  enemies = SPEC.enemy.map(e => ({
    type: e.type, x: e.x, y: e.y, ax: e.x, ay: e.y,
    dir: hash(e.x) > 0.5 ? 1 : -1, fdir: 1, rot: 0, t: hash(e.x) * 9, ph: hash(e.x * 7) * 9,
    vx: 0, vy: 0, dvx: 0, dvy: 0,
    w: e.type === 'tiger' ? 34 : e.type === 'rawr' ? 58 : 56,
    h: e.type === 'tiger' ? 40 : e.type === 'rawr' ? 38 : 34,
    grounded: false, pause: 0.3 + hash(e.x) * 0.5,
    state: e.type === 'rawr' ? 'sleep' : e.type === 'bird' ? 'wander' : 'patrol',
    stateT: 0, chargeT: 0, cd: 0, flew: false,
    hp: TIER() >= 2 ? 3 : 2,
    gone: false, poof: 0
  }));
  SPEC.pillow.forEach(p => { p.active = false; });
  mushrooms.forEach(m => { m.squish = 0; });
  particles = []; popups = [];
  camX = clamp(player.x - VW * 0.4, 0, WORLD_W - VW);
  camY = WORLD_H - VH;
}

function startPlay() {
  state = 'play'; paused = false;
  pressed.clear();
}
function startNewGame() {
  curLevel = 0; levelStartButtons = 0; buttonsCollected = 0; timeSec = 0;
  upg = { maxHearts: 3, speed: false, djump: false, dash: false, ball: false, ball2: false, ball3: false, yarn: false };
  buildLevel(0); resetLevel();
  state = 'play'; paused = false;
}
function nextLevel() {
  curLevel++; levelStartButtons = buttons;
  buildLevel(curLevel); resetLevel();
  state = 'play'; paused = false;
  pressed.clear();
}
function respawnFromCheckpoint() {
  hearts = upg.maxHearts;
  player.x = checkpoint.x; player.y = checkpoint.y;
  player.vx = 0; player.vy = 0; player.splashed = false;
  player.invuln = 1.8; deathFade = 1;
  hist = [];
  comps[0].x = player.x - 40; comps[0].y = player.y;
  comps[1].x = player.x - 76; comps[1].y = player.y;
  special = null; specialCd = 0; overT = 0;
  camX = clamp(player.x - VW * 0.42, 0, WORLD_W - VW);
  spawnParts(player.x, player.y - 20, 'puff', 10, { speed: 90, life: 0.6, color: '#efe6d6' });
  state = 'play'; paused = false;
  pressed.clear();
}

// ------------------------------------------------------------ particles & popups
function spawnParts(x, y, type, n, opts) {
  opts = opts || {};
  for (let i = 0; i < n; i++) {
    const a = TAU * (i + Math.random()) / n;
    const sp = (opts.speed || 90) * (0.4 + Math.random() * 0.9);
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp + (opts.vx || 0),
      vy: Math.sin(a) * sp * (opts.upward ? -Math.abs(Math.sin(a)) * 1.4 : 1) + (opts.vy || 0),
      life: 0, max: (opts.life || 0.7) * (0.7 + Math.random() * 0.6),
      type: type, size: (opts.size || 5) * (0.7 + Math.random() * 0.7),
      color: opts.color, rot: Math.random() * TAU, grav: opts.grav !== undefined ? opts.grav : 220
    });
  }
  if (particles.length > 380) particles.splice(0, particles.length - 380);
}
function popup(x, y, txt) { popups.push({ x, y, txt, t: 0 }); }
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += p.grav * dt; p.rot += dt * 2;
    if (p.life > p.max) particles.splice(i, 1);
  }
  for (let i = popups.length - 1; i >= 0; i--) {
    popups[i].t += dt; popups[i].y -= 34 * dt;
    if (popups[i].t > 1) popups.splice(i, 1);
  }
}

// ------------------------------------------------------------ physics
function physics(e, dt) {
  e.x += e.vx * dt;
  e.x = clamp(e.x, e.w / 2 + 2, WORLD_W - e.w / 2 - 2);
  let top = e.y - e.h, bot = e.y;
  let ty0 = Math.floor(top / TILE), ty1 = Math.floor((bot - 1) / TILE);
  if (e.vx > 0) {
    const tx = Math.floor((e.x + e.w / 2) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) if (S(tx, ty)) { e.x = tx * TILE - e.w / 2 - 0.01; e.vx = 0; break; }
  } else if (e.vx < 0) {
    const tx = Math.floor((e.x - e.w / 2) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) if (S(tx, ty)) { e.x = (tx + 1) * TILE + e.w / 2 + 0.01; e.vx = 0; break; }
  }
  const prevBot = e.y;
  e.y += e.vy * dt;
  e.grounded = false; e.bounced = null;
  const l = e.x - e.w / 2, r = e.x + e.w / 2;
  const tx0 = Math.floor(l / TILE), tx1 = Math.floor((r - 0.01) / TILE);
  if (e.vy >= 0) {
    const ty = Math.floor(e.y / TILE);
    for (let tx = tx0; tx <= tx1; tx++) if (S(tx, ty)) { e.y = ty * TILE - 0.01; e.vy = 0; e.grounded = true; break; }
    if (!e.grounded) {
      for (const p of platforms) {
        if (prevBot <= p.y + 0.5 && e.y >= p.y && r > p.x + 2 && l < p.x + p.w - 2) {
          e.y = p.y; e.vy = 0; e.grounded = true; break;
        }
      }
    }
    if (!e.grounded) {
      for (const m of movers) {
        if (prevBot <= m.y + Math.max(0, m.dy) + 0.6 && e.y >= m.y && r > m.x + 2 && l < m.x + m.w - 2) {
          e.y = m.y; e.vy = 0; e.grounded = true; e.onMover = m; break;
        }
      }
    }
    if (!e.grounded) {
      for (const cb of crumbs) {
        if (cb.state === 'gone') continue;
        if (prevBot <= cb.y + 0.5 && e.y >= cb.y && r > cb.x + 2 && l < cb.x + cb.w - 2) {
          e.y = cb.y; e.vy = 0; e.grounded = true;
          if (cb.state === 'idle') { cb.state = 'shake'; cb.t = 0; }
          break;
        }
      }
    }
    if (!e.grounded) {
      for (const pu of pulses) {
        if (!pulseOn(pu)) continue;
        if (prevBot <= pu.y + 0.5 && e.y >= pu.y && r > pu.x + 2 && l < pu.x + pu.w - 2) {
          e.y = pu.y; e.vy = 0; e.grounded = true; break;
        }
      }
    }
    if (!e.grounded) {
      for (const m of mushrooms) {
        if (prevBot <= m.capY + 0.5 && e.y >= m.capY && r > m.x - 25 && l < m.x + 25) {
          e.y = m.capY; e.bounced = m; break;
        }
      }
    }
  } else {
    const ty = Math.floor((e.y - e.h) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) if (S(tx, ty)) { e.y = (ty + 1) * TILE + e.h; e.vy = 0; break; }
  }
}
function groundBelowY(x, fromY) {
  let best = Infinity;
  const tx = Math.floor(x / TILE);
  for (let ty = Math.max(0, Math.floor(fromY / TILE)); ty < LH; ty++) if (S(tx, ty)) { best = ty * TILE; break; }
  for (const p of platforms) if (x > p.x && x < p.x + p.w && p.y >= fromY - 2 && p.y < best) best = p.y;
  for (const m of mushrooms) if (Math.abs(x - m.x) < 25 && m.capY >= fromY - 2 && m.capY < best) best = m.capY;
  return best === Infinity ? null : best;
}

// ------------------------------------------------------------ update
function update(dt) {
  simT += dt;
  pollTouch();
  musicTick();
  updateAmbient(dt);
  if (state !== 'play') {
    updateParticles(dt);
    if (state === 'win') winT += dt;
    if (state === 'over') overT += dt;
    if (state === 'chapter') chapterT += dt;
    if (state === 'shop') shops.forEach(sh => { sh.hopT = Math.max(0, sh.hopT - dt); });
    pressed.clear();
    return;
  }
  timeSec += dt;
  levelBannerT = Math.max(0, levelBannerT - dt);
  specialCd = Math.max(0, specialCd - dt);
  airHintT = Math.max(0, airHintT - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  player.launchT = Math.max(0, player.launchT - dt);
  deathFade = Math.max(0, deathFade - dt * 2.4);

  // ---- input
  let left = keys.ArrowLeft || keys.KeyA || touch.left || gpad.left;
  let right = keys.ArrowRight || keys.KeyD || touch.right || gpad.right;
  let jumpPressed = pressed.has('Space') || pressed.has('ArrowUp') || pressed.has('KeyW');
  const jumpHeld = keys.Space || keys.ArrowUp || keys.KeyW || touch.jump || gpad.jump;
  let specialPressed = pressed.has('KeyX') || pressed.has('KeyE');
  const dashPressed = pressed.has('KeyZ') || pressed.has('ShiftLeft') || pressed.has('ShiftRight');
  if (autopilot) {
    left = false; right = true;
    apJumpT -= dt;
    if (apJumpT <= 0) { jumpPressed = true; apJumpT = 0.85; }
  }

  // ---- special move state machine
  if (specialPressed && !special && state === 'play') {
    if (specialCd > 0) { /* still recharging */ }
    else if (!player.grounded) { if (airHintT <= 0) { popup(player.x, player.y - 70, 'land to Stack!'); airHintT = 2.5; } }
    else {
      special = { phase: 'gather', t: 0, x: player.x, y: player.y, sq: 0 };
      player.vx = 0;
    }
  }
  if (special) {
    special.t += dt;
    if (special.phase === 'gather') {
      player.vx = 0; player.vy = 0;
      if (special.t > 0.16) { special.phase = 'spring'; special.t = 0; }
    } else if (special.phase === 'spring') {
      player.vx = 0; player.vy = 0;
      special.sq = Math.sin(clamp(special.t / 0.14, 0, 1) * Math.PI * 0.5) * 0.55;
      if (special.t > 0.14) {
        special.phase = 'cheer'; special.t = 0;
        player.vy = -LAUNCH; player.launchT = 0.55; player.squash = -0.6;
        player.vx = player.face * 80;
        sfx.launch();
        rumble(0.4, 0.8, 220);
        popup(player.x, player.y - 90, 'Stuffie Stack!');
        spawnParts(player.x, player.y - 30, 'heart', 10, { speed: 150, life: 1, size: 6, grav: -30 });
        spawnParts(player.x, player.y - 8, 'puff', 8, { speed: 80, life: 0.5, color: '#e8dccb' });
      }
    } else if (special.phase === 'cheer') {
      if (special.t > 0.6) { special = null; specialCd = 3; }
    }
  }

  const frozen = special && special.phase !== 'cheer';

  // ---- player movement
  if (!frozen) {
    const curMS = upg.speed ? 350 : MS;
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    // wind ribbon dash
    player.dashCd = Math.max(0, player.dashCd - dt);
    if (dashPressed && upg.dash && player.dashCd <= 0 && player.dashT <= 0 && !(yarn && yarn.phase === 'pull') &&
        (player.grounded || player.airDash > 0)) {
      if (!player.grounded) player.airDash--;
      player.dashT = 0.16; player.dashCd = 0.8;
      player.vx = player.face * 620; player.vy = 0;
      player.squash = -0.45;
      blip(300, 720, 0.12, 'square', 0.05);
      spawnParts(player.x - player.face * 12, player.y - 24, 'puff', 6, { speed: 70, life: 0.4, color: '#ffffff' });
    }
    if (dir !== 0 && player.dashT <= 0) {
      if (Math.abs(player.vx) > curMS && Math.sign(player.vx) === dir) {
        player.vx -= Math.sign(player.vx) * 900 * dt; // bleed dash speed gently
      } else {
        const acc = (player.grounded ? ACC : AIRACC) * (THEME.ice && player.grounded ? 0.55 : 1) * (1 - 0.5 * (player.sandT || 0));
        player.vx = clamp(player.vx + dir * acc * dt, -curMS, curMS);
      }
      player.face = dir;
      player.idleT = 0;
    } else if (dir !== 0) {
      player.face = dir; player.idleT = 0;
    } else {
      const fr = player.grounded ? (THEME.ice ? 620 : FRICTION) : 240;
      if (player.vx > 0) player.vx = Math.max(0, player.vx - fr * dt);
      else player.vx = Math.min(0, player.vx + fr * dt);
      player.idleT += dt;
    }
    if (jumpPressed) player.jumpBuf = 0.12;
    player.jumpBuf = Math.max(0, player.jumpBuf - dt);
    if (player.jumpBuf > 0 && player.coyote > 0) {
      player.vy = -JUMP * (1 - 0.28 * (player.sandT || 0)); player.jumpBuf = 0; player.coyote = 0;
      player.squash = -0.35; player.grounded = false;
      sfx.jump();
      spawnParts(player.x, player.y, 'puff', 4, { speed: 50, life: 0.4, color: '#efe6d6' });
    } else if (player.jumpBuf > 0 && upg.djump && !player.grounded && player.airJumps > 0 && player.coyote <= 0) {
      player.vy = -JUMP * 0.94; player.jumpBuf = 0; player.airJumps--;
      player.squash = -0.4;
      blip(420, 700, 0.14, 'triangle', 0.05);
      spawnParts(player.x, player.y - 6, 'puff', 7, { speed: 80, life: 0.5, color: '#ffffff' });
    }
    if (yarn && yarn.phase === 'pull') { // reeled in gently along the yarn
      yarn.pt += dt;
      const pdx = yarn.ax - player.x, pdy = yarn.ay - (player.y - 22);
      const pdist = Math.hypot(pdx, pdy);
      const ramp = Math.min(1, yarn.pt / 0.14);            // ease in
      const spd = Math.min(640, 150 + pdist * 3) * ramp;   // brake as you arrive
      player.vx = pdx / Math.max(1, pdist) * spd;
      player.vy = pdy / Math.max(1, pdist) * spd;
      if (Math.random() < dt * 22) {
        spawnParts(player.x, player.y - 26, 'sparkle', 1, { speed: 14, life: 0.25, color: '#f3a6b8', grav: 0 });
      }
      if (pdist < 26 || yarn.pt > 0.7) {
        yarn.len = pdist;
        yarn.phase = 'retract';
        player.vy = Math.min(player.vy, -130);
        player.vx *= 0.45;
      }
    } else if (player.dashT > 0) { // dashing: hover flat, hold speed
      player.dashT -= dt;
      player.vx = player.face * 620;
      player.vy = 0;
      if (Math.random() < dt * 50) {
        spawnParts(player.x - player.face * 18, player.y - 22 - Math.random() * 14, 'puff', 1, { speed: 26, life: 0.3, color: '#ffffff' });
      }
    } else {
      const rising = player.vy < 0;
      const g = (rising && (jumpHeld || player.launchT > 0)) ? GRAV_HOLD : GRAV_DOWN;
      player.vy = Math.min(FALLCAP, player.vy + g * dt);
    }

    if (player.onMover) {
      player.x += player.onMover.dx || 0;
      player.y += player.onMover.dy || 0;
    }
    player.onMover = null;
    const wasGrounded = player.grounded;
    const prevVy = player.vy;
    player.pBot = player.y;
    physics(player, dt);
    if (player.bounced) {
      const m = player.bounced;
      player.vy = -BOUNCE; m.squish = 1; player.squash = -0.5;
      sfx.bounce(); popup(player.x, player.y - 80, 'Boing!');
      spawnParts(m.x, m.capY, 'star', 6, { speed: 120, life: 0.6, color: '#ffd978' });
    }
    if (player.grounded) {
      player.coyote = 0.1;
      player.airJumps = 1;
      player.airDash = 1;
      if (!wasGrounded && prevVy > 420) {
        player.squash = 0.45;
        spawnParts(player.x, player.y, 'puff', 5, { speed: 60, life: 0.4, color: '#efe6d6' });
      }
    } else player.coyote = Math.max(0, player.coyote - dt);
  }
  player.squash += (0 - player.squash) * Math.min(1, dt * 10);
  player.run = clamp(Math.abs(player.vx) / (upg.speed ? 350 : MS), 0, 1);

  // mushroom squish recovery
  mushrooms.forEach(m => { m.squish = Math.max(0, m.squish - dt * 3); });

  // ---- moving platforms
  for (const m of movers) {
    const prevX = m.x, prevY = m.y;
    const mph = simT * (TAU / m.period) + m.phase;
    m.x = m.x0 + (m.axis === 'h' ? Math.sin(mph) * m.range : 0);
    m.y = m.y0 + (m.axis === 'v' ? Math.sin(mph) * m.range : 0);
    m.dx = m.x - prevX; m.dy = m.y - prevY;
  }
  // ---- crumbling platforms
  for (const cb of crumbs) {
    if (cb.state === 'shake') {
      cb.t += dt;
      if (Math.random() < dt * 18) {
        spawnParts(cb.x + Math.random() * cb.w, cb.y + 10, 'puff', 1, { speed: 24, life: 0.3, color: cb.k === 'ice' ? '#dceef8' : '#e8dcc8' });
      }
      if (cb.t > 0.55) {
        cb.state = 'gone'; cb.t = 0;
        spawnParts(cb.x + cb.w / 2, cb.y + 8, 'puff', 9, { speed: 90, life: 0.55, color: cb.k === 'ice' ? '#dceef8' : '#e8dcc8' });
        blip(280, 120, 0.18, 'triangle', 0.05);
      }
    } else if (cb.state === 'gone') {
      cb.t += dt;
      if (cb.t > 2.6) {
        cb.state = 'idle'; cb.t = 0;
        spawnParts(cb.x + cb.w / 2, cb.y + 6, 'sparkle', 5, { speed: 60, life: 0.4, color: '#fff3c0', grav: 0 });
      }
    }
  }
  // ---- geysers: hazard + elevator on a rhythm
  for (const g of geysers) {
    const gpos = (simT / g.period + g.phase) % 1;
    g.erupt = gpos > 0.68;
    g.warn = gpos > 0.52 && !g.erupt;
    if (g.erupt) {
      g.h = 200 * Math.min(1, (gpos - 0.68) / 0.12);
      const gBase = WORLD_H - 64;
      if (Math.abs(player.x - g.x) < 26 && player.y > gBase - g.h - 10 && player.y < gBase + 40) {
        player.vy = Math.min(player.vy, -760);
        player.launchT = 0.35;
        if (Math.random() < dt * 30) spawnParts(player.x, player.y, 'splash', 1, { speed: 60, life: 0.4, color: THEME.waterDeep });
      }
    } else g.h = 0;
    if (g.warn && Math.random() < dt * 8) {
      spawnParts(g.x + (Math.random() - 0.5) * 24, WORLD_H - 60, 'splash', 1, { speed: 50, life: 0.4, color: THEME.water });
    }
  }
  // ---- wind, updrafts and soft sand
  player.sandT = Math.max(0, (player.sandT || 0) - dt * 3);
  for (const wz of winds) {
    if (player.x > wz.x && player.x < wz.x + wz.w && player.y > wz.y && player.y - player.h < wz.y + wz.h) {
      if (wz.sand) {
        if (player.grounded) player.sandT = Math.min(1, player.sandT + dt * 5);
      } else {
        if (wz.fx) player.vx = clamp(player.vx + wz.fx * dt, -430, 430);
        if (wz.fy) player.vy = Math.max(-280, player.vy + wz.fy * dt);
      }
    }
  }
  // ---- rollers: chasing snowballs & tumbleweeds
  for (const z of rollerZones) {
    z.cd = Math.max(0, z.cd - dt);
    if (z.kind === 'snow') {
      if (!z.active && z.cd <= 0 && player.x > z.trig && player.x < z.trig + 220) {
        z.active = { x: z.start, y: 0, dir: 1, r: 30, rot: 0, kind: 'snow', zone: z };
        rollers.push(z.active);
        popup(player.x, player.y - 92, 'SNOWBALL!');
        blip(120, 80, 0.4, 'sawtooth', 0.07);
        rumble(0.5, 0.7, 250);
      }
    } else {
      z.t += dt;
      if (z.t > z.period && Math.abs(player.x - z.end) < VW) {
        z.t = 0;
        rollers.push({ x: z.end, y: 0, dir: -1, r: 14, rot: 0, kind: 'tumble', zone: z });
      }
    }
  }
  for (let i = rollers.length - 1; i >= 0; i--) {
    const ro = rollers[i];
    const rSpd = ro.kind === 'snow' ? 205 : 125 + Math.sin(simT * 2 + ro.x * 0.01) * 20;
    ro.x += ro.dir * rSpd * dt;
    ro.rot += ro.dir * rSpd * dt / ro.r;
    const rgy = groundBelowY(ro.x, 0);
    if (rgy === null) {
      spawnParts(ro.x, surfY(), 'splash', 8, { speed: 120, life: 0.6, color: THEME.waterDeep });
      if (ro.zone && ro.zone.kind === 'snow') { ro.zone.active = null; ro.zone.cd = 6; }
      rollers.splice(i, 1);
      continue;
    }
    ro.y = rgy;
    if (ro.kind === 'snow' && (ro.x > ro.zone.end || ro.x < ro.zone.start - 80)) {
      ro.zone.active = null; ro.zone.cd = 6;
      rollers.splice(i, 1);
      continue;
    }
    if (ro.kind === 'tumble' && (ro.x < ro.zone.start - 60 || ro.x > ro.zone.end + 120)) { rollers.splice(i, 1); continue; }
    if (player.invuln <= 0 &&
        Math.abs(player.x - ro.x) < ro.r + 12 && player.y > ro.y - ro.r * 2 && player.y - player.h < ro.y) {
      const fromAbove = player.pBot <= ro.y - ro.r * 2 + 12 || (player.vy > 0 && player.y - (ro.y - ro.r * 2) < 26);
      if (ro.kind === 'tumble' && fromAbove) {
        spawnParts(ro.x, ro.y - ro.r, 'puff', 8, { speed: 90, life: 0.5, color: '#b89a6a' });
        popup(ro.x, ro.y - 40, 'poof!');
        player.vy = -480; player.squash = -0.3;
        sfx.stomp();
        rollers.splice(i, 1);
        continue;
      }
      hurtPlayer(false, Math.sign(player.x - ro.x) || 1);
    }
  }
  // ---- falling apples
  for (const z of appleZones) {
    z.t += dt;
    if (z.t > z.period) {
      z.t = 0;
      const apx = z.x0 + hash(simT * 7.3 + z.x0) * (z.x1 - z.x0);
      if (Math.abs(apx - (camX + VW / 2)) < VW * 0.8) {
        const agy = groundTopAt(Math.floor(apx / TILE));
        if (agy !== null) apples.push({ x: apx, y: agy * TILE - 196, vy: 30, rot: hash(apx) * 6 });
      }
    }
  }
  for (let i = apples.length - 1; i >= 0; i--) {
    const ap = apples[i];
    ap.vy = Math.min(560, ap.vy + 1300 * dt);
    ap.y += ap.vy * dt;
    ap.rot += dt * 4;
    const agy2 = groundBelowY(ap.x, ap.y - 20);
    if ((agy2 !== null && ap.y >= agy2) || ap.y > WORLD_H) {
      if (agy2 !== null) spawnParts(ap.x, agy2 - 4, 'puff', 5, { speed: 60, life: 0.4, color: '#d9716a' });
      apples.splice(i, 1);
      continue;
    }
    if (player.invuln <= 0 &&
        Math.abs(player.x - ap.x) < 18 && Math.abs((player.y - 24) - ap.y) < 26) {
      spawnParts(ap.x, ap.y, 'puff', 5, { speed: 70, life: 0.4, color: '#d9716a' });
      apples.splice(i, 1);
      hurtPlayer(false, Math.sign(player.x - ap.x) || 1);
      continue;
    }
  }

  // ---- yarn zinger
  yarnCd = Math.max(0, yarnCd - dt);
  if (yarn) updateYarn(dt);
  if (pressed.has('KeyG') && upg.yarn && !frozen && !yarn) fireYarn();

  // ---- lucky baseball
  if (aiming && upg.ball && !frozen) player.face = (aimPt.x + camX >= player.x) ? 1 : -1;
  ballCd = Math.max(0, ballCd - dt);
  if ((pressed.has('KeyF') || pressed.has('KeyV')) && upg.ball && ballCd <= 0 && !frozen) {
    ballCd = 0.45;
    balls.push({
      x: player.x + player.face * 14, y: player.y - 34,
      vx: player.face * (upg.ball2 ? 660 : 440) + player.vx * 0.35,
      vy: upg.ball2 ? -110 : -150,
      grav: upg.ball2 ? 1000 : 1500,
      gold: upg.ball3,
      bounces: 0, life: upg.ball2 ? 2.3 : 1.6, rot: 0
    });
    blip(500, 320, 0.1, 'triangle', 0.05);
  }
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    b.life -= dt;
    b.vy += (b.grav || 1500) * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.rot += b.vx * dt * 0.03;
    const btx = Math.floor(b.x / TILE), bty = Math.floor(b.y / TILE);
    if (S(btx, bty)) {
      if (b.vy > 0 && b.bounces < 1) {
        b.y = bty * TILE - 1; b.vy *= -0.5; b.vx *= 0.75; b.bounces++;
        blip(300, 200, 0.06, 'triangle', 0.03);
      } else {
        spawnParts(b.x, b.y, 'puff', 4, { speed: 60, life: 0.35, color: '#f2ece0' });
        balls.splice(i, 1);
        continue;
      }
    }
    if (b.life <= 0 || b.y > WORLD_H + 40) { balls.splice(i, 1); continue; }
    for (const en of enemies) {
      if (en.gone) continue;
      const hw2 = en.type === 'rhino' ? 33 : en.type === 'rawr' ? 32 : en.type === 'bird' ? 17 : 19;
      const hh2 = en.type === 'rhino' ? 34 : en.type === 'rawr' ? 40 : en.type === 'bird' ? 32 : 40;
      if (Math.abs(b.x - en.x) < hw2 + 6 && b.y > en.y - hh2 - 6 && b.y < en.y + 6) {
        en.hp -= b.gold ? 99 : 1;
        spawnParts(b.x, b.y, 'star', b.gold ? 9 : 5, { speed: 120, life: 0.5, color: '#ffd978' });
        // knockback scales with how fast the ball is flying
        const kb = clamp(Math.hypot(b.vx, b.vy) * 0.5, 130, 430);
        const kdir = b.vx >= 0 ? 1 : -1;
        if (en.type === 'tiger' || en.type === 'rawr') {
          en.vx = kdir * kb * 0.85;
          en.vy = Math.min(en.vy, -kb * 0.5);
          en.flew = true;
          if (en.type === 'rawr') en.state = 'pounce'; // tumbles, then settles back down
        } else if (en.type === 'rhino') {
          en.x += kdir * kb * 0.16;
          if (en.state === 'charge') { en.state = 'tired'; en.stateT = 0.6; }
        } else { // bird gets blown off course
          en.ax += kdir * kb * 0.22;
          en.ay = Math.max(60, en.ay - kb * 0.12);
          en.x += kdir * kb * 0.18;
          en.state = 'return';
        }
        if (en.hp <= 0) poofEnemy(en);
        else { popup(en.x, en.y - hh2 - 14, 'bonk!'); blip(260, 140, 0.12, 'square', 0.06); }
        balls.splice(i, 1);
        break;
      }
    }
  }

  // ---- record path for companions
  hist.push({ t: simT, x: player.x, y: player.y, face: player.face, run: player.run, g: player.grounded, vy: player.vy });
  if (hist.length > 260) hist.splice(0, hist.length - 260);

  updateCompanions(dt);

  // ---- buttons & hearts
  for (const b of items.btn) {
    if (b.got) continue;
    if (Math.abs(player.x - b.x) < 30 && Math.abs(player.y - 22 - b.y) < 36) {
      b.got = true; buttons++; buttonsCollected++;
      sfx.button();
      spawnParts(b.x, b.y, 'sparkle', 6, { speed: 90, life: 0.5, color: '#ffd978', grav: 0 });
    }
  }
  for (const h of items.heart) {
    if (h.got) continue;
    if (Math.abs(player.x - h.x) < 32 && Math.abs(player.y - 22 - h.y) < 38) {
      h.got = true;
      sfx.heart();
      if (hearts < 3) { hearts++; popup(h.x, h.y - 14, '+ ♥'); }
      else { buttons += 3; buttonsCollected += 3; popup(h.x, h.y - 14, '♥ +3 buttons'); }
      spawnParts(h.x, h.y, 'heart', 8, { speed: 110, life: 0.9, size: 5, grav: -20 });
    }
  }

  // ---- pillows (checkpoints)
  for (const p of SPEC.pillow) {
    if (!p.active && Math.abs(player.x - p.x) < 34 && Math.abs(player.y - p.y) < 50) {
      p.active = true;
      checkpoint = { x: p.x, y: p.y };
      sfx.check(); popup(p.x, p.y - 64, 'Checkpoint ♥');
      spawnParts(p.x, p.y - 24, 'sparkle', 10, { speed: 110, life: 0.7, color: '#ffd978', grav: 0 });
    }
  }

  // ---- the heart shop
  for (const sh of shops) {
    sh.hopT = Math.max(0, sh.hopT - dt);
    sh.near = Math.abs(player.x - sh.x) < 64 && Math.abs(player.y - sh.y) < 70;
    if (sh.near) {
      const browse = pressed.has('ArrowDown') || pressed.has('KeyS') || sh.tapBuy;
      if (browse) openShop();
    }
    sh.tapBuy = false;
  }

  // ---- Rhino & Tiger
  for (const en of enemies) {
    if (en.gone) { en.poof += dt; continue; }
    if (en.x < camX - 640 || en.x > camX + VW + 640) continue; // sleep far offscreen
    if (en.type === 'rhino') updateRhino(en, dt);
    else if (en.type === 'tiger') updateTiger(en, dt);
    else if (en.type === 'rawr') updateRawr(en, dt);
    else updateBird(en, dt);
    if (en.gone) continue;
    const hw = en.type === 'rhino' ? 33 : en.type === 'rawr' ? 32 : en.type === 'bird' ? 17 : 19;
    const hh = en.type === 'rhino' ? 34 : en.type === 'rawr' ? 40 : en.type === 'bird' ? 32 : 40;
    const top2 = en.y - hh;
    if (player.invuln <= 0 && state === 'play' &&
        Math.abs(player.x - en.x) < hw + 13 && player.y > top2 && player.y - player.h < en.y) {
      // generous: if your feet came from above their head, it's a stomp
      const fromAbove = player.pBot <= top2 + 12 || (player.vy > 0 && player.y - top2 < 30);
      if (fromAbove && player.vy > -60) {
        poofEnemy(en);
        player.vy = -480; player.squash = -0.3;
      } else if (player.y > top2 + 14) {
        hurtPlayer(false, Math.sign(player.x - en.x) || -player.face);
      } // grazing the very top of their head: no harm done
    }
  }

  // ---- falling into ponds (the tide can rise to meet you!)
  const surfNow = surfY();
  if (player.y > surfNow + 18) {
    if (!player.splashed) {
      player.splashed = true;
      sfx.splash(); popup(player.x, surfNow - 40, THEME.splashWord || 'Splash!');
      spawnParts(player.x, surfNow, 'splash', 12, { speed: 160, life: 0.7, color: THEME.waterDeep });
    }
    if (player.y > surfNow + 42) hurtPlayer(true, 0);
  }

  // ---- win condition: reach the cottage door
  if (GOAL && player.x + 15 > GOAL.x && player.x - 15 < GOAL.x + GOAL.w &&
      player.y > GOAL.y && player.y - player.h < GOAL.y + GOAL.h) {
    winGame();
  }

  // ---- camera
  const targX = clamp(player.x - VW * 0.42 + player.face * 56, 0, WORLD_W - VW);
  camX += (targX - camX) * Math.min(1, dt * 5);
  const targY = clamp(player.y - VH * 0.64, -130, WORLD_H - VH);
  camY += (targY - camY) * Math.min(1, dt * 4);

  updateParticles(dt);
  pressed.clear();
}

function hurtPlayer(respawn, knockDir) {
  if (!respawn && player.invuln > 0) return;
  hearts--;
  sfx.hurt();
  if (hearts <= 0) {
    state = 'over'; overT = 0;
    return;
  }
  if (respawn) {
    player.x = checkpoint.x; player.y = checkpoint.y;
    player.vx = 0; player.vy = 0; player.splashed = false;
    player.invuln = 1.6; deathFade = 1;
    hist = [];
    comps[0].x = player.x - 40; comps[0].y = player.y;
    comps[1].x = player.x - 76; comps[1].y = player.y;
    spawnParts(player.x, player.y - 20, 'puff', 10, { speed: 90, life: 0.6, color: '#efe6d6' });
    camX = clamp(player.x - VW * 0.42, 0, WORLD_W - VW);
  } else {
    player.invuln = 1.3;
    player.vx = knockDir * 300; player.vy = -330;
    rumble(0.7, 0.4, 180);
    popup(player.x, player.y - 70, 'Oof!');
  }
}

function winGame() {
  if (state !== 'play') return;
  sfxWin();
  if (curLevel < LEVELS.length - 1) {
    state = 'chapter'; chapterT = 0;
    spawnParts(GOAL.x + GOAL.w / 2, GOAL.y + 30, 'heart', 12, { speed: 150, life: 1.3, size: 6, grav: -40 });
    spawnParts(GOAL.x + GOAL.w / 2, GOAL.y + 40, 'star', 10, { speed: 170, life: 1, color: '#ffd978' });
  } else {
    state = 'win'; winT = 0;
    spawnParts(GOAL.x + 30, GOAL.y + 20, 'heart', 16, { speed: 170, life: 1.4, size: 7, grav: -40 });
  }
}

function updateRhino(en, dt) {
  en.t += dt;
  en.cd = Math.max(0, en.cd - dt);
  const blockedAhead = dir => {
    const ftx = Math.floor((en.x + dir * 38) / TILE);
    return S(ftx, Math.floor((en.y - 18) / TILE)) || !S(ftx, Math.floor((en.y + 4) / TILE));
  };
  if (en.state === 'charge') {
    en.x += en.dir * (360 + TIER() * 30) * dt;
    en.chargeT -= dt;
    if (Math.random() < dt * 16) {
      spawnParts(en.x - en.dir * 30, en.y - 4, 'puff', 1, { speed: 30, life: 0.4, color: '#d8cfc0' });
    }
    if (en.chargeT <= 0 || blockedAhead(en.dir)) {
      en.state = 'tired'; en.stateT = 0.9;
      spawnParts(en.x + en.dir * 26, en.y - 14, 'star', 4, { speed: 90, life: 0.5, color: '#ffd978' });
    }
  } else if (en.state === 'alert') {
    en.stateT -= dt;
    if (en.stateT <= 0) {
      en.state = 'charge'; en.chargeT = 1.35;
      blip(110, 55, 0.5, 'sawtooth', 0.055);
    }
  } else if (en.state === 'tired') {
    en.stateT -= dt;
    if (en.stateT <= 0) en.state = 'patrol';
  } else { // patrol on all fours
    if (blockedAhead(en.dir)) en.dir *= -1;
    en.x += en.dir * 42 * dt;
    const dx = player.x - en.x;
    if (en.cd <= 0 && Math.sign(dx) === en.dir && Math.abs(dx) < 330 + TIER() * 30 &&
        Math.abs(player.y - en.y) < 84 && player.invuln <= 0) {
      en.state = 'alert'; en.stateT = 0.45 - TIER() * 0.05; en.cd = 5 - TIER() * 0.7; // cooldown shrinks on later chapters
      popup(en.x, en.y - 64, '!');
      blip(150, 210, 0.14, 'square', 0.05);
    }
  }
}

function updateTiger(en, dt) {
  en.t += dt;
  en.vy = Math.min(900, en.vy + 1900 * dt);
  physics(en, dt);
  if (en.bounced) en.vy = -520;
  if (en.grounded) {
    en.vx = 0;
    en.pause -= dt;
    if (en.pause <= 0) {
      const dx = player.x - en.x;
      const chase = Math.abs(dx) < 270 + TIER() * 30 && Math.abs(player.y - en.y) < 170 && player.invuln <= 0;
      if (chase) en.dir = dx > 0 ? 1 : -1;
      else if (hash(en.x + en.t * 7) > 0.72) en.dir *= -1;
      let hopV = en.dir * (chase ? 150 + TIER() * 25 : 85);
      const landCol = Math.floor((en.x + en.dir * (chase ? 110 : 70)) / TILE);
      if (pondCols && pondCols[clamp(landCol, 0, LW - 1)]) {
        if (chase) hopV = 0; else { en.dir *= -1; hopV = en.dir * 85; }
      }
      en.vx = hopV;
      en.vy = chase ? -470 - TIER() * 25 : -400;
      en.pause = chase ? Math.max(0.14, 0.26 - TIER() * 0.04) : 0.5 + hash(en.x * 3 + en.t) * 0.45;
    }
  }
  if (en.y > surfY() + 14) { // tumbled into a pond
    en.gone = true; en.poof = 1;
    sfx.splash();
    spawnParts(en.x, WORLD_H - 64, 'splash', 8, { speed: 130, life: 0.6, color: THEME.waterDeep });
  }
}

function poofEnemy(en) {
  en.gone = true; en.poof = 0;
  rumble(0.25, 0.5, 90);
  sfx.stomp(); popup(en.x, en.y - 50, 'poof!');
  spawnParts(en.x, en.y - 18, 'puff', 10, {
    speed: 100, life: 0.7,
    color: en.type === 'rhino' ? '#c4cdb2' : en.type === 'rawr' ? '#cdb59a' : en.type === 'bird' ? '#ffe9a8' : '#eab377'
  });
}

function updateRawr(en, dt) {
  en.t += dt;
  en.cd = Math.max(0, en.cd - dt);
  en.vy = Math.min(900, en.vy + 1900 * dt);
  physics(en, dt);
  if (!en.grounded) en.flew = true;
  if (en.state === 'wake') {
    en.stateT -= dt;
    if (en.stateT <= 0) {
      en.state = 'pounce'; en.flew = false;
      en.dir = player.x >= en.x ? 1 : -1;
      en.vx = en.dir * clamp(Math.abs(player.x - en.x) * 2, 150, 290 + TIER() * 40);
      en.vy = -540;
      popup(en.x, en.y - 76, 'RAWR!');
      blip(85, 190, 0.35, 'sawtooth', 0.07);
    }
  } else if (en.state === 'pounce') {
    if (en.grounded && en.flew) {
      en.state = 'settle'; en.stateT = 0.9; en.vx = 0;
      spawnParts(en.x, en.y, 'puff', 6, { speed: 70, life: 0.5, color: '#cdb59a' });
    }
  } else if (en.state === 'settle') {
    en.stateT -= dt; en.vx = 0;
    if (en.stateT <= 0) { en.state = 'sleep'; en.cd = Math.max(0.7, 1.6 - TIER() * 0.3); }
  } else { // fast asleep
    en.vx = 0;
    if (Math.random() < dt * 0.8) spawnParts(en.x + en.dir * 16, en.y - 48, 'zz', 1, { speed: 12, life: 1.6, grav: -30 });
    const dx = player.x - en.x;
    if (en.cd <= 0 && Math.abs(dx) < 132 + TIER() * 25 && Math.abs(player.y - en.y) < 92 && player.invuln <= 0) {
      en.state = 'wake'; en.stateT = Math.max(0.25, 0.42 - TIER() * 0.06);
      popup(en.x, en.y - 68, '!');
      blip(70, 140, 0.25, 'triangle', 0.06);
    }
  }
}

function updateBird(en, dt) {
  en.t += dt;
  en.cd = Math.max(0, en.cd - dt);
  const wanderX = () => en.ax + Math.sin(en.ph * 0.6) * 90 + Math.sin(en.ph * 1.3) * 30;
  const wanderY = () => en.ay + Math.sin(en.ph * 0.9) * 42 + Math.cos(en.ph * 1.7) * 18;
  if (en.state === 'aim') {
    en.stateT -= dt;
    en.fdir = player.x >= en.x ? 1 : -1;          // orient toward the player
    en.rot = lerpAngle(en.rot, 0, Math.min(1, dt * 14)); // level out
    if (en.stateT <= 0) {
      en.state = 'dive';
      const dx = player.x - en.x, dy = (player.y - 24) - en.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const dvSpd = 330 + TIER() * 35;
      en.dvx = dx / d * dvSpd; en.dvy = dy / d * dvSpd;
      en.stateT = 0.9;
      blip(880, 440, 0.3, 'square', 0.045);
    }
  } else if (en.state === 'dive') {
    en.x += en.dvx * dt; en.y += en.dvy * dt;
    en.stateT -= dt;
    en.fdir = en.dvx >= 0 ? 1 : -1;
    en.rot = lerpAngle(en.rot, Math.atan2(en.dvy, Math.abs(en.dvx)), Math.min(1, dt * 14));
    const tx = Math.floor(en.x / TILE), ty = Math.floor((en.y - 16) / TILE);
    if (en.stateT <= 0 || S(tx, ty) || en.y > WORLD_H - 70) en.state = 'return';
  } else if (en.state === 'return') {
    en.ph += dt * 1.2;
    const txp = wanderX(), typ = wanderY();
    en.x += (txp - en.x) * Math.min(1, dt * 2.2);
    en.y += (typ - en.y) * Math.min(1, dt * 2.2);
    en.rot = lerpAngle(en.rot, 0, Math.min(1, dt * 4));
    if (Math.abs(txp - en.x) < 14 && Math.abs(typ - en.y) < 14) en.state = 'wander';
  } else { // woodstock loops — tumbling along the flight path, upside down and all
    en.ph += dt * 1.2;
    const hvx = Math.cos(en.ph * 0.6) * 54 + Math.cos(en.ph * 1.3) * 39;
    const hvy = Math.cos(en.ph * 0.9) * 37.8 - Math.sin(en.ph * 1.7) * 30.6;
    en.fdir = 1;
    en.rot = lerpAngle(en.rot, Math.atan2(hvy, hvx), Math.min(1, dt * 7));
    en.x = wanderX(); en.y = wanderY();
    const dx = player.x - en.x, dy = player.y - 30 - en.y;
    if (en.cd <= 0 && Math.hypot(dx, dy) < 250 + TIER() * 25 && player.invuln <= 0) {
      en.state = 'aim'; en.stateT = 0.32; en.cd = 5 - TIER() * 0.8; // cooldown shrinks on later chapters
      popup(en.x, en.y - 50, '!');
      blip(990, 1320, 0.1, 'sine', 0.05);
    }
  }
}

function openShop() {
  if (state !== 'play') return;
  state = 'shop'; shopSel = 0;
  aiming = false; aimId = null;
  if (canvas.style) canvas.style.cursor = '';
  player.vx = 0;
  pressed.clear();
  blip(660, 880, 0.12, 'sine', 0.05);
}
function closeShop() {
  state = 'play';
  pressed.clear();
}
function shopAvail(it) {
  if (it.id === 'heal') return hearts < upg.maxHearts ? true : 'hearts are full';
  if (it.id === 'maxhp') return upg.maxHearts < 5 ? true : 'pouch is full';
  if (it.id === 'speed') return upg.speed ? 'owned ♥' : true;
  if (it.id === 'djump') return upg.djump ? 'owned ♥' : true;
  if (it.id === 'dash') return upg.dash ? 'owned ♥' : true;
  if (it.id === 'ball') return upg.ball ? 'owned ♥' : true;
  if (it.id === 'ball2') return !upg.ball ? 'needs the baseball' : (upg.ball2 ? 'owned ♥' : true);
  if (it.id === 'ball3') return !upg.ball2 ? 'needs fastball stitch' : (upg.ball3 ? 'owned ♥' : true);
  if (it.id === 'yarn') return upg.yarn ? 'owned ♥' : true;
  return true;
}
function buySelected() {
  if (shopSel >= SHOP_ITEMS.length) { closeShop(); return; }
  const it = SHOP_ITEMS[shopSel];
  const av = shopAvail(it);
  if (av !== true) { blip(420, 420, 0.1, 'sine', 0.04); return; }
  if (buttons < it.price) { blip(240, 170, 0.16, 'triangle', 0.05); return; }
  buttons -= it.price;
  if (it.id === 'heal') hearts++;
  else if (it.id === 'maxhp') { upg.maxHearts++; hearts++; }
  else if (it.id === 'speed') upg.speed = true;
  else if (it.id === 'djump') upg.djump = true;
  else if (it.id === 'dash') upg.dash = true;
  else if (it.id === 'ball') upg.ball = true;
  else if (it.id === 'ball2') upg.ball2 = true;
  else if (it.id === 'ball3') upg.ball3 = true;
  else if (it.id === 'yarn') upg.yarn = true;
  sfx.heart(); sfx.button();
  shops.forEach(sh => { if (sh.near) sh.hopT = 0.5; });
  spawnParts(player.x, player.y - 40, 'star', 8, { speed: 120, life: 0.7, color: '#ffd978' });
}

function sampleHist(back) {
  if (!hist.length) return null;
  const target = simT - back;
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].t <= target) {
      const a = hist[i], b = hist[Math.min(i + 1, hist.length - 1)];
      const span = Math.max(1e-6, b.t - a.t), k = clamp((target - a.t) / span, 0, 1);
      return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), face: b.face, run: b.run, g: b.g, vy: b.vy };
    }
  }
  const a = hist[0];
  return { x: a.x, y: a.y, face: a.face, run: a.run, g: a.g, vy: a.vy };
}
function updateOneComp(c, delay, settleOff, stackOff, dt) {
  let t;
  if (special && special.phase !== 'cheer') {
    t = { x: special.x + stackOff, y: special.y, face: player.face, run: 0, g: true, vy: 0 };
  } else if (special && special.phase === 'cheer') {
    c.hop = Math.abs(Math.sin(special.t * 13)) * 12;
    t = { x: special.x + stackOff, y: special.y, face: player.face, run: 0, g: true, vy: 0 };
  } else {
    c.hop = Math.max(0, c.hop - dt * 60);
    if (player.idleT > 0.55) t = { x: player.x - player.face * settleOff, y: player.y, face: player.face, run: 0, g: true, vy: 0 };
    else t = sampleHist(delay) || { x: player.x - player.face * settleOff, y: player.y, face: player.face, run: 0, g: true, vy: 0 };
  }
  const rate = special ? 16 : 11;
  const dx = t.x - c.x, dy = t.y - c.y;
  if (Math.abs(dx) > 300 || Math.abs(dy) > 300) { c.x = t.x; c.y = t.y; }
  else { c.x += dx * Math.min(1, dt * rate); c.y += dy * Math.min(1, dt * rate); }
  c.face = Math.abs(dx) > 4 ? (dx > 0 ? 1 : -1) : t.face;
  c.run += (t.run - c.run) * Math.min(1, dt * 8);
  c.g = t.g; c.vy = t.vy;
}
function updateCompanions(dt) {
  updateOneComp(comps[0], 0.26, 42, -24, dt);
  updateOneComp(comps[1], 0.52, 78, 24, dt);
}

// ---- ambient critters
function updateAmbient(dt) {
  if (!butterflies.length) {
    [10, 34, 60, 83, 101, 140, 167].forEach((c, i) => {
      butterflies.push({ ax: c * TILE, ay: (groundTopAt(c) || 12) * TILE - 60, ph: i * 2.2, col: ['#f3a6b8', '#a6c8f3', '#f3d8a6'][i % 3] });
    });
  }
  butterflies.forEach(b => { b.ph += dt; });
}

// ============================================================ characters
// All drawn with feet at (x, y), facing right (flip via o.face = -1).

function drawDoggie(x, y, o) {
  o = o || {};
  const f = o.face || 1, t = o.t !== undefined ? o.t : simT;
  const run = o.run || 0, g = o.grounded !== false, vy = o.vy || 0, s = o.scale || 1;
  const sq = o.squash || 0, pose = o.pose || '';
  const C = PAL.dog;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f * s * (1 + sq * 0.22), s * (1 - sq * 0.22));
  const bob = (g && !pose) ? Math.abs(Math.sin(t * 11.5)) * 3.2 * run : 0;
  ctx.translate(0, -bob);
  const lean = pose ? 0 : run * 0.085 + (g ? 0 : clamp(vy / 3200, -0.12, 0.16));
  ctx.rotate(lean);
  const ph = t * 11.5;

  // tail
  E(-16, -28, 5, 4.5, C.dark, Math.sin(t * 9) * 0.4);
  // legs
  let lA = Math.sin(ph) * 8 * run, lB = -lA;
  let liftA = Math.max(0, Math.sin(ph)) * 5 * run, liftB = Math.max(0, -Math.sin(ph)) * 5 * run;
  if (!g) { lA = 7; lB = -4; liftA = 7; liftB = 2; }
  limb(-6, -18, -6 + lB, -3 - liftB, 9, C.body, C.light, 5.5);
  limb(6, -18, 6 + lA, -3 - liftA, 9, C.body, C.light, 5.5);
  // body
  EO(0, -30, 16, 18, C.body);
  E(3, -26, 10.5, 12, C.light);
  plushShade(0, -30, 16, 18);
  furRing(0, -30, 15, 10, 4, 'rgba(255,255,255,.22)', 3, 1.6);
  // arms — longer, sticking out at the sides like the real plush
  const aA = pose === 'cheer' || pose === 'hug' ? -2.2 : Math.sin(ph + Math.PI) * 0.7 * run + (g ? 0.65 : -0.6);
  const aF = Math.PI - aA;
  const armY = -40;
  limb(-11, armY, -11 + Math.cos(aF) * 15, armY + Math.sin(aF) * 15, 8, C.body, C.light, 5);
  limb(11, armY, 11 + Math.cos(aA) * 15, armY + Math.sin(aA) * 15, 8, C.body, C.light, 5);
  // scarf — red & white stripes with a little hanging tail
  ctx.save();
  ctx.translate(10, -39); ctx.rotate(0.3 + Math.sin(t * 2.1) * 0.06);
  ctx.fillStyle = '#d23b2f'; RR(-3.5, 0, 8, 15, 3); ctx.fill();
  ctx.fillStyle = '#f3ece1'; ctx.fillRect(-3.5, 3.5, 8, 3.2); ctx.fillRect(-3.5, 10, 8, 3.2);
  ctx.strokeStyle = 'rgba(86,50,40,.4)'; ctx.lineWidth = 1.4; RR(-3.5, 0, 8, 15, 3); ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.08 + 0.84 * i / 8);
    E(4 + Math.cos(a) * 11, -44 + Math.sin(a) * 4.5, 3.3, 3.3, i % 2 ? '#f3ece1' : '#d23b2f');
  }
  // head — long floppy hound ears draping past the chin, muzzle out front
  const earSwing = clamp(vy / 1500, -0.5, 0.5);
  const earFlap = Math.sin(ph) * 0.1 * run;
  const drawEar = (ax, ay, rot, dir, len) => {
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(-6.2, 0);
    ctx.bezierCurveTo(-8.5 + dir * 2, len * 0.35, -7.5 + dir * 5, len * 0.68, -4 + dir * 7, len * 0.92);
    ctx.quadraticCurveTo(dir * 8, len * 1.1, 4.5 + dir * 7, len * 0.9);
    ctx.bezierCurveTo(7.5 + dir * 3, len * 0.58, 6.8, len * 0.3, 6, 0);
    ctx.closePath();
    ctx.fillStyle = C.dark; ctx.fill();
    ctx.strokeStyle = 'rgba(70,50,36,.3)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();
  };
  // far ear hangs behind the head, nearly straight
  drawEar(-6, -69, 0.1 + earSwing * 0.7 + earFlap, -0.4, 37);
  // near ear also roots behind the head, hanging down past the chin
  drawEar(12, -66.5, -0.34 - earSwing * 0.7 + earFlap, 0.5, 40);
  EO(4, -59, 18, 17, C.body);
  plushShade(4, -59, 18, 17);
  // fuzzy crown
  furRing(4, -62, 15, 8, 3.5, 'rgba(255,255,255,.2)', 8, 1.5);
  // big soft muzzle with a little button nose (like Bear's)
  E(12, -50, 11.5, 9.5, C.light);
  ctx.fillStyle = C.nose;
  ctx.beginPath();
  ctx.moveTo(11.5, -54.5); ctx.lineTo(20, -54.5);
  ctx.quadraticCurveTo(20.2, -49.5, 15.8, -47.2);
  ctx.quadraticCurveTo(11.3, -49.5, 11.5, -54.5);
  ctx.closePath(); ctx.fill();
  E(13.5, -53.2, 1.7, 1.2, 'rgba(255,255,255,.3)');
  // tiny stitched smile
  ctx.strokeStyle = '#33333a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.save(); ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.arc(15.8, -44.3, 2.7, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  ctx.restore();
  // sleepy stitched eyes, set high and wide like the real Doggie
  ctx.strokeStyle = '#33333a'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(-2, -66, 2.5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  ctx.beginPath(); ctx.arc(10, -67, 2.5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  // faint brow seams
  ctx.save(); ctx.globalAlpha = 0.28;
  ctx.beginPath(); ctx.arc(-2, -72, 3.4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.beginPath(); ctx.arc(10, -73, 3.4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function drawBear(x, y, o) {
  o = o || {};
  const f = o.face || 1, t = o.t !== undefined ? o.t : simT;
  const run = o.run || 0, g = o.grounded !== false, vy = o.vy || 0, s = o.scale || 1;
  const sq = o.squash || 0, pose = o.pose || '';
  const C = PAL.bear;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f * s * (1 + sq * 0.22), s * (1 - sq * 0.22));
  const bob = (g && !pose) ? Math.abs(Math.sin(t * 11.5 + 1)) * 3 * run : 0;
  ctx.translate(0, -bob);
  ctx.rotate(pose ? 0 : run * 0.08 + (g ? 0 : clamp(vy / 3200, -0.12, 0.16)));
  const ph = t * 11.5 + 1;

  // legs
  let lA = Math.sin(ph) * 7 * run, lB = -lA;
  if (!g) { lA = 6; lB = -3; }
  limb(-6, -16, -6 + lB, -3, 9.5, C.body, C.light, 5.5);
  limb(6, -16, 6 + lA, -3, 9.5, C.body, C.light, 5.5);
  // shaggy body — dense short fluff, not spikes
  furRing(0, -27, 15, 34, 4, 'rgba(166,118,58,.95)', 11, 2.6);
  furRing(0, -27, 15.5, 26, 3, C.light, 47, 2);
  EO(0, -27, 16, 17, C.body);
  plushShade(0, -27, 16, 17);
  furRing(0, -27, 12.5, 20, 3.5, C.light, 5, 1.8);
  E(3, -23, 10, 11, C.light);
  // arms
  const aA = pose === 'cheer' ? -2.1 : (pose === 'hug' ? -1.2 : Math.sin(ph + Math.PI) * 0.6 * run + 0.55);
  limb(-9, -36, -9 + Math.cos(aA) * 10, -36 + Math.sin(aA) * 10, 8.5, C.body, C.light, 4.5);
  limb(9, -36, 9 + Math.cos(aA - 0.3) * 10, -36 + Math.sin(aA - 0.3) * 10, 8.5, C.body, C.light, 4.5);
  // ears
  EO(-4.5, -65, 7, 7, C.body); E(-4.5, -65, 3.4, 3.4, C.dark);
  EO(14, -65, 7, 7, C.body); E(14, -65, 3.4, 3.4, C.dark);
  // shaggy head — soft halo of short fluff
  furRing(4, -52, 14.5, 30, 3.8, 'rgba(166,118,58,.95)', 23, 2.4);
  furRing(4, -52, 15, 22, 2.8, C.light, 61, 1.9);
  EO(4, -52, 15.5, 15, C.body);
  plushShade(4, -52, 15.5, 15);
  furRing(4, -52, 12, 18, 3, C.light, 31, 1.6);
  // muzzle + heart-ish brown nose
  E(9, -47, 9, 7, C.muzzle);
  ctx.fillStyle = C.nose;
  ctx.beginPath();
  ctx.moveTo(5.5, -50.5); ctx.lineTo(14.5, -50.5);
  ctx.quadraticCurveTo(14.5, -45.5, 10, -43.5);
  ctx.quadraticCurveTo(5.5, -45.5, 5.5, -50.5);
  ctx.closePath(); ctx.fill();
  // wide-set bead eyes + a happy smile
  E(-2, -55, 2.4, 2.6, '#2a2018'); E(-2.7, -55.8, 0.8, 0.8, 'rgba(255,255,255,.7)');
  E(15, -55, 2.4, 2.6, '#2a2018'); E(14.3, -55.8, 0.8, 0.8, 'rgba(255,255,255,.7)');
  ctx.strokeStyle = '#3a2818'; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(9.5, -42.5, 3.4, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke();
  ctx.restore();
}

function drawDearie(x, y, o) {
  o = o || {};
  const f = o.face || 1, t = o.t !== undefined ? o.t : simT;
  const run = o.run || 0, g = o.grounded !== false, vy = o.vy || 0, s = o.scale || 1;
  const sq = o.squash || 0, pose = o.pose || '';
  const C = PAL.deer;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f * s * (1 + sq * 0.22), s * (1 - sq * 0.22));
  const bob = (g && !pose) ? Math.abs(Math.sin(t * 12 + 2)) * 2.8 * run : 0;
  ctx.translate(0, -bob);
  ctx.rotate(pose ? 0 : run * 0.08 + (g ? 0 : clamp(vy / 3200, -0.12, 0.16)));
  const ph = t * 12 + 2;

  // legs
  let lA = Math.sin(ph) * 6 * run, lB = -lA;
  if (!g) { lA = 5; lB = -3; }
  limb(-5, -13, -5 + lB, -2.5, 8, C.body, C.light, 4.5);
  limb(5, -13, 5 + lA, -2.5, 8, C.body, C.light, 4.5);
  // round little body with soft grey belly
  EO(0, -23, 13.5, 15, C.body);
  E(2.5, -19, 9, 10.5, C.belly);
  plushShade(0, -23, 13.5, 15);
  furRing(0, -23, 12.5, 12, 4, 'rgba(255,235,210,.35)', 17, 1.6);
  // arms
  const aA = pose === 'cheer' ? -2.1 : (pose === 'hug' ? -1.0 : Math.sin(ph + Math.PI) * 0.55 * run + 0.6);
  limb(-7, -30, -7 + Math.cos(aA) * 8, -30 + Math.sin(aA) * 8, 7, C.body, C.light, 3.8);
  limb(7, -30, 7 + Math.cos(aA - 0.3) * 8, -30 + Math.sin(aA - 0.3) * 8, 7, C.body, C.light, 3.8);
  // antlers — little felt hearts
  ctx.strokeStyle = C.antler; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-5, -53); ctx.lineTo(-8.5, -66);
  ctx.moveTo(-7.5, -60); ctx.lineTo(-2, -67);
  ctx.moveTo(10, -53); ctx.lineTo(13.5, -68);
  ctx.moveTo(12, -61); ctx.lineTo(17.5, -67);
  ctx.stroke();
  // sideways ears with blue-grey lining
  EO(-12, -50, 7.5, 4.6, C.body, -0.55); E(-12.5, -50, 4.6, 2.6, C.inner, -0.55);
  EO(17, -49, 7.5, 4.6, C.body, 0.5); E(17.5, -49, 4.6, 2.6, C.inner, 0.5);
  // leafy garland collar
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.06 + 0.88 * i / 6);
    E(2 + Math.cos(a) * 9.5, -33 + Math.sin(a) * 3.6, 3, 1.8, i % 2 ? '#5e8a4a' : '#75a45c', a - Math.PI / 2);
  }
  // big soft head
  EO(2.5, -44, 14.5, 13.8, C.body);
  plushShade(2.5, -44, 14.5, 13.8);
  furRing(2.5, -44, 12.5, 12, 4, 'rgba(255,235,210,.3)', 41, 1.5);
  // muzzle + brown nose
  E(8, -39, 8.5, 6.5, C.muzzle);
  EO(10, -41.5, 4.4, 3.5, C.nose);
  // big glossy eyes
  E(-2, -46.5, 3.5, 3.8, '#1c1410'); E(-3.1, -47.7, 1.3, 1.3, 'rgba(255,255,255,.85)');
  E(10.5, -46, 3.5, 3.8, '#1c1410'); E(9.4, -47.2, 1.3, 1.3, 'rgba(255,255,255,.85)');
  // tiny smile
  ctx.strokeStyle = '#5e3c22'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(10, -36, 2.8, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  ctx.restore();
}

const CHAR_DRAW = { doggie: drawDoggie, bear: drawBear, dearie: drawDearie };

function drawRawr(en) {
  const t = en.t || 0;
  const C = { body: '#a87a52', dark: '#8a5f3c', face: '#d9a878', strap: '#b58a5e', box: '#f3e6cf' };
  const sleeping = en.state === 'sleep' || en.state === 'settle';
  const wake = en.state === 'wake';
  const pounce = en.state === 'pounce';
  ctx.save();
  ctx.translate(en.x + (wake ? Math.sin(t * 55) * 1.5 : 0), en.y);
  ctx.scale(en.dir * (en.scale || 1), en.scale || 1);
  const br = sleeping ? Math.sin(t * 1.7) * 0.025 : 0; // slow snoozy breathing
  ctx.scale(1 + br, 1 - br);
  if (pounce) { ctx.rotate(-0.1); ctx.scale(1.08, 0.95); }
  // tail nub
  E(-32, -16, 6, 5, C.dark, 0.3);
  // big lying body
  EO(-6, -18, 28, 16, C.body);
  plushShade(-6, -18, 28, 16);
  // fur swirls
  ctx.strokeStyle = 'rgba(90,60,35,.35)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-22, -22); ctx.quadraticCurveTo(-18, -16, -22, -11);
  ctx.moveTo(-10, -26); ctx.quadraticCurveTo(-6, -20, -10, -14);
  ctx.moveTo(2, -24); ctx.quadraticCurveTo(6, -18, 2, -12);
  ctx.stroke();
  // bandolier sash with cartridge boxes
  ctx.save();
  ctx.beginPath(); ctx.ellipse(-6, -18, 28, 16, 0, 0, TAU); ctx.clip();
  ctx.save(); ctx.translate(-8, -18); ctx.rotate(-0.5);
  ctx.fillStyle = C.strap; ctx.fillRect(-7, -22, 14, 44);
  ctx.fillStyle = C.box;
  for (let i = -2; i <= 2; i++) ctx.fillRect(-5, i * 9 - 3, 10, 6);
  ctx.restore(); ctx.restore();
  // tucked legs
  E(-24, -6, 8, 5.5, C.dark); E(8, -6, 8, 5.5, C.dark);
  // arms
  if (pounce) {
    limb(16, -22, 31, -31, 9, C.body, C.dark, 5);
    limb(10, -16, 27, -13, 9, C.body, C.dark, 5);
  } else {
    E(14, -8, 9, 6, C.dark, 0.2);
  }
  // big head
  EO(22, -26, 17, 15.5, C.body);
  ctx.save();
  ctx.beginPath(); ctx.ellipse(22, -26, 17, 15.5, 0, 0, TAU); ctx.clip();
  E(25, -22, 14, 11, C.face);
  ctx.strokeStyle = 'rgba(90,60,35,.5)'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(12, -36); ctx.quadraticCurveTo(20, -32, 18, -26);
  ctx.moveTo(20, -39); ctx.quadraticCurveTo(26, -34, 25, -29);
  ctx.moveTo(28, -38); ctx.quadraticCurveTo(32, -33, 30, -28);
  ctx.stroke();
  ctx.restore();
  // ear
  E(10, -38, 4.5, 5, C.body);
  // scrunched sleepy eyes
  ctx.strokeStyle = '#241c14'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(16, -28); ctx.quadraticCurveTo(19.5, -31.5, 23, -28.6);
  ctx.moveTo(27, -28.6); ctx.quadraticCurveTo(30.5, -31.5, 34, -28);
  ctx.stroke();
  // nose + mouth
  E(25.5, -19.5, 4.6, 3.2, '#241c14');
  if (pounce || wake) E(25.5, -13.5, 4, 3, '#5e3c28');
  else {
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(21, -14); ctx.quadraticCurveTo(25, -12, 29, -14); ctx.stroke();
  }
  ctx.restore();
}

function drawBird(en) {
  const t = en.t || 0;
  const C = { body: '#ffd56b', light: '#ffe9a8', yarn: '#f0c437', line: '#2b251c', scarf: '#4a6fc4', tip: '#3ecfa0' };
  const dive = en.state === 'dive';
  const fl = Math.sin(t * (dive ? 26 : 15));
  ctx.save();
  ctx.translate(en.x, en.y - 16); // spin around his middle, not his feet
  ctx.scale((en.fdir || 1) * (en.scale || 1), en.scale || 1);
  ctx.rotate((en.rot || 0) + (dive ? 0 : Math.sin(t * 9) * 0.07));
  // little scarf tail fluttering off the neck
  ctx.save();
  ctx.translate(-7, -2);
  ctx.rotate(-0.35 + Math.sin(t * 7) * 0.22 + (dive ? 0.3 : 0));
  ctx.fillStyle = C.scarf; RR(-11, -2.5, 11, 5, 2.5); ctx.fill();
  ctx.fillStyle = C.tip; RR(-16.5, -3, 6, 6, 2); ctx.fill();
  ctx.restore();
  // far wing
  E(-9, 6, 7, 4.2, C.yarn, -0.5 + fl * 0.5);
  // small round body tucked under the big head
  EO(-3, 8, 10, 8.5, C.body);
  E(-2, 10.5, 6.5, 4.8, C.light);
  // feet nubs
  E(-5, 15.5, 2.8, 1.8, C.yarn); E(1, 15.5, 2.8, 1.8, C.yarn);
  // small neck scarf
  ctx.save(); ctx.rotate(-0.12);
  ctx.fillStyle = C.scarf; RR(-8, -2.5, 18, 5.5, 2.75); ctx.fill();
  ctx.restore();
  // big fluffy head
  EO(4, -9, 12.5, 12, C.body);
  E(6, -6, 7.5, 6.5, C.light);
  plushShade(4, -9, 12.5, 12);
  furRing(4, -9, 11, 12, 2.6, 'rgba(255,255,255,.35)', 21, 1.4);
  // yarn mohawk
  ctx.strokeStyle = C.yarn; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -2.1 + i * 0.3;
    ctx.moveTo(1 + i * 1.2, -19.5);
    ctx.lineTo(1 + i * 1.2 + Math.cos(a) * 8, -19.5 + Math.sin(a) * 10);
  }
  ctx.stroke();
  // closed happy eyes + the long stitched smile
  ctx.strokeStyle = C.line; ctx.lineWidth = 1.7;
  ctx.beginPath(); ctx.arc(1.5, -12, 2.3, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  ctx.beginPath(); ctx.arc(8.5, -12, 2.3, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-3.5, -6.5); ctx.quadraticCurveTo(4.5, -4, 13, -7); ctx.stroke();
  // near wing
  E(4, 7, 7.5, 4.5, C.body, 0.5 - fl * 0.5);
  ctx.restore();
}

function drawRhino(en) {
  const t = en.t || 0;
  const C = { body: '#b9c4a6', light: '#d0d9bf', horn: '#f7f3ea', spike: '#2b2620' };
  const charging = en.state === 'charge';
  const alert = en.state === 'alert';
  const tired = en.state === 'tired';
  ctx.save();
  ctx.translate(en.x + (alert ? Math.sin(t * 60) * 1.6 : 0), en.y);
  ctx.scale(en.dir * (en.scale || 1), en.scale || 1);
  if (charging) ctx.scale(1.1, 0.94);
  if (tired) ctx.scale(1, 0.96);
  const ph = t * (charging ? 24 : 7);
  const hy = charging ? 4 : (alert ? -2 : 0); // head drops when charging, lifts on alert
  // legs (all fours)
  const sw = charging ? 8 : 4;
  limb(-18, -14, -18 + Math.sin(ph) * sw, -2.5, 9, C.body, C.light, 4.5);
  limb(-7, -14, -7 - Math.sin(ph) * sw, -2.5, 9, C.body, C.light, 4.5);
  limb(6, -14, 6 + Math.sin(ph + 1) * sw, -2.5, 9, C.body, C.light, 4.5);
  limb(17, -14, 17 - Math.sin(ph + 1) * sw, -2.5, 9, C.body, C.light, 4.5);
  // tail
  E(-30, -27, 5, 4, C.body, 0.4);
  // body
  EO(-3, -25, 27, 16.5, C.body);
  E(-2, -17, 18, 8.5, C.light);
  plushShade(-3, -25, 27, 16.5);
  // black felt back spikes
  ctx.fillStyle = C.spike;
  [[-17, -37], [-5, -39.5], [7, -38]].forEach((s, i) => {
    ctx.save(); ctx.translate(s[0], s[1]); ctx.rotate(-0.25);
    ctx.beginPath();
    ctx.moveTo(-6, 3); ctx.quadraticCurveTo(-2, -7 - i, 4, -5);
    ctx.quadraticCurveTo(4.5, -1, 6, 3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  });
  // head + snout
  EO(22, -28 + hy, 14.5, 12.5, C.body);
  E(30, -24 + hy, 9.5, 7.5, C.light);
  // big white nose horn
  ctx.fillStyle = C.horn;
  ctx.beginPath();
  ctx.moveTo(30, -30 + hy);
  ctx.quadraticCurveTo(40, -45 + hy, 45.5, -42.5 + hy);
  ctx.quadraticCurveTo(42, -31 + hy, 37.5, -25 + hy);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(86,60,40,.3)'; ctx.lineWidth = 1.6; ctx.stroke();
  // little white brow horns
  const hornlet = (x, y, rot) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = C.horn;
    ctx.beginPath();
    ctx.moveTo(-3.4, 2.5); ctx.quadraticCurveTo(-1, -7, 2.5, -5.5);
    ctx.quadraticCurveTo(2.8, -1, 3.4, 2.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(86,60,40,.25)'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.restore();
  };
  hornlet(19, -37 + hy, -0.55); hornlet(12, -39 + hy, -0.2);
  // ear + eye
  E(8.5, -39 + hy * 0.5, 4.5, 5, C.body, -0.3);
  E(22, -33 + hy, 2.1, 2.4, '#2a2520');
  E(21.4, -33.9 + hy, 0.8, 0.8, 'rgba(255,255,255,.7)');
  if (tired) { // dizzy huff
    ctx.strokeStyle = 'rgba(90,80,70,.4)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(34, -36, 3 + Math.sin(t * 6) * 1, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

function drawTiger(en) {
  const t = en.t || 0;
  const C = { body: '#e8964a', belly: '#f3d2a0', stripe: '#332c24', inner: '#f3c98e' };
  const k = clamp(-(en.vy || 0) / 1500, -0.22, 0.22); // stretch up, squash down
  ctx.save();
  ctx.translate(en.x, en.y);
  ctx.rotate((en.vx || 0) / 1400);
  ctx.scale((en.dir < 0 ? -1 : 1) * (en.scale || 1) * (1 - k * 0.55), (en.scale || 1) * (1 + k));
  const wob = en.grounded ? Math.sin(t * 3) * 0.03 : 0;
  ctx.rotate(wob);
  // feet
  E(-8, -3.5, 6.5, 4.5, C.body); E(8, -3.5, 6.5, 4.5, C.body);
  // squishy pear body + head
  EO(0, -22, 17.5, 20, C.body);
  EO(0, -42, 14.5, 13, C.body);
  E(0, -17.5, 11.5, 13, C.belly);
  plushShade(0, -22, 17.5, 20);
  plushShade(0, -42, 14.5, 13);
  // stubby arms
  E(-16.5, -27, 5, 8, C.body, 0.5); E(16.5, -27, 5, 8, C.body, -0.5);
  // ears
  EO(-10, -53, 5.2, 5.2, C.body); E(-10, -53, 2.6, 2.6, C.inner);
  EO(10, -53, 5.2, 5.2, C.body); E(10, -53, 2.6, 2.6, C.inner);
  // stripes
  ctx.strokeStyle = C.stripe; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-4, -55.5); ctx.quadraticCurveTo(0, -53.5, 4, -55.5);
  ctx.moveTo(-13.5, -47); ctx.quadraticCurveTo(-9.5, -46, -7.5, -48);
  ctx.moveTo(13.5, -47); ctx.quadraticCurveTo(9.5, -46, 7.5, -48);
  ctx.moveTo(-16.5, -32); ctx.quadraticCurveTo(-11.5, -31, -9.5, -33);
  ctx.moveTo(16.5, -32); ctx.quadraticCurveTo(11.5, -31, 9.5, -33);
  ctx.moveTo(-16.5, -20); ctx.quadraticCurveTo(-11.5, -19, -10, -21);
  ctx.moveTo(16.5, -20); ctx.quadraticCurveTo(11.5, -19, 10, -21);
  ctx.stroke();
  // muzzle, button nose, smile
  E(0, -38, 8, 6.5, C.belly);
  ctx.fillStyle = C.stripe;
  ctx.beginPath();
  ctx.moveTo(-3.2, -41.5); ctx.lineTo(3.2, -41.5);
  ctx.quadraticCurveTo(3.2, -38.3, 0, -37.3);
  ctx.quadraticCurveTo(-3.2, -38.3, -3.2, -41.5);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = C.stripe; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(-2.5, -35.8, 2.4, Math.PI * 0.1, Math.PI * 0.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(2.5, -35.8, 2.4, Math.PI * 0.15, Math.PI * 0.9);
  ctx.stroke();
  // eyes
  E(-6.5, -45, 2.2, 2.4, C.stripe); E(6.5, -45, 2.2, 2.4, C.stripe);
  E(-7.1, -45.8, 0.8, 0.8, 'rgba(255,255,255,.7)'); E(5.9, -45.8, 0.8, 0.8, 'rgba(255,255,255,.7)');
  ctx.restore();
}
function drawShadow(x, feetY, w) {
  const gy = groundBelowY(x, feetY - 2);
  if (gy === null) return;
  const d = clamp(1 - (gy - feetY) / 240, 0, 1);
  if (d <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.09 * d;
  E(x, gy + 4, w * (0.85 + 0.3 * d), 6 * d + 2.5, '#4a3120');
  ctx.globalAlpha = 0.12 * d;
  E(x, gy + 4, w * (0.5 + 0.2 * d), 3.5 * d + 1.5, '#4a3120');
  ctx.restore();
}

// ============================================================ pre-rendered scenery
function makeTerrain() {
  soilPat = null; grassStrip = null;
  if (typeof document === 'undefined' || !document.createElement) return;
  // --- seamless watercolour soil pattern
  const sc = document.createElement('canvas');
  sc.width = 192; sc.height = 192;
  const p = sc.getContext('2d');
  p.fillStyle = THEME.soil; p.fillRect(0, 0, 192, 192);
  const blob = (x, y, rx, ry, col, al) => {
    p.globalAlpha = al; p.fillStyle = col;
    for (const ox of [-192, 0, 192]) for (const oy of [-192, 0, 192]) {
      p.beginPath(); p.ellipse(x + ox, y + oy, rx, ry, 0, 0, TAU); p.fill();
    }
    p.globalAlpha = 1;
  };
  // big soft inner stains (kept away from edges so the tile still wraps)
  for (let i = 0; i < 7; i++) {
    const x = 62 + Math.random() * 68, y = 62 + Math.random() * 68, r = 28 + Math.random() * 32;
    const g = p.createRadialGradient(x, y, r * 0.15, x, y, r);
    const col = i % 2 ? THEME.soilDark : shade(THEME.soil, 1.16);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    p.globalAlpha = 0.22; p.fillStyle = g; p.fillRect(x - r, y - r, r * 2, r * 2);
    p.globalAlpha = 1;
  }
  for (let i = 0; i < 26; i++) {
    const r = Math.random();
    blob(Math.random() * 192, Math.random() * 192, 12 + r * 30, 9 + r * 22,
      i % 2 ? THEME.soilDark : shade(THEME.soil, 1.16), 0.12 + Math.random() * 0.1);
  }
  // thin sediment streaks
  p.strokeStyle = shade(THEME.soilDark, 0.9, 0.18); p.lineWidth = 1.6; p.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const y = Math.random() * 192, x = Math.random() * 192, l = 30 + Math.random() * 60;
    p.beginPath();
    p.moveTo(x, y); p.quadraticCurveTo(x + l / 2, y + (Math.random() - 0.5) * 6, x + l, y);
    p.stroke();
    p.beginPath();
    p.moveTo(x - 192, y); p.quadraticCurveTo(x - 192 + l / 2, y + 3, x - 192 + l, y);
    p.moveTo(x + 192, y); p.quadraticCurveTo(x + 192 + l / 2, y + 3, x + 192 + l, y);
    p.stroke();
  }
  for (let i = 0; i < 10; i++) { // dimensional half-buried stones
    const x = Math.random() * 192, y = Math.random() * 192, r = 3 + Math.random() * 5;
    blob(x + 1, y + 2, r * 1.05, r * 0.75, 'rgba(48,28,14,.4)', 0.5);
    blob(x, y, r, r * 0.75, shade(THEME.soil, 1.4), 0.85);
    blob(x - r * 0.3, y - r * 0.3, r * 0.45, r * 0.3, 'rgba(255,250,238,.5)', 0.7);
  }
  p.globalAlpha = 0.5;
  for (let i = 0; i < 480; i++) {
    p.fillStyle = Math.random() < 0.5 ? 'rgba(46,26,12,.4)' : 'rgba(255,240,220,.28)';
    p.fillRect(Math.random() * 192, Math.random() * 192, 1.6, 1.2);
  }
  p.globalAlpha = 1;
  soilPat = ctx.createPattern(sc, 'repeat');

  // --- lush mossy grass strip (4 tiles wide, drawn per cap tile)
  const gc = document.createElement('canvas');
  gc.width = 192; gc.height = 46;
  const q = gc.getContext('2d');
  const gg = q.createLinearGradient(0, 2, 0, 30);
  gg.addColorStop(0, shade(THEME.grass, 1.22));
  gg.addColorStop(0.5, THEME.grass);
  gg.addColorStop(1, shade(THEME.grass, 0.8));
  q.fillStyle = gg; q.fillRect(0, 3, 192, 27);
  // sunlit uneven top edge
  q.fillStyle = shade(THEME.grass, 1.38);
  for (let x = -4; x < 196; x += 6) {
    q.beginPath(); q.arc(x + 3, 4.5, 2.4 + hash(x * 1.7) * 2.6, 0, TAU); q.fill();
  }
  q.fillStyle = shade(THEME.grass, 1.55, 0.5);
  for (let x = -2; x < 196; x += 11) {
    q.beginPath(); q.arc(x + 4, 3.5, 1.4 + hash(x * 2.3) * 1.4, 0, TAU); q.fill();
  }
  q.lineCap = 'round';
  for (let i = 0; i < 150; i++) { // dense blade texture, three tones
    const x = (i * 1.28 + hash(i) * 4) % 192;
    q.strokeStyle = [shade(THEME.grassDark, 1.0, 0.55), shade(THEME.grass, 0.76, 0.5),
      shade(THEME.grass, 1.3, 0.5), shade(THEME.grass, 1.05, 0.45)][i % 4];
    q.lineWidth = 1.1 + hash(i * 3) * 1;
    q.beginPath();
    q.moveTo(x, 6 + hash(i * 7) * 8);
    q.quadraticCurveTo(x + (hash(i * 11) - 0.5) * 2, 15, x + (hash(i * 11) - 0.5) * 4.5, 20 + hash(i * 5) * 9);
    q.stroke();
  }
  // tiny daisies tucked into the grass
  for (let i = 0; i < 4; i++) {
    const x = 18 + i * 46 + hash(i * 13.7) * 22, y = 9 + hash(i * 5.1) * 8;
    for (let pp = 0; pp < 6; pp++) {
      const ang = pp / 6 * TAU;
      q.fillStyle = 'rgba(255,253,246,.95)';
      q.beginPath(); q.ellipse(x + Math.cos(ang) * 2.6, y + Math.sin(ang) * 2.6, 1.7, 1.1, ang, 0, TAU); q.fill();
    }
    q.fillStyle = '#f3c93c';
    q.beginPath(); q.arc(x, y, 1.5, 0, TAU); q.fill();
  }
  // mossy overhanging lip
  q.fillStyle = shade(THEME.grassDark, 0.95);
  for (let x = -8; x < 200; x += 16) {
    q.beginPath();
    q.ellipse(x + 8, 27.5, 8 + hash(x * 3.3) * 3, 7 + hash(x * 1.9) * 4, 0, 0, Math.PI);
    q.fill();
  }
  q.strokeStyle = shade(THEME.grassDark, 0.66, 0.6); q.lineWidth = 1.7;
  q.beginPath();
  for (let x = 0; x <= 192; x += 8) {
    const y = 33.5 + Math.sin(x * 0.6) * 2.4;
    if (x) q.lineTo(x, y); else q.moveTo(x, y);
  }
  q.stroke();
  // long blades drooping over the edge
  for (let i = 0; i < 9; i++) {
    const x = 8 + i * 21 + hash(i * 9.3) * 10;
    const droop = 8 + hash(i * 4.7) * 9;
    q.strokeStyle = i % 2 ? shade(THEME.grassDark, 0.9, 0.9) : shade(THEME.grass, 0.85, 0.85);
    q.lineWidth = 1.7;
    q.beginPath();
    q.moveTo(x, 24); q.quadraticCurveTo(x + 4, 31, x + 6, 32 + droop);
    q.moveTo(x + 3, 25); q.quadraticCurveTo(x + 6, 30, x + 9.5, 31 + droop * 0.7);
    q.stroke();
  }
  // moss drips
  q.strokeStyle = shade(THEME.grassDark, 0.8, 0.85); q.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const x = 14 + i * 31 + hash(i * 13) * 12;
    q.beginPath(); q.moveTo(x, 31); q.quadraticCurveTo(x + 1.5, 37, x - 1, 41 + hash(i * 3) * 4); q.stroke();
  }
  grassStrip = gc;
}

// --- tiny scenery painters used on the parallax bands
function decoHouse(p, x, y, s, warm) {
  p.save(); p.translate(x, y); p.scale(s, s);
  p.fillStyle = 'rgba(70,48,28,.18)'; p.beginPath(); p.ellipse(0, 1, 13, 3, 0, 0, TAU); p.fill();
  p.fillStyle = '#f2e3c2'; p.fillRect(-9, -14, 18, 14);
  p.strokeStyle = 'rgba(86,60,40,.4)'; p.lineWidth = 1.2; p.strokeRect(-9, -14, 18, 14);
  p.fillStyle = '#b45a44';
  p.beginPath(); p.moveTo(-12, -13); p.lineTo(0, -24); p.lineTo(12, -13); p.closePath(); p.fill();
  p.strokeStyle = 'rgba(70,40,28,.4)'; p.stroke();
  p.fillStyle = '#8a5c3b'; p.fillRect(4, -21, 3.5, 6);
  p.fillStyle = warm ? '#ffd76b' : '#7a5a3c'; p.fillRect(-4, -10, 5, 5);
  p.restore();
}
function decoCypress(p, x, y, s) {
  p.save(); p.translate(x, y); p.scale(s, s);
  p.fillStyle = '#5f8657';
  p.beginPath();
  p.moveTo(0, -34); p.quadraticCurveTo(6.5, -16, 2.5, 0);
  p.lineTo(-2.5, 0); p.quadraticCurveTo(-6.5, -16, 0, -34);
  p.closePath(); p.fill();
  p.fillStyle = 'rgba(35,60,35,.3)';
  p.beginPath();
  p.moveTo(0, -34); p.quadraticCurveTo(5.5, -16, 2, 0); p.lineTo(0, 0);
  p.closePath(); p.fill();
  p.restore();
}
function decoBushTree(p, x, y, s) {
  const f = THEME.foliage;
  p.save(); p.translate(x, y); p.scale(s, s);
  p.fillStyle = '#7e5a3c'; p.fillRect(-1.8, -10, 3.6, 10);
  p.fillStyle = shade(f[0], 0.92);
  p.beginPath(); p.ellipse(0, -15, 13, 10, 0, 0, TAU); p.fill();
  p.fillStyle = f[1];
  p.beginPath(); p.ellipse(-5, -17, 8, 6.5, 0, 0, TAU); p.fill();
  p.fillStyle = f[2];
  p.beginPath(); p.ellipse(4, -19, 8, 6.5, 0, 0, TAU); p.fill();
  p.fillStyle = 'rgba(255,250,235,.35)';
  p.beginPath(); p.ellipse(1, -21, 3.5, 2.2, 0, 0, TAU); p.fill();
  p.restore();
}
function decoBush(p, x, y, s, col) {
  p.save(); p.translate(x, y); p.scale(s, s);
  p.fillStyle = col;
  p.beginPath(); p.ellipse(-6, -4, 8, 5.5, 0, 0, TAU); p.fill();
  p.beginPath(); p.ellipse(6, -4, 8, 5.5, 0, 0, TAU); p.fill();
  p.beginPath(); p.ellipse(0, -8, 9, 6, 0, 0, TAU); p.fill();
  p.fillStyle = 'rgba(255,255,240,.18)';
  p.beginPath(); p.ellipse(-2, -10, 4, 2.4, 0, 0, TAU); p.fill();
  p.restore();
}
function decoPine(p, x, y, s, col) {
  p.save(); p.translate(x, y); p.scale(s, s);
  p.fillStyle = '#5a4430'; p.fillRect(-1.6, -7, 3.2, 7);
  p.fillStyle = col;
  p.beginPath(); p.moveTo(-10, -6); p.lineTo(0, -26); p.lineTo(10, -6); p.closePath(); p.fill();
  p.beginPath(); p.moveTo(-8, -16); p.lineTo(0, -33); p.lineTo(8, -16); p.closePath(); p.fill();
  if (THEME.snow) {
    p.strokeStyle = 'rgba(255,255,255,.85)'; p.lineWidth = 2.4; p.lineCap = 'round';
    p.beginPath();
    p.moveTo(-6, -21); p.lineTo(0, -33); p.lineTo(6, -21);
    p.moveTo(-7, -10); p.lineTo(0, -25);
    p.stroke();
  }
  p.restore();
}
function decoCabin(p, x, y, s) {
  p.save(); p.translate(x, y); p.scale(s, s);
  p.fillStyle = '#6b5138'; p.fillRect(-10, -13, 20, 13);
  p.fillStyle = '#4f3c28';
  p.beginPath(); p.moveTo(-13, -12); p.lineTo(0, -22); p.lineTo(13, -12); p.closePath(); p.fill();
  p.fillStyle = '#ffd76b'; p.fillRect(-4, -9, 5, 5);
  p.restore();
}
function decoRock(p, x, y, s) {
  p.save(); p.translate(x, y); p.scale(s, s);
  p.fillStyle = '#c4ab80';
  p.beginPath(); p.ellipse(0, -4, 11, 7, 0, 0, TAU); p.fill();
  p.fillStyle = '#b59c72';
  p.beginPath(); p.ellipse(8, -2.5, 7, 5, 0, 0, TAU); p.fill();
  p.fillStyle = 'rgba(255,250,235,.3)';
  p.beginPath(); p.ellipse(-3, -7, 4.5, 2.5, 0, 0, TAU); p.fill();
  p.restore();
}
function decoCactusSil(p, x, y, s) {
  p.save(); p.translate(x, y); p.scale(s, s);
  p.fillStyle = '#8aa56b';
  p.fillRect(-2.5, -22, 5, 22);
  p.fillRect(-9, -16, 5, 3); p.fillRect(-9, -19, 3, 6);
  p.fillRect(4, -13, 5, 3); p.fillRect(6, -17, 3, 7);
  p.restore();
}
function decoAdobe(p, x, y, s) {
  p.save(); p.translate(x, y); p.scale(s, s);
  p.fillStyle = '#dec39a'; p.fillRect(-9, -12, 18, 12);
  p.strokeStyle = 'rgba(120,90,55,.4)'; p.lineWidth = 1.2; p.strokeRect(-9, -12, 18, 12);
  p.fillStyle = '#c4a87c'; p.fillRect(-10, -13.5, 20, 3);
  p.fillStyle = '#7a5a3c'; p.fillRect(-3, -8, 4.5, 8);
  p.restore();
}

function decoBoat(p, x, y, s) {
  p.save(); p.translate(x, y); p.scale(s, s);
  p.fillStyle = '#8a5c3b';
  p.beginPath(); p.moveTo(-10, 0); p.quadraticCurveTo(0, 5, 10, 0); p.lineTo(8, -3); p.lineTo(-8, -3); p.closePath(); p.fill();
  p.strokeStyle = '#6e4a30'; p.lineWidth = 1.2;
  p.beginPath(); p.moveTo(0, -3); p.lineTo(0, -16); p.stroke();
  p.fillStyle = '#f6ead2';
  p.beginPath(); p.moveTo(1, -16); p.lineTo(9, -5); p.lineTo(1, -5); p.closePath(); p.fill();
  p.restore();
}
function decoLighthouse(p, x, y, s) {
  p.save(); p.translate(x, y); p.scale(s, s);
  p.fillStyle = '#f2e8d8';
  p.beginPath(); p.moveTo(-6, 0); p.lineTo(-4, -26); p.lineTo(4, -26); p.lineTo(6, 0); p.closePath(); p.fill();
  p.fillStyle = '#c4604a'; p.fillRect(-5.4, -8, 10.8, 5); p.fillRect(-4.7, -19, 9.4, 5);
  p.fillStyle = '#ffd76b'; p.fillRect(-3.5, -30, 7, 4.5);
  p.fillStyle = '#7a5a48';
  p.beginPath(); p.moveTo(-4.5, -30); p.lineTo(0, -35); p.lineTo(4.5, -30); p.closePath(); p.fill();
  p.restore();
}
function decoPalmSil(p, x, y, s) {
  p.save(); p.translate(x, y); p.scale(s, s);
  p.strokeStyle = '#9c7850'; p.lineWidth = 3; p.lineCap = 'round';
  p.beginPath(); p.moveTo(0, 0); p.quadraticCurveTo(3, -12, 8, -22); p.stroke();
  p.strokeStyle = '#6f9c55'; p.lineWidth = 2.4;
  for (let i = 0; i < 5; i++) {
    const a = -2.7 + i * 0.55;
    p.beginPath(); p.moveTo(8, -22);
    p.quadraticCurveTo(8 + Math.cos(a) * 8, -22 + Math.sin(a) * 6, 8 + Math.cos(a) * 15, -22 + Math.sin(a) * 10 + 3);
    p.stroke();
  }
  p.restore();
}
function decoShroomSil(p, x, y, s, col) {
  p.save(); p.translate(x, y); p.scale(s, s);
  p.fillStyle = '#d8cec0'; p.fillRect(-2.5, -14, 5, 14);
  p.fillStyle = col;
  p.beginPath(); p.ellipse(0, -14, 11, 7, 0, Math.PI, 0); p.closePath(); p.fill();
  p.fillStyle = 'rgba(255,240,255,.5)';
  p.beginPath(); p.arc(-4, -17, 1.6, 0, TAU); p.fill();
  p.beginPath(); p.arc(3, -16, 1.2, 0, TAU); p.fill();
  p.restore();
}
function decoSpire(p, x, y, s, col) {
  p.save(); p.translate(x, y); p.scale(s, s);
  p.fillStyle = col;
  p.beginPath();
  p.moveTo(-10, 0); p.lineTo(-4, -22); p.lineTo(0, -14); p.lineTo(5, -30); p.lineTo(10, 0);
  p.closePath(); p.fill();
  p.restore();
}
function decoVent(p, x, y, s) {
  p.save(); p.translate(x, y); p.scale(s, s);
  const g = p.createRadialGradient(0, -3, 1, 0, -3, 10);
  g.addColorStop(0, 'rgba(255,160,90,.8)'); g.addColorStop(1, 'rgba(255,160,90,0)');
  p.fillStyle = g; p.fillRect(-10, -13, 20, 16);
  p.fillStyle = '#ffc080';
  p.beginPath(); p.arc(0, -3, 2.2, 0, TAU); p.fill();
  p.restore();
}

function makeBands() {
  bands = [];
  if (typeof document === 'undefined' || !document.createElement) return;
  const W = 1920;
  function build(par, topY, waves, color, decorate, hz) {
    const c = document.createElement('canvas');
    c.width = W; c.height = VH;
    const p = c.getContext('2d');
    const yAt = x => {
      let y = topY;
      for (const w of waves) y += Math.sin(TAU * w[0] * x / W + w[2]) * w[1];
      return y;
    };
    p.fillStyle = color;
    p.beginPath(); p.moveTo(0, VH);
    for (let x = 0; x <= W; x += 10) p.lineTo(x, yAt(x));
    p.lineTo(W, VH); p.closePath(); p.fill();
    for (let i = 0; i < 26; i++) { // broad washes
      const bx = hash(i * 17.3 + topY) * W, by = yAt(bx) + 14 + hash(i * 7.7) * 110;
      const r = 30 + hash(i * 3.1 + topY) * 90;
      p.globalAlpha = 0.16;
      p.fillStyle = i % 2 ? shade(color, 0.9) : shade(color, 1.1);
      p.beginPath(); p.ellipse(bx, by, r, r * 0.55, 0, 0, TAU); p.fill();
      p.globalAlpha = 1;
    }
    p.lineCap = 'round'; // sunlit crest line, then a pooled shadow just below
    p.strokeStyle = shade(color, 1.32, 0.6); p.lineWidth = 2.5;
    p.beginPath();
    for (let x = 0; x <= W; x += 10) { const y = yAt(x) + 0.8; if (x) p.lineTo(x, y); else p.moveTo(x, y); }
    p.stroke();
    p.strokeStyle = shade(color, 0.84, 0.45); p.lineWidth = 6;
    p.beginPath();
    for (let x = 0; x <= W; x += 10) { const y = yAt(x) + 7; if (x) p.lineTo(x, y); else p.moveTo(x, y); }
    p.stroke();
    // distant foliage stipple clusters
    p.fillStyle = shade(color, 0.85, 0.5);
    for (let i = 0; i < 16; i++) {
      const cxx = hash(i * 13.7 + topY * 2) * W, cyy = yAt(cxx) + 16 + hash(i * 5.3) * 60;
      for (let k2 = 0; k2 < 6; k2++) {
        p.beginPath();
        p.arc(cxx + (hash(i * 7 + k2) - 0.5) * 26, cyy + (hash(i * 3 + k2) - 0.5) * 12, 1.6 + hash(k2 + i) * 1.4, 0, TAU);
        p.fill();
      }
    }
    p.strokeStyle = shade(color, 0.84, 0.5); p.lineWidth = 1.3; // grass flecks
    p.beginPath();
    for (let i = 0; i < 240; i++) {
      const tx2 = hash(i * 5.31 + topY * 3) * W;
      const ty2 = yAt(tx2) + 5 + hash(i * 2.7) * 80;
      p.moveTo(tx2, ty2); p.lineTo(tx2 + (hash(i) - 0.5) * 3, ty2 - 4 - hash(i * 9) * 5);
    }
    p.stroke();
    if (decorate) {
      const wrap = (x, fn) => { fn(x); fn(x - W); fn(x + W); };
      decorate(p, yAt, W, wrap);
    }
    bands.push({ c, par, hz });
  }
  const style = THEME.band;
  if (style === 'pines') {
    build(0.12, 318, [[2, 15, 0], [5, 8, 1]], shade(THEME.hillFar, 1.1), null, [298, 425, 0.5]);
    build(0.25, 348, [[3, 22, 2], [7, 10, 0.5]], THEME.hillFar, (p, yAt, W, wrap) => {
      for (let i = 0; i < 16; i++) {
        const x = (i + 0.5) * W / 16 + hash(i * 3) * 40;
        wrap(x, xx => decoPine(p, xx, yAt(x) + 6, 0.7 + hash(i) * 0.6, shade(THEME.hillFar2, 0.8)));
      }
      wrap(hash(7.7) * W, xx => decoCabin(p, xx, yAt(hash(7.7) * W) + 4, 1.1));
    }, [330, 462, 0.24]);
    build(0.45, 392, [[3, 26, 4], [8, 12, 2]], THEME.hillFar2, (p, yAt, W, wrap) => {
      for (let i = 0; i < 11; i++) {
        const x = (i + 0.5) * W / 11 + hash(i * 7) * 50;
        wrap(x, xx => decoPine(p, xx, yAt(x) + 8, 1 + hash(i * 2) * 0.9, shade(THEME.hillMid, 0.85)));
      }
    }, [382, 502, 0.15]);
    build(0.66, 440, [[4, 26, 1], [9, 12, 3]], THEME.hillMid, (p, yAt, W, wrap) => {
      for (let i = 0; i < 12; i++) {
        const x = (i + 0.5) * W / 12 + hash(i * 11) * 40;
        wrap(x, xx => decoBush(p, xx, yAt(x) + 6, 0.9 + hash(i * 5) * 0.8, shade(THEME.hillMid, 0.8)));
      }
    }, [432, VH, 0.1]);
  } else if (style === 'desert') {
    build(0.12, 318, [[2, 13, 0], [5, 6, 1]], shade(THEME.hillFar, 1.08), null, [298, 425, 0.5]);
    build(0.25, 348, [[3, 18, 2], [7, 8, 0.5]], THEME.hillFar, (p, yAt, W, wrap) => {
      for (let i = 0; i < 6; i++) {
        const x = (i + 0.5) * W / 6 + hash(i * 3) * 80;
        wrap(x, xx => decoRock(p, xx, yAt(x) + 5, 0.8 + hash(i) * 0.7));
      }
      for (let i = 0; i < 2; i++) {
        const x = hash(i * 9 + 3) * W;
        wrap(x, xx => { decoAdobe(p, xx, yAt(x) + 4, 1); decoAdobe(p, xx + 24, yAt(x) + 6, 0.8); });
      }
    }, [330, 462, 0.24]);
    build(0.45, 392, [[3, 22, 4], [8, 10, 2]], THEME.hillFar2, (p, yAt, W, wrap) => {
      for (let i = 0; i < 9; i++) {
        const x = (i + 0.5) * W / 9 + hash(i * 7) * 60;
        wrap(x, xx => (hash(i * 13) > 0.4 ? decoCactusSil(p, xx, yAt(x) + 6, 0.9 + hash(i * 2) * 0.7) : decoRock(p, xx, yAt(x) + 6, 0.9)));
      }
    }, [382, 502, 0.15]);
    build(0.66, 440, [[4, 22, 1], [9, 10, 3]], THEME.hillMid, (p, yAt, W, wrap) => {
      for (let i = 0; i < 10; i++) {
        const x = (i + 0.5) * W / 10 + hash(i * 11) * 50;
        wrap(x, xx => decoBush(p, xx, yAt(x) + 6, 0.7 + hash(i * 5) * 0.6, shade(THEME.hillMid, 0.82)));
      }
    }, [432, VH, 0.1]);
  } else if (style === 'sea') {
    build(0.1, 332, [[1, 4, 0], [3, 2, 1]], shade(THEME.hillFar, 1.05), (p, yAt, W, wrap) => {
      const lx = hash(4.2) * W;
      wrap(lx, xx => decoLighthouse(p, xx, yAt(lx) + 2, 1.1));
      for (let i = 0; i < 3; i++) {
        const x = hash(i * 9.7) * W;
        wrap(x, xx => decoBoat(p, xx, yAt(x) - 2, 0.7 + hash(i) * 0.3));
      }
    }, [318, 430, 0.32]);
    build(0.24, 360, [[2, 5, 2], [5, 2.5, 0.5]], THEME.hillFar2, (p, yAt, W, wrap) => {
      for (let i = 0; i < 4; i++) {
        const x = (i + 0.4) * W / 4;
        wrap(x, xx => decoBoat(p, xx, yAt(x) - 2, 0.9 + hash(i * 3) * 0.4));
      }
      p.globalAlpha = 0.5; p.strokeStyle = '#ffffff'; p.lineWidth = 1.4;
      p.beginPath();
      for (let i = 0; i < 60; i++) {
        const x = hash(i * 3.13) * W, y = yAt(x) + 8 + hash(i * 7.7) * 70;
        p.moveTo(x, y); p.lineTo(x + 8 + hash(i) * 10, y);
      }
      p.stroke(); p.globalAlpha = 1;
    }, [350, 470, 0.22]);
    build(0.45, 405, [[3, 18, 4], [8, 8, 2]], THEME.hillMid, (p, yAt, W, wrap) => {
      for (let i = 0; i < 7; i++) {
        const x = (i + 0.5) * W / 7 + hash(i * 7) * 60;
        wrap(x, xx => decoPalmSil(p, xx, yAt(x) + 5, 0.9 + hash(i * 2) * 0.6));
      }
    }, [392, 505, 0.14]);
    build(0.66, 442, [[4, 20, 1], [9, 9, 3]], shade(THEME.hillMid, 1.08), (p, yAt, W, wrap) => {
      for (let i = 0; i < 10; i++) {
        const x = (i + 0.5) * W / 10 + hash(i * 11) * 40;
        wrap(x, xx => decoBush(p, xx, yAt(x) + 6, 0.7 + hash(i * 5) * 0.6, shade(THEME.grassDark, 1.05)));
      }
    }, [432, VH, 0.1]);
  } else if (style === 'shroom') {
    build(0.12, 318, [[2, 15, 0], [5, 8, 1]], shade(THEME.hillFar, 1.1), null, [298, 425, 0.5]);
    build(0.25, 348, [[3, 22, 2], [7, 10, 0.5]], THEME.hillFar, (p, yAt, W, wrap) => {
      for (let i = 0; i < 9; i++) {
        const x = (i + 0.5) * W / 9 + hash(i * 3) * 60;
        wrap(x, xx => decoShroomSil(p, xx, yAt(x) + 4, 0.8 + hash(i) * 0.8, shade(THEME.foliage[1], 0.85)));
      }
    }, [330, 462, 0.24]);
    build(0.45, 392, [[3, 26, 4], [8, 12, 2]], THEME.hillFar2, (p, yAt, W, wrap) => {
      for (let i = 0; i < 7; i++) {
        const x = (i + 0.5) * W / 7 + hash(i * 7) * 60;
        wrap(x, xx => decoShroomSil(p, xx, yAt(x) + 6, 1.2 + hash(i * 2) * 1, THEME.foliage[1]));
      }
      p.globalAlpha = 0.7;
      for (let i = 0; i < 30; i++) { // spores
        const x = hash(i * 3.93) * W;
        p.fillStyle = '#cdbaf0';
        p.beginPath(); p.arc(x, yAt(x) + 14 + hash(i * 7) * 60, 1.4, 0, TAU); p.fill();
      }
      p.globalAlpha = 1;
    }, [382, 502, 0.15]);
    build(0.66, 440, [[4, 26, 1], [9, 12, 3]], THEME.hillMid, (p, yAt, W, wrap) => {
      for (let i = 0; i < 11; i++) {
        const x = (i + 0.5) * W / 11 + hash(i * 11) * 40;
        wrap(x, xx => decoBush(p, xx, yAt(x) + 6, 0.8 + hash(i * 5) * 0.7, shade(THEME.hillMid, 0.84)));
      }
    }, [432, VH, 0.1]);
  } else if (style === 'ember') {
    build(0.12, 312, [[2, 18, 0], [5, 9, 1]], shade(THEME.hillFar, 1.12), (p, yAt, W, wrap) => {
      for (let i = 0; i < 5; i++) {
        const x = (i + 0.5) * W / 5 + hash(i * 3) * 80;
        wrap(x, xx => decoSpire(p, xx, yAt(x) + 4, 1.1 + hash(i) * 0.7, shade(THEME.hillFar, 0.9)));
      }
    }, [295, 425, 0.34]);
    build(0.25, 348, [[3, 24, 2], [7, 11, 0.5]], THEME.hillFar, (p, yAt, W, wrap) => {
      for (let i = 0; i < 7; i++) {
        const x = (i + 0.5) * W / 7 + hash(i * 3) * 50;
        wrap(x, xx => decoSpire(p, xx, yAt(x) + 5, 1 + hash(i) * 0.9, shade(THEME.hillFar, 0.82)));
      }
    }, [330, 462, 0.32]);
    build(0.45, 392, [[3, 28, 4], [8, 13, 2]], THEME.hillFar2, (p, yAt, W, wrap) => {
      for (let i = 0; i < 6; i++) {
        const x = (i + 0.5) * W / 6 + hash(i * 7) * 60;
        wrap(x, xx => decoVent(p, xx, yAt(x) + 8, 1 + hash(i * 2) * 0.8));
      }
    }, [382, 502, 0.2]);
    build(0.66, 440, [[4, 28, 1], [9, 13, 3]], THEME.hillMid, (p, yAt, W, wrap) => {
      for (let i = 0; i < 6; i++) {
        const x = (i + 0.5) * W / 6 + hash(i * 11) * 50;
        wrap(x, xx => { decoSpire(p, xx, yAt(x) + 6, 0.8 + hash(i * 5) * 0.6, shade(THEME.hillMid, 0.85)); decoVent(p, xx + 30, yAt(x) + 10, 0.8); });
      }
    }, [432, VH, 0.1]);
  } else { // sunny meadow & friends
    build(0.12, 318, [[2, 15, 0], [5, 8, 1]], shade(THEME.hillFar, 1.08), (p, yAt, W, wrap) => {
      for (let i = 0; i < 4; i++) {
        const x = (i + 0.5) * W / 4 + hash(i * 3) * 100;
        p.globalAlpha = 0.55;
        wrap(x, xx => decoCypress(p, xx, yAt(x) + 4, 0.7));
        p.globalAlpha = 1;
      }
    }, [298, 425, 0.34]);
    build(0.25, 348, [[3, 22, 2], [7, 10, 0.5]], THEME.hillFar, (p, yAt, W, wrap) => {
      for (let v = 0; v < 2; v++) { // little hilltop villages
        const vx = (v + 0.32) * W / 2;
        wrap(vx, xx => {
          decoHouse(p, xx - 26, yAt(vx - 26) + 2, 0.95, false);
          decoHouse(p, xx, yAt(vx) + 1, 1.2, true);
          decoHouse(p, xx + 26, yAt(vx + 26) + 3, 0.9, false);
          decoCypress(p, xx - 46, yAt(vx - 46) + 3, 0.85);
          decoCypress(p, xx + 44, yAt(vx + 44) + 3, 0.95);
        });
      }
      for (let i = 0; i < 6; i++) {
        const x = hash(i * 23.7) * W;
        wrap(x, xx => decoBushTree(p, xx, yAt(x) + 4, 0.7 + hash(i) * 0.4));
      }
    }, [330, 462, 0.24]);
    build(0.45, 392, [[3, 26, 4], [8, 12, 2]], THEME.hillFar2, (p, yAt, W, wrap) => {
      for (let i = 0; i < 8; i++) {
        const x = (i + 0.5) * W / 8 + hash(i * 7) * 60;
        wrap(x, xx => (hash(i * 3) > 0.35 ? decoBushTree(p, xx, yAt(x) + 6, 0.95 + hash(i * 2) * 0.6)
                                          : decoCypress(p, xx, yAt(x) + 5, 1 + hash(i * 5) * 0.4)));
      }
    }, [382, 502, 0.15]);
    build(0.66, 440, [[4, 26, 1], [9, 12, 3]], THEME.hillMid, (p, yAt, W, wrap) => {
      for (let i = 0; i < 11; i++) {
        const x = (i + 0.5) * W / 11 + hash(i * 11) * 40;
        wrap(x, xx => decoBush(p, xx, yAt(x) + 6, 0.8 + hash(i * 5) * 0.7, shade(THEME.hillMid, 0.84)));
      }
      p.globalAlpha = 0.8; // flower dots along the crest
      for (let i = 0; i < 50; i++) {
        const x = hash(i * 3.93) * W;
        p.fillStyle = THEME.flowers[i % THEME.flowers.length];
        p.beginPath(); p.arc(x, yAt(x) + 10 + hash(i * 7) * 60, 1.6, 0, TAU); p.fill();
      }
      p.globalAlpha = 1;
    }, [432, VH, 0.1]);
  }
}

// ============================================================ world drawing
function drawCloud(cx, cy, s, alpha) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.globalAlpha = alpha;
  const P = THEME.cloud;
  [[-52, 10, 17, 10], [-30, 5, 24, 14], [-6, 0, 28, 17], [20, 4, 26, 15], [46, 10, 18, 11],
   [-38, -6, 18, 11], [-18, -13, 21, 13], [6, -15, 23, 14], [28, -8, 19, 12]]
    .forEach(q2 => E(q2[0], q2[1], q2[2], q2[3], P));
  ctx.globalAlpha = alpha * 0.45;
  E(-4, 15, 44, 8, 'rgba(172,146,112,.5)');
  E(24, 13, 22, 6, 'rgba(172,146,112,.4)');
  ctx.globalAlpha = alpha * 0.85;
  E(-16, -18, 14, 8, 'rgba(255,255,253,.9)');
  E(6, -20, 15, 8.5, 'rgba(255,255,253,.85)');
  E(-34, -10, 11, 6, 'rgba(255,255,253,.7)');
  ctx.restore();
}
function drawSky() {
  ctx.fillStyle = cachedGrad('sky', () => {
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, THEME.skyTop);
    g.addColorStop(0.55, shade(THEME.skyBot, 1.06));
    g.addColorStop(1, THEME.skyBot);
    return g;
  });
  ctx.fillRect(0, 0, VW, VH);
  // soft watercolour corner washes
  [[0, 0], [VW, 0]].forEach((cc, ci) => {
    ctx.fillStyle = cachedGrad('cw' + ci, () => {
      const cw = ctx.createRadialGradient(cc[0], cc[1], 30, cc[0], cc[1], 430);
      cw.addColorStop(0, 'rgba(140,110,70,.07)'); cw.addColorStop(1, 'rgba(140,110,70,0)');
      return cw;
    });
    ctx.fillRect(cc[0] - 430, cc[1] - 430, 860, 860);
  });
  const rise = (WORLD_H - VH) - camY;
  const sx = 150 - camX * 0.02, sy = 92 + rise * 0.04;
  if (THEME.orb === 'moon') {
    for (let i = 0; i < 14; i++) { // twinkling stars
      const stx = hash(i * 7.3) * (VW + 80) - 40, sty = hash(i * 3.1) * 215;
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(simT * 2 + i * 1.7));
      ctx.fillStyle = '#fff3c8';
      starPath(stx, sty, 2.4 + hash(i) * 1.6); ctx.fill();
      ctx.restore();
    }
    ctx.save(); ctx.translate(sx, sy);
    ctx.fillStyle = cachedGrad('moonglow', () => {
      const rg = ctx.createRadialGradient(0, 0, 8, 0, 0, 130);
      rg.addColorStop(0, 'rgba(255,246,220,.4)'); rg.addColorStop(1, 'rgba(255,246,220,0)');
      return rg;
    });
    ctx.fillRect(-130, -130, 260, 260);
    ctx.restore();
    E(sx, sy, 31, 31, '#f6efdc');
    E(sx - 8, sy - 7, 24, 24, 'rgba(255,252,240,.55)');
    E(sx - 9, sy - 6, 6, 6, 'rgba(160,150,128,.25)');
    E(sx + 6, sy + 9, 4.5, 4.5, 'rgba(160,150,128,.2)');
    E(sx + 11, sy - 10, 3, 3, 'rgba(160,150,128,.2)');
    const ssK = Math.floor(simT / 7), ssT = (simT % 7) / 0.6;
    if (ssT < 1 && hash(ssK) > 0.45) { // a wishing star streaks by
      const wx2 = 180 + hash(ssK * 3) * 540 + ssT * 190, wy2 = 36 + hash(ssK * 7) * 60 + ssT * 88;
      ctx.save(); ctx.globalAlpha = Math.sin(ssT * Math.PI) * 0.85;
      ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(wx2 - 28, wy2 - 14); ctx.lineTo(wx2, wy2); ctx.stroke();
      E(wx2, wy2, 2.2, 2.2, '#fff6d8');
      ctx.restore();
    }
  } else {
    ctx.save(); ctx.translate(sx, sy);
    ctx.fillStyle = cachedGrad('sunglow', () => {
      const rg = ctx.createRadialGradient(0, 0, 10, 0, 0, 175);
      rg.addColorStop(0, 'rgba(255,222,132,.62)');
      rg.addColorStop(0.35, 'rgba(255,222,132,.28)');
      rg.addColorStop(0.7, 'rgba(255,222,132,.1)');
      rg.addColorStop(1, 'rgba(255,222,132,0)');
      return rg;
    });
    ctx.fillRect(-175, -175, 350, 350);
    ctx.restore();
    E(sx + 2, sy + 2, 46, 45, 'rgba(255,198,84,.3)');
    E(sx, sy, 39, 38, 'rgba(255,210,100,.55)');
    E(sx, sy, 33, 33, '#ffd564');
    E(sx - 5, sy - 5, 26, 25, '#ffdf84');
    E(sx - 10, sy - 10, 14, 13, 'rgba(255,246,206,.9)');
    ctx.strokeStyle = 'rgba(255,250,222,.5)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(sx - 3, sy - 3, 28, Math.PI * 0.78, Math.PI * 1.42); ctx.stroke();
    ctx.strokeStyle = 'rgba(220,160,70,.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx + 3, sy + 3, 30, Math.PI * 1.85, Math.PI * 0.4); ctx.stroke();
    // drifting light specks in the sunny air
    for (let i = 0; i < 16; i++) {
      const lx2 = hash(i * 9.1) * VW, ly2 = 30 + hash(i * 4.3) * 290;
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.22 * (0.5 + 0.5 * Math.sin(simT * 1.4 + i * 2.2));
      const r2 = 1.4 + hash(i) * 1.6;
      E(lx2, ly2, r2, r2, '#fffaf0');
      ctx.restore();
    }
  }
  for (let i = 0; i < 10; i++) { // drifting watercolour clouds
    const m = VW + 520;
    const cx = ((i * 367 + 130 - camX * 0.18 - simT * (4 + (i % 3) * 2)) % m + m) % m - 260;
    const cy = 46 + hash(i * 5) * 150 + rise * 0.08;
    const cs = 0.55 + hash(i * 9) * 0.85;
    drawCloud(cx, cy, cs, THEME.cloudA * (0.72 + hash(i * 3) * 0.28));
  }
}
function hazeBand(y0, y1, a) {
  const h = y1 - y0;
  ctx.save(); ctx.translate(0, y0);
  ctx.fillStyle = cachedGrad('haze' + h + '_' + a, () => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(' + THEME.haze + ',0)');
    g.addColorStop(0.7, 'rgba(' + THEME.haze + ',' + a + ')');
    g.addColorStop(1, 'rgba(' + THEME.haze + ',' + a * 0.85 + ')');
    return g;
  });
  ctx.fillRect(0, 0, VW, h);
  ctx.restore();
}
function lightRays() {
  if (!THEME.rays) return;
  const sx = 150 - camX * 0.02, sy = 92 + ((WORLD_H - VH) - camY) * 0.04;
  for (let i = 0; i < 3; i++) {
    const rot = 0.5 + i * 0.34 + Math.sin(simT * 0.25 + i * 2.1) * 0.05;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rot);
    ctx.fillStyle = cachedGrad('ray' + i, () => {
      const g = ctx.createLinearGradient(0, 0, 0, 560);
      g.addColorStop(0, 'rgba(' + THEME.rays + ',' + (0.09 - i * 0.018) + ')');
      g.addColorStop(1, 'rgba(' + THEME.rays + ',0)');
      return g;
    });
    ctx.beginPath();
    ctx.moveTo(-12, 10); ctx.lineTo(16, 6);
    ctx.lineTo(190 + i * 50, 600); ctx.lineTo(60 + i * 40, 620);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
function drawHills() {
  const rise = (WORLD_H - VH) - camY; // how far the camera has climbed above ground view
  for (const b of bands) {
    const W2 = b.c.width;
    let off = -((camX * b.par) % W2);
    if (off > 0) off -= W2;
    const dy = rise * b.par * 0.55; // distant layers drift down only a little
    const sx2 = -off;
    const w1 = Math.min(W2 - sx2, VW);
    ctx.drawImage(b.c, sx2, 0, w1, VH, 0, dy, w1, VH);
    if (w1 < VW) ctx.drawImage(b.c, 0, 0, VW - w1, VH, w1, dy, VW - w1, VH);
    if (b.hz) hazeBand(b.hz[0] + dy, b.hz[1] + dy, b.hz[2]);
  }
}

function drawPonds() {
  if (!pondCols) return;
  const x0 = Math.max(0, Math.floor(camX / TILE) - 1), x1 = Math.min(LW - 1, Math.ceil((camX + VW) / TILE) + 1);
  const surf = surfY();
  const pondGrad = cachedGrad('pond', () => {
    const g = ctx.createLinearGradient(0, surf, 0, WORLD_H);
    g.addColorStop(0, THEME.water);
    g.addColorStop(0.55, THEME.waterDeep);
    g.addColorStop(1, shade(THEME.waterDeep, 0.66));
    return g;
  });
  for (let tx = x0; tx <= x1; tx++) {
    if (!pondCols[tx]) continue;
    const px = tx * TILE;
    ctx.fillStyle = pondGrad;
    ctx.fillRect(px, surf, TILE, WORLD_H - surf);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillRect(px, surf + Math.sin(simT * 2 + tx) * 1.6, TILE, 2.5);
    // shimmer streaks
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 2; k++) {
      const sy2 = surf + 12 + hash(tx * 5 + k * 3) * 34;
      const sw = 10 + hash(tx + k) * 22;
      const sx2 = px + 6 + hash(tx * 2 + k) * 24 + Math.sin(simT * 1.1 + tx + k * 2) * 5;
      ctx.fillRect(sx2, sy2, sw, 1.6);
    }
    ctx.globalAlpha = 1;
    if (THEME.lily !== null && hash(tx * 3.3) > 0.55) {
      const lx = px + TILE / 2, ly = surf + 3 + Math.sin(simT * 1.4 + tx) * 1.5;
      E(lx, ly, 12, 4.5, THEME.lily || '#7fbf6a');
      if (hash(tx * 7.7) > 0.6) { E(lx + 4, ly - 3, 3, 2.6, '#f3a6b8'); E(lx + 4, ly - 4, 1.2, 1.2, '#ffe9a8'); }
    }
    // reeds and cattails on the banks
    if (!THEME.noReeds) {
      if (!pondCols[tx - 1]) drawCattail(px + 3, surf, tx);
      if (!pondCols[tx + 1]) drawCattail(px + TILE - 3, surf, tx * 1.7 + 5);
    }
  }
}
function drawCattail(x, y, seed) {
  const lean = Math.sin(simT * 1.1 + seed) * 2.2;
  ctx.strokeStyle = shade(THEME.grassDark, 0.9); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + 6); ctx.quadraticCurveTo(x + lean * 0.5, y - 12, x + lean, y - 27);
  ctx.moveTo(x - 5, y + 6); ctx.quadraticCurveTo(x - 5 + lean * 0.4, y - 4, x - 8 + lean, y - 15);
  ctx.moveTo(x + 5, y + 6); ctx.quadraticCurveTo(x + 5 + lean * 0.4, y - 2, x + 9 + lean, y - 11);
  ctx.stroke();
  ctx.fillStyle = '#7a5238';
  RR(x + lean - 2.5, y - 31, 5, 11, 2.5); ctx.fill();
}

function drawTiles() {
  const x0 = Math.max(0, Math.floor(camX / TILE) - 1), x1 = Math.min(LW - 1, Math.ceil((camX + VW) / TILE) + 1);
  const y0 = Math.max(0, Math.floor(camY / TILE) - 1), y1 = Math.min(LH - 1, Math.ceil((camY + VH) / TILE) + 1);
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      if (!S(tx, ty)) continue;
      const px = tx * TILE, py = ty * TILE;
      ctx.fillStyle = soilPat || THEME.soil;
      ctx.fillRect(px - 0.6, py - 0.6, TILE + 1.2, TILE + 1.2);
      if (!S(tx - 1, ty)) { ctx.fillStyle = 'rgba(90,55,30,.18)'; ctx.fillRect(px, py, 3, TILE); }
      if (!S(tx + 1, ty)) { ctx.fillStyle = 'rgba(90,55,30,.18)'; ctx.fillRect(px + TILE - 3, py, 3, TILE); }
      if (!S(tx, ty - 1)) {
        // lush mossy cap from the pre-painted strip
        if (grassStrip) {
          ctx.drawImage(grassStrip, (((tx % 4) + 4) % 4) * TILE, 0, TILE, 46, px, py - 8, TILE, 46);
        } else {
          ctx.fillStyle = THEME.grass;
          RR(px - 2, py - 3, TILE + 4, 15, 6); ctx.fill();
        }
        // blades
        ctx.strokeStyle = THEME.grassDark; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const gx = px + 4 + k * 13 + hash(tx * 5 + k * 3) * 8;
          const ln = 7 + hash(tx * 7 + k) * 7;
          const sway = Math.sin(simT * 1.8 + tx + k) * 1.5;
          ctx.moveTo(gx, py - 2); ctx.quadraticCurveTo(gx + sway, py - 2 - ln * 0.55, gx + sway * 1.6, py - 2 - ln);
        }
        ctx.stroke();
        // painterly tuft clumps
        const th2 = hash(tx * 9.31);
        if (th2 > 0.55) {
          ctx.strokeStyle = th2 > 0.8 ? shade(THEME.grassDark, 0.85) : shade(THEME.grass, 1.12);
          ctx.lineWidth = 2;
          ctx.beginPath();
          const bx2 = px + 10 + th2 * 28;
          for (let k = 0; k < 5; k++) {
            const aa = -2 + k * 0.42;
            const len = 9 + hash(tx * 13 + k) * 9;
            const sway = Math.sin(simT * 1.7 + tx * 1.3 + k) * 1.6;
            ctx.moveTo(bx2, py + 2);
            ctx.quadraticCurveTo(bx2 + Math.cos(aa) * len * 0.5, py + 2 + Math.sin(aa) * len * 0.6,
                                 bx2 + Math.cos(aa) * len + sway, py + 2 + Math.sin(aa) * len);
          }
          ctx.stroke();
        }
        // little flowers
        const fh = hash(tx * 11.3);
        if (fh > 0.55) {
          const drawBloom = (fx, fy, sc, kind, fc) => {
            const swayF = Math.sin(simT * 1.6 + fx * 0.13) * 1.4 * sc;
            ctx.strokeStyle = THEME.grassDark; ctx.lineWidth = 1.4 * sc; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(fx, py - 1); ctx.quadraticCurveTo(fx + swayF * 0.5, (py - 1 + fy) / 2, fx + swayF, fy + 3 * sc);
            ctx.stroke();
            E(fx + swayF * 0.55 + 2.5 * sc, (py + fy) / 2, 2.4 * sc, 1.2 * sc, THEME.grassDark, 0.7); // leaf
            const bx = fx + swayF, by = fy;
            if (kind === 0) { // daisy
              for (let p6 = 0; p6 < 6; p6++) {
                const ang = p6 / 6 * TAU + fh;
                ctx.save(); ctx.translate(bx + Math.cos(ang) * 3.2 * sc, by + Math.sin(ang) * 3.2 * sc); ctx.rotate(ang);
                ctx.fillStyle = '#fffdf4';
                ctx.beginPath(); ctx.ellipse(0, 0, 2.6 * sc, 1.5 * sc, 0, 0, TAU); ctx.fill();
                ctx.restore();
              }
              E(bx, by, 1.9 * sc, 1.9 * sc, '#f3c93c');
            } else if (kind === 1) { // round bloom
              for (let p5 = 0; p5 < 5; p5++) {
                const ang = TAU * p5 / 5 + fh * 3;
                E(bx + Math.cos(ang) * 3.3 * sc, by + Math.sin(ang) * 3.3 * sc, 2.4 * sc, 2.4 * sc, fc);
              }
              E(bx, by, 2 * sc, 2 * sc, '#ffd35e');
              E(bx - 0.7 * sc, by - 0.7 * sc, 0.8 * sc, 0.8 * sc, 'rgba(255,255,255,.6)');
            } else { // little bell
              ctx.fillStyle = fc;
              ctx.beginPath();
              ctx.moveTo(bx - 2.6 * sc, by - 1.5 * sc);
              ctx.quadraticCurveTo(bx, by - 4.5 * sc, bx + 2.6 * sc, by - 1.5 * sc);
              ctx.quadraticCurveTo(bx + 2.8 * sc, by + 2 * sc, bx + 1.4 * sc, by + 2.2 * sc);
              ctx.lineTo(bx - 1.4 * sc, by + 2.2 * sc);
              ctx.quadraticCurveTo(bx - 2.8 * sc, by + 2 * sc, bx - 2.6 * sc, by - 1.5 * sc);
              ctx.closePath(); ctx.fill();
              E(bx, by + 2.6 * sc, 1 * sc, 1 * sc, '#ffd35e');
            }
          };
          const fc = THEME.flowers[Math.floor(fh * 17) % THEME.flowers.length];
          drawBloom(px + 8 + fh * 26, py - 9 - fh * 3, 1, Math.floor(fh * 23) % 3, fc);
          if (fh > 0.85) {
            const fc2 = THEME.flowers[Math.floor(fh * 29) % THEME.flowers.length];
            drawBloom(px + 30 + fh * 10, py - 7, 0.75, Math.floor(fh * 31) % 3, fc2);
          }
        }
      }
    }
  }
}

function platShape(p, i) {
  const w = p.w;
  {
    if (p.k === 'log') {
      ctx.fillStyle = '#8a6242'; RR(p.x, p.y + 2, w, 16, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(60,38,22,.45)'; ctx.lineWidth = 2; RR(p.x, p.y + 2, w, 16, 8); ctx.stroke();
      ctx.strokeStyle = 'rgba(50,32,18,.32)'; ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(p.x + 8, p.y + 8); ctx.quadraticCurveTo(p.x + w / 2, p.y + 10, p.x + w - 12, p.y + 8);
      ctx.moveTo(p.x + 12, p.y + 14); ctx.quadraticCurveTo(p.x + w / 2, p.y + 15.5, p.x + w - 16, p.y + 13.5);
      ctx.stroke();
      E(p.x + w - 7, p.y + 10, 6.5, 7.5, '#a87c54');
      ctx.strokeStyle = 'rgba(60,38,22,.4)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(p.x + w - 7, p.y + 10, 3.6, 4.2, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = shade(THEME.grass, 0.95);
      RR(p.x + 2, p.y - 3, w - 4, 8, 4); ctx.fill();
      ctx.fillStyle = shade(THEME.grassDark, 0.95);
      for (let k2 = 0; k2 < Math.floor(w / 16); k2++) {
        ctx.beginPath(); ctx.ellipse(p.x + 10 + k2 * 16, p.y + 5, 4, 2.8, 0, 0, Math.PI); ctx.fill();
      }
    } else if (p.k === 'cloud') {
      ctx.save(); ctx.globalAlpha = 0.96;
      const n = Math.max(3, Math.round(w / 26));
      for (let k2 = 0; k2 < n; k2++) {
        E(p.x + (k2 + 0.5) * (w / n), p.y + 8, (w / n) * 0.78, 11, '#f6f2e8');
      }
      E(p.x + w * 0.3, p.y + 1, w * 0.2, 8, '#fffdf8');
      E(p.x + w * 0.68, p.y + 2, w * 0.18, 7, '#fffdf8');
      ctx.globalAlpha = 0.4;
      E(p.x + w / 2, p.y + 16, w * 0.42, 5, 'rgba(120,115,150,.55)');
      ctx.restore();
      if (hash(i * 3.7) > 0.5) {
        ctx.save(); ctx.globalAlpha = 0.6 + Math.sin(simT * 3 + i) * 0.3;
        ctx.fillStyle = '#fff3c0'; starPath(p.x + w - 8, p.y - 6, 3.4); ctx.fill();
        ctx.restore();
      }
    } else if (p.k === 'leaf') {
      ctx.fillStyle = shade(THEME.grass, 1.05);
      ctx.beginPath();
      ctx.moveTo(p.x - 4, p.y + 8);
      ctx.quadraticCurveTo(p.x + w * 0.3, p.y - 5, p.x + w + 6, p.y + 4);
      ctx.quadraticCurveTo(p.x + w * 0.55, p.y + 19, p.x - 4, p.y + 8);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = shade(THEME.grassDark, 0.8, 0.7); ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = shade(THEME.grassDark, 0.85, 0.8); ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x - 2, p.y + 8); ctx.quadraticCurveTo(p.x + w / 2, p.y + 4, p.x + w + 4, p.y + 4.5);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k2 = 1; k2 < 5; k2++) {
        const vx2 = p.x + (w / 5) * k2;
        ctx.moveTo(vx2, p.y + 6 - k2 * 0.3); ctx.lineTo(vx2 + 8, p.y - 1 + k2 * 0.4);
      }
      ctx.stroke();
      E(p.x + w * 0.5, p.y + 2, 3, 1.6, 'rgba(255,255,235,.35)', -0.15);
    } else if (p.k === 'ice') {
      ctx.fillStyle = '#cfe8f6'; RR(p.x, p.y, w, 15, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(110,150,180,.55)'; ctx.lineWidth = 2; RR(p.x, p.y, w, 15, 5); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x + 8, p.y + 11); ctx.lineTo(p.x + 22, p.y + 4);
      ctx.moveTo(p.x + w * 0.5, p.y + 12); ctx.lineTo(p.x + w * 0.5 + 16, p.y + 4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(225,242,252,.95)';
      [0.22, 0.55, 0.82].forEach((fx, k2) => {
        const ix = p.x + w * fx;
        ctx.beginPath();
        ctx.moveTo(ix - 4, p.y + 14); ctx.lineTo(ix, p.y + 25 + k2 * 4); ctx.lineTo(ix + 4, p.y + 14);
        ctx.closePath(); ctx.fill();
      });
      ctx.fillStyle = '#ffffff'; RR(p.x + 2, p.y - 3, w - 4, 7, 3.5); ctx.fill();
    } else if (p.k === 'stone') {
      ctx.fillStyle = shade(THEME.soilDark, 1.3); RR(p.x, p.y, w, 17, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(40,26,16,.5)'; ctx.lineWidth = 2; RR(p.x, p.y, w, 17, 6); ctx.stroke();
      ctx.fillStyle = shade(THEME.soilDark, 1.5);
      RR(p.x + 3, p.y + 2, w - 6, 5, 2.5); ctx.fill();
      ctx.strokeStyle = 'rgba(40,26,16,.4)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x + w * 0.3, p.y + 6); ctx.lineTo(p.x + w * 0.36, p.y + 13);
      ctx.moveTo(p.x + w * 0.7, p.y + 4); ctx.lineTo(p.x + w * 0.62, p.y + 12);
      ctx.stroke();
      ctx.strokeStyle = THEME.grassDark; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x + 6, p.y); ctx.lineTo(p.x + 4, p.y - 6);
      ctx.moveTo(p.x + 10, p.y); ctx.lineTo(p.x + 10, p.y - 5);
      ctx.moveTo(p.x + w - 8, p.y); ctx.lineTo(p.x + w - 6, p.y - 6);
      ctx.stroke();
    } else if (p.k === 'drift') {
      ctx.fillStyle = '#dcc9a4'; RR(p.x, p.y + 1, w, 14, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(120,95,60,.5)'; ctx.lineWidth = 1.8; RR(p.x, p.y + 1, w, 14, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(150,120,80,.45)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x + 6, p.y + 6); ctx.quadraticCurveTo(p.x + w / 2, p.y + 8.5, p.x + w - 8, p.y + 5.5);
      ctx.moveTo(p.x + 10, p.y + 11); ctx.quadraticCurveTo(p.x + w / 2, p.y + 12.5, p.x + w - 12, p.y + 10.5);
      ctx.stroke();
      E(p.x + w * 0.3, p.y + 8, 2.6, 3.2, 'rgba(140,110,70,.5)');
      E(p.x + w * 0.72, p.y + 7, 2.2, 2.8, 'rgba(140,110,70,.45)');
    } else if (p.k === 'cap') {
      ctx.fillStyle = '#e2d8c8'; RR(p.x + w / 2 - 7, p.y + 10, 14, 18, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(86,60,40,.35)'; ctx.lineWidth = 1.6; RR(p.x + w / 2 - 7, p.y + 10, 14, 18, 5); ctx.stroke();
      const capCol = THEME.tree === 'shroom' ? THEME.foliage[1] : '#c46a52';
      ctx.fillStyle = capCol;
      ctx.beginPath();
      ctx.moveTo(p.x - 3, p.y + 12);
      ctx.quadraticCurveTo(p.x + w * 0.5, p.y - 9, p.x + w + 3, p.y + 12);
      ctx.quadraticCurveTo(p.x + w * 0.5, p.y + 17, p.x - 3, p.y + 12);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,35,40,.4)'; ctx.lineWidth = 2; ctx.stroke();
      E(p.x + w * 0.28, p.y + 3, 4, 2.6, 'rgba(255,245,235,.8)');
      E(p.x + w * 0.62, p.y + 1, 3.2, 2.2, 'rgba(255,245,235,.7)');
      E(p.x + w * 0.45, p.y - 2, 5, 2.6, shade(capCol, 1.25));
    } else {
      // the classic storybook book stack
      const c2 = PAL.bookCols[(i + 2) % PAL.bookCols.length];
      ctx.fillStyle = c2; RR(p.x + 5, p.y + 16, w - 10, 14, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(86,60,40,.3)'; ctx.lineWidth = 2; RR(p.x + 5, p.y + 16, w - 10, 14, 5); ctx.stroke();
      ctx.fillStyle = 'rgba(255,250,235,.85)'; RR(p.x + 9, p.y + 19, w - 24, 8, 3); ctx.fill();
      ctx.fillStyle = p.c; RR(p.x, p.y, w, 16, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(86,60,40,.4)'; ctx.lineWidth = 2; RR(p.x, p.y, w, 16, 6); ctx.stroke();
      ctx.fillStyle = 'rgba(255,250,235,.95)'; RR(p.x + 8, p.y + 3, w - 14, 10, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(120,90,60,.35)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x + 10, p.y + 6.5); ctx.lineTo(p.x + w - 9, p.y + 6.5);
      ctx.moveTo(p.x + 10, p.y + 10); ctx.lineTo(p.x + w - 9, p.y + 10);
      ctx.stroke();
      ctx.fillStyle = 'rgba(86,60,40,.25)'; RR(p.x, p.y, 7, 16, 4); ctx.fill();
      ctx.fillStyle = '#d23b2f';
      ctx.beginPath();
      ctx.moveTo(p.x + w - 18, p.y + 14); ctx.lineTo(p.x + w - 18, p.y + 30);
      ctx.lineTo(p.x + w - 13, p.y + 25); ctx.lineTo(p.x + w - 8, p.y + 30);
      ctx.lineTo(p.x + w - 8, p.y + 14);
      ctx.closePath(); ctx.fill();
    }
  }
}
function drawBooks() {
  platforms.forEach((p, i) => {
    if (p.x + p.w < camX - 40 || p.x > camX + VW + 40) return;
    ctx.save();
    ctx.translate(0, Math.sin(simT * 1.3 + i * 2) * 1.5);
    ctx.globalAlpha = 0.18; E(p.x + p.w / 2, p.y + 38, p.w * 0.42, 6, '#4a3120'); ctx.globalAlpha = 1;
    platShape(p, i);
    ctx.restore();
  });
  // moving platforms (drawn with the same biome shapes)
  movers.forEach((m, i) => {
    if (m.x + m.w < camX - 80 || m.x > camX + VW + 80) return;
    ctx.save();
    ctx.globalAlpha = 0.18; E(m.x + m.w / 2, m.y + 38, m.w * 0.42, 6, '#4a3120'); ctx.globalAlpha = 1;
    platShape(m, i + 40);
    ctx.restore();
  });
  // crumbling platforms
  crumbs.forEach((cb, i) => {
    if (cb.state === 'gone') return;
    if (cb.x + cb.w < camX - 40 || cb.x > camX + VW + 40) return;
    ctx.save();
    if (cb.state === 'shake') {
      ctx.translate(Math.sin(simT * 55 + i) * 2.2, Math.sin(simT * 47) * 1.4 + cb.t * 5);
      ctx.globalAlpha = 1 - cb.t * 0.5;
    }
    if (cb.k === 'pages') {
      // a loose sheaf of pages
      ctx.fillStyle = '#f3e8cf'; RR(cb.x + 2, cb.y + 5, cb.w - 4, 9, 3); ctx.fill();
      ctx.fillStyle = '#faf2de'; RR(cb.x, cb.y, cb.w, 11, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(120,90,60,.45)'; ctx.lineWidth = 1.6; RR(cb.x, cb.y, cb.w, 11, 4); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,90,60,.3)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cb.x + 8, cb.y + 4); ctx.lineTo(cb.x + cb.w - 8, cb.y + 4);
      ctx.moveTo(cb.x + 8, cb.y + 7.5); ctx.lineTo(cb.x + cb.w - 12, cb.y + 7.5);
      ctx.stroke();
    } else {
      platShape(cb, i + 80);
    }
    if (cb.state === 'shake') { // cracks
      ctx.strokeStyle = 'rgba(60,40,30,.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cb.x + cb.w * 0.3, cb.y); ctx.lineTo(cb.x + cb.w * 0.38, cb.y + 9);
      ctx.moveTo(cb.x + cb.w * 0.7, cb.y + 2); ctx.lineTo(cb.x + cb.w * 0.6, cb.y + 12);
      ctx.stroke();
    }
    ctx.restore();
  });
  // pulse platforms — glow shelves that blink to a beat
  pulses.forEach((pu, i) => {
    if (pu.x + pu.w < camX - 40 || pu.x > camX + VW + 40) return;
    const k = (simT / pu.period + pu.phase) % 1;
    const on = k < 0.55;
    let a;
    if (on) {
      a = Math.min(1, k / 0.07);
      if (k > 0.43) a = 0.45 + 0.55 * Math.abs(Math.sin(k * 60)); // warning flicker
    } else {
      a = 0.12; // faint ghost so you can plan
    }
    const glowCol = THEME.orb === 'moon' ? '#cdaaf0' : '#ffe9a0';
    ctx.save();
    ctx.globalAlpha = a * 0.5;
    E(pu.x + pu.w / 2, pu.y + 7, pu.w * 0.62, 16, glowCol);
    ctx.globalAlpha = a;
    ctx.fillStyle = on ? '#fdf6e2' : '#d8cdb8';
    RR(pu.x, pu.y, pu.w, 13, 6); ctx.fill();
    ctx.strokeStyle = shade('#9a6fb8', 1, 0.6); ctx.lineWidth = 2;
    RR(pu.x, pu.y, pu.w, 13, 6); ctx.stroke();
    for (let d = 0; d < 3; d++) {
      E(pu.x + pu.w * (0.25 + d * 0.25), pu.y + 6.5, 2.4, 2.4, glowCol);
    }
    ctx.restore();
  });
}

function drawGeysers() {
  const base = WORLD_H - 64;
  geysers.forEach(g => {
    if (g.x < camX - 80 || g.x > camX + VW + 80) return;
    // vent stones
    E(g.x - 8, base + 4, 10, 6, shade(THEME.soilDark, 1.2));
    E(g.x + 8, base + 5, 8, 5, shade(THEME.soilDark, 1.05));
    if (g.h > 0) {
      const top = base - g.h;
      const wob = Math.sin(simT * 22) * 3;
      ctx.save();
      ctx.globalAlpha = 0.85;
      const gg = ctx.createLinearGradient(0, top, 0, base);
      gg.addColorStop(0, shade(THEME.water, 1.15, 0.25));
      gg.addColorStop(0.4, THEME.water);
      gg.addColorStop(1, THEME.waterDeep);
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.moveTo(g.x - 13, base);
      ctx.quadraticCurveTo(g.x - 16 - wob, (top + base) / 2, g.x - 9, top + 8);
      ctx.quadraticCurveTo(g.x, top - 8, g.x + 9, top + 8);
      ctx.quadraticCurveTo(g.x + 16 + wob, (top + base) / 2, g.x + 13, base);
      ctx.closePath(); ctx.fill();
      E(g.x, top + 2, 16, 8, shade(THEME.water, 1.25, 0.85));
      ctx.restore();
      if (Math.random() < 0.4) {
        spawnParts(g.x + (Math.random() - 0.5) * 20, top + 6, 'splash', 1, { speed: 90, life: 0.4, color: THEME.water });
      }
    }
  });
}

function drawWindZones() {
  winds.forEach((wz, i) => {
    if (wz.x + wz.w < camX - 60 || wz.x > camX + VW + 60) return;
    if (wz.sand) {
      // soft sand: rippled overlay on the ground band
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = shade(THEME.soil, 1.18);
      RR(wz.x, wz.y + wz.h - 14, wz.w, 12, 6); ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = shade(THEME.soilDark, 1.1, 0.5); ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = wz.x + 6; x < wz.x + wz.w - 6; x += 22) {
        ctx.moveTo(x, wz.y + wz.h - 7);
        ctx.quadraticCurveTo(x + 7, wz.y + wz.h - 11, x + 14, wz.y + wz.h - 7);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let s2 = 0; s2 < 8; s2++) {
      if (wz.fy) { // updraft: rising streaks
        const ux = wz.x + (s2 + 0.5) * (wz.w / 8) + Math.sin(simT * 2 + s2) * 5;
        const uy = wz.y + wz.h - ((simT * 90 + s2 * 67) % wz.h);
        ctx.moveTo(ux, uy); ctx.quadraticCurveTo(ux + 4, uy - 9, ux, uy - 17);
      } else { // gust: horizontal streaks
        const dirW = Math.sign(wz.fx) || 1;
        const ux = wz.x + ((simT * 130 + s2 * 97) % wz.w);
        const uy = wz.y + (s2 + 0.5) * (wz.h / 8);
        ctx.moveTo(ux, uy); ctx.quadraticCurveTo(ux + 10 * dirW, uy - 2, ux + 20 * dirW, uy);
      }
    }
    ctx.stroke();
    ctx.restore();
  });
}

function drawRollers() {
  rollers.forEach(ro => {
    if (ro.x < camX - 80 || ro.x > camX + VW + 80) return;
    ctx.save();
    ctx.translate(ro.x, ro.y - ro.r);
    ctx.rotate(ro.rot);
    if (ro.kind === 'snow') {
      E(0, 0, ro.r, ro.r, '#f4f8fb');
      ctx.strokeStyle = 'rgba(150,175,200,.5)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, ro.r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(150,175,200,.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-ro.r * 0.25, 0, ro.r * 0.55, 0.4, 2.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(ro.r * 0.2, ro.r * 0.15, ro.r * 0.34, 2.6, 4.9); ctx.stroke();
      E(-ro.r * 0.3, -ro.r * 0.35, ro.r * 0.3, ro.r * 0.2, 'rgba(255,255,255,.85)');
    } else {
      ctx.strokeStyle = '#a07c4a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let a = 0; a < 5; a++) {
        ctx.beginPath();
        ctx.arc(0, 0, ro.r * (0.45 + a * 0.14), a * 1.7, a * 1.7 + 4.2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(120,90,50,.7)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 0, ro.r * 0.8, 1, 5.5); ctx.stroke();
    }
    ctx.restore();
    if (ro.kind === 'snow' && Math.random() < 0.3) {
      spawnParts(ro.x - 20, ro.y - 4, 'puff', 1, { speed: 40, life: 0.4, color: '#eef4f8' });
    }
  });
}

function drawApples() {
  apples.forEach(ap => {
    if (ap.x < camX - 40 || ap.x > camX + VW + 40) return;
    ctx.save();
    ctx.translate(ap.x, ap.y);
    ctx.rotate(Math.sin(ap.rot) * 0.4);
    ctx.strokeStyle = 'rgba(70,45,22,.7)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(1, -10); ctx.stroke();
    E(3.6, -8.5, 3, 1.7, '#8fbc68', 0.5);
    const ag = ctx.createRadialGradient(-2, -2, 1, 0, 0, 7);
    ag.addColorStop(0, '#e8806f'); ag.addColorStop(1, '#c0392e');
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(86,40,30,.4)'; ctx.lineWidth = 1; ctx.stroke();
    E(-2, -2.6, 1.8, 1.2, 'rgba(255,255,255,.7)', -0.6);
    ctx.restore();
  });
}

function drawMushrooms() {
  mushrooms.forEach(m => {
    if (m.x < camX - 80 || m.x > camX + VW + 80) return;
    const sq = m.squish * 0.45;
    const baseY = m.capY + 36;
    if (THEME.spring === 'flower') {
      // bouncy daisy trampoline
      ctx.strokeStyle = shade(THEME.grassDark, 0.95); ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(m.x, baseY); ctx.quadraticCurveTo(m.x + 3, baseY - 14, m.x, baseY - 22); ctx.stroke();
      E(m.x - 7, baseY - 12, 6, 3, shade(THEME.grass, 0.95), 0.5);
      E(m.x + 8, baseY - 16, 6, 3, shade(THEME.grass, 0.95), -0.5);
      ctx.save();
      ctx.translate(m.x, baseY - 24);
      ctx.scale(1 + sq * 0.5, 1 - sq);
      for (let p5 = 0; p5 < 8; p5++) {
        const a = p5 / 8 * TAU + 0.3;
        ctx.save(); ctx.translate(Math.cos(a) * 17, Math.sin(a) * 7 - 3); ctx.rotate(a);
        ctx.fillStyle = '#fffdf4';
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 5.5, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(86,60,40,.25)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.restore();
      }
      E(0, -3, 11, 7, '#f3c93c');
      E(-3, -5, 4, 2.4, 'rgba(255,255,255,.55)');
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#f3e6c8';
    RR(m.x - 9, baseY - 26, 18, 26, 7); ctx.fill();
    ctx.save();
    ctx.translate(m.x, baseY - 24);
    ctx.scale(1 + sq * 0.5, 1 - sq);
    ctx.fillStyle = '#e25d52';
    ctx.beginPath(); ctx.ellipse(0, -4, 27, 15, 0, Math.PI, 0); ctx.lineTo(27, -2); ctx.quadraticCurveTo(0, 6, -27, -2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(86,60,40,.3)'; ctx.lineWidth = 2; ctx.stroke();
    E(-11, -9, 4.5, 3.5, '#fff3e0'); E(6, -13, 3.8, 3, '#fff3e0'); E(16, -6, 3, 2.4, '#fff3e0');
    ctx.restore();
  });
}

function drawTreesAndFences() {
  SPEC.tree.forEach(tr => {
    if (tr.x < camX - 200 || tr.x > camX + VW + 200) return;
    const s = tr.s;
    ctx.save(); ctx.translate(tr.x, tr.y); ctx.scale(s, s);
    if (THEME.tree === 'pine') {
      // tall dusky pine
      ctx.fillStyle = '#6e4f34'; RR(-5.5, -32, 11, 34, 4); ctx.fill();
      const tri = (baseY, w, h, col) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-w / 2, baseY); ctx.quadraticCurveTo(0, baseY - h * 0.25, 0, baseY - h);
        ctx.quadraticCurveTo(0, baseY - h * 0.25, w / 2, baseY);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(30,45,35,.3)'; ctx.lineWidth = 2; ctx.stroke();
      };
      tri(-26, 64, 44, THEME.foliage[2]);
      tri(-52, 52, 42, THEME.foliage[1]);
      tri(-78, 40, 40, THEME.foliage[0]);
      if (THEME.snow) {
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-14, -84); ctx.lineTo(0, -116); ctx.lineTo(14, -84);
        ctx.moveTo(-17, -58); ctx.lineTo(0, -91);
        ctx.moveTo(-21, -32); ctx.lineTo(-4, -64);
        ctx.stroke();
      }
      if (hash(tr.x) > 0.5) { // little toadstool at the base
        ctx.fillStyle = '#f3e6c8'; RR(16, -10, 6, 10, 3); ctx.fill();
        E(19, -11, 8, 5, '#d9534c'); E(16, -13, 1.8, 1.4, '#fff3e0'); E(22, -12, 1.5, 1.2, '#fff3e0');
      }
    } else if (THEME.tree === 'cactus') {
      // friendly saguaro
      ctx.fillStyle = '#7fae6a';
      ctx.strokeStyle = 'rgba(60,90,50,.4)'; ctx.lineWidth = 2;
      RR(-9, -82, 18, 84, 9); ctx.fill(); ctx.stroke();
      RR(-26, -56, 9, 26, 4.5); ctx.fill(); ctx.stroke();   // left arm
      RR(-26, -36, 19, 9, 4.5); ctx.fill();
      RR(17, -64, 9, 30, 4.5); ctx.fill(); ctx.stroke();    // right arm
      RR(8, -42, 18, 9, 4.5); ctx.fill();
      ctx.strokeStyle = 'rgba(70,110,60,.35)'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-4, -6); ctx.lineTo(-4, -74);
      ctx.moveTo(2, -6); ctx.lineTo(2, -76);
      ctx.stroke();
      E(0, -84, 4.5, 4, '#e86a8a'); E(0, -85.5, 1.8, 1.6, '#f8e08e'); // desert bloom
    } else if (THEME.tree === 'palm') {
      const swayP = Math.sin(simT * 0.8 + tr.x) * 2;
      ctx.strokeStyle = '#a07848'; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(8, -40, 22 + swayP, -76); ctx.stroke();
      ctx.strokeStyle = 'rgba(60,38,22,.3)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 1; k < 5; k++) {
        const tt = k / 5;
        const bx2 = tt * tt * (22 + swayP) + 2 * tt * (1 - tt) * 8, by2 = -tt * 76 + (1 - tt) * 0 - 2 * tt * (1 - tt) * 2;
        ctx.moveTo(bx2 - 4, by2); ctx.lineTo(bx2 + 4, by2);
      }
      ctx.stroke();
      ctx.strokeStyle = '#5e9c55'; ctx.lineWidth = 5;
      for (let k = 0; k < 6; k++) {
        const a = -2.8 + k * 0.5;
        const fx = 22 + swayP, fy = -76;
        ctx.beginPath(); ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(fx + Math.cos(a) * 24, fy + Math.sin(a) * 18,
          fx + Math.cos(a) * 46, fy + Math.sin(a) * 30 + 14);
        ctx.stroke();
      }
      ctx.strokeStyle = '#4f8a48'; ctx.lineWidth = 3;
      for (let k = 0; k < 6; k++) {
        const a = -2.8 + k * 0.5;
        const fx = 22 + swayP, fy = -76;
        ctx.beginPath(); ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(fx + Math.cos(a) * 22, fy + Math.sin(a) * 16,
          fx + Math.cos(a) * 42, fy + Math.sin(a) * 28 + 16);
        ctx.stroke();
      }
      E(17 + swayP, -71, 4.5, 4.5, '#7a5a38'); E(27 + swayP, -69, 4.5, 4.5, '#6b4d30');
    } else if (THEME.tree === 'shroom') {
      // giant glowing toadstool
      const pulse = 0.75 + Math.sin(simT * 1.6 + tr.x) * 0.25;
      ctx.save(); ctx.globalAlpha = pulse;
      ctx.fillStyle = cachedGrad('shroomGlow', () => {
        const rg2 = ctx.createRadialGradient(0, -66, 8, 0, -66, 70);
        rg2.addColorStop(0, 'rgba(196,160,240,.22)');
        rg2.addColorStop(1, 'rgba(196,160,240,0)');
        return rg2;
      });
      ctx.fillRect(-70, -136, 140, 140);
      ctx.restore();
      ctx.fillStyle = '#e2d8c8';
      ctx.beginPath();
      ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-5, -30, -6, -58);
      ctx.lineTo(6, -58); ctx.quadraticCurveTo(5, -30, 8, 0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(86,60,40,.3)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = THEME.foliage[1];
      ctx.beginPath(); ctx.ellipse(0, -58, 40, 27, 0, Math.PI, 0);
      ctx.quadraticCurveTo(20, -50, 0, -50); ctx.quadraticCurveTo(-20, -50, -40, -58);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,40,70,.35)'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = THEME.foliage[2];
      ctx.beginPath(); ctx.ellipse(-8, -70, 22, 12, -0.15, 0, TAU); ctx.fill();
      [[-22, -66, 5], [4, -74, 4], [20, -64, 3.4]].forEach(sp => {
        E(sp[0], sp[1], sp[2], sp[2] * 0.8, 'rgba(245,235,255,.75)');
      });
      E(-14, -52, 2, 2, 'rgba(245,235,255,' + 0.8 * pulse + ')');
      E(16, -54, 1.7, 1.7, 'rgba(245,235,255,' + 0.7 * pulse + ')');
    } else if (THEME.tree === 'dead') {
      // bare gnarled tree with a last ember leaf
      ctx.strokeStyle = '#4a3430'; ctx.lineCap = 'round';
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.quadraticCurveTo(-4, -28, 2, -52); ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(2, -52); ctx.quadraticCurveTo(10, -66, 24, -72);
      ctx.moveTo(2, -52); ctx.quadraticCurveTo(-10, -64, -18, -78);
      ctx.moveTo(0, -34); ctx.quadraticCurveTo(12, -42, 20, -42);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(24, -72); ctx.lineTo(32, -80);
      ctx.moveTo(24, -72); ctx.lineTo(30, -68);
      ctx.moveTo(-18, -78); ctx.lineTo(-26, -84);
      ctx.moveTo(-18, -78); ctx.lineTo(-12, -88);
      ctx.stroke();
      const gl = 0.6 + Math.sin(simT * 2.2 + tr.x) * 0.4;
      E(31, -79, 3, 1.8, 'rgba(255,150,80,' + (0.5 + gl * 0.4) + ')', 0.5);
    } else {
      // the apple / blossom tree — full storybook treatment
      const sway = Math.sin(simT * 0.9 + tr.x) * 2;
      const f0 = THEME.foliage[0], f1 = THEME.foliage[1], f2 = THEME.foliage[2];
      // soft ground shadow
      ctx.save(); ctx.globalAlpha = 0.13;
      E(2, 1, 42, 7, '#4a3120');
      ctx.restore();
      // trunk with flare, taper, bark
      ctx.fillStyle = cachedGrad('trunk', () => {
        const tg = ctx.createLinearGradient(-10, 0, 12, 0);
        tg.addColorStop(0, '#8a6442'); tg.addColorStop(0.5, '#7a5638'); tg.addColorStop(1, '#5e4028');
        return tg;
      });
      ctx.beginPath();
      ctx.moveTo(-10, 1); ctx.quadraticCurveTo(-5, -28, -5, -56);
      ctx.quadraticCurveTo(-2, -66, 6, -70);
      ctx.lineTo(7, -62); ctx.quadraticCurveTo(5, -34, 10, 1);
      ctx.quadraticCurveTo(15, 2, 18, 5); ctx.lineTo(-18, 5); ctx.quadraticCurveTo(-15, 2, -10, 1);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(48,30,16,.45)'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.strokeStyle = 'rgba(46,28,14,.4)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-4, -6); ctx.quadraticCurveTo(-2, -30, -2.5, -52);
      ctx.moveTo(3.5, -12); ctx.quadraticCurveTo(5, -34, 3.5, -56);
      ctx.moveTo(-8, -2); ctx.quadraticCurveTo(-7, -14, -6, -22);
      ctx.stroke();
      E(1, -34, 2.6, 4, 'rgba(46,28,14,.35)'); // knot
      // cauliflower canopy: deep shadow core, mid clusters, sunlit tops
      const puffs = (cx2, cy2, r, col) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        for (let k2 = 0; k2 < 7; k2++) {
          const ang = k2 / 7 * TAU + cx2;
          const px3 = cx2 + Math.cos(ang) * r * 0.55, py3 = cy2 + Math.sin(ang) * r * 0.45;
          ctx.moveTo(px3 + r * 0.52, py3);
          ctx.arc(px3, py3, r * 0.52, 0, TAU);
        }
        ctx.moveTo(cx2 + r * 0.62, cy2); ctx.arc(cx2, cy2, r * 0.62, 0, TAU);
        ctx.fill();
      };
      puffs(sway * 0.4, -84, 44, shade(f0, 0.82));
      puffs(sway * 0.4 - 25, -90, 30, f0);
      puffs(sway * 0.5 + 24, -92, 30, shade(f1, 0.94));
      puffs(sway * 0.5, -106, 32, f1);
      puffs(sway * 0.6 - 12, -112, 24, f2);
      puffs(sway * 0.6 + 16, -110, 22, shade(f2, 1.06));
      // dappled light along the sunny side
      for (let k2 = 0; k2 < 12; k2++) {
        const ang = -0.5 - k2 * 0.18;
        const dx2 = Math.cos(ang) * (30 + hash(k2 * 3 + tr.x) * 12) + sway * 0.5;
        const dy2 = -96 + Math.sin(ang) * 26;
        E(dx2, dy2, 2.6 + hash(k2) * 1.6, 1.8 + hash(k2) * 1.2, shade(f2, 1.3, 0.5));
      }
      // pooled shade under the canopy
      ctx.strokeStyle = shade(f0, 0.6, 0.4); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sway * 0.4, -82, 40, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
      // fruit with stems, leaves and shine
      if (THEME.fruit) {
        for (let k2 = 0; k2 < 6; k2++) {
          const ax = Math.cos(k2 * 2.2 + tr.x) * 30 + sway, ay = -96 + Math.sin(k2 * 1.7 + tr.x) * 19;
          ctx.strokeStyle = 'rgba(70,45,22,.6)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(ax, ay - 3.4); ctx.lineTo(ax + 0.8, ay - 6.5); ctx.stroke();
          E(ax + 2.6, ay - 6, 2.4, 1.3, shade(f1, 1.1), 0.5);
          ctx.save(); ctx.translate(ax, ay);
          ctx.fillStyle = cachedGrad('apple', () => {
            const ag = ctx.createRadialGradient(-1.3, -1.3, 0.5, 0, 0, 4.4);
            ag.addColorStop(0, shade(THEME.fruit, 1.35)); ag.addColorStop(1, shade(THEME.fruit, 0.88));
            return ag;
          });
          ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(86,40,30,.35)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.restore();
          E(ax - 1.4, ay - 1.6, 1.2, 0.8, 'rgba(255,255,255,.75)', -0.6);
        }
      }
    }
    ctx.restore();
  });
  SPEC.fence.forEach(rg => {
    const fx0 = rg[0] * TILE, fx1 = (rg[1] + 1) * TILE;
    if (fx1 < camX - 40 || fx0 > camX + VW + 40) return;
    const fy = (groundTopAt(rg[0]) || 12) * TILE;
    ctx.strokeStyle = 'rgba(86,60,40,.4)'; ctx.lineWidth = 1.6;
    for (let x = fx0; x <= fx1 - 20; x += 34) {
      ctx.fillStyle = shade('#debd8d', 0.9 + hash(x) * 0.18);
      RR(x, fy - 35, 9, 35, 4); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(110,78,46,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 4.5, fy - 30); ctx.lineTo(x + 4.5, fy - 8); ctx.stroke();
      ctx.strokeStyle = 'rgba(86,60,40,.4)'; ctx.lineWidth = 1.6;
    }
    ctx.fillStyle = '#debd8d';
    RR(fx0 - 4, fy - 29, fx1 - fx0 - 12, 6.5, 3); ctx.fill(); ctx.stroke();
    RR(fx0 - 4, fy - 16, fx1 - fx0 - 12, 6.5, 3); ctx.fill(); ctx.stroke();
    // creeping vine with leaves
    ctx.strokeStyle = '#5e8a4a'; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(fx0 + 6, fy - 2);
    ctx.quadraticCurveTo(fx0 + 30, fy - 36, fx0 + 70, fy - 25);
    ctx.quadraticCurveTo(fx0 + 102, fy - 16, fx0 + 132, fy - 28);
    ctx.stroke();
    for (let k = 0; k < 4; k++) {
      E(fx0 + 24 + k * 30, fy - 27 + Math.sin(k * 2.1) * 5, 3.4, 2, '#6f9c55', k % 2 ? 0.5 : -0.4);
    }
    for (let k = 0; k < 2; k++) {
      const vx2 = fx0 + 44 + k * 62, vy2 = fy - 25 + Math.sin(k * 3.1) * 4;
      for (let p5 = 0; p5 < 5; p5++) {
        const ang = TAU * p5 / 5;
        E(vx2 + Math.cos(ang) * 2.4, vy2 + Math.sin(ang) * 2.4, 1.7, 1.7, k ? '#f3a6b8' : '#fffdf4');
      }
      E(vx2, vy2, 1.4, 1.4, '#ffd35e');
    }
  });
}

function drawCottage() {
  if (!COTTAGE) return;
  const cx = COTTAGE.x, gy = COTTAGE.y, w = COTTAGE.w;
  if (cx + w < camX - 100 || cx > camX + VW + 100) return;
  const wallTop = gy - 150;
  // chimney + smoke
  ctx.fillStyle = '#b0876b'; ctx.fillRect(cx + w - 92, wallTop - 64, 26, 70);
  ctx.fillStyle = '#8a6242'; ctx.fillRect(cx + w - 96, wallTop - 70, 34, 10);
  for (let i = 0; i < 3; i++) {
    const st = (simT * 0.5 + i * 0.33) % 1;
    ctx.save(); ctx.globalAlpha = 0.35 * (1 - st);
    E(cx + w - 79 + Math.sin(st * 5 + i) * 10, wallTop - 76 - st * 60, 9 + st * 14, 7 + st * 10, '#fff6e8');
    ctx.restore();
  }
  // walls
  ctx.fillStyle = PAL.wall; RR(cx, wallTop, w, 152, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(86,60,40,.4)'; ctx.lineWidth = 2.5; RR(cx, wallTop, w, 152, 8); ctx.stroke();
  // timber framing
  ctx.strokeStyle = PAL.timber; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + 8, wallTop + 8); ctx.lineTo(cx + 8, gy - 6);
  ctx.moveTo(cx + w - 8, wallTop + 8); ctx.lineTo(cx + w - 8, gy - 6);
  ctx.moveTo(cx + 8, wallTop + 52); ctx.lineTo(cx + w - 8, wallTop + 52);
  ctx.stroke();
  // roof — solid thatch with stitched rows inside
  ctx.fillStyle = PAL.roof;
  ctx.beginPath();
  ctx.moveTo(cx - 28, wallTop + 14);
  ctx.quadraticCurveTo(cx - 6, wallTop - 30, cx + w / 2, wallTop - 96);
  ctx.quadraticCurveTo(cx + w + 6, wallTop - 30, cx + w + 28, wallTop + 14);
  ctx.quadraticCurveTo(cx + w / 2, wallTop + 26, cx - 28, wallTop + 14);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(86,60,40,.4)'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = PAL.roofDark; ctx.lineWidth = 3; ctx.globalAlpha = 0.6;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - 30, wallTop + 16 - i * 22);
    ctx.quadraticCurveTo(cx + w / 2, wallTop + 44 - i * 30, cx + w + 30, wallTop + 16 - i * 22);
    ctx.stroke();
  }
  ctx.restore();
  // warm windows
  [[cx + 52, wallTop + 84], [cx + w - 58, wallTop + 84]].forEach(wp => {
    const glow = 0.75 + Math.sin(simT * 2.3 + wp[0]) * 0.12;
    ctx.save(); ctx.globalAlpha = glow * 0.5;
    ctx.translate(wp[0], wp[1]);
    ctx.fillStyle = cachedGrad('winGlow', () => {
      const rg = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
      rg.addColorStop(0, PAL.glow); rg.addColorStop(1, 'rgba(255,215,107,0)');
      return rg;
    });
    ctx.fillRect(-46, -46, 92, 92);
    ctx.restore();
    ctx.fillStyle = PAL.glow; RR(wp[0] - 17, wp[1] - 20, 34, 40, 8); ctx.fill();
    ctx.strokeStyle = PAL.timber; ctx.lineWidth = 3.4; RR(wp[0] - 17, wp[1] - 20, 34, 40, 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wp[0], wp[1] - 20); ctx.lineTo(wp[0], wp[1] + 20);
    ctx.moveTo(wp[0] - 17, wp[1]); ctx.lineTo(wp[0] + 17, wp[1]); ctx.stroke();
    // flower box
    ctx.fillStyle = '#a06a42'; RR(wp[0] - 20, wp[1] + 20, 40, 9, 3); ctx.fill();
    for (let i = 0; i < 4; i++) E(wp[0] - 13 + i * 9, wp[1] + 18, 3.4, 3.4, ['#f3a6b8', '#f8e08e', '#e8b8e0', '#f3a6b8'][i]);
  });
  // the door — journey's end
  const d = GOAL;
  ctx.fillStyle = PAL.door;
  ctx.beginPath();
  ctx.moveTo(d.x, gy); ctx.lineTo(d.x, d.y + 26);
  ctx.quadraticCurveTo(d.x, d.y, d.x + d.w / 2, d.y);
  ctx.quadraticCurveTo(d.x + d.w, d.y, d.x + d.w, d.y + 26);
  ctx.lineTo(d.x + d.w, gy);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(50,30,16,.5)'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,190,.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(d.x + d.w / 2, d.y + 6); ctx.lineTo(d.x + d.w / 2, gy - 6); ctx.stroke();
  E(d.x + d.w - 14, d.y + 52, 3.6, 3.6, '#e8c46f');
  // heart over the door
  ctx.fillStyle = '#d23b2f'; heartPath(d.x + d.w / 2, d.y - 14, 7 + Math.sin(simT * 3) * 0.8); ctx.fill();
  // welcome mat
  ctx.fillStyle = '#c98a4e'; RR(d.x - 8, gy - 4, d.w + 16, 8, 4); ctx.fill();
}

function drawSignsAndPillows() {
  SPEC.sign.forEach(sg => {
    if (sg.x < camX - 200 || sg.x > camX + VW + 200) return;
    // post with grain
    ctx.fillStyle = '#8a6242'; RR(sg.x - 4.5, sg.y - 46, 9, 46, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(60,38,22,.35)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(sg.x - 1, sg.y - 42); ctx.quadraticCurveTo(sg.x + 1, sg.y - 24, sg.x - 1, sg.y - 6); ctx.stroke();
    // plank
    const pg = ctx.createLinearGradient(0, sg.y - 68, 0, sg.y - 36);
    pg.addColorStop(0, '#dcbe90'); pg.addColorStop(1, '#c9a572');
    ctx.fillStyle = pg; RR(sg.x - 36, sg.y - 68, 72, 32, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(86,60,40,.5)'; ctx.lineWidth = 2.2; RR(sg.x - 36, sg.y - 68, 72, 32, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,85,50,.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sg.x - 30, sg.y - 61); ctx.quadraticCurveTo(sg.x, sg.y - 59, sg.x + 30, sg.y - 61.5);
    ctx.moveTo(sg.x - 30, sg.y - 42); ctx.quadraticCurveTo(sg.x - 4, sg.y - 40.5, sg.x + 30, sg.y - 42.5);
    ctx.stroke();
    // painted arrow
    ctx.strokeStyle = 'rgba(80,55,35,.75)'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sg.x - 18, sg.y - 52); ctx.lineTo(sg.x + 14, sg.y - 52);
    ctx.moveTo(sg.x + 6, sg.y - 59); ctx.lineTo(sg.x + 15, sg.y - 52); ctx.lineTo(sg.x + 6, sg.y - 45);
    ctx.stroke();
    // nails + creeping vine
    E(sg.x - 30, sg.y - 63.5, 1.5, 1.5, 'rgba(70,50,30,.6)');
    E(sg.x + 30, sg.y - 63.5, 1.5, 1.5, 'rgba(70,50,30,.6)');
    ctx.strokeStyle = '#5e8a4a'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(sg.x + 3, sg.y - 2); ctx.quadraticCurveTo(sg.x + 9, sg.y - 18, sg.x + 2, sg.y - 35); ctx.stroke();
    E(sg.x + 7, sg.y - 14, 3.4, 2, '#6f9c55', 0.6);
    E(sg.x + 3, sg.y - 26, 3.2, 1.9, '#6f9c55', -0.5);
    for (let p5 = 0; p5 < 5; p5++) {
      const ang = TAU * p5 / 5;
      E(sg.x + 6 + Math.cos(ang) * 2.6, sg.y - 33 + Math.sin(ang) * 2.6, 1.9, 1.9, '#f3a6b8');
    }
    E(sg.x + 6, sg.y - 33, 1.5, 1.5, '#ffd35e');
    // speech bubble when the trio is near
    if (state === 'play' && Math.abs(player.x - sg.x) < 120) {
      const lines = touchUI ? sg.lines.map(l => TOUCH_SIGN[l] || l) : sg.lines;
      const bw = 250, bh = 22 + lines.length * 20;
      const bx = clamp(sg.x - bw / 2, camX + 8, camX + VW - bw - 8), by = sg.y - 92 - bh;
      ctx.save();
      ctx.globalAlpha = 0.96;
      ctx.fillStyle = '#fffaf0'; RR(bx, by, bw, bh, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(86,60,40,.5)'; ctx.lineWidth = 2; RR(bx, by, bw, bh, 12); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sg.x - 8, by + bh); ctx.lineTo(sg.x, by + bh + 12); ctx.lineTo(sg.x + 8, by + bh);
      ctx.closePath(); ctx.fillStyle = '#fffaf0'; ctx.fill();
      lines.forEach((ln, i) => text(ln, bx + bw / 2, by + 16 + i * 20, 15, PAL.ink));
      ctx.restore();
    }
  });
  SPEC.pillow.forEach(p => {
    if (p.x < camX - 100 || p.x > camX + VW + 100) return;
    const puff = p.active ? Math.sin(simT * 3) * 1.2 : 0;
    ctx.save(); ctx.translate(p.x, p.y);
    if (p.active) {
      ctx.strokeStyle = '#8a6242'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(14, -16); ctx.lineTo(14, -58); ctx.stroke();
      ctx.fillStyle = '#f0c060';
      ctx.beginPath(); ctx.moveTo(14, -58); ctx.lineTo(38, -50); ctx.lineTo(14, -42); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d23b2f'; heartPath(22, -50, 4); ctx.fill();
    }
    ctx.fillStyle = p.active ? PAL.pillow : '#d9c2b8';
    RR(-24, -16 - puff, 48, 17 + puff, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(86,60,40,.35)'; ctx.lineWidth = 2;
    RR(-24, -16 - puff, 48, 17 + puff, 9); ctx.stroke();
    ctx.strokeStyle = p.active ? PAL.pillowDark : '#b8a094';
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1.6;
    RR(-19, -12 - puff, 38, 9 + puff, 6); ctx.stroke();
    ctx.setLineDash([]);
    E(0, -8 - puff / 2, 2.6, 2.6, p.active ? PAL.pillowDark : '#b8a094');
    ctx.restore();
  });
}

function drawLeaves() {
  if (THEME.tree === 'cactus' || THEME.tree === 'dead' || THEME.tree === 'shroom') return;
  SPEC.tree.forEach(tr => {
    if (tr.x < camX - 120 || tr.x > camX + VW + 120) return;
    for (let i = 0; i < 3; i++) {
      const ph = (simT * 0.13 + i * 0.34 + hash(tr.x + i * 31)) % 1;
      const lx = tr.x + 8 + Math.sin((ph * 6 + i) * 2.2 + tr.x) * 26 + ph * 52;
      const ly = tr.y - 118 * tr.s + ph * 190;
      const al = ph < 0.1 ? ph * 10 : (ph > 0.85 ? (1 - ph) * 6.7 : 1);
      ctx.save();
      ctx.globalAlpha = al * 0.8;
      ctx.translate(lx, ly); ctx.rotate(ph * 9 + i);
      E(0, 0, 4, 2.2, i % 2 ? shade(THEME.foliage[2], 1.05) : '#c8a050');
      ctx.restore();
    }
  });
}

function drawShops() {
  shops.forEach(sh => {
    if (sh.x < camX - 180 || sh.x > camX + VW + 180) return;
    ctx.save();
    ctx.translate(sh.x, sh.y);
    // warm glow
    ctx.fillStyle = cachedGrad('shopGlow', () => {
      const rg = ctx.createRadialGradient(0, -46, 6, 0, -46, 74);
      rg.addColorStop(0, 'rgba(255,215,107,.28)'); rg.addColorStop(1, 'rgba(255,215,107,0)');
      return rg;
    });
    ctx.fillRect(-74, -120, 148, 120);
    // posts
    ctx.fillStyle = '#8a6242';
    RR(-37, -66, 7, 66, 3); ctx.fill();
    RR(30, -66, 7, 66, 3); ctx.fill();
    // owl shopkeeper (peeking over the counter)
    const ob = Math.sin(simT * 2.2) * 1.5 - (sh.hopT > 0 ? Math.abs(Math.sin(sh.hopT * 16)) * 7 : 0);
    ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); // ear tufts
    ctx.moveTo(-8, -54 + ob); ctx.lineTo(-11, -60 + ob);
    ctx.moveTo(8, -54 + ob); ctx.lineTo(11, -60 + ob);
    ctx.stroke();
    EO(0, -44 + ob, 11.5, 12.5, '#b8906a');
    E(0, -40 + ob, 7.5, 8, '#dfc09a');
    const blink2 = (Math.sin(simT * 1.1) > 0.97) ? 0.15 : 1;
    E(-4.5, -48 + ob, 4.2, 4.6 * blink2, '#fffaf0'); E(-4.5, -48 + ob, 2.2, 2.5 * blink2, '#2a2018');
    E(4.5, -48 + ob, 4.2, 4.6 * blink2, '#fffaf0'); E(4.5, -48 + ob, 2.2, 2.5 * blink2, '#2a2018');
    ctx.fillStyle = '#e8a13f';
    ctx.beginPath(); ctx.moveTo(-2.4, -43 + ob); ctx.lineTo(2.4, -43 + ob); ctx.lineTo(0, -38.5 + ob); ctx.closePath(); ctx.fill();
    // counter
    ctx.fillStyle = '#c89a66'; RR(-30, -26, 60, 26, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(86,60,40,.35)'; ctx.lineWidth = 2; RR(-30, -26, 60, 26, 4); ctx.stroke();
    ctx.fillStyle = '#a87a4e'; RR(-34, -31, 68, 8, 3); ctx.fill();
    // wares on the counter
    ctx.fillStyle = '#e2574c'; heartPath(-17, -16, 5); ctx.fill();
    E(-2, -16, 5, 5, '#f6f2ea');
    ctx.strokeStyle = '#d23b2f'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(-5.5, -16, 3.6, -0.8, 0.8); ctx.stroke();
    EO(13, -16, 5.5, 5.5, '#e9b13f'); E(13, -16, 3.8, 3.8, '#f5cc6a');
    // scalloped awning
    ctx.fillStyle = '#d9534c'; RR(-44, -82, 88, 14, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(86,60,40,.35)'; ctx.lineWidth = 2; RR(-44, -82, 88, 14, 5); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? '#f6e8cf' : '#d9534c';
      ctx.beginPath(); ctx.arc(-36 + i * 18, -68, 9, 0, Math.PI); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // bubble when the trio is browsing
    if (sh.near && state === 'play') {
      const lines = ['Wares for buttons, dearies!',
        'press ▼ (or tap the stall) to browse'];
      const bw = 252, bh = 62;
      const bx = clamp(sh.x - bw / 2, camX + 8, camX + VW - bw - 8), by = sh.y - 132 - 28;
      ctx.save(); ctx.globalAlpha = 0.96;
      ctx.fillStyle = '#fffaf0'; RR(bx, by, bw, bh, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(86,60,40,.5)'; ctx.lineWidth = 2; RR(bx, by, bw, bh, 12); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sh.x - 8, by + bh); ctx.lineTo(sh.x, by + bh + 12); ctx.lineTo(sh.x + 8, by + bh);
      ctx.closePath(); ctx.fillStyle = '#fffaf0'; ctx.fill();
      text(lines[0], bx + bw / 2, by + 20, 15, PAL.ink);
      text(lines[1], bx + bw / 2, by + 42, 14, '#9a6fb8', 'center', 'italic');
      ctx.restore();
    }
  });
}

function drawGoalBook() {
  if (!GOAL || GOAL.type !== 'book') return;
  const cx = GOAL.x + GOAL.w / 2, gy = GOAL.y + GOAL.h;
  if (cx < camX - 160 || cx > camX + VW + 160) return;
  const bob = Math.sin(simT * 1.6) * 3;
  // pedestal
  ctx.fillStyle = '#c8b59a'; RR(cx - 24, gy - 26, 48, 26, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(86,60,40,.4)'; ctx.lineWidth = 2; RR(cx - 24, gy - 26, 48, 26, 5); ctx.stroke();
  ctx.fillStyle = '#b5a288'; RR(cx - 31, gy - 7, 62, 7, 3); ctx.fill();
  // golden glow
  ctx.save(); ctx.translate(cx, gy - 52 + bob);
  ctx.fillStyle = cachedGrad('bookGlow', () => {
    const rg = ctx.createRadialGradient(0, 0, 6, 0, 0, 64);
    rg.addColorStop(0, 'rgba(255,217,120,.4)'); rg.addColorStop(1, 'rgba(255,217,120,0)');
    return rg;
  });
  ctx.fillRect(-64, -64, 128, 128);
  ctx.restore();
  // the open storybook
  ctx.save();
  ctx.translate(cx, gy - 42 + bob);
  ctx.fillStyle = '#8a5c3b'; RR(-34, -8, 68, 16, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(60,38,22,.4)'; ctx.lineWidth = 2; RR(-34, -8, 68, 16, 6); ctx.stroke();
  ctx.fillStyle = '#fdf4e0';
  ctx.beginPath();
  ctx.moveTo(0, -4); ctx.quadraticCurveTo(-17, -20, -31, -12);
  ctx.lineTo(-31, -2); ctx.quadraticCurveTo(-16, -8, 0, 2);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(120,90,60,.4)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -4); ctx.quadraticCurveTo(17, -20, 31, -12);
  ctx.lineTo(31, -2); ctx.quadraticCurveTo(16, -8, 0, 2);
  ctx.closePath(); ctx.fillStyle = '#fdf4e0'; ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(120,90,60,.3)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-24, -10); ctx.lineTo(-8, -7); ctx.moveTo(-24, -6.5); ctx.lineTo(-8, -3.5);
  ctx.moveTo(8, -7); ctx.lineTo(24, -10); ctx.moveTo(8, -3.5); ctx.lineTo(24, -6.5);
  ctx.stroke();
  ctx.restore();
  // orbiting sparkles
  for (let i = 0; i < 3; i++) {
    const a = simT * 1.5 + i * (TAU / 3);
    ctx.save(); ctx.globalAlpha = 0.75 + Math.sin(simT * 3 + i) * 0.2;
    ctx.fillStyle = '#ffd978';
    starPath(cx + Math.cos(a) * 42, gy - 52 + bob + Math.sin(a) * 24, 5);
    ctx.fill(); ctx.restore();
  }
  text('Chapter ' + (curLevel + 2) + ' awaits…', cx, gy - 112 + bob, 14, PAL.ink, 'center', 'italic', 0.75);
}

function drawItems() {
  items.btn.forEach((b, i) => {
    if (b.got || b.x < camX - 60 || b.x > camX + VW + 60) return;
    const wob = Math.sin(simT * 3 + i) * 3;
    const spin = Math.cos(simT * 2.2 + i * 0.8);
    ctx.save(); ctx.translate(b.x, b.y + wob);
    ctx.rotate(Math.sin(simT * 1.3 + i) * 0.12);
    ctx.scale(Math.abs(spin) * 0.75 + 0.25, 1);
    E(1.8, 3, 12.5, 12.5, 'rgba(95,60,20,.22)');
    ctx.fillStyle = cachedGrad('btnRim', () => {
      const rim = ctx.createRadialGradient(-4, -4, 3, 0, 0, 13);
      rim.addColorStop(0, '#e8b94e'); rim.addColorStop(1, '#a87a20');
      return rim;
    });
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(110,72,18,.55)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.stroke();
    ctx.fillStyle = cachedGrad('btnFace', () => {
      const bg3 = ctx.createRadialGradient(-4.5, -4.5, 2, 0, 0, 11);
      bg3.addColorStop(0, '#ffe9a0'); bg3.addColorStop(0.6, '#f0bc45'); bg3.addColorStop(1, '#d9a32e');
      return bg3;
    });
    ctx.beginPath(); ctx.arc(0, 0, 10.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,20,.4)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, 10.2, 0, TAU); ctx.stroke();
    E(-3.5, -5.5, 4, 2.2, 'rgba(255,250,225,.65)', -0.5);
    [[-3.6, -3.2], [3.6, -3.2], [-3.6, 3.6], [3.6, 3.6]].forEach(hh2 => {
      E(hh2[0], hh2[1] + 0.9, 1.9, 1.9, 'rgba(255,238,180,.85)');
      E(hh2[0], hh2[1], 1.8, 1.8, '#92661a');
    });
    ctx.restore();
    if (hash(i * 3.3 + Math.floor(simT * 2)) > 0.92) {
      spawnParts(b.x + (hash(i) - 0.5) * 18, b.y + wob - 8, 'sparkle', 1, { speed: 8, life: 0.5, color: '#fff0c0', grav: -10 });
    }
  });
  items.heart.forEach((h, i) => {
    if (h.got || h.x < camX - 60 || h.x > camX + VW + 60) return;
    const wob = Math.sin(simT * 2.6 + i * 2) * 4;
    ctx.save(); ctx.translate(h.x, h.y + wob);
    ctx.fillStyle = '#e2574c'; heartPath(0, 0, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(86,60,40,.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.setLineDash([3, 4]);
    heartPath(0, 0, 7.5); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  });
}

function drawButterflies() {
  butterflies.forEach(b => {
    const bx = b.ax + Math.sin(b.ph * 0.7) * 70 + Math.sin(b.ph * 1.7) * 22;
    const by = b.ay + Math.sin(b.ph * 1.1) * 26 - 10;
    if (bx < camX - 40 || bx > camX + VW + 40) return;
    if (THEME.ambient === 'firefly') {
      const tw = 0.5 + 0.5 * Math.sin(b.ph * 2.6);
      ctx.save(); ctx.globalAlpha = 0.3 + 0.55 * tw;
      ctx.save(); ctx.translate(bx, by);
      ctx.fillStyle = cachedGrad('fly', () => {
        const rg = ctx.createRadialGradient(0, 0, 1, 0, 0, 12);
        rg.addColorStop(0, 'rgba(255,233,150,.9)'); rg.addColorStop(1, 'rgba(255,233,150,0)');
        return rg;
      });
      ctx.fillRect(-12, -12, 24, 24);
      ctx.restore();
      E(bx, by, 2.2, 2.2, '#ffefb0');
      ctx.restore();
      return;
    }
    const flap = Math.sin(b.ph * 14) * 0.7;
    ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.sin(b.ph) * 0.2);
    E(0, 0, 1.6, 4, '#5d4434');
    ctx.save(); ctx.scale(Math.abs(flap) * 0.8 + 0.2, 1);
    E(-4.5, -1, 4.5, 6, b.col); E(4.5, -1, 4.5, 6, b.col);
    ctx.restore(); ctx.restore();
  });
}

// tall grass clumps drawn in front of the characters for depth
function drawForeground() {
  const x0 = Math.max(0, Math.floor(camX / TILE) - 1), x1 = Math.min(LW - 1, Math.ceil((camX + VW) / TILE) + 1);
  for (let tx = x0; tx <= x1; tx++) {
    const h = hash(tx * 3.71);
    if (h < 0.82) continue;
    const top = groundTopAt(tx);
    if (top === null) continue;
    const bx = tx * TILE + 24 + (h - 0.9) * 80, by = top * TILE + 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = shade(THEME.grassDark, 0.78); ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      const aa = -1.95 + k * 0.32;
      const len = 16 + hash(tx * 7 + k) * 14;
      const sway = Math.sin(simT * 1.6 + tx + k) * 2.2;
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + Math.cos(aa) * len * 0.5 + sway * 0.4, by + Math.sin(aa) * len * 0.6,
                           bx + Math.cos(aa) * len + sway, by + Math.sin(aa) * len);
    }
    ctx.stroke();
    ctx.strokeStyle = shade(THEME.grass, 1.06); ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const aa = -1.8 + k * 0.4;
      const len = 12 + hash(tx * 11 + k) * 10;
      const sway = Math.sin(simT * 1.6 + tx + k * 2) * 2;
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + Math.cos(aa) * len * 0.5, by + Math.sin(aa) * len * 0.6,
                           bx + Math.cos(aa) * len + sway, by + Math.sin(aa) * len);
    }
    ctx.stroke();
  }
}

// drifting dust motes / pollen in the air
function drawWeather() {
  if (!THEME.weather) return;
  for (let i = 0; i < 26; i++) {
    const rising = THEME.weather === 'embers';
    const sp = rising ? -(14 + hash(i) * 20) : (18 + hash(i) * 26);
    const m = VH + 40;
    const wy = ((hash(i * 3.7) * m + simT * sp) % m + m) % m - 20;
    const mw = VW + 40;
    const wx = ((i * 167 + hash(i * 7) * 400 + Math.sin(simT * (0.5 + hash(i) * 0.7) + i) * 40 - camX * 0.25) % mw + mw) % mw - 20;
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(simT * 2 + i));
    if (THEME.weather === 'snow') {
      const r = 1.8 + hash(i * 5) * 1.8;
      E(wx, wy, r, r, '#ffffff');
    } else if (THEME.weather === 'petals') {
      ctx.translate(wx, wy); ctx.rotate(simT * (1 + hash(i)) + i);
      E(0, 0, 3.4, 1.9, '#f6c4d4');
    } else {
      E(wx, wy, 1.8, 1.8, '#ffb070');
    }
    ctx.restore();
  }
}

function drawMotes() {
  ctx.save();
  for (let i = 0; i < 14; i++) {
    const sp = 6 + hash(i * 1.7) * 10;
    const m = VW + 60;
    const mx = ((i * 211 + hash(i) * 500 + simT * sp - camX * 0.35) % m + m) % m - 30;
    const my = 60 + hash(i * 3.1) * 400 + Math.sin(simT * 0.6 + i * 1.9) * 24;
    ctx.globalAlpha = 0.1 + 0.15 * (0.5 + 0.5 * Math.sin(simT * 0.9 + i * 2.4));
    const r = 1.5 + hash(i * 5) * 1.7;
    E(mx, my, r, r, 'rgb(' + THEME.mote + ')');
  }
  ctx.restore();
}

function drawParticles() {
  particles.forEach(p => {
    const k = 1 - p.life / p.max;
    ctx.save(); ctx.globalAlpha = clamp(k, 0, 1);
    ctx.translate(p.x, p.y);
    if (p.type === 'heart') { ctx.fillStyle = p.color || '#e2574c'; heartPath(0, 0, p.size); ctx.fill(); }
    else if (p.type === 'star') { ctx.rotate(p.rot); ctx.fillStyle = p.color || '#ffd978'; starPath(0, 0, p.size); ctx.fill(); }
    else if (p.type === 'sparkle') {
      ctx.strokeStyle = p.color || '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-p.size, 0); ctx.lineTo(p.size, 0); ctx.moveTo(0, -p.size); ctx.lineTo(0, p.size);
      ctx.stroke();
    }
    else if (p.type === 'splash') { E(0, 0, p.size * 0.6, p.size, p.color || PAL.waterDeep); }
    else if (p.type === 'zz') { text('z', 0, 0, 13 + p.size, '#8d8478', 'center', 'italic'); }
    else { E(0, 0, p.size, p.size * 0.9, p.color || '#e8dccb'); }
    ctx.restore();
  });
  popups.forEach(p => {
    const a = 1 - p.t;
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    text(p.txt, p.x, p.y, 17, '#fffaf0', 'center', 'bold');
    ctx.strokeStyle = 'rgba(86,60,40,.6)'; ctx.lineWidth = 0.8;
    ctx.restore();
  });
}

// ---- companions + player
function drawCompanions() {
  const sq = special && special.phase === 'spring' ? special.sq : 0;
  const pose = special ? (special.phase === 'cheer' ? 'cheer' : 'brace') : '';
  [comps[1], comps[0]].forEach((c, i) => {
    drawShadow(c.x, c.y, i ? 18 : 16);
    CHAR_DRAW[c.char](c.x, c.y - c.hop, {
      face: c.face, run: c.run, grounded: c.g, vy: c.vy, squash: sq, pose: pose, t: simT
    });
  });
}
function drawBalls() {
  balls.forEach(b => {
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(b.rot);
    E(0.8, 1.2, 5.8, 5.8, 'rgba(60,40,20,.2)');
    E(0, 0, 5.5, 5.5, b.gold ? '#f3cb5e' : '#f6f2ea');
    if (b.gold && Math.random() < 0.3) {
      spawnParts(b.x, b.y, 'sparkle', 1, { speed: 14, life: 0.3, color: '#ffe9a0', grav: 0 });
    }
    ctx.strokeStyle = b.gold ? 'rgba(150,100,20,.55)' : 'rgba(86,60,40,.4)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = b.gold ? '#a8542f' : '#d23b2f'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(-4.5, 0, 4.5, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(4.5, 0, 4.5, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
    ctx.restore();
  });
}
function drawPlayer() {
  if (player.invuln > 0 && Math.floor(player.invuln * 9) % 2 === 0 && state === 'play') return;
  drawShadow(player.x, player.y, 19);
  const sq = special && special.phase === 'spring' ? special.sq : player.squash;
  CHAR_DRAW[CHARS[heroIdx]](player.x, player.y + (player.sandT || 0) * 9, {
    face: player.face, run: player.run, grounded: player.grounded, vy: player.vy, squash: sq, t: simT
  });
}

// ============================================================ HUD & overlays
function chip(x, y, w, h) {
  ctx.fillStyle = 'rgba(70,48,28,.16)'; RR(x + 2, y + 3, w, h, 12); ctx.fill();
  ctx.fillStyle = '#f7eed8'; RR(x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(93,68,52,.5)'; ctx.lineWidth = 2; RR(x, y, w, h, 12); ctx.stroke();
  ctx.strokeStyle = 'rgba(93,68,52,.28)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  RR(x + 4, y + 4, w - 8, h - 8, 8); ctx.stroke(); ctx.setLineDash([]);
}
function drawHUD() {
  // stitched heart patches
  for (let i = 0; i < upg.maxHearts; i++) {
    ctx.save();
    ctx.translate(44 + i * 40, 40);
    ctx.rotate(-0.08 + (i % 3) * 0.08);
    if (i < hearts) {
      ctx.fillStyle = 'rgba(60,38,20,.22)'; heartPath(1.5, 3, 14.5); ctx.fill();
      ctx.fillStyle = '#d9483f'; heartPath(0, 0, 14.5); ctx.fill();
      ctx.strokeStyle = 'rgba(86,50,40,.5)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.22)'; heartPath(-3.5, -4, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(255,235,225,.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([3.5, 3]);
      heartPath(0, 0, 10); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#efe2c6'; heartPath(0, 0, 14.5); ctx.fill();
      ctx.strokeStyle = '#5d4434'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]);
      heartPath(0, 0, 13); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  }
  // button pouch — parchment chip
  chip(VW - 172, 16, 154, 46);
  ctx.save();
  ctx.translate(VW - 142, 39);
  E(1, 1.8, 13.5, 13.5, 'rgba(95,60,20,.18)');
  E(0, 0, 13, 13, '#c8922e');
  ctx.fillStyle = cachedGrad('hudBtn', () => {
    const bg2 = ctx.createRadialGradient(-4, -4, 2, 0, 0, 13);
    bg2.addColorStop(0, '#ffe08a'); bg2.addColorStop(0.7, '#edb83f'); bg2.addColorStop(1, '#d9a32e');
    return bg2;
  });
  ctx.beginPath(); ctx.arc(0, 0, 10.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#9a6d1d';
  [[-3.5, -3], [3.5, -3], [-3.5, 3.5], [3.5, 3.5]].forEach(o => E(o[0], o[1], 1.8, 1.8, '#9a6d1d'));
  ctx.restore();
  text(String(buttons), VW - 120, 40, 27, PAL.ink, 'left', 'bold');
  text('— Chapter ' + (curLevel + 1) + ' of ' + LEVELS.length + ' —', VW / 2, 26, 13, PAL.ink, 'center', 'italic', 0.6);
  // stuffie stack potion bottle
  const ready = specialCd <= 0 && !special;
  const prog = ready ? 1 : clamp(1 - specialCd / 3, 0, 1);
  const mx2 = 44, my2 = 96;
  ctx.save();
  ctx.translate(mx2, my2);
  E(1, 17, 12.5, 3.4, 'rgba(70,48,28,.16)');
  ctx.fillStyle = 'rgba(225,235,244,.55)';
  ctx.beginPath(); ctx.ellipse(0, 3, 13, 13.5, 0, 0, TAU); ctx.fill();
  ctx.fillRect(-5, -19, 10, 11);
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 3, 13, 13.5, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = ready ? '#9a6fb8' : '#b79ccb';
  const lh = 27 * prog;
  ctx.fillRect(-14, 16.5 - lh, 28, lh + 1);
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.fillRect(-14, 16.5 - lh, 28, 2.2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(93,68,52,.55)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 3, 13, 13.5, 0, 0, TAU); ctx.stroke();
  ctx.strokeRect(-5, -19, 10, 11);
  ctx.fillStyle = '#b08968'; RR(-6.5, -24.5, 13, 7, 2.5); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(-4, 1, 7.5, Math.PI * 0.7, Math.PI * 1.25); ctx.stroke();
  if (ready) {
    ctx.globalAlpha = 0.7 + Math.sin(simT * 5) * 0.3;
    ctx.fillStyle = '#ffd978';
    starPath(13, -13, 4.5); ctx.fill();
  }
  ctx.restore();
  if (!touchUI) text('X', mx2 + 26, my2 - 8, 16, PAL.ink, 'left', 'bold');
  text(ready ? 'Stuffie Stack!' : 'recharging…', mx2 + 26, my2 + (touchUI ? 2 : 11), 13, PAL.ink, 'left', 'italic', 0.8);
  // hero swap chip
  chip(SWAPBTN.x, SWAPBTN.y, SWAPBTN.w, SWAPBTN.h);
  text('⟳ play as ' + NAMES[CHARS[(heroIdx + 1) % 3]] + (touchUI ? '' : '  (C)'),
    SWAPBTN.x + SWAPBTN.w / 2, SWAPBTN.y + SWAPBTN.h / 2 + 2, touchUI ? 14 : 13, PAL.ink);
  if (touchUI) {
    chip(MUTEBTN.x, MUTEBTN.y, MUTEBTN.w, MUTEBTN.h);
    text(muted ? '♪ sound: off' : '♪ sound: on', MUTEBTN.x + MUTEBTN.w / 2, MUTEBTN.y + MUTEBTN.h / 2 + 1, 12.5, PAL.ink);
  } else {
    text(muted ? 'M: sound off' : 'M: sound on ♪', VW - 24, SWAPBTN.y + 50, 12, PAL.ink, 'right', 'italic', 0.6);
  }
}

function drawTouchButtons() {
  // floating run pad (or its resting hint)
  const sx2 = stick.active ? stick.ox : 110;
  const sy2 = stick.active ? stick.oy : VH - 104;
  ctx.save();
  ctx.globalAlpha = stick.active ? 0.5 : 0.22;
  E(sx2, sy2, 56, 56, 'rgba(255,250,235,.75)');
  ctx.strokeStyle = 'rgba(86,60,40,.6)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(sx2, sy2, 56, 0, TAU); ctx.stroke();
  text('◀', sx2 - 36, sy2 + 1, 18, PAL.ink, 'center');
  text('▶', sx2 + 36, sy2 + 1, 18, PAL.ink, 'center');
  const kx = sx2 + (stick.active ? stick.dx : 0);
  ctx.globalAlpha = stick.active ? 0.9 : 0.32;
  E(kx + 1.5, sy2 + 3, 34, 34, 'rgba(60,40,20,.3)');
  E(kx, sy2, 34, 34, '#f7eed8');
  ctx.strokeStyle = 'rgba(93,68,52,.6)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(kx, sy2, 34, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(93,68,52,.55)';
  E(kx, sy2 + 7, 9.5, 7.5, 'rgba(93,68,52,.55)');
  E(kx - 10, sy2 - 4, 4.2, 5, 'rgba(93,68,52,.55)');
  E(kx, sy2 - 8, 4.2, 5, 'rgba(93,68,52,.55)');
  E(kx + 10, sy2 - 4, 4.2, 5, 'rgba(93,68,52,.55)');
  ctx.restore();
  // plush action buttons
  for (const b2 of actionButtons()) {
    const held = btnHeld[b2.id] !== undefined;
    const onCd =
      b2.id === 'stack' ? (specialCd > 0 || !!special) :
      b2.id === 'ball' ? ballCd > 0 :
      b2.id === 'dash' ? player.dashCd > 0 :
      b2.id === 'yarn' ? (yarnCd > 0 || !!yarn) : false;
    ctx.save();
    ctx.translate(b2.x, b2.y);
    if (held) ctx.scale(0.92, 0.92);
    ctx.globalAlpha = onCd ? 0.42 : 0.85;
    E(2, 4, b2.r, b2.r, 'rgba(60,40,20,.28)');
    E(0, 0, b2.r, b2.r, held ? '#eaddbf' : '#f7eed8');
    ctx.strokeStyle = 'rgba(93,68,52,.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, b2.r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(93,68,52,.28)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(0, 0, b2.r - 7, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    if (b2.id === 'jump') {
      ctx.fillStyle = '#74a455';
      ctx.beginPath();
      ctx.moveTo(0, -30); ctx.lineTo(23, -2); ctx.lineTo(11, -2); ctx.lineTo(11, 26);
      ctx.lineTo(-11, 26); ctx.lineTo(-11, -2); ctx.lineTo(-23, -2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,40,20,.45)'; ctx.lineWidth = 2.5; ctx.stroke();
    } else if (b2.id === 'stack') {
      // the trio, stacked
      E(0, 15, 14, 9, '#c28e52');
      E(0, 2, 12, 8, '#a9764c');
      E(0, -10, 11, 8, '#99a2ad');
      ctx.strokeStyle = 'rgba(86,60,40,.4)'; ctx.lineWidth = 1.6;
      [[0, 15, 14, 9], [0, 2, 12, 8], [0, -10, 11, 8]].forEach(q2 => {
        ctx.beginPath(); ctx.ellipse(q2[0], q2[1], q2[2], q2[3], 0, 0, TAU); ctx.stroke();
      });
      ctx.fillStyle = '#ffd978'; starPath(16, -18, 6); ctx.fill();
      const prog = clamp(1 - specialCd / 3, 0, 1);
      if (prog < 1) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#9a6fb8'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, 0, b2.r - 4, -Math.PI / 2, -Math.PI / 2 + TAU * prog); ctx.stroke();
      }
    } else {
      ctx.save();
      ctx.scale(b2.r / 26, b2.r / 26);
      drawShopIcon(b2.id, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
}

function drawVignette() {
  ctx.save();
  ctx.fillStyle = cachedGrad('vig', () => {
    const rg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.45, VW / 2, VH / 2, VW * 0.72);
    rg.addColorStop(0, 'rgba(90,60,30,0)');
    rg.addColorStop(1, 'rgba(90,60,30,.27)');
    return rg;
  });
  ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = cachedGrad('vigtop', () => {
    const tg = ctx.createLinearGradient(0, 0, 0, 64);
    tg.addColorStop(0, 'rgba(70,50,30,.08)'); tg.addColorStop(1, 'rgba(70,50,30,0)');
    return tg;
  });
  ctx.fillRect(0, 0, VW, 64);
  // storybook plate frame
  ctx.strokeStyle = 'rgba(93,68,52,.4)'; ctx.lineWidth = 2.5;
  RR(7, 7, VW - 14, VH - 14, 14); ctx.stroke();
  ctx.strokeStyle = 'rgba(93,68,52,.18)'; ctx.lineWidth = 1.2;
  RR(13, 13, VW - 26, VH - 26, 10); ctx.stroke();
  ctx.restore();
  if (deathFade > 0) {
    ctx.fillStyle = 'rgba(70,45,25,' + (deathFade * 0.55) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }
}

function card(w, h) {
  const x = (VW - w) / 2, y = (VH - h) / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(60,40,22,.35)'; RR(x + 6, y + 10, w, h, 20); ctx.fill();
  ctx.fillStyle = '#fdf4e0'; RR(x, y, w, h, 20); ctx.fill();
  ctx.strokeStyle = 'rgba(93,68,52,.55)'; ctx.lineWidth = 3; RR(x, y, w, h, 20); ctx.stroke();
  ctx.strokeStyle = 'rgba(93,68,52,.3)'; ctx.lineWidth = 1.4; RR(x + 9, y + 9, w - 18, h - 18, 14); ctx.stroke();
  ctx.restore();
  return { x, y, w, h };
}

function drawTitle() {
  const c = card(660, 400);
  text('a tiny storybook adventure', VW / 2, c.y + 52, 17, PAL.ink, 'center', 'italic', 0.8);
  text('Doggie & Friends', VW / 2, c.y + 102, 52, PAL.ink, 'center', 'bold');
  text('❦  The Stroll Home  ❦', VW / 2, c.y + 148, 22, '#9a6fb8', 'center', 'italic');
  // grass strip + the trio
  ctx.save();
  ctx.fillStyle = THEME.grass;
  RR(c.x + 110, c.y + 286, c.w - 220, 14, 7); ctx.fill();
  const wob = Math.sin(simT * 2) * 2;
  const tOthers = [0, 1, 2].filter(k => k !== heroIdx);
  CHAR_DRAW[CHARS[tOthers[0]]](VW / 2 - 95, c.y + 290 + wob * 0.4, { t: simT, scale: 1.15, face: 1 });
  CHAR_DRAW[CHARS[heroIdx]](VW / 2, c.y + 290, { t: simT, scale: 1.3, face: 1 });
  CHAR_DRAW[CHARS[tOthers[1]]](VW / 2 + 88, c.y + 290 - wob * 0.4, { t: simT, scale: 1.15, face: -1 });
  ctx.restore();
  // floating hearts
  for (let i = 0; i < 5; i++) {
    const hy = c.y + 200 - ((simT * 22 + i * 53) % 110);
    const hx = VW / 2 + Math.sin(simT + i * 2.3) * (180 + i * 22);
    ctx.save(); ctx.globalAlpha = clamp(1 - (c.y + 200 - hy) / 110, 0, 1) * 0.5;
    ctx.fillStyle = '#e8a0b0'; heartPath(hx, hy, 5 + (i % 3)); ctx.fill(); ctx.restore();
  }
  const blink = Math.sin(simT * 3.4) > -0.4;
  if (blink) text('press any key — or tap — to begin', VW / 2, c.y + 330, 19, PAL.ink, 'center', 'bold');
  text(touchUI ? 'slide the paw pad to run  ·  tap the big button to jump  ·  the trio button stacks!'
               : '← → run · Space jump · X Stuffie Stack · C swap hero · M sound · P pause',
    VW / 2, c.y + 366, 14, PAL.ink, 'center', 'italic', 0.7);
}

function fmtTime(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return m + ':' + (ss < 10 ? '0' : '') + ss;
}

function drawBanner() {
  if (levelBannerT <= 0) return;
  const a = clamp(Math.min((2.8 - levelBannerT) * 3, levelBannerT * 1.4), 0, 1);
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(253,244,224,.9)'; RR(VW / 2 - 200, 40, 400, 46, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(93,68,52,.45)'; ctx.lineWidth = 2; RR(VW / 2 - 200, 40, 400, 46, 14); ctx.stroke();
  text('Chapter ' + (curLevel + 1) + ' — ' + LEVELS[curLevel].name, VW / 2, 64, 22, PAL.ink, 'center', 'bold');
  ctx.restore();
}

function drawChapter() {
  const a = ease((chapterT - 0.4) / 0.5);
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  const c = card(600, 320);
  text('❦', VW / 2, c.y + 46, 24, '#9a6fb8');
  text('Chapter ' + (curLevel + 1) + ' complete!', VW / 2, c.y + 96, 40, PAL.ink, 'center', 'bold');
  text('“' + LEVELS[curLevel].name + '” — done and dusted. ♥', VW / 2, c.y + 148, 18, PAL.ink, 'center', 'italic');
  ctx.save(); ctx.translate(VW / 2 - 96, c.y + 198);
  EO(0, 0, 10, 10, '#e9b13f'); E(0, 0, 7, 7, '#f5cc6a');
  ctx.restore();
  text(buttons + ' buttons in the pouch', VW / 2 - 78, c.y + 198, 17, PAL.ink, 'left');
  const blink = Math.sin(simT * 3.4) > -0.4;
  if (blink && chapterT > 0.6) text('press any key — or tap — for Chapter ' + (curLevel + 2), VW / 2, c.y + 262, 17, '#9a6fb8', 'center', 'bold');
  ctx.restore();
}

function drawWinScene() {
  // the trio hugging by the door
  const gx = GOAL.x + GOAL.w / 2, gy = COTTAGE.y;
  const bounce = Math.abs(Math.sin(winT * 4)) * 6 * Math.max(0, 1 - winT * 0.5);
  const wOthers = [0, 1, 2].filter(k => k !== heroIdx);
  CHAR_DRAW[CHARS[wOthers[0]]](gx - 44, gy - bounce * 0.6, { face: 1, pose: 'hug', t: simT, scale: 1.05 });
  CHAR_DRAW[CHARS[wOthers[1]]](gx + 42, gy - bounce * 0.8, { face: -1, pose: 'hug', t: simT });
  CHAR_DRAW[CHARS[heroIdx]](gx, gy - bounce, { face: 1, pose: 'hug', t: simT, scale: 1.1 });
  if (Math.random() < 0.1) {
    spawnParts(gx + (Math.random() - 0.5) * 90, gy - 90, 'heart', 1, { speed: 30, life: 1.6, size: 6, grav: -50 });
  }
}
function drawWin() {
  if (winT < 1.2) return;
  const a = ease((winT - 1.2) / 0.6);
  ctx.save(); ctx.globalAlpha = a;
  const c = card(620, 330);
  text('❦', VW / 2, c.y + 48, 26, '#9a6fb8');
  text('The End', VW / 2, c.y + 96, 52, PAL.ink, 'center', 'bold');
  text('Doggie, Bear & Dearie made it home —', VW / 2, c.y + 150, 19, PAL.ink, 'center', 'italic');
  text('snug, sleepy, and together. ♥', VW / 2, c.y + 176, 19, PAL.ink, 'center', 'italic');
  // stats
  ctx.save(); ctx.translate(VW / 2 - 92, c.y + 222);
  EO(0, 0, 10, 10, '#e9b13f'); E(0, 0, 7, 7, '#f5cc6a');
  ctx.restore();
  text(buttonsCollected + ' buttons found', VW / 2 - 74, c.y + 222, 18, PAL.ink, 'left');
  text('⏱ ' + fmtTime(timeSec), VW / 2 + 92, c.y + 222, 18, PAL.ink, 'left');
  const blink = Math.sin(simT * 3.4) > -0.4;
  if (blink) text('press R — or tap — to read it again', VW / 2, c.y + 280, 17, '#9a6fb8', 'center', 'bold');
  ctx.restore();
}
function drawOver() {
  const a = ease(overT / 0.5);
  ctx.save(); ctx.globalAlpha = a * 0.45;
  ctx.fillStyle = '#3a2614'; ctx.fillRect(0, 0, VW, VH);
  ctx.restore();
  ctx.save(); ctx.globalAlpha = a;
  const c = card(540, 240);
  text('Nap time…', VW / 2, c.y + 76, 42, PAL.ink, 'center', 'bold');
  text('Doggie needs a snuggle before trying again.', VW / 2, c.y + 130, 18, PAL.ink, 'center', 'italic');
  const blink = Math.sin(simT * 3.4) > -0.4;
  if (blink) text('press R — or tap — to continue from the last pillow', VW / 2, c.y + 182, 17, '#9a6fb8', 'center', 'bold');
  ctx.restore();
}
function drawShopIcon(id, x, y) {
  ctx.save(); ctx.translate(x, y);
  if (id === 'heal' || id === 'maxhp') {
    ctx.fillStyle = '#d9483f'; heartPath(0, 0, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(86,50,40,.5)'; ctx.lineWidth = 1.6; ctx.stroke();
    if (id === 'maxhp') {
      ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-3.5, -1); ctx.lineTo(3.5, -1); ctx.moveTo(0, -4.5); ctx.lineTo(0, 2.5); ctx.stroke();
    }
  } else if (id === 'speed') {
    E(0, 2, 9, 5.5, '#8fb3dd', 0.2);
    E(5, -1, 4.5, 4, '#6e93c4', 0.2);
    ctx.strokeStyle = '#ffd978'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, -3); ctx.lineTo(-7, -3);
    ctx.moveTo(-15, 2); ctx.lineTo(-8, 2);
    ctx.stroke();
  } else if (id === 'djump') {
    E(-4, 2, 7, 4.5, '#ffffff'); E(4, 2, 7, 4.5, '#ffffff'); E(0, -2, 8, 5, '#ffffff');
    ctx.strokeStyle = 'rgba(120,140,170,.5)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 1, 9.5, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
    ctx.strokeStyle = '#9a6fb8'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, -4); ctx.moveTo(-3, -8); ctx.lineTo(0, -11); ctx.lineTo(3, -8); ctx.stroke();
  } else if (id === 'dash') {
    ctx.strokeStyle = '#7fb3d8'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-13, -5); ctx.quadraticCurveTo(2, -8, 12, -3);
    ctx.moveTo(-14, 1); ctx.quadraticCurveTo(0, -1, 10, 3);
    ctx.moveTo(-11, 6); ctx.quadraticCurveTo(1, 5, 8, 8);
    ctx.stroke();
    ctx.fillStyle = '#a8cce8';
    ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(16, -2); ctx.lineTo(9, 1); ctx.closePath(); ctx.fill();
  } else if (id === 'yarn') {
    E(0.8, 1, 8.5, 8.5, 'rgba(60,40,20,.2)');
    E(0, 0, 8, 8, '#e25d52');
    ctx.strokeStyle = 'rgba(255,235,225,.85)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(0, 0, 5.2, 0.3, 2.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 6.8, 2.6, 4.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 4, 4.2, 6); ctx.stroke();
    ctx.strokeStyle = '#d23b2f'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(7, 3); ctx.quadraticCurveTo(13, 5, 16, 2); ctx.stroke();
  } else {
    const gold = id === 'ball3';
    if (id === 'ball2') {
      ctx.strokeStyle = '#c8a050'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-16, -4); ctx.lineTo(-8, -4);
      ctx.moveTo(-17, 1); ctx.lineTo(-9, 1);
      ctx.moveTo(-15, 6); ctx.lineTo(-9, 6);
      ctx.stroke();
    }
    E(0.8, 1, 8.5, 8.5, 'rgba(60,40,20,.2)');
    if (gold) {
      E(0, 0, 8, 8, '#f3cb5e');
      ctx.strokeStyle = 'rgba(150,100,20,.55)';
    } else {
      E(0, 0, 8, 8, '#f6f2ea');
      ctx.strokeStyle = 'rgba(86,60,40,.4)';
    }
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.stroke();
    ctx.strokeStyle = gold ? '#a8542f' : '#d23b2f'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(-6.5, 0, 6.5, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(6.5, 0, 6.5, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
    if (gold) { ctx.fillStyle = '#fff3c0'; starPath(7, -7, 3.5); ctx.fill(); }
    return ctx.restore();
  }
  ctx.restore();
}
function drawShop() {
  ctx.fillStyle = 'rgba(50,35,20,.45)'; ctx.fillRect(0, 0, VW, VH);
  const c = card(640, 500);
  text('❧  The Plush Peddler  ❧', VW / 2, c.y + 28, 20, PAL.ink, 'center', 'bold');
  ctx.save(); ctx.translate(c.x + c.w - 66, c.y + 28);
  E(0, 0, 8.5, 8.5, '#c8922e'); E(0, 0, 6, 6, '#f5cc6a');
  ctx.restore();
  text(String(buttons), c.x + c.w - 53, c.y + 29, 16, PAL.ink, 'left', 'bold');
  const ROWS = SHOP_ITEMS.length + 1;
  for (let i = 0; i < ROWS; i++) {
    const ry = c.y + 50 + i * 41;
    if (i === shopSel) {
      ctx.fillStyle = 'rgba(154,111,184,.14)'; RR(c.x + 14, ry, c.w - 28, 38, 9); ctx.fill();
      ctx.strokeStyle = 'rgba(154,111,184,.55)'; ctx.lineWidth = 2; RR(c.x + 14, ry, c.w - 28, 38, 9); ctx.stroke();
    }
    if (i < SHOP_ITEMS.length) {
      const it = SHOP_ITEMS[i];
      const av = shopAvail(it);
      ctx.save();
      if (av !== true) ctx.globalAlpha = 0.55;
      ctx.save(); ctx.translate(c.x + 42, ry + 19); ctx.scale(0.8, 0.8); drawShopIcon(it.id, 0, 0); ctx.restore();
      text(it.name, c.x + 72, ry + 12, 14.5, PAL.ink, 'left', 'bold');
      text(it.desc, c.x + 72, ry + 28, 11, PAL.ink, 'left', 'italic', 0.8);
      if (av === true) {
        const afford = buttons >= it.price;
        ctx.save(); ctx.translate(c.x + c.w - 92, ry + 19);
        ctx.globalAlpha = afford ? 1 : 0.5;
        E(0, 0, 7.5, 7.5, '#c8922e'); E(0, 0, 5.2, 5.2, '#f5cc6a');
        ctx.restore();
        text(String(it.price), c.x + c.w - 79, ry + 19, 14.5, afford ? PAL.ink : 'rgba(93,68,52,.5)', 'left', 'bold');
      } else {
        text(String(av), c.x + c.w - 150, ry + 19, 11.5, '#9a6fb8', 'left', 'italic');
      }
      ctx.restore();
    } else {
      text('Esc', c.x + 42, ry + 19, 11, PAL.ink, 'center', 'italic', 0.6);
      text('Leave the shop', c.x + 72, ry + 19, 14, PAL.ink, 'left', 'bold', 0.85);
    }
  }
  text('↑↓ choose  ·  Space buy  ·  Esc leave  ·  (or tap)', VW / 2, c.y + c.h - 14, 12, PAL.ink, 'center', 'italic', 0.7);
}
function drawPaused() {
  ctx.fillStyle = 'rgba(60,40,22,.35)'; ctx.fillRect(0, 0, VW, VH);
  const c = card(380, 130);
  text('Paused', VW / 2, c.y + 56, 34, PAL.ink, 'center', 'bold');
  text('press P to keep strolling', VW / 2, c.y + 96, 16, PAL.ink, 'center', 'italic', 0.8);
}

// ============================================================ master draw
function draw() {
  ctx.setTransform(RS, 0, 0, RS, 0, 0);
  drawSky();
  drawHills();
  lightRays();
  ctx.save();
  // snap the camera to the device-pixel grid so tile edges never antialias into seams
  ctx.translate(-Math.round(camX * RS) / RS, -Math.round(camY * RS) / RS);
  drawPonds();
  drawGeysers();
  drawTreesAndFences();
  drawTiles();
  drawWindZones();
  drawBooks();
  drawMushrooms();
  drawCottage();
  drawGoalBook();
  drawSignsAndPillows();
  drawShops();
  drawItems();
  drawLeaves();
  drawRollers();
  drawApples();
  enemies.forEach(en => {
    if (en.gone) return;
    if (en.x < camX - 160 || en.x > camX + VW + 160) return;
    drawShadow(en.x, en.y, en.type === 'rawr' ? 30 : en.type === 'rhino' ? 26 : en.type === 'bird' ? 11 : 16);
    const fn = en.type === 'rhino' ? drawRhino : en.type === 'tiger' ? drawTiger : en.type === 'rawr' ? drawRawr : drawBird;
    fn(en);
  });
  drawButterflies();
  if (state === 'play' || state === 'over' || state === 'chapter' || state === 'shop') {
    drawCompanions();
    drawPlayer();
    drawBalls();
    drawYarn();
    drawAim();
  } else if (state === 'win') {
    drawWinScene();
  }
  drawParticles();
  drawForeground();
  ctx.restore();
  drawMotes();
  drawWeather();
  if (THEME.tint) { ctx.fillStyle = THEME.tint; ctx.fillRect(0, 0, VW, VH); }
  drawVignette();
  if (state === 'play') { drawHUD(); drawBanner(); }
  if (touchUI && state === 'play') drawTouchButtons();
  if (state === 'title') drawTitle();
  if (state === 'chapter') drawChapter();
  if (state === 'shop') drawShop();
  if (state === 'win') drawWin();
  if (state === 'over') drawOver();
  if (paused && state === 'play') drawPaused();
  if (paperTex) { // paper grain over the whole page
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(paperTex, 0, 0, VW, VH);
    ctx.restore();
  }
}

// ---- lineup pose (for ?pose=lineup screenshots)
function drawLineup() {
  ctx.setTransform(RS, 0, 0, RS, 0, 0);
  ctx.fillStyle = '#fdf4e0'; ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = PAL.grass; RR(60, 420, VW - 120, 18, 9); ctx.fill();
  drawBear(240, 424, { t: 1.2, scale: 2.5, face: 1 });
  drawDoggie(480, 424, { t: 1.2, scale: 2.5, face: 1 });
  drawDearie(720, 424, { t: 1.2, scale: 2.5, face: 1 });
  text('Bear', 240, 480, 26, PAL.ink, 'center', 'bold');
  text('Doggie', 480, 480, 26, PAL.ink, 'center', 'bold');
  text('Dearie', 720, 480, 26, PAL.ink, 'center', 'bold');
}
function drawFoes() {
  ctx.setTransform(RS, 0, 0, RS, 0, 0);
  ctx.fillStyle = '#fdf4e0'; ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = THEME.grass; RR(40, 430, VW - 80, 16, 8); ctx.fill();
  drawRhino({ x: 150, y: 434, dir: 1, t: 1.2, state: 'patrol', scale: 2 });
  drawTiger({ x: 400, y: 434, dir: 1, t: 1.2, vx: 0, vy: 0, grounded: true, scale: 2 });
  drawRawr({ x: 640, y: 434, dir: 1, t: 1.2, state: 'sleep', scale: 2 });
  drawBird({ x: 870, y: 400, fdir: 1, t: 1.2, state: 'wander', scale: 2 });
  text('Rhino', 150, 490, 24, PAL.ink, 'center', 'bold');
  text('Tiger', 400, 490, 24, PAL.ink, 'center', 'bold');
  text('Rawr', 640, 490, 24, PAL.ink, 'center', 'bold');
  text('Bird', 870, 490, 24, PAL.ink, 'center', 'bold');
}

// ============================================================ main loop
let lastT = 0, perfAcc = 0, perfN = 0, perfCool = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!lastT) lastT = ts;
  const rawDt = ts - lastT;
  let dt = Math.min(0.033, rawDt / 1000);
  lastT = ts;
  // adaptive resolution — trade pixels for a steady frame rate
  if (rawDt > 0 && rawDt < 250) { perfAcc += rawDt; perfN++; }
  if (perfN >= 90) {
    const avg = perfAcc / perfN;
    perfAcc = 0; perfN = 0;
    if (perfCool > 0) perfCool--;
    else if (avg > 19.5 && rsIdx > 0) { rsIdx--; RS = RS_STEPS[rsIdx]; applyRS(); perfCool = 2; }
    else if (avg < 12.5 && rsIdx < RS_STEPS.length - 1) { rsIdx++; RS = RS_STEPS[rsIdx]; applyRS(); perfCool = 4; }
  }
  pollGamepad();
  if (paused && state === 'play') { simT += dt; draw(); pressed.clear(); return; }
  if (state === 'title') { simT += dt; updateAmbient(dt); musicTick(); updateParticles(dt); }
  else update(dt);
  draw();
}

// ---- boot
makePaper();
curLevel = clamp(parseInt(qs.get('lv') || '0', 10) || 0, 0, LEVELS.length - 1);
if (qs.get('hero') !== null) setHero(clamp(parseInt(qs.get('hero'), 10) || 0, 0, 2));
if (qs.get('touch')) {
  touchUI = true;
  if (qs.get('touch') === '2') { upg.ball = true; upg.dash = true; upg.yarn = true; }
}
if (touchUI) { SWAPBTN.x = VW - 208; SWAPBTN.y = 64; SWAPBTN.w = 190; SWAPBTN.h = 38; MUTEBTN.y = SWAPBTN.y + SWAPBTN.h + 8; }
buildLevel(curLevel);
resetLevel();

if (poseMode === 'lineup') {
  simT = 1.2;
  drawLineup();
} else if (poseMode === 'foes') {
  simT = 1.2;
  drawFoes();
} else if (shotMode) {
  state = 'play';
  const secs = parseFloat(qs.get('t') || '4');
  if (shotMode === 'at') {
    const x = parseFloat(qs.get('x') || String(player.x));
    player.x = x;
    const gy = groundBelowY(x, 0);
    player.y = gy !== null ? gy : 12 * TILE;
    checkpoint = { x: player.x, y: player.y };
    comps[0].x = x - 40; comps[0].y = player.y;
    comps[1].x = x - 76; comps[1].y = player.y;
    camX = clamp(x - VW * 0.45, 0, WORLD_W - VW);
    camY = clamp(player.y - VH * 0.64, 0, WORLD_H - VH);
    if (qs.get('walk')) autopilot = true;
    if (qs.get('aim')) { upg.ball = true; upg.ball2 = qs.get('aim') === '2'; aiming = true; aimPt = { x: 620, y: 210 }; }
    for (let i = 0; i < secs * 60; i++) update(1 / 60);
    if (qs.get('yarn')) { upg.yarn = true; player.face = 1; fireYarn(); for (let i = 0; i < 8; i++) update(1 / 60); }
  } else {
    autopilot = true;
    for (let i = 0; i < secs * 60; i++) update(1 / 60);
  }
  draw();
} else {
  state = 'title';
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(frame);
}

// ---- debug / test hooks
if (typeof window !== 'undefined') {
  window.__game = {
    get state() { return state; },
    get hearts() { return hearts; },
    get buttons() { return buttons; },
    player: player,
    debug: {
      get goalX() { return GOAL.x; },
      get level() { return curLevel; },
      get shopX() { return shops.length ? shops[0].x : 0; },
      addButtons(n) { buttons += n; },
      setHearts(n) { hearts = n; },
      teleport(x) {
        player.x = x;
        const gy = groundBelowY(x, 0);
        player.y = gy !== null ? gy : 12 * TILE;
        player.vx = 0; player.vy = 0;
        camX = clamp(x - VW * 0.45, 0, WORLD_W - VW);
      },
      set autopilot(v) { autopilot = v; },
      step(dt) { update(dt); }
    }
  };
}

})();
