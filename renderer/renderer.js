// Claude Buddy behavior engine.
// Behaviors are generator functions resumed once per animation frame,
// so "yield" means "wait one frame" and helpers like wait()/walkTo()
// can be composed with yield*.
//
// Two modes:
//  - active: buddy on screen, render every animation frame
//  - hidden: window is hidden by the main process, we only wake up twice a
//    second on the wall clock to advance time and check triggers.
(() => {
  const S = window.SPRITES;
  const C = window.BUDDY_CONFIG;

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  function resize(w, h) {
    W = w || window.innerWidth;
    H = h || window.innerHeight;
    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = false;
  }
  resize();
  window.addEventListener('resize', () => resize());

  const SC = C.scale;
  const DW = S.W * SC;
  const DH = S.H * SC;
  const groundY = () => H - DH;
  // Where a visit happens vertically: sometimes the floor, mostly somewhere
  // in the middle of the screen so the buddy does not live in the dock.
  function pickY() {
    return Math.random() < 0.35 ? groundY() : rand(0.08, 0.85) * groundY();
  }

  // ---- input (cursor + idle) ----
  const cur = { x: -9999, y: -9999, idle: 0 };
  let paused = false;
  let quiet = false;
  let testMode = C.testMode;
  const eventQueue = [];
  let current = ''; // name of the running behavior, for the log
  function rlog(m) {
    if (window.buddy) window.buddy.log(m);
    else console.log(m);
  }
  window.onerror = (msg, _src, line) => rlog(`error: ${msg} (line ${line})`);
  window.onunhandledrejection = (e) => rlog(`rejection: ${e.reason}`);

  if (window.buddy) {
    window.buddy.onTick((d) => {
      cur.x = d.x;
      cur.y = d.y;
      cur.idle = d.idle;
      // while hidden, follow the display the cursor is on so the canvas
      // already has the right size when the next visit starts
      if (state === 'hidden' && d.dw && d.dh && (d.dw !== W || d.dh !== H)) resize(d.dw, d.dh);
    });
    window.buddy.onPaused((p) => {
      paused = p;
      if (p) hideNow();
      else scheduleNext(true);
    });
    window.buddy.onQuiet((q) => {
      quiet = q;
    });
    window.buddy.onTestMode((v) => {
      testMode = v;
      scheduleNext(true);
    });
    window.buddy.onAppearNow(() => {
      if (state === 'hidden' && !paused) startBehavior(pickBehavior());
    });
    window.buddy.onEvent((ev) => {
      if (paused) return;
      eventQueue.push(ev);
      if (state === 'hidden') startNextEvent();
    });
  } else {
    // browser mock for development: move mouse, press "a" (appear), "s" (stalk), "e" (event)
    let lastMove = performance.now();
    window.addEventListener('mousemove', (e) => {
      cur.x = e.clientX;
      cur.y = e.clientY;
      lastMove = performance.now();
    });
    setInterval(() => {
      cur.idle = (performance.now() - lastMove) / 1000;
    }, 200);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'a' && state === 'hidden') startBehavior(pickBehavior());
      if (e.key === 's' && state === 'hidden') startBehavior(bStalk);
      if (e.key === 'e' && state === 'hidden') {
        eventQueue.push({ kind: 'done', text: 'done: claude-buddy' });
        startNextEvent();
      }
    });
  }

  // ---- buddy state ----
  const dog = { x: -9999, y: 0, face: 1, frame: 'stand', vflip: false };
  let state = 'hidden'; // 'hidden' | 'active'
  let seq = null;
  let effects = [];
  let bubble = null;
  let t = 0;
  let dt = 0;
  let nextAt = 0;
  let stalkReadyAt = 0;

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function appearRange() {
    return testMode ? [C.testAppearMin, C.testAppearMax] : [C.appearMin, C.appearMax];
  }
  function stalkIdleSec() {
    return testMode ? C.testStalkIdleSec : C.stalkIdleSec;
  }
  function scheduleNext(soon) {
    const [a, b] = appearRange();
    nextAt = t + (soon ? rand(a * 0.3, a) : rand(a, b));
  }

  function hideNow() {
    const onScreen = dog.x > -DW && dog.x < W && dog.y > -DH && dog.y < H;
    rlog(`end ${current} at ${Math.round(dog.x)},${Math.round(dog.y)}${onScreen ? ' STILL ON SCREEN' : ''}`);
    current = '';
    state = 'hidden';
    seq = null;
    effects = [];
    bubble = null;
    dog.vflip = false;
    ctx.clearRect(0, 0, W, H);
    if (window.buddy) window.buddy.setVisible(false);
    scheduleNext();
  }

  // ---- effects ----
  function fx(map, x, y, opts = {}) {
    effects.push({
      map,
      x,
      y,
      vx: opts.vx || 0,
      vy: opts.vy || 0,
      age: 0,
      ttl: opts.ttl || 1,
      scale: opts.scale || SC,
      follow: opts.follow || false, // x/y relative to the buddy
      fade: opts.fade !== false,
    });
  }
  function spawnHeart(x, y) {
    fx(S.HEART, x + rand(-14, 14), y, { vx: rand(-8, 8), vy: rand(-45, -30), ttl: rand(1.2, 1.8), scale: SC * 0.75 });
  }
  function spawnHearts(n) {
    for (let i = 0; i < n; i++) spawnHeart(dog.x + DW * 0.6, dog.y - 10);
  }
  function spawnZ() {
    fx(S.ZLETTER, dog.x + DW * 0.8, dog.y + DH * 0.3, { vx: rand(6, 14), vy: rand(-20, -14), ttl: 2.2, scale: SC * 0.8 });
  }
  function spawnDust(x, y) {
    fx(['UU', 'UU'], x, y, { vx: rand(-30, 30), vy: rand(-25, -5), ttl: rand(0.3, 0.6), scale: SC * 0.6 });
  }
  function spawnBang() {
    fx(S.BANG, dog.x + DW * 0.7, dog.y - 7 * SC, { ttl: 0.8 });
  }
  function spawnDots() {
    fx(S.DOTS, dog.x + DW * 0.75, dog.y - 5 * SC, { ttl: 1.6, scale: SC * 0.8 });
  }
  function spawnIcon(map, ttl) {
    fx(map, DW * 0.3, -9 * SC, { ttl: ttl || 2.5, scale: SC, follow: true, fade: false });
  }
  function say(text, sec) {
    bubble = { text, until: t + (sec || C.bubbleSec) };
  }
  function maybeSay() {
    if (Math.random() < C.bubbleChance) say(pick(C.messages));
  }

  function cursorOnDog() {
    return cur.x > dog.x - 10 && cur.x < dog.x + DW + 10 && cur.y > dog.y - 10 && cur.y < dog.y + DH + 10;
  }

  // ---- generator helpers ----
  function* wait(sec) {
    const end = t + sec;
    while (t < end) yield;
  }
  function walkFrame(fps) {
    return Math.floor(t * fps) % 2 ? 'walk2' : 'walk1';
  }
  function* walkTo(x, speed, opts = {}) {
    while (Math.abs(dog.x - x) > Math.max(4, speed * dt * 1.5)) {
      const dir = Math.sign(x - dog.x) || 1;
      if (!opts.keepFace) dog.face = dir;
      dog.x += dir * speed * dt;
      dog.frame = walkFrame(speed > 200 ? 12 : 7);
      if (speed > 350 && Math.random() < dt * 12) spawnDust(dog.x + (dir > 0 ? 4 : DW - 4), dog.y + DH - 6);
      yield;
    }
    dog.frame = 'stand';
  }
  function* moveTo(x, y, speed, frame) {
    while (true) {
      const dx = x - dog.x;
      const dy = y - dog.y;
      const dist = Math.hypot(dx, dy);
      if (dist < Math.max(5, speed * dt * 1.5)) break;
      dog.face = Math.abs(dx) > 2 ? (dx > 0 ? 1 : -1) : dog.face;
      dog.x += (dx / dist) * speed * dt;
      dog.y += (dy / dist) * speed * dt;
      dog.frame = frame || walkFrame(speed > 200 ? 12 : 7);
      yield;
    }
  }
  function* hop(times, height) {
    for (let i = 0; i < times; i++) {
      const baseY = dog.y;
      const dur = 0.32;
      const end = t + dur;
      while (t < end) {
        const p = 1 - (end - t) / dur;
        dog.frame = 'jump';
        dog.y = baseY - Math.sin(p * Math.PI) * height;
        yield;
      }
      dog.y = baseY;
      dog.frame = 'happy';
      yield* wait(0.12);
    }
  }
  function* sitFor(sec, happy) {
    for (const end = t + sec; t < end; ) {
      dog.frame = Math.floor(t * 2.5) % 2 ? (happy ? 'sitHappy' : 'sitBounce') : 'sit';
      yield;
    }
  }
  function* celebrate() {
    spawnIcon(S.SPARK, 1.2);
    yield* hop(3, 22);
    maybeSay();
    dog.frame = 'happy';
    yield* wait(0.9);
  }
  function* think(sec) {
    dog.frame = 'stand';
    let next = t;
    for (const end = t + sec; t < end; ) {
      if (t >= next) {
        spawnDots();
        next = t + 1.4;
      }
      yield;
    }
  }
  function* leave(fast) {
    const exitLeft = dog.x + DW / 2 < W / 2;
    const exitX = exitLeft ? -DW - 20 : W + 20;
    const speed = fast ? 340 : 130;
    while (exitLeft ? dog.x > exitX : dog.x < exitX) {
      const dir = exitLeft ? -1 : 1;
      dog.face = dir;
      dog.x += dir * speed * dt;
      dog.frame = walkFrame(speed > 200 ? 12 : 8);
      yield;
    }
  }
  // enter from the edge closer to the cursor and stop near it
  function* enterNearCursor(speed) {
    dog.y = clamp(cur.y - DH * 0.5, 0, groundY());
    const fromLeft = cur.x < W / 2;
    dog.x = fromLeft ? -DW : W;
    const target = clamp(cur.x + (fromLeft ? -DW * 1.4 : DW * 0.6), 10, W - DW - 10);
    yield* walkTo(target, speed || 170);
    dog.face = cur.x > dog.x + DW / 2 ? 1 : -1;
  }

  // ---- behaviors ----
  function* bWalkAcross() {
    const fromLeft = Math.random() < 0.5;
    dog.y = pickY();
    dog.x = fromLeft ? -DW : W;
    const target = fromLeft ? W + 20 : -DW - 20;
    const speed = rand(75, 115);
    const stops = Math.random() < 0.65 ? 1 + Math.floor(Math.random() * 2) : 0;
    for (let i = 0; i < stops; i++) {
      const frac = (i + 1) / (stops + 1);
      const sx = dog.x + (target - dog.x) * frac * rand(0.7, 1.1);
      yield* walkTo(clamp(sx, 10, W - DW - 10), speed);
      const what = Math.random();
      if (what < 0.4) {
        yield* think(rand(1.5, 3));
        dog.face *= -1;
        yield* wait(0.5);
        dog.face *= -1;
        yield* wait(0.4);
      } else if (what < 0.75) {
        yield* sitFor(rand(2, 4));
        maybeSay();
      } else {
        dog.face = cur.x > dog.x + DW / 2 ? 1 : -1;
        dog.frame = 'stand';
        yield* wait(rand(1, 2));
      }
    }
    yield* walkTo(target, speed);
  }

  function* bPeek() {
    const edge = pick(['left', 'right', 'bottom', 'top']);
    if (edge === 'bottom') {
      dog.x = rand(0.15, 0.75) * W;
      dog.face = cur.x > dog.x ? 1 : -1;
      const top = H - DH * 0.62;
      dog.y = H;
      while (dog.y > top) {
        dog.y -= 90 * dt;
        dog.frame = 'stand';
        yield;
      }
      yield* wait(rand(2.5, 5));
      maybeSay();
      yield* wait(1);
      while (dog.y < H + 5) {
        dog.y += 110 * dt;
        yield;
      }
      return;
    }
    if (edge === 'top') {
      dog.vflip = true;
      dog.x = rand(0.15, 0.75) * W;
      dog.face = cur.x > dog.x ? -1 : 1; // mirrored because flipped
      const drop = -DH * 0.35;
      dog.y = -DH;
      while (dog.y < drop) {
        dog.y += 80 * dt;
        dog.frame = 'stand';
        yield;
      }
      yield* wait(rand(2.5, 5));
      maybeSay();
      yield* wait(1);
      while (dog.y > -DH - 5) {
        dog.y -= 100 * dt;
        yield;
      }
      dog.vflip = false;
      return;
    }
    const left = edge === 'left';
    dog.y = rand(0.2, 1) * groundY();
    const visible = DW * 0.48;
    dog.face = left ? 1 : -1;
    dog.x = left ? -DW : W;
    const peekX = left ? -DW + visible : W - visible;
    yield* walkTo(peekX, 120, { keepFace: true });
    dog.frame = 'stand';
    yield* wait(rand(2.5, 5));
    maybeSay();
    yield* wait(1);
    yield* walkTo(left ? -DW - 10 : W + 10, 150, { keepFace: true });
  }

  function* bChase() {
    dog.y = clamp(cur.y - DH * 0.5, 0, groundY());
    const fromLeft = cur.x > W / 2;
    dog.x = fromLeft ? -DW : W;
    yield* walkTo(fromLeft ? 30 : W - DW - 30, 200);
    spawnBang();
    yield* wait(0.5);
    const start = t;
    while (t - start < C.chaseTimeout) {
      const tx = cur.x - DW * 0.7;
      const ty = clamp(cur.y - DH * 0.5, 0, groundY());
      const dx = tx - dog.x;
      const dy = ty - dog.y;
      const dist = Math.hypot(cur.x - (dog.x + DW * 0.7), cur.y - (dog.y + DH * 0.5));
      if (dist < C.catchRadius) {
        yield* celebrate();
        yield* leave();
        return;
      }
      const d2 = Math.hypot(dx, dy) || 1;
      dog.face = dx > 0 ? 1 : -1;
      dog.x += (dx / d2) * C.chaseSpeed * dt;
      dog.y += (dy / d2) * C.chaseSpeed * dt;
      dog.frame = walkFrame(13);
      if (Math.random() < dt * 6) spawnDust(dog.x + DW * 0.2, dog.y + DH - 6);
      yield;
    }
    yield* sitFor(2.4);
    yield* leave();
  }

  function* bStalk() {
    const left = Math.random() < 0.5;
    dog.y = clamp(cur.y - DH * 0.5, 0, groundY());
    dog.x = left ? -DW : W;
    dog.face = left ? 1 : -1;
    yield* walkTo(left ? -DW * 0.5 : W - DW * 0.5, 55, { keepFace: true });
    dog.frame = 'stand';
    yield* wait(rand(1.2, 2));
    while (true) {
      if (cur.idle < 2) {
        spawnBang();
        dog.frame = 'stand';
        yield* wait(0.7);
        yield* leave(true);
        return;
      }
      const dist = Math.hypot(cur.x - (dog.x + DW * 0.7), cur.y - (dog.y + DH * 0.5));
      if (dist < C.pounceRange) break;
      const stepEnd = t + rand(0.6, 1.2);
      while (t < stepEnd) {
        const tx = cur.x - DW * 0.7;
        const ty = clamp(cur.y - DH * 0.5, 0, groundY());
        const dx = tx - dog.x;
        const dy = ty - dog.y;
        const d = Math.hypot(dx, dy) || 1;
        dog.face = dx > 0 ? 1 : -1;
        dog.x += (dx / d) * C.stalkSpeed * dt;
        dog.y += (dy / d) * C.stalkSpeed * dt;
        dog.frame = walkFrame(4);
        yield;
      }
      dog.frame = 'stand';
      yield* wait(rand(0.5, 1.1));
    }
    spawnBang();
    dog.frame = 'stand';
    yield* wait(0.8);
    yield* moveTo(cur.x - DW * 0.7, clamp(cur.y - DH * 0.55, 0, groundY()), C.pounceSpeed, 'jump');
    yield* celebrate();
    const guardEnd = t + C.guardMaxSec;
    while (cur.idle > 1.5 && t < guardEnd) {
      dog.frame = Math.floor(t * 2) % 2 ? 'sitBounce' : 'sit';
      yield;
    }
    if (cur.idle <= 1.5) {
      spawnBang();
      yield* hop(2, 18);
      say(pick(C.messages));
      yield* wait(1);
    }
    yield* leave();
  }

  function* bNap() {
    dog.y = pickY();
    const fromLeft = Math.random() < 0.5;
    dog.x = fromLeft ? -DW : W;
    yield* walkTo(rand(0.2, 0.7) * W, 100);
    dog.face *= -1;
    yield* wait(0.35);
    dog.face *= -1;
    yield* wait(0.35);
    const sleepEnd = t + rand(C.napMin, C.napMax);
    let nextZ = t + 1;
    while (t < sleepEnd) {
      dog.frame = Math.floor(t * 1.1) % 2 ? 'sleep2' : 'sleep1';
      if (t > nextZ) {
        spawnZ();
        nextZ = t + rand(1.4, 2.2);
      }
      if (cursorOnDog()) {
        spawnBang();
        dog.frame = 'stand';
        yield* wait(0.5);
        yield* celebrate();
        yield* leave();
        return;
      }
      yield;
    }
    yield* sitFor(1.2);
    yield* leave();
  }

  function* bZoomies() {
    dog.y = pickY();
    dog.x = -DW;
    const passes = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < passes; i++) {
      const last = i === passes - 1;
      const target = dog.x < W / 2 ? (last ? W + 20 : W - DW * 0.7) : last ? -DW - 20 : -DW * 0.3;
      yield* walkTo(target, rand(430, 520));
    }
  }

  // sits down with a tiny laptop and types for a while
  function* bWork() {
    dog.y = pickY();
    dog.x = Math.random() < 0.5 ? -DW : W;
    yield* walkTo(rand(0.2, 0.75) * W, 110);
    dog.face = 1;
    const workEnd = t + rand(8, 16);
    let nextDots = t + rand(2, 4);
    let said = false;
    while (t < workEnd) {
      dog.frame = Math.floor(t * 6) % 2 ? 'work2' : 'work1';
      if (t >= nextDots) {
        spawnDots();
        nextDots = t + rand(2, 4);
      }
      if (!said && t > workEnd - 4) {
        said = true;
        say(pick(C.workMessages));
      }
      yield;
    }
    spawnIcon(S.CHECK, 1.5);
    yield* hop(1, 16);
    dog.frame = 'happy';
    yield* wait(1.2);
    yield* leave();
  }

  function* bSitWatch() {
    dog.y = pickY();
    const left = Math.random() < 0.5;
    dog.x = left ? -DW : W;
    yield* walkTo(left ? rand(0.05, 0.2) * W : rand(0.8, 0.95) * W - DW, 110);
    const end = t + rand(8, 16);
    while (t < end) {
      dog.face = cur.x > dog.x + DW / 2 ? 1 : -1;
      dog.frame = Math.floor(t * 2.5) % 2 ? 'sitBounce' : 'sit';
      yield;
    }
    maybeSay();
    yield* wait(1.5);
    yield* leave();
  }

  // Parks at an edge of the screen (bottom or a side, never near the cursor),
  // opens the laptop and works alongside you for a while. Stays put.
  function* bCowork() {
    let targetX;
    let fromLeft;
    if (Math.random() < 0.6) {
      dog.y = groundY();
      targetX = rand(0.08, 0.85) * (W - DW);
      fromLeft = targetX < W / 2;
    } else {
      fromLeft = Math.random() < 0.5;
      dog.y = rand(0.15, 0.9) * groundY();
      targetX = fromLeft ? 12 : W - DW - 12;
    }
    dog.x = fromLeft ? -DW : W;
    yield* walkTo(targetX, 130);
    dog.face = cur.x > dog.x + DW / 2 ? 1 : -1;
    yield* wait(0.6);
    const end = t + rand(C.coworkMin, C.coworkMax);
    let nextGlance = t + rand(12, 25);
    let nextDots = t + rand(4, 9);
    while (t < end) {
      dog.frame = Math.floor(t * 5) % 2 ? 'work2' : 'work1';
      if (t >= nextDots) {
        spawnDots();
        nextDots = t + rand(5, 12);
      }
      if (t >= nextGlance) {
        // look over to you for a moment, then back to work
        const keep = dog.face;
        dog.frame = 'stand';
        dog.face = cur.x > dog.x + DW / 2 ? 1 : -1;
        yield* wait(rand(1.2, 2));
        if (Math.random() < 0.3) say(pick(C.coworkMessages), 3);
        dog.face = keep;
        nextGlance = t + rand(15, 35);
      }
      yield;
    }
    spawnIcon(S.CHECK, 1.5);
    yield* hop(1, 14);
    say(pick(C.coworkDoneMessages), 3);
    dog.frame = 'happy';
    yield* wait(2.2);
    yield* leave();
  }

  // Sits at the bottom edge and fishes below the screen. Sometimes a bite.
  function* bFish() {
    dog.y = groundY();
    dog.x = Math.random() < 0.5 ? -DW : W;
    yield* walkTo(rand(0.15, 0.8) * W, 110);
    dog.face = 1;
    const end = t + rand(20, 45);
    let nextBite = t + rand(8, 15);
    while (t < end) {
      dog.frame = Math.floor(t * 1.5) % 2 ? 'fish2' : 'fish1';
      if (t >= nextBite) {
        spawnBang();
        yield* wait(0.4);
        yield* hop(1, 12);
        if (Math.random() < 0.5) say(pick(C.fishMessages), 2.5);
        nextBite = t + rand(8, 15);
      }
      yield;
    }
    dog.frame = 'sit';
    yield* wait(1);
    yield* leave();
  }

  // sits down with a book for a while, flips pages now and then
  function* bRead() {
    dog.y = pickY();
    dog.x = Math.random() < 0.5 ? -DW : W;
    yield* walkTo(rand(0.2, 0.75) * W, 100);
    dog.face = 1;
    const end = t + rand(20, 40);
    let nextFlip = t + rand(3, 6);
    let flipUntil = 0;
    let said = false;
    while (t < end) {
      dog.frame = t < flipUntil ? 'read2' : 'read1';
      if (t >= nextFlip) {
        flipUntil = t + 0.4;
        nextFlip = t + rand(3, 6);
      }
      if (!said && t > end - 6) {
        said = true;
        if (Math.random() < 0.7) say(pick(C.readMessages), 3);
      }
      yield;
    }
    dog.frame = 'happy';
    yield* wait(1);
    yield* leave();
  }

  // swims across, splashing, sometimes treads water for a line
  function* bSwim() {
    dog.y = rand(0.3, 0.85) * groundY();
    const fromLeft = Math.random() < 0.5;
    dog.x = fromLeft ? -DW : W;
    const dir = fromLeft ? 1 : -1;
    dog.face = dir;
    const target = fromLeft ? W + 20 : -DW - 20;
    const stopX = Math.random() < 0.5 ? clamp(rand(0.3, 0.7) * W, 10, W - DW - 10) : null;
    let stopped = false;
    while (fromLeft ? dog.x < target : dog.x > target) {
      dog.x += dir * 70 * dt;
      dog.frame = Math.floor(t * 3) % 2 ? 'swim2' : 'swim1';
      if (stopX !== null && !stopped && (fromLeft ? dog.x >= stopX : dog.x <= stopX)) {
        stopped = true;
        const end = t + rand(2, 4);
        while (t < end) {
          dog.frame = Math.floor(t * 3) % 2 ? 'swim2' : 'swim1';
          yield;
        }
        say(pick(C.swimMessages), 2.5);
      }
      yield;
    }
  }

  // pedals across the screen, sometimes a line on the way
  function* bBike() {
    dog.y = Math.random() < 0.5 ? groundY() : pickY();
    const fromLeft = Math.random() < 0.5;
    dog.x = fromLeft ? -DW : W;
    const dir = fromLeft ? 1 : -1;
    dog.face = dir;
    const target = fromLeft ? W + 20 : -DW - 20;
    const sayX = Math.random() < 0.5 ? clamp(rand(0.35, 0.65) * W, 10, W - DW - 10) : null;
    let said = false;
    while (fromLeft ? dog.x < target : dog.x > target) {
      dog.x += dir * 230 * dt;
      dog.frame = Math.floor(t * 8) % 2 ? 'bike2' : 'bike1';
      if (sayX !== null && !said && (fromLeft ? dog.x >= sayX : dog.x <= sayX)) {
        said = true;
        say(pick(C.bikeMessages), 2.5);
      }
      yield;
    }
  }

  // jogs across with dust, sometimes drops a line mid-run
  function* bRun() {
    dog.y = pickY();
    const fromLeft = Math.random() < 0.5;
    dog.x = fromLeft ? -DW : W;
    const target = fromLeft ? W + 20 : -DW - 20;
    const mid = clamp(rand(0.35, 0.65) * W, 10, W - DW - 10);
    yield* walkTo(mid, rand(360, 430));
    if (Math.random() < 0.6) {
      say(pick(C.runMessages), 2.5);
      yield* wait(1.2);
    }
    yield* walkTo(target, rand(360, 430));
  }

  // walks in, thinks visibly, then says one of the lines
  function* bThink() {
    yield* enterNearCursor(120);
    yield* think(rand(2.5, 4));
    say(pick(C.messages), 4);
    dog.frame = 'happy';
    yield* wait(3);
    yield* leave();
  }

  // ---- event visits (from the main process) ----
  // ev = { kind, text, sticky }
  //   done: Claude Code finished        needs: Claude Code waits for you
  //   calendar: meeting soon            daily: no daily note yet
  //   stretch: long time at the desk    coffee: very long time at the desk
  //   week: friday wrap-up
  const EVENT_ICON = {
    done: S.CHECK,
    needs: S.BELL,
    calendar: S.CLOCK,
    daily: S.DOTS,
    stretch: S.SPARK,
    coffee: S.CUP,
    week: S.HEART,
  };
  function* bEvent(ev) {
    yield* enterNearCursor(ev.kind === 'needs' || ev.kind === 'calendar' ? 260 : 170);
    if (ev.kind === 'coffee') {
      // drags the cup along the whole way, drops it next to the cursor
      spawnIcon(S.CUP, 30);
    } else {
      spawnIcon(EVENT_ICON[ev.kind] || S.SPARK, 3);
    }
    if (ev.kind === 'needs' || ev.kind === 'calendar') spawnBang();
    yield* hop(ev.kind === 'stretch' ? 3 : 2, 18);
    say(ev.text, C.eventBubbleSec);
    if (ev.kind === 'week') spawnHearts(5);
    // stay until the bubble is gone; sticky visits wait for the human
    const minEnd = t + C.eventBubbleSec;
    const maxEnd = t + (ev.sticky ? 120 : C.eventBubbleSec);
    while (t < minEnd || (ev.sticky && cur.idle > 1.5 && t < maxEnd)) {
      dog.frame = Math.floor(t * 2.5) % 2 ? 'sitBounce' : 'sit';
      if (ev.kind === 'needs' && Math.random() < dt * 0.4) spawnBang();
      yield;
    }
    dog.frame = 'happy';
    yield* wait(0.6);
    yield* leave(ev.kind === 'needs');
  }

  const BEHAVIORS = [
    [bWalkAcross, 20],
    [bPeek, 15],
    [bChase, 12],
    [bThink, 11],
    [bCowork, 10],
    [bWork, 6],
    [bFish, 8],
    [bNap, 8],
    [bZoomies, 8],
    [bSitWatch, 7],
    [bRead, 6],
    [bRun, 5],
    [bBike, 5],
    [bSwim, 5],
  ];

  function pickBehavior() {
    const total = BEHAVIORS.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [fn, w] of BEHAVIORS) {
      r -= w;
      if (r <= 0) return fn;
    }
    return bWalkAcross;
  }

  function startBehavior(fn, arg) {
    current = fn.name + (arg && arg.kind ? ':' + arg.kind : '');
    rlog(`start ${current} (cursor ${Math.round(cur.x)},${Math.round(cur.y)} idle ${Math.round(cur.idle)}s)`);
    state = 'active';
    bubble = null;
    dog.vflip = false;
    seq = fn(arg);
    if (window.buddy) window.buddy.setVisible(true);
    startLoop();
  }
  function startNextEvent() {
    if (state !== 'hidden' || paused || eventQueue.length === 0) return false;
    startBehavior(bEvent, eventQueue.shift());
    return true;
  }

  // ---- drawing ----
  const mapCache = new Map();
  function mapCanvas(map) {
    let cv = mapCache.get(map);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = map[0].length;
      cv.height = map.length;
      const c = cv.getContext('2d');
      for (let j = 0; j < map.length; j++) {
        for (let i = 0; i < map[j].length; i++) {
          const ch = map[j][i];
          if (ch === '.') continue;
          c.fillStyle = S.PALETTE[ch] || '#FF00FF';
          c.fillRect(i, j, 1, 1);
        }
      }
      mapCache.set(map, cv);
    }
    return cv;
  }
  function drawMap(map, x, y, scale, face = 1, alpha = 1, vflip = false) {
    const cv = mapCanvas(map);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y));
    if (face < 0) {
      ctx.translate(cv.width * scale, 0);
      ctx.scale(-1, 1);
    }
    if (vflip) {
      ctx.translate(0, cv.height * scale);
      ctx.scale(1, -1);
    }
    ctx.drawImage(cv, 0, 0, cv.width * scale, cv.height * scale);
    ctx.restore();
  }

  function drawBubble() {
    if (!bubble || t > bubble.until) {
      bubble = null;
      return;
    }
    const fs = clamp(3.5 * SC, 11, 14);
    ctx.font = `bold ${fs}px 'Courier New', monospace`;
    const tw = ctx.measureText(bubble.text).width;
    const pad = 6;
    const bw = tw + pad * 2;
    const bh = fs + pad * 1.6;
    const bx = clamp(dog.x + DW * 0.5 - bw / 2, 8, W - bw - 8);
    let by = dog.y - bh - SC * 3;
    if (by < 8) by = dog.y + DH + SC * 2;
    ctx.fillStyle = '#FFF8EF';
    ctx.strokeStyle = '#2E2A24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2E2A24';
    ctx.textBaseline = 'middle';
    ctx.fillText(bubble.text, bx + pad, by + bh / 2 + 1);
  }

  function updateEffects() {
    effects = effects.filter((e) => (e.age += dt) < e.ttl);
    for (const e of effects) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
  }
  function drawEffects() {
    for (const e of effects) {
      const alpha = e.fade ? 1 - Math.pow(e.age / e.ttl, 2) : e.age > e.ttl - 0.4 ? (e.ttl - e.age) / 0.4 : 1;
      const x = e.follow ? dog.x + (dog.face < 0 ? DW - e.x - e.map[0].length * e.scale : e.x) : e.x;
      const y = e.follow ? dog.y + e.y : e.y;
      drawMap(e.map, x, y, e.scale, 1, alpha);
    }
  }

  // Cursor on the buddy: it squints happily. No hearts, those are for rare events.
  function petted() {
    return state !== 'hidden' && cur.idle < 2 && cursorOnDog();
  }
  function frameToDraw() {
    if (!petted()) return dog.frame;
    if (dog.frame.startsWith('sit')) return 'sitHappy';
    if (dog.frame === 'stand' || dog.frame.startsWith('walk')) return 'happy';
    return dog.frame;
  }

  // ---- triggers ----
  nextAt = 0;
  let booted = false;
  function checkTriggers() {
    if (!booted) {
      booted = true;
      nextAt = t + (testMode ? rand(3, 6) : rand(C.firstAppearMin, C.firstAppearMax));
      return;
    }
    if (startNextEvent()) return;
    if (quiet) return; // quiet hours: no random visits, events still come
    const cooldown = testMode ? C.testStalkCooldown : C.stalkCooldown;
    if (cur.idle >= stalkIdleSec() && t >= stalkReadyAt) {
      stalkReadyAt = t + cooldown;
      startBehavior(bStalk);
      return;
    }
    if (t >= nextAt) {
      if (cur.idle < 10 && Math.random() < C.coworkChanceWhenActive) startBehavior(bCowork);
      else startBehavior(pickBehavior());
    }
  }

  // debug handle for development
  window.__buddy = {
    dog,
    getState: () => state,
    getT: () => t,
    hasSeq: () => !!seq,
    start: (name) => {
      if (state !== 'hidden') return false;
      const m = {
        walk: bWalkAcross,
        peek: bPeek,
        chase: bChase,
        stalk: bStalk,
        nap: bNap,
        zoomies: bZoomies,
        work: bWork,
        cowork: bCowork,
        fish: bFish,
        sit: bSitWatch,
        think: bThink,
        read: bRead,
        run: bRun,
        bike: bBike,
        swim: bSwim,
      };
      if (m[name]) startBehavior(m[name]);
      return !!m[name];
    },
    event: (kind, text) => {
      eventQueue.push({ kind, text: text || kind });
      return startNextEvent();
    },
  };

  // ---- main loop ----
  let last = performance.now();
  let rafId = null;
  let idleTimer = null;

  function loop(now) {
    dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    ctx.clearRect(0, 0, W, H);
    if (seq) {
      const r = seq.next();
      if (r.done) hideNow();
    }
    if (state !== 'hidden') {
      drawMap(S.FRAMES[frameToDraw()] || S.FRAMES.stand, dog.x, dog.y, SC, dog.face, 1, dog.vflip);
      updateEffects();
      drawEffects();
      drawBubble();
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
      scheduleIdle();
    }
  }
  function idleTick() {
    idleTimer = null;
    const now = performance.now();
    t += (now - last) / 1000;
    last = now;
    if (!paused && state === 'hidden') checkTriggers();
    if (state === 'hidden') scheduleIdle();
  }
  function scheduleIdle() {
    if (idleTimer === null && rafId === null) idleTimer = setTimeout(idleTick, 500);
  }
  function startLoop() {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (rafId === null) {
      last = performance.now();
      rafId = requestAnimationFrame(loop);
    }
  }
  scheduleIdle();
})();
