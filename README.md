# Doggie & Friends — *The Stroll Home* 🧸

A cozy storybook side-scroller starring three real-life stuffed animals:
**Doggie** (the hero), with **Bear** and **Dearie** running along behind him.

## Play

Just open `index.html` in any browser (double-click it — no build, no server,
no dependencies). Works on desktop and on tablets (touch buttons appear
automatically).

## Deploy as a PWA

The game is a full Progressive Web App — installable, offline-capable, and
fullscreen on phones/tablets (no page chrome, no rounded corners).

1. Host the folder on any **https** static host:
   - **Netlify**: drag the folder onto app.netlify.com/drop
   - **GitHub Pages**: push the repo, enable Pages on the repo settings
   - **itch.io**: zip the folder, upload as an HTML game
   - Local test: `npx serve .` (service worker works on localhost)
2. On iPhone/iPad: open the URL in Safari → Share → **Add to Home Screen**.
   It launches fullscreen with the Doggie icon, landscape, no browser UI.
   On Android, Chrome shows an install prompt automatically.
3. When you deploy an update, bump `CACHE` in `sw.js` (e.g. `doggie-v2`)
   so installed copies fetch the new build.

Touch devices and installed apps get the edge-to-edge layout automatically;
desktop browsers keep the framed storybook page. Test the fullscreen layout
on desktop with `?fs=1`. Regenerate icons by screenshotting `icon.html`.

## Controls

**On tablets / phones** (automatic): touch the left half of the screen and
slide your thumb — a paw pad appears under your finger to run. Big plush
buttons sit bottom-right: the green arrow jumps (hold for higher), the
stacked-trio button fires the Stuffie Stack, and owned upgrades add their
own buttons (⚾ tap to throw, or drag off it to aim with a trajectory;
» dash; yarn ball zips). The gold star is the hero power — every friend
has their own! Tap the chips top-right to swap hero or mute.

**On a gamepad** (plug in or pair — works in any browser): left stick or
d-pad runs, **A** jumps (hold for higher), **Y** fires the Stuffie Stack,
**B** dashes, **X** throws the baseball (straight — or hold the **right
stick** to aim with the trajectory arc, then press X), **RB/RT** zips the
yarn, **LT** fires the hero power, **LB** swaps hero, **Start** pauses and advances menus, and the shop
navigates with stick/d-pad + A to buy, B to leave. Rumble included. Note:
browsers only unlock sound after a click/tap/keypress, so give the page one
tap before handing over the controller.

**On keyboards:**

| Action | Keys |
|---|---|
| Run | `←` `→` or `A` `D` |
| Jump (hold for higher) | `Space` / `W` / `↑` |
| **Stuffie Stack** team launch | `X` (also `E`) |
| Swap hero (Doggie / Bear / Dearie) | `C` or tap the top-right chip |
| Throw baseball (once bought) | `F` straight ahead, or **hold left-click to aim** — release to throw |
| Dash (once bought) | `Z` / `Shift` or tap `»` |
| Yarn zinger (once bought) | `G` — poofs a foe ahead and pulls you to it |
| Buy at the heart shop | `▼` / `S` or tap the stall |
| Pause / Restart / Sound | `P` / `R` / `M` |
| **Hero Power** (each friend has their own!) | `V` — recharges in 60s |
| Skip to next chapter (keyboard only) | `N` |

## The game

Eleven storybook chapters, each in its own hand-painted biome:

1. **The Meadow** · 2. **The Whispering Woods** · 3. **The Golden Dunes** ·
4. **Orchard Lane** · 5. **The Snowy Peaks** (toboggan!) · 6. **Petal
Gardens** · 7. **Sandy Shores** · 8. **Glowshroom Hollow** · 9. **The Great
Bookshelf** (climb straight UP!) · 10. **Ember Canyon** · 11. **The Starlit
Stroll** — home at last.

- **Hero Powers** (`V` / the gold-star button / LT, one per friend, 60s
  recharge): **Doggie** flings his collar — a comet that chases down and
  poofs *every* rascal on screen. **Bear** grows HUGE and his roar stuns
  everyone in sight (they just see stars — walk right past, or boop them).
  **Dearie** transforms into a true deer and charges through up to two
  foes. Swap heroes (`C`) to bring the right power!
- **Gate guardians**: a giant sleepy Rawr blocks the gates of chapters 3, 6
  and 10. Dodge his pounces, then boop his noggin while he's dizzy — three
  boops makes a friend ♥
- **3 hidden Story Pages** per chapter (33 total) — tucked up high, behind
  things, and past tricky jumps. Find all three in a chapter for +15
  buttons at the gate; the ending counts your full collection.
- **Cushion switches** raise bridges of books — some only for a few
  seconds. Stomp the big gold buttons!

- **Stuffie Stack** (`X`) — Bear and Dearie launch the hero sky-high. Big
  cliffs need it; Ember Canyon needs it twice in a row.
- **The Plush Peddler** waits halfway through every chapter. Browse with
  `▼`: plush hearts (10), a bigger heart pouch up to 5 (25), zoomy
  slippers (20), cloud-bounce double jump (30), the wind-ribbon dash (25),
  and the lucky baseball (30) — throw with `F`, two bonks poofs a foe.
  Upgrade it with Fastball Stitch (35) and the one-bonk Golden Baseball (50).
- Monsters get meaner every three chapters: faster charges, longer leaps,
  shorter cooldowns, lighter sleepers, tougher hides.
- Buttons are money *and* score. Pillow checkpoints save your spot; the
  storybook gates turn the page; reach the cottage door in chapter 11:
  *"...snug, sleepy, and together. The End ♥"*

## Dev notes

- Everything is hand-drawn canvas code in `game.js` — the sprites are
  parametric plush drawings matched to photos of the real stuffies.
- `node smoke.js` runs a headless playthrough sanity check.
- Screenshot/debug URL params: `?pose=lineup`, `?pose=foes`, `?lv=1`, `?hero=1`,
  `?shot=play&t=4`, `?shot=at&x=8650&t=1&walk=1`.
# doggie
