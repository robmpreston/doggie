/* Headless smoke test: stubs the DOM, loads game.js, simulates input,
   and checks the level can be moved through and won.  Run: node smoke.js */
'use strict';

const handlers = {};
function on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); }
function fire(type, ev) {
  (handlers[type] || []).forEach(f => f(Object.assign({ preventDefault() {}, repeat: false }, ev)));
}

const ctxStub = new Proxy({}, {
  get(t, p) {
    if (p === 'canvas') return cv;
    return (...a) => ({ addColorStop() {}, width: 10 });
  },
  set() { return true; }
});
const cv = {
  width: 960, height: 540, style: {},
  addEventListener: on,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
  getContext: () => ctxStub
};

global.window = global;
global.document = { getElementById: () => cv, addEventListener: on };
global.addEventListener = on;
global.location = { search: '' };
global.localStorage = { getItem: () => null, setItem() {} };
global.devicePixelRatio = 1;
let now = 0;
global.performance = { now: () => now };
let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };

require('./game.js');

function pump(n) {
  for (let i = 0; i < n; i++) {
    now += 16.7;
    const cb = rafCb; rafCb = null;
    if (cb) cb(now); else break;
  }
}
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  ok  ' + msg);
  else { console.error('  FAIL ' + msg); failures++; }
}

const G = window.__game;
check(!!G, 'game booted and exposed __game');

pump(5);
check(G.state === 'title', 'starts on title screen');

fire('keydown', { code: 'Space', key: ' ' });
pump(5);
check(G.state === 'play', 'any key starts play');

// run right for ~4s
fire('keydown', { code: 'ArrowRight', key: 'ArrowRight' });
const x0 = G.player.x;
pump(240);
check(G.player.x > x0 + 500, 'Doggie runs right (x ' + Math.round(x0) + ' -> ' + Math.round(G.player.x) + ')');

// hero switching survives a few cycles
fire('keydown', { code: 'KeyC', key: 'c' }); pump(8);
fire('keydown', { code: 'KeyC', key: 'c' }); pump(8);
fire('keydown', { code: 'KeyC', key: 'c' }); pump(8);
check(G.state === 'play', 'C cycles the hero without breaking play');

// jump
const yBefore = G.player.y;
fire('keydown', { code: 'Space', key: ' ' });
pump(12);
check(G.player.y < yBefore - 20, 'Doggie jumps');
fire('keyup', { code: 'Space', key: ' ' });
pump(80);

// Stuffie Stack from the ground
fire('keyup', { code: 'ArrowRight' });
pump(40);
const groundY = G.player.y;
fire('keydown', { code: 'KeyX', key: 'x' });
pump(30); // gather + spring + launch
check(G.player.y < groundY - 120, 'Stuffie Stack launches Doggie high (' + Math.round(groundY - G.player.y) + 'px up)');
pump(180); // land + cooldown

// long autopilot soak — make sure nothing crashes over 30s of play
G.debug.autopilot = true;
pump(1800);
G.debug.autopilot = false;
check(G.state === 'play' || G.state === 'over' || G.state === 'win', 'survives 30s autopilot soak (state: ' + G.state + ')');

// the shop: browse the overlay, buy a heart for 10 buttons
if (G.state !== 'play') { fire('keydown', { code: 'KeyR', key: 'r' }); pump(5); }
fire('keyup', { code: 'ArrowRight' }); pump(10);
G.debug.teleport(G.debug.shopX);
G.debug.setHearts(2); G.debug.addButtons(40);
const wallet = G.buttons;
pump(10);
fire('keydown', { code: 'ArrowDown', key: 'ArrowDown' });
fire('keyup', { code: 'ArrowDown', key: 'ArrowDown' });
pump(5);
check(G.state === 'shop', 'pressing down at the stall opens the shop');
fire('keydown', { code: 'Space', key: ' ' }); pump(5); // buy heal (row 0)
check(G.hearts === 3 && G.buttons === wallet - 10,
  'shop sells a heart for 10 buttons (hearts: ' + G.hearts + ', wallet: ' + wallet + ' -> ' + G.buttons + ')');
fire('keydown', { code: 'ArrowDown', key: 'ArrowDown' }); pump(3);
fire('keydown', { code: 'ArrowDown', key: 'ArrowDown' }); pump(3);
fire('keydown', { code: 'ArrowDown', key: 'ArrowDown' }); pump(3);
fire('keydown', { code: 'ArrowDown', key: 'ArrowDown' }); pump(3);
fire('keydown', { code: 'ArrowDown', key: 'ArrowDown' }); pump(3); // row 5: baseball
fire('keydown', { code: 'Space', key: ' ' }); pump(5);
check(G.buttons === wallet - 40, 'shop sells the lucky baseball');
fire('keydown', { code: 'Escape', key: 'Escape' }); pump(5);
check(G.state === 'play', 'Esc leaves the shop');

// throwing the baseball
fire('keydown', { code: 'KeyF', key: 'f' });
fire('keyup', { code: 'KeyF', key: 'f' });
pump(10);
check(G.state === 'play', 'baseball throw does not break play');

// walk every chapter gate: 1 through 9, then the cottage on 10
let gates = true;
for (let lv = 0; lv < 9; lv++) {
  G.debug.teleport(G.debug.goalX - 160);
  fire('keydown', { code: 'ArrowRight' });
  pump(320);
  if (G.state !== 'chapter') {
    check(false, 'gate completes chapter ' + (lv + 1) + ' (state: ' + G.state + ')');
    gates = false;
    break;
  }
  fire('keydown', { code: 'Space', key: ' ' }); pump(10);
}
if (gates) {
  check(G.debug.level === 9 && G.state === 'play', 'arrived at Chapter 10');
  G.debug.teleport(G.debug.goalX - 160);
  pump(320);
  check(G.state === 'win', 'cottage door ends the story (state: ' + G.state + ')');
}

// R starts a brand-new story from Chapter 1
fire('keydown', { code: 'KeyR', key: 'r' });
pump(5);
check(G.state === 'play' && G.debug.level === 0 && G.player.x < 400, 'R starts a fresh story from Chapter 1');

if (failures) { console.error('\nSMOKE FAILED: ' + failures); process.exit(1); }
console.log('\nSMOKE OK — level is playable start to finish');
