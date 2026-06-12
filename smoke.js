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

// walk every chapter gate (befriending any gate-guardians), then the cottage
const totalLv = G.debug.levels;
let gates = true;
for (let lv = 0; lv < totalLv - 1; lv++) {
  G.debug.teleport(G.debug.goalX - 160);
  G.debug.tameBoss();
  fire('keydown', { code: 'ArrowRight' });
  pump(340);
  if (G.state !== 'chapter') {
    check(false, 'gate completes chapter ' + (lv + 1) + ' (state: ' + G.state + ')');
    gates = false;
    break;
  }
  fire('keydown', { code: 'Space', key: ' ' }); pump(10);
}
if (gates) {
  check(G.debug.level === totalLv - 1 && G.state === 'play', 'arrived at the final chapter (' + totalLv + ')');
  G.debug.teleport(G.debug.goalX - 160);
  G.debug.tameBoss();
  pump(340);
  check(G.state === 'win', 'cottage door ends the story (state: ' + G.state + ')');
}

// R starts a brand-new story from Chapter 1
fire('keydown', { code: 'KeyR', key: 'r' });
pump(5);
check(G.state === 'play' && G.debug.level === 0 && G.player.x < 400, 'R starts a fresh story from Chapter 1');

// N (keyboard only) skips to the next chapter
fire('keydown', { code: 'KeyN', key: 'n' });
pump(5);
check(G.state === 'play' && G.debug.level === 1, 'N skips to the next chapter');

// the chapter-5 toboggan mounts when landing anywhere along the run
fire('keydown', { code: 'KeyN', key: 'n' }); pump(3);
fire('keydown', { code: 'KeyN', key: 'n' }); pump(3);
fire('keydown', { code: 'KeyN', key: 'n' }); pump(3); // level index 4: The Snowy Peaks
fire('keyup', { code: 'ArrowRight' }); pump(3); // stop running before the ride
G.debug.teleport(6800); // mid-run, well past the crest
pump(30);
check(G.debug.level === 4 && G.player.sled === true, 'toboggan mounts mid-run on Snowy Peaks');
pump(280); // ride it out (forced 340px/s covers the rest), stopping short of the gate
check(G.player.sled === false && G.player.x > 8064 && G.state === 'play',
  'toboggan ride completes and dismounts (x: ' + Math.round(G.player.x) + ')');

// hero powers (V): Doggie's Collar Comet poofs every on-screen foe
G.debug.setHearts(5);
G.debug.teleport(3360); // tiger + two rhinos live on this stretch of Snowy Peaks
pump(3);
const foes0 = G.debug.enemiesNear;
fire('keydown', { code: 'KeyV', key: 'v' }); fire('keyup', { code: 'KeyV', key: 'v' });
pump(300);
check(foes0 >= 3 && G.debug.enemiesNear === 0 && G.debug.powerCds[0] > 0,
  'Collar Comet clears the screen (' + foes0 + ' foes -> ' + G.debug.enemiesNear + ')');

// Dearie's Wild Charge: a real gallop with its own cooldown
fire('keydown', { code: 'KeyC', key: 'c' }); pump(5);
fire('keydown', { code: 'KeyC', key: 'c' }); pump(5); // Doggie -> Bear -> Dearie
const cx0 = G.player.x;
fire('keydown', { code: 'KeyV', key: 'v' }); fire('keyup', { code: 'KeyV', key: 'v' });
pump(70);
check(G.player.x - cx0 > 300 && G.debug.powerCds[2] > 0 && G.state === 'play',
  'Wild Charge gallops Dearie forward (' + Math.round(G.player.x - cx0) + 'px)');

// Bear's Big Bear Roar: stuns whoever is on screen
fire('keydown', { code: 'KeyC', key: 'c' }); pump(5);
fire('keydown', { code: 'KeyC', key: 'c' }); pump(5); // Dearie -> Doggie -> Bear
G.debug.teleport(4032); // the bird wheels overhead here
pump(3);
fire('keydown', { code: 'KeyV', key: 'v' }); fire('keyup', { code: 'KeyV', key: 'v' });
pump(70);
check(G.debug.anyStunned && G.debug.powerCds[1] > 0, 'Big Bear Roar stuns the on-screen foes');

if (failures) { console.error('\nSMOKE FAILED: ' + failures); process.exit(1); }
console.log('\nSMOKE OK — level is playable start to finish');
