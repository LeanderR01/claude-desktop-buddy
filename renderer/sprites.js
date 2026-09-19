// Pixel-art Claude mascot, exactly like the Claude Code terminal one:
// square body with hard corners, two square eyes, side nubs at mid height,
// two short legs. One unit = 2 grid pixels so eyes can close and legs can step.
// Works in both node (icon generation) and the browser (renderer).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SPRITES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Grid unit: 2 grid pixels = 1 "mascot pixel" (so eyes can be 1.5).
  const W = 54; // body + arms use x 0..37, laptop/rod use x 38..53
  const H = 20;

  const PALETTE = {
    B: '#D97757', // body (Claude orange)
    E: '#2E2A24', // eyes
    P: '#F2A0A0', // blush
    H: '#E86A6A', // hearts
    U: '#9C7A5B', // dust
    Z: '#8FA6BF', // zzz / thinking dots
    L: '#4A4A4A', // laptop
    S: '#BFE3F0', // laptop screen
    G: '#5CB87A', // check mark
    Y: '#E0B04A', // bell / clock
    C: '#F5EDE3', // cup
    K: '#6B4A2B', // coffee / fishing rod
    W: '#9A9A9A', // fishing line
    R: '#E04B4B', // float
  };

  function grid() {
    return Array.from({ length: H }, () => Array(W).fill('.'));
  }
  function rect(g, x, y, w, h, c) {
    for (let j = y; j < y + h; j++) {
      if (j < 0 || j >= H) continue;
      for (let i = x; i < x + w; i++) {
        if (i < 0 || i >= W) continue;
        g[j][i] = c;
      }
    }
  }
  function toStrings(g) {
    return g.map((r) => r.join(''));
  }

  // Sizes in mascot pixels (mp), 1 mp = 2 grid px:
  // body 13 x 8, arms 3 long x 1.5 thick at mid height, eyes 1.5 x 1.5 in the
  // top third, legs 1.5 wide x 2 long as one pair per side.
  function body(g, y, opts = {}) {
    const h = opts.h || 16;
    rect(g, 6, y, 26, h, 'B');
    const ny = y + Math.round(h * 0.4);
    rect(g, 0, ny, 6, 3, 'B');
    rect(g, 32, ny, 6, 3, 'B');
    const kind = opts.eyes || 'open';
    if (kind === 'closed') {
      rect(g, 10, y + 6, 3, 1, 'E');
      rect(g, 24, y + 6, 3, 1, 'E');
    } else if (kind === 'happy') {
      rect(g, 10, y + 4, 3, 1, 'E');
      rect(g, 24, y + 4, 3, 1, 'E');
    } else {
      rect(g, 10, y + 4, 3, 3, 'E');
      rect(g, 24, y + 4, 3, 3, 'E');
    }
  }
  function legs(g, xs, h = 4, y = 16) {
    for (const x of xs) rect(g, x, y, 3, h, 'B');
  }
  const LEGS = [8, 13, 22, 27]; // left pair, right pair

  function makeStand(opts = {}) {
    const g = grid();
    body(g, 0, opts);
    legs(g, LEGS);
    return toStrings(g);
  }
  function makeWalk(step) {
    const g = grid();
    body(g, 0);
    if (step === 1) legs(g, [6, 13, 22, 29]); // stride
    else {
      legs(g, [10, 25]);
      legs(g, [13, 22], 2); // inner legs lifted
    }
    return toStrings(g);
  }
  function makeJump() {
    const g = grid();
    body(g, 0, { eyes: 'happy' });
    legs(g, LEGS, 2); // tucked
    return toStrings(g);
  }

  // Sitting: body drops onto the ground, legs disappear.
  function makeSit(opts = {}) {
    const g = grid();
    if (opts.bounce) {
      body(g, 2, opts);
      legs(g, LEGS, 2, 18);
    } else {
      body(g, 4, opts);
    }
    return toStrings(g);
  }

  // Sleeping: flatter block, eyes closed, breathing alternates height.
  function makeSleep(breath) {
    const g = grid();
    if (breath) body(g, 8, { h: 12, eyes: 'closed' });
    else body(g, 6, { h: 14, eyes: 'closed' });
    return toStrings(g);
  }

  // Working: small grey laptop flat on the ground in front, the thin lid
  // leans away from the buddy, two little hands hover over the keyboard and
  // type (frames alternate which hand is down).
  function makeWork(alt) {
    const g = grid();
    body(g, 0);
    legs(g, LEGS);
    rect(g, 40, 18, 10, 2, 'L'); // keyboard base on the ground
    // lid: thin diagonal rising away from the buddy
    rect(g, 46, 16, 2, 2, 'W');
    rect(g, 48, 14, 2, 2, 'W');
    rect(g, 50, 12, 2, 2, 'W');
    rect(g, 52, 10, 2, 2, 'W');
    // hands over the keyboard, alternating
    rect(g, 40, alt ? 14 : 16, 2, 2, 'B');
    rect(g, 44, alt ? 16 : 14, 2, 2, 'B');
    return toStrings(g);
  }

  // Fishing: rod up to the right from the arm, line straight down.
  function makeFish(alt) {
    const g = grid();
    body(g, 0);
    legs(g, LEGS);
    rect(g, 38, 6, 2, 2, 'K');
    rect(g, 40, 4, 2, 2, 'K');
    rect(g, 42, 2, 2, 2, 'K');
    rect(g, 44, 0, 2, 2, 'K');
    rect(g, 46, 2, 2, 18, 'W');
    rect(g, 46, alt ? 14 : 16, 2, 2, 'R');
    return toStrings(g);
  }

  // Reading: sits with an open book on the ground in front, one hand on the
  // page (the hand switches sides when a page is flipped).
  function makeRead(flip) {
    const g = grid();
    body(g, 4);
    rect(g, 38, 14, 6, 2, 'C'); // left page
    rect(g, 44, 14, 6, 2, 'C'); // right page
    rect(g, 38, 16, 12, 2, 'K'); // cover
    rect(g, flip ? 44 : 38, 12, 2, 2, 'B'); // hand
    return toStrings(g);
  }

  // Swimming: lower half below the waterline, splashes in front.
  function makeSwim(alt) {
    const g = grid();
    body(g, alt ? 9 : 8, { h: 12 });
    rect(g, 0, 16, W, 2, 'S'); // waterline
    rect(g, 40, alt ? 12 : 14, 2, 2, 'S'); // splash
    rect(g, 44, alt ? 14 : 12, 2, 2, 'S');
    return toStrings(g);
  }

  // Biking: body up on two grey wheels, handlebar in front, pedal alternates.
  function wheelAt(g, x, y) {
    rect(g, x + 1, y, 4, 1, 'L');
    rect(g, x, y + 1, 6, 4, 'L');
    rect(g, x + 1, y + 5, 4, 1, 'L');
  }
  function makeBike(alt) {
    const g = grid();
    body(g, 0, { h: 12 });
    wheelAt(g, 7, 13);
    wheelAt(g, 23, 13);
    rect(g, 13, 14, 10, 1, 'K'); // frame bar
    rect(g, alt ? 16 : 18, 15, 2, 2, 'K'); // pedal
    rect(g, 32, 10, 2, 5, 'K'); // handlebar stem
    rect(g, 32, 10, 4, 1, 'K'); // handlebar
    return toStrings(g);
  }

  const FRAMES = {
    stand: makeStand(),
    happy: makeStand({ eyes: 'happy' }),
    walk1: makeWalk(1),
    walk2: makeWalk(2),
    sit: makeSit(),
    sitBounce: makeSit({ bounce: true }),
    sitHappy: makeSit({ eyes: 'happy', bounce: true }),
    sleep1: makeSleep(false),
    sleep2: makeSleep(true),
    work1: makeWork(false),
    work2: makeWork(true),
    fish1: makeFish(false),
    fish2: makeFish(true),
    read1: makeRead(false),
    read2: makeRead(true),
    swim1: makeSwim(false),
    swim2: makeSwim(true),
    bike1: makeBike(false),
    bike2: makeBike(true),
    jump: makeJump(),
  };

  const HEART = ['.HH.HH.', 'HHHHHHH', 'HHHHHHH', '.HHHHH.', '..HHH..', '...H...'];
  const ZLETTER = ['ZZZ', '..Z', '.Z.', 'Z..', 'ZZZ'];
  const BANG = ['EE', 'EE', 'EE', 'EE', '..', 'EE'];
  const DOTS = ['Z......', 'Z..ZZ..', '...ZZ.Z', '......Z'];
  const CHECK = ['......G', '.....GG', 'G...GG.', 'GG.GG..', '.GGG...', '..G....'];
  const BELL = ['...YY...', '..YYYY..', '.YYYYYY.', '.YYYYYY.', 'YYYYYYYY', '...EE...'];
  const CLOCK = ['..YYYY..', '.Y....Y.', 'Y...E..Y', 'Y...E..Y', 'Y...EE.Y', 'Y......Y', '.Y....Y.', '..YYYY..'];
  const CUP = ['.KKKK...', 'CCCCCC.C', 'CCCCCCC.', 'CCCCCC..', '.CCCC...'];
  const SPARK = ['..Y..', '..Y..', 'YYYYY', '..Y..', '..Y..'];

  return { W, H, PALETTE, FRAMES, HEART, ZLETTER, BANG, DOTS, CHECK, BELL, CLOCK, CUP, SPARK };
});
