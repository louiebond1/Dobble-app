// ---------------------------------------------------------------------------
// Hugo Pong — a real swipe-to-throw physics mini-game.
//
// World coordinates: worldY 0 (player's edge) -> 100 (back wall), worldX
// -25..25 (table width), worldZ 0+ (height above the table). Everything is
// simulated in these plain units, then projected to canvas pixels for
// drawing — this keeps the physics testable independent of the DOM (see the
// exports guard at the bottom, used by the standalone physics test).
// ---------------------------------------------------------------------------

const WORLD = {
  depth: 100,
  gravity: 34,
  bounceDamping: 0.42,
  maxBounces: 2,
};

function buildCups() {
  const rows = [
    { y: 74, xs: [-12, -4, 4, 12] },
    { y: 80, xs: [-8, 0, 8] },
    { y: 86, xs: [-4, 4] },
    { y: 92, xs: [0] },
  ];
  const cups = [];
  let id = 0;
  for (const row of rows) {
    for (const x of row.xs) {
      cups.push({ id: id++, x, y: row.y, baseRadius: 3.5, sunk: false, hitAnimT: null });
    }
  }
  return cups;
}

function cupRadiusFor(cup, remainingFraction) {
  // Subtle progressive difficulty — the target shrinks a little as fewer
  // cups remain, without ever becoming unfairly small.
  return cup.baseRadius * (0.82 + 0.18 * remainingFraction);
}

function velocityFromSwipe(dxPx, dyPx) {
  const forwardPx = Math.max(0, -dyPx);
  const lateralPx = dxPx;
  const FORWARD_SCALE = 0.34;
  const LATERAL_SCALE = 0.16;
  const ARC_RATIO = 0.6;
  const MIN_VZ = 7;
  const vy = Math.min(forwardPx * FORWARD_SCALE, 48);
  const vx = Math.max(-16, Math.min(16, lateralPx * LATERAL_SCALE));
  const vz = Math.max(vy * ARC_RATIO, MIN_VZ);
  return { vx, vy, vz };
}

// Mutates `ball` ({x,y,z,vx,vy,vz,bounces}) forward by dt seconds.
// Returns one of: null (still flying), 'bounce', 'sunk', or 'miss'.
// `cups` (with a `.sunk` flag + effective `.radius`) is only read, never
// mutated here — the caller decides what sinking a cup means for game state.
function stepBallOnce(ball, dt, cups) {
  ball.vz -= WORLD.gravity * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;

  if (ball.z > 0) return null;
  ball.z = 0;
  if (ball.vz > 0) return null;

  const hit = cups.find((c) => !c.sunk && Math.hypot(ball.x - c.x, ball.y - c.y) <= c.radius);
  if (hit) return { type: 'sunk', cup: hit };

  ball.bounces += 1;
  if (ball.bounces > WORLD.maxBounces || ball.y > WORLD.depth + 4 || Math.abs(ball.x) > 27) {
    return { type: 'miss' };
  }
  ball.vz = -ball.vz * WORLD.bounceDamping;
  ball.vy *= 0.72;
  ball.vx *= 0.82;
  if (ball.vz < 3) return { type: 'miss' };
  return { type: 'bounce' };
}

// Fast, non-visual simulation of a full throw — used for both the aim
// preview and for automated testing. Returns the path plus outcome.
function simulateThrow(startX, startY, vx, vy, vz, cups, dt = 1 / 60, maxSteps = 500) {
  const ball = { x: startX, y: startY, z: 0, vx, vy, vz, bounces: 0 };
  const path = [{ x: ball.x, y: ball.y, z: ball.z }];
  for (let i = 0; i < maxSteps; i++) {
    const event = stepBallOnce(ball, dt, cups);
    path.push({ x: ball.x, y: ball.y, z: ball.z });
    if (event && event.type === 'sunk') return { outcome: 'sunk', cupId: event.cup.id, path, finalBall: ball };
    if (event && event.type === 'miss') return { outcome: 'miss', cupId: null, path, finalBall: ball };
  }
  return { outcome: 'miss', cupId: null, path, finalBall: ball };
}

const _isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WORLD, buildCups, cupRadiusFor, velocityFromSwipe, stepBallOnce, simulateThrow };
}

if (_isBrowser) {
  runGame();
}

function runGame() {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const el = (id) => document.getElementById(id);

  const TOTAL_THROWS = 10;
  let cups = buildCups();
  let throwsTaken = 0;
  let score = 0;
  let particles = [];
  let ripples = [];

  let soundEnabled = true;
  function sfx(fn) {
    if (soundEnabled) fn();
  }
  el('soundToggleBtn').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    el('soundToggleBtn').textContent = soundEnabled ? '🔊' : '🔇';
  });

  let view = { width: 0, height: 0, dpr: 1, top: 0, bottom: 0, centerX: 0, xScale: 1, zScale: 1 };
  let bgLayer = null; // cached offscreen atmosphere — rebuilt only on resize
  let twinkles = [];

  function buildBackgroundLayer() {
    const w = view.width;
    const h = view.height;
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(w * view.dpr));
    off.height = Math.max(1, Math.round(h * view.dpr));
    const bctx = off.getContext('2d');
    bctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

    // Sunset sky, deep plum at the top fading through dusk pink to a warm
    // horizon glow — this is the "party at golden hour" backdrop, not a
    // flat brand-colour fill.
    const horizonY = h * 0.58;
    const sky = bctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, '#2a1440');
    sky.addColorStop(0.55, '#6a3468');
    sky.addColorStop(1, '#e8875f');
    bctx.fillStyle = sky;
    bctx.fillRect(0, 0, w, horizonY);

    // Warm sun glow sitting on the horizon.
    const sunGlow = bctx.createRadialGradient(w * 0.5, horizonY, 4, w * 0.5, horizonY, w * 0.55);
    sunGlow.addColorStop(0, 'rgba(255, 200, 150, 0.55)');
    sunGlow.addColorStop(1, 'rgba(255, 200, 150, 0)');
    bctx.fillStyle = sunGlow;
    bctx.fillRect(0, 0, w, horizonY + 40);

    // Ground / terrace beneath the horizon, blending toward where the
    // table sits so it reads as one continuous space.
    const ground = bctx.createLinearGradient(0, horizonY, 0, h);
    ground.addColorStop(0, '#4a2a4a');
    ground.addColorStop(1, '#150c1c');
    bctx.fillStyle = ground;
    bctx.fillRect(0, horizonY, w, h - horizonY);

    // Distant skyline silhouette along the horizon — city lights across
    // the water, not just an empty gradient.
    const rand = mulberry32(42);
    drawSkyline(bctx, w, horizonY, rand);

    // Bokeh fairy lights, scattered through the sky, denser near the
    // skyline to read as city/harbour lights.
    const bokehColors = ['#ffd9a0', '#ffb6c9', '#fff2c7', '#ffe0f0'];
    const staticBokeh = [];
    for (let i = 0; i < 30; i++) {
      const bx = rand() * w;
      const by = horizonY - rand() * rand() * horizonY * 0.9;
      const r = 2.5 + rand() * 8;
      const color = bokehColors[i % bokehColors.length];
      const alpha = 0.25 + rand() * 0.4;
      staticBokeh.push({ x: bx, y: by, r, color, alpha });
    }
    staticBokeh.forEach((b) => drawGlowDot(bctx, b.x, b.y, b.r, b.color, b.alpha));

    // A string of warm fairy lights draped across the top of the scene.
    drawFairyLightString(bctx, w, h * 0.03, h * 0.1);

    // Palm silhouettes framing the sides — bleed off the edges so they
    // read as "you're standing on a rooftop among palms," not a centred
    // decoration.
    drawPalmTree(bctx, w * 0.04, h * 1.0, h * 0.62, -1);
    drawPalmTree(bctx, w * 0.97, h * 1.0, h * 0.56, 1);
    drawPlantCluster(bctx, -w * 0.04, h * 1.0, h * 0.2, -1);
    drawPlantCluster(bctx, w * 1.03, h * 1.0, h * 0.18, 1);

    // Low lounge furniture silhouette, cropped at the very bottom edges.
    drawLoungeSilhouette(bctx, w * 0.14, h * 1.02, w * 0.28);
    drawLoungeSilhouette(bctx, w * 0.88, h * 1.02, w * 0.28);

    // Candle glows nestled near the furniture.
    [[w * 0.1, h * 0.93], [w * 0.2, h * 0.9], [w * 0.81, h * 0.91], [w * 0.92, h * 0.94]].forEach(([cx, cy]) => {
      drawGlowDot(bctx, cx, cy, 5, '#ffb35c', 0.65);
    });

    // Flower blossoms near the plant clusters.
    [[w * 0.08, h * 0.62], [w * 0.14, h * 0.58], [w * 0.92, h * 0.6], [w * 0.86, h * 0.64]].forEach(([fx, fy]) => {
      drawGlowDot(bctx, fx, fy, 6, '#ff8fc0', 0.5);
    });

    // Vignette so the centre stage (table + cups) stays the clearest area.
    const vignette = bctx.createRadialGradient(w * 0.5, h * 0.45, h * 0.2, w * 0.5, h * 0.5, h * 0.85);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
    bctx.fillStyle = vignette;
    bctx.fillRect(0, 0, w, h);

    // A gentle overall blur softens every hard edge above into something
    // that reads as atmosphere rather than flat vector shapes.
    try {
      const blurred = document.createElement('canvas');
      blurred.width = off.width;
      blurred.height = off.height;
      const blurCtx = blurred.getContext('2d');
      blurCtx.filter = 'blur(3px)';
      blurCtx.drawImage(off, 0, 0);
      bgLayer = blurred;
    } catch (e) {
      bgLayer = off; // filter unsupported — the unblurred version still looks fine
    }

    // A handful of lights get an animated twinkle drawn fresh each frame.
    twinkles = staticBokeh.slice(0, 12).map((b, i) => ({ ...b, phase: (i / 12) * Math.PI * 2 }));
  }

  function mulberry32(seed) {
    let a = seed;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function drawGlowDot(c, x, y, r, color, alpha) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexToRgba(color, alpha));
    g.addColorStop(1, hexToRgba(color, 0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function drawSkyline(c, w, horizonY, rand) {
    c.fillStyle = 'rgba(20, 10, 28, 0.55)';
    let x = -10;
    while (x < w + 10) {
      const bw = 14 + rand() * 26;
      const bh = 10 + rand() * horizonY * 0.22;
      c.fillRect(x, horizonY - bh, bw, bh + 4);
      x += bw + rand() * 6;
    }
  }

  function drawFairyLightString(c, w, sagTop, sagAmount) {
    const segments = 3;
    const pts = [{ x: 0, y: sagTop }];
    for (let i = 1; i <= segments; i++) pts.push({ x: (w * i) / segments, y: sagTop + sagAmount * (0.6 + 0.4 * Math.sin(i)) });
    c.strokeStyle = 'rgba(255, 220, 200, 0.35)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cx = (prev.x + pts[i].x) / 2;
      const cy = Math.max(prev.y, pts[i].y) + sagAmount * 0.7;
      c.quadraticCurveTo(cx, cy, pts[i].x, pts[i].y);
    }
    c.stroke();

    // Sample small warm bulbs along the same curve.
    const bulbCount = 16;
    for (let i = 0; i <= bulbCount; i++) {
      const t = i / bulbCount;
      const segT = t * segments;
      const seg = Math.min(segments - 1, Math.floor(segT));
      const localT = segT - seg;
      const a = pts[seg];
      const b = pts[seg + 1];
      const cx = (a.x + b.x) / 2;
      const cy = Math.max(a.y, b.y) + sagAmount * 0.7;
      const bx = (1 - localT) * (1 - localT) * a.x + 2 * (1 - localT) * localT * cx + localT * localT * b.x;
      const by = (1 - localT) * (1 - localT) * a.y + 2 * (1 - localT) * localT * cy + localT * localT * b.y;
      drawGlowDot(c, bx, by, 4, '#ffdca0', 0.85);
    }
  }

  function drawPalmTree(c, x, groundY, height, dir) {
    // Trunk — a gently curved silhouette.
    c.fillStyle = 'rgba(8, 6, 14, 0.85)';
    c.beginPath();
    c.moveTo(x - 5, groundY);
    c.quadraticCurveTo(x + dir * height * 0.12, groundY - height * 0.55, x + dir * height * 0.22, groundY - height * 0.92);
    c.lineTo(x + dir * height * 0.22 + 10, groundY - height * 0.92);
    c.quadraticCurveTo(x + dir * height * 0.12 + 8, groundY - height * 0.55, x + 5, groundY);
    c.closePath();
    c.fill();

    // Fronds radiating from the crown.
    const crownX = x + dir * height * 0.22 + 5;
    const crownY = groundY - height * 0.92;
    const frondCount = 7;
    for (let i = 0; i < frondCount; i++) {
      const angle = -Math.PI / 2 + (i / (frondCount - 1) - 0.5) * Math.PI * 1.15;
      const len = height * (0.32 + (i % 2) * 0.08);
      const tipX = crownX + Math.cos(angle) * len;
      const tipY = crownY + Math.sin(angle) * len * 0.6;
      c.beginPath();
      c.moveTo(crownX, crownY);
      c.quadraticCurveTo(crownX + Math.cos(angle) * len * 0.5, crownY + Math.sin(angle) * len * 0.25 - 8, tipX, tipY);
      c.quadraticCurveTo(crownX + Math.cos(angle) * len * 0.4, crownY + Math.sin(angle) * len * 0.35 + 6, crownX, crownY);
      c.closePath();
      c.fillStyle = 'rgba(8, 6, 14, 0.85)';
      c.fill();
    }
  }

  function drawPlantCluster(c, x, y, height, dir) {
    const fronds = 6;
    for (let i = 0; i < fronds; i++) {
      const t = i / (fronds - 1);
      const angle = dir * (0.15 + t * 0.9) * Math.PI * 0.5 - Math.PI / 2;
      const len = height * (0.55 + t * 0.5);
      const tipX = x + Math.cos(angle) * len * 0.35 * dir;
      const tipY = y - Math.sin(angle) * len;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + dir * len * 0.15, y - len * 0.6, tipX, tipY);
      c.quadraticCurveTo(x + dir * len * 0.05, y - len * 0.55, x, y);
      c.closePath();
      c.fillStyle = 'rgba(10, 22, 16, 0.8)';
      c.fill();
    }
  }

  function drawLoungeSilhouette(c, x, y, w) {
    const h = w * 0.34;
    c.fillStyle = 'rgba(8, 6, 16, 0.7)';
    c.beginPath();
    c.moveTo(x - w / 2, y);
    c.lineTo(x - w / 2, y - h * 0.5);
    c.quadraticCurveTo(x - w / 2, y - h, x - w / 2 + h * 0.4, y - h);
    c.lineTo(x + w / 2 - h * 0.4, y - h);
    c.quadraticCurveTo(x + w / 2, y - h, x + w / 2, y - h * 0.5);
    c.lineTo(x + w / 2, y);
    c.closePath();
    c.fill();
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    view.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    view.width = rect.width;
    view.height = rect.height;
    canvas.width = Math.round(rect.width * view.dpr);
    canvas.height = Math.round(rect.height * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    // ~15% top zone (title/stats), ~70% scene, ~15% ball/swipe zone.
    view.top = rect.height * 0.17;
    view.bottom = rect.height * 0.85;
    view.centerX = rect.width / 2;
    view.xScale = Math.min(rect.width * 0.017, 9.2);
    view.zScale = 4.4;
    buildBackgroundLayer();
  }
  window.addEventListener('resize', resize);
  resize();

  function project(worldX, worldY, worldZ) {
    const t = Math.min(1, worldY / WORLD.depth);
    const scale = 1 - t * 0.4; // gentler falloff so far cups stay legible
    const screenY = view.bottom - t * (view.bottom - view.top) - worldZ * view.zScale * scale;
    const screenX = view.centerX + worldX * view.xScale * scale;
    return { x: screenX, y: screenY, scale };
  }

  // --- Ball / drag state -----------------------------------------------
  const ballStart = { x: 0, y: 3, z: 0 };
  let ball = { ...ballStart, vx: 0, vy: 0, vz: 0, bounces: 0 };
  let state = 'idle'; // idle | dragging | flying | resolved | over
  let drag = null; // {startPx:{x,y}, curPx:{x,y}}
  let previewPath = null;
  let hintShown = true;

  function ballScreenPos() {
    return project(ball.x, ball.y, ball.z);
  }

  function distToBall(px, py) {
    const p = ballScreenPos();
    return Math.hypot(px - p.x, py - p.y);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'idle') return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (distToBall(px, py) > 64) return;
    drag = { startPx: { x: px, y: py }, curPx: { x: px, y: py } };
    state = 'dragging';
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (state !== 'dragging' || !drag) return;
    const rect = canvas.getBoundingClientRect();
    drag.curPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const dx = drag.curPx.x - drag.startPx.x;
    const dy = drag.curPx.y - drag.startPx.y;
    const { vx, vy, vz } = velocityFromSwipe(dx, dy);
    if (vy > 2) {
      const sim = simulateThrow(ball.x, ball.y, vx, vy, vz, cups);
      previewPath = sim.path.filter((_, i) => i % 4 === 0);
    } else {
      previewPath = null;
    }
  });

  function endDrag(e) {
    if (state !== 'dragging' || !drag) return;
    const dx = drag.curPx.x - drag.startPx.x;
    const dy = drag.curPx.y - drag.startPx.y;
    drag = null;
    previewPath = null;
    const dragDist = Math.hypot(dx, dy);
    if (dragDist < 16) {
      state = 'idle';
      return;
    }
    if (hintShown) {
      hintShown = false;
      el('swipeHint').classList.add('hidden');
    }
    const { vx, vy, vz } = velocityFromSwipe(dx, dy);
    ball.vx = vx;
    ball.vy = Math.max(vy, 14);
    ball.vz = vz;
    ball.bounces = 0;
    state = 'flying';
    sfx(playWhoosh);
    hapticTap();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // --- Particles ------------------------------------------------------
  function spawnSplash(worldX, worldY) {
    for (let i = 0; i < 12; i++) {
      particles.push({
        x: worldX,
        y: worldY,
        z: 2 + Math.random() * 3,
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.5) * 6,
        vz: 11 + Math.random() * 15,
        life: 0.5 + Math.random() * 0.3,
        age: 0,
        color: Math.random() > 0.5 ? '#d7f0c8' : '#eef8e0',
      });
    }
    ripples.push({ x: worldX, y: worldY, age: 0, life: 0.5 });
  }

  function updateParticles(dt) {
    particles.forEach((p) => {
      p.age += dt;
      p.vz -= WORLD.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.z < 0) p.z = 0;
    });
    particles = particles.filter((p) => p.age < p.life);
    ripples.forEach((r) => (r.age += dt));
    ripples = ripples.filter((r) => r.age < r.life);
  }

  // --- Result handling --------------------------------------------------
  function remainingFraction() {
    return cups.filter((c) => !c.sunk).length / cups.length;
  }

  function showToast(text) {
    const t = el('resultToast');
    t.textContent = text;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 900);
  }

  function updateHud() {
    const remaining = cups.filter((c) => !c.sunk).length;
    const sunkCount = cups.length - remaining;
    el('cupsStat').textContent = `${sunkCount}/${cups.length}`;
    el('throwsStat').textContent = `${throwsTaken}/${TOTAL_THROWS}`;
    el('scoreStat').textContent = String(score);
  }

  function resolveThrow(outcome, cup) {
    throwsTaken += 1;
    if (outcome === 'sunk' && cup) {
      cup.sunk = true;
      cup.hitAnimT = 0;
      score += 100;
      spawnSplash(cup.x, cup.y);
      sfx(playSplash);
      hapticSuccess();
      showToast(cups.every((c) => c.sunk) ? '🍹 CLEARED!' : '🍹 NICE!');
    } else {
      sfx(playMissThud);
      hapticTap();
      showToast('So close!');
    }
    updateHud();
    state = 'resolved';
    setTimeout(() => {
      if (throwsTaken >= TOTAL_THROWS || cups.every((c) => c.sunk)) {
        endGame();
      } else {
        ball = { ...ballStart, vx: 0, vy: 0, vz: 0, bounces: 0 };
        state = 'idle';
      }
    }, 650);
  }

  function endGame() {
    state = 'over';
    const sunkCount = cups.filter((c) => c.sunk).length;
    const accuracy = Math.round((sunkCount / TOTAL_THROWS) * 100);
    el('endScoreLine').textContent = `${sunkCount} / ${TOTAL_THROWS} cups sunk`;
    el('endAccuracyLine').textContent = `${accuracy}% accuracy · Score ${score}`;
    let title, sub;
    if (sunkCount >= 9) {
      title = '🍹 Spritz Master';
      sub = 'You were ON FIRE. Certified pong legend.';
    } else if (sunkCount >= 6) {
      title = '🍹 Pretty Good';
      sub = 'Not bad. More Spritz required for perfection.';
    } else if (sunkCount >= 3) {
      title = '🍹 One More Round?';
      sub = "Those last few cups were definitely rigged.";
    } else {
      title = '🍹 Nice Try';
      sub = 'The Spritz remains undefeated. For now.';
    }
    el('endVerdictTitle').textContent = title;
    el('endVerdictSub').textContent = sub;
    sfx(playCelebrate);
    el('endOverlay').classList.remove('hidden');
  }

  el('playAgainBtn').addEventListener('click', () => {
    cups = buildCups();
    throwsTaken = 0;
    score = 0;
    particles = [];
    ripples = [];
    ball = { ...ballStart, vx: 0, vy: 0, vz: 0, bounces: 0 };
    state = 'idle';
    hintShown = true;
    el('swipeHint').classList.remove('hidden');
    el('endOverlay').classList.add('hidden');
    el('resultToast').classList.add('hidden');
    updateHud();
  });

  // --- Drawing ------------------------------------------------------------
  let clockT = 0;

  function drawBackground() {
    ctx.clearRect(0, 0, view.width, view.height);
    if (bgLayer) ctx.drawImage(bgLayer, 0, 0, view.width, view.height);
    twinkles.forEach((tw) => {
      const flicker = 0.5 + 0.5 * Math.sin(clockT * 1.6 + tw.phase);
      drawGlowDot(ctx, tw.x, tw.y, tw.r * 0.8, tw.color, tw.alpha * flicker);
    });
  }

  function drawTable() {
    const nearHalfWidth = view.xScale * 23;
    const farHalfWidth = nearHalfWidth * 0.5;
    const tableTopY = view.top;
    const tableFrontY = view.bottom + 8;
    const apronDepth = Math.max(20, view.height * 0.035);
    const cx = view.centerX;

    // Grounded drop shadow beneath the whole table.
    ctx.save();
    const shadowGrad = ctx.createRadialGradient(
      cx, tableFrontY + apronDepth, 10,
      cx, tableFrontY + apronDepth, nearHalfWidth * 1.3
    );
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(cx, tableFrontY + apronDepth, nearHalfWidth * 1.2, apronDepth * 1.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Table top surface — a real perspective quad, not a flat brand-colour fill.
    ctx.beginPath();
    ctx.moveTo(cx - farHalfWidth, tableTopY);
    ctx.lineTo(cx + farHalfWidth, tableTopY);
    ctx.lineTo(cx + nearHalfWidth, tableFrontY);
    ctx.lineTo(cx - nearHalfWidth, tableFrontY);
    ctx.closePath();
    const topGrad = ctx.createLinearGradient(0, tableTopY, 0, tableFrontY);
    topGrad.addColorStop(0, '#3d2046');
    topGrad.addColorStop(0.45, '#22132b');
    topGrad.addColorStop(1, '#120a18');
    ctx.fillStyle = topGrad;
    ctx.fill();

    // Soft sheen suggesting reflected ambient light, clipped to the surface.
    ctx.save();
    ctx.clip();
    const sheen = ctx.createRadialGradient(
      cx, tableTopY + (tableFrontY - tableTopY) * 0.3, 10,
      cx, tableTopY + (tableFrontY - tableTopY) * 0.3, nearHalfWidth
    );
    sheen.addColorStop(0, 'rgba(255, 200, 220, 0.16)');
    sheen.addColorStop(1, 'rgba(255, 200, 220, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, view.width, view.height);
    ctx.restore();

    // Faint "Hugo Spritz" branding etched into the felt, between the ball
    // and the cups — a real table, not just a play surface.
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffb6d9';
    ctx.textAlign = 'center';
    ctx.font = `italic 700 ${Math.max(13, view.xScale * 1.7)}px 'Snell Roundhand', 'Brush Script MT', cursive`;
    ctx.fillText('Hugo Spritz', cx, tableFrontY - (tableFrontY - tableTopY) * 0.16);
    ctx.font = `700 ${Math.max(7, view.xScale * 0.7)}px sans-serif`;
    ctx.globalAlpha = 0.12;
    ctx.fillText('EST. 2018', cx, tableFrontY - (tableFrontY - tableTopY) * 0.12);
    ctx.restore();

    // Neon perimeter edge — a glowing pink outline instead of a flat white
    // stroke, so the table reads as a lit object, not a painted shape.
    ctx.save();
    ctx.shadowColor = 'rgba(255, 60, 170, 0.9)';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = 'rgba(255, 150, 210, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - farHalfWidth, tableTopY);
    ctx.lineTo(cx + farHalfWidth, tableTopY);
    ctx.lineTo(cx + nearHalfWidth, tableFrontY);
    ctx.lineTo(cx - nearHalfWidth, tableFrontY);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, tableTopY);
    ctx.lineTo(cx, tableFrontY);
    ctx.stroke();

    // Front apron — the table's visible "side," giving it real thickness
    // instead of reading as a flat painted shape floating in space.
    ctx.beginPath();
    ctx.moveTo(cx - nearHalfWidth, tableFrontY);
    ctx.lineTo(cx + nearHalfWidth, tableFrontY);
    ctx.lineTo(cx + nearHalfWidth * 0.97, tableFrontY + apronDepth);
    ctx.lineTo(cx - nearHalfWidth * 0.97, tableFrontY + apronDepth);
    ctx.closePath();
    const apronGrad = ctx.createLinearGradient(0, tableFrontY, 0, tableFrontY + apronDepth);
    apronGrad.addColorStop(0, '#0f0815');
    apronGrad.addColorStop(1, '#050308');
    ctx.fillStyle = apronGrad;
    ctx.fill();
    ctx.save();
    ctx.shadowColor = 'rgba(255, 60, 170, 0.7)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(255, 150, 210, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - nearHalfWidth, tableFrontY);
    ctx.lineTo(cx + nearHalfWidth, tableFrontY);
    ctx.stroke();
    ctx.restore();
  }

  function drawShadow(worldX, worldY, worldZ, scale, sizeMul = 1) {
    const p = project(worldX, worldY, 0);
    const heightFactor = Math.max(0.3, 1 - worldZ / 22);
    ctx.save();
    ctx.globalAlpha = 0.34 * heightFactor;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 11 * scale * heightFactor * sizeMul, 4.5 * scale * heightFactor * sizeMul, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCup(cup) {
    const remaining = remainingFraction();
    cup.radius = cupRadiusFor(cup, cup.sunk ? 1 : remaining);
    const p = project(cup.x, cup.y, 0);
    if (cup.sunk && cup.hitAnimT == null) return; // fully faded, nothing to draw

    let wobble = 0;
    let popScale = 1;
    let alpha = 1;
    let ringT = null;
    if (cup.sunk) {
      cup.hitAnimT += 1 / 60;
      const t = cup.hitAnimT;
      popScale = 1 + Math.max(0, 0.35 - t) * 1.3;
      wobble = Math.sin(t * 34) * 0.22 * Math.max(0, 1 - t / 0.45);
      alpha = Math.max(0, 1 - t / 0.75);
      if (t < 0.5) ringT = t / 0.5;
      if (alpha <= 0) {
        cup.hitAnimT = null;
        return;
      }
    }

    drawShadow(cup.x, cup.y, 0, p.scale, 1.6);

    const size = 60 * p.scale * popScale; // much larger — the glasses are the hero
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(wobble);

    const topW = size * 0.56;
    const botW = size * 0.4;
    const h = size * 0.98;

    // Glass body.
    ctx.beginPath();
    ctx.moveTo(-topW, -h);
    ctx.lineTo(topW, -h);
    ctx.lineTo(botW, 0);
    ctx.lineTo(-botW, 0);
    ctx.closePath();
    const bodyGrad = ctx.createLinearGradient(-topW, -h, topW, 0);
    bodyGrad.addColorStop(0, 'rgba(255,255,255,0.5)');
    bodyGrad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    bodyGrad.addColorStop(1, 'rgba(255,255,255,0.42)');
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, size * 0.035);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.stroke();

    // Liquid fill — pale, glossy Hugo Spritz.
    const liquidTopY = -h * 0.82;
    ctx.beginPath();
    ctx.moveTo(-topW * 0.93, liquidTopY);
    ctx.lineTo(topW * 0.93, liquidTopY);
    ctx.lineTo(botW * 0.9, -size * 0.03);
    ctx.lineTo(-botW * 0.9, -size * 0.03);
    ctx.closePath();
    const liquidGrad = ctx.createLinearGradient(0, liquidTopY, 0, 0);
    liquidGrad.addColorStop(0, '#e2f4c9');
    liquidGrad.addColorStop(1, '#9fd583');
    ctx.fillStyle = liquidGrad;
    ctx.fill();

    // Liquid surface + carbonation bubbles.
    ctx.beginPath();
    ctx.ellipse(0, liquidTopY, topW * 0.92, size * 0.075, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(236,252,220,0.92)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    [
      [-topW * 0.35, -h * 0.55], [topW * 0.2, -h * 0.4], [0.05 * topW, -h * 0.68],
      [-topW * 0.1, -h * 0.3], [topW * 0.32, -h * 0.6],
    ].forEach(([bx, by]) => {
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(0.7, size * 0.022), 0, Math.PI * 2);
      ctx.fill();
    });

    // Ice cubes with a little volume via a mini highlight each.
    [[-topW * 0.38, liquidTopY - size * 0.01, -0.35], [topW * 0.22, liquidTopY + size * 0.05, 0.5], [-topW * 0.02, liquidTopY - size * 0.09, 0.15]].forEach(
      ([ix, iy, rot]) => {
        ctx.save();
        ctx.translate(ix, iy);
        ctx.rotate(rot);
        const s = size * 0.2;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.strokeStyle = 'rgba(185,225,235,0.9)';
        ctx.lineWidth = 1;
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.strokeRect(-s / 2, -s / 2, s, s);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(-s * 0.25, -s * 0.25, s * 0.18, s * 0.18);
        ctx.restore();
      }
    );

    // Mint sprig — a small cluster of leaves, not a single blob.
    [[-topW * 0.05, -0.05, 1], [topW * 0.06, 0.25, 0.85], [-topW * 0.14, -0.35, 0.7]].forEach(([lx, rot, scale]) => {
      ctx.save();
      ctx.translate(lx, liquidTopY - size * 0.02);
      ctx.rotate(rot);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(size * 0.02, -size * 0.24, size * 0.13, -size * 0.16);
      ctx.quadraticCurveTo(size * 0.03, -size * 0.08, 0, 0);
      ctx.closePath();
      ctx.fillStyle = '#4f9e5a';
      ctx.fill();
      ctx.restore();
    });

    // Lime wheel resting on the rim — mostly over the glass, a touch
    // hanging past the edge, like a real garnish notched onto the side.
    ctx.save();
    ctx.translate(topW * 0.64, -h * 0.92);
    ctx.rotate(-0.25);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = '#bfe25a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.085, 0, Math.PI * 2);
    ctx.fillStyle = '#d8f08a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,150,30,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Segment lines so it reads as a citrus wheel, not a plain ring.
    ctx.strokeStyle = 'rgba(120,150,30,0.35)';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * size * 0.085, Math.sin(a) * size * 0.085);
      ctx.stroke();
    }
    ctx.restore();

    // Condensation droplets on the glass.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    [[-topW * 0.5, -h * 0.35], [botW * 0.55, -h * 0.15], [-botW * 0.4, -h * 0.05]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.ellipse(dx, dy, size * 0.012, size * 0.022, 0.2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Glossy highlight streak.
    ctx.beginPath();
    ctx.moveTo(-topW * 0.6, -h * 0.92);
    ctx.lineTo(-botW * 0.65, -size * 0.1);
    ctx.lineWidth = Math.max(1.5, size * 0.05);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineCap = 'round';
    ctx.stroke();

    // A tiny "Hugo" heart decal on the glass — the branded-drinkware touch.
    if (p.scale > 0.65) {
      ctx.save();
      ctx.translate(0, -size * 0.14);
      ctx.scale(size * 0.011, size * 0.011);
      ctx.beginPath();
      ctx.moveTo(0, 3);
      ctx.bezierCurveTo(-6, -3, -6, -8, 0, -6);
      ctx.bezierCurveTo(6, -8, 6, -3, 0, 3);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 120, 180, 0.55)';
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    if (ringT != null) {
      const ringP = project(cup.x, cup.y, 0);
      ctx.save();
      ctx.globalAlpha = 0.5 * (1 - ringT);
      ctx.strokeStyle = '#eef8e0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ringP.x, ringP.y - size * 0.62, (topW * 0.5 + ringT * size * 0.5) * 0.9, (topW * 0.15 + ringT * size * 0.18) * 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBall() {
    const p = ballScreenPos();
    drawShadow(ball.x, ball.y, ball.z, p.scale);
    const r = 13 * p.scale;
    ctx.save();
    ctx.translate(p.x, p.y);
    const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.7, '#f7ecec');
    grad.addColorStop(1, '#e8d3d3');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,140,140,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // A tiny secondary highlight for extra glossiness.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.4, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPreview() {
    if (!previewPath || !previewPath.length) return;
    ctx.save();
    for (let i = 0; i < previewPath.length; i++) {
      const pt = previewPath[i];
      const proj = project(pt.x, pt.y, pt.z);
      const fade = 0.35 + 0.65 * (i / previewPath.length);
      const size = (2.6 + 1.6 * (i / previewPath.length)) * proj.scale;
      ctx.save();
      ctx.shadowColor = 'rgba(255, 90, 190, 0.9)';
      ctx.shadowBlur = 6;
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#ff8fd0';
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // A glowing target ring at the predicted landing point.
    const last = previewPath[previewPath.length - 1];
    const lp = project(last.x, last.y, 0);
    ctx.save();
    ctx.shadowColor = 'rgba(255, 90, 190, 0.9)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(255, 140, 210, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(lp.x, lp.y, 10 * lp.scale, 4 * lp.scale, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  function drawParticles() {
    particles.forEach((p) => {
      const proj = project(p.x, p.y, p.z);
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 3.4 * proj.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // --- Main loop ------------------------------------------------------
  let lastT = null;
  function frame(t) {
    if (lastT == null) lastT = t;
    const dt = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;
    clockT += dt;

    if (state === 'flying') {
      const event = stepBallOnce(ball, dt, cups);
      if (event) {
        if (event.type === 'sunk') resolveThrow('sunk', event.cup);
        else if (event.type === 'miss') resolveThrow('miss', null);
      }
    }
    updateParticles(dt);

    drawBackground();
    drawTable();
    const drawOrder = cups.slice().sort((a, b) => a.y - b.y);
    drawOrder.forEach(drawCup);
    drawParticles();
    drawPreview();
    if (state !== 'over') drawBall();

    requestAnimationFrame(frame);
  }

  // --- Intro / countdown --------------------------------------------------
  el('introStartBtn').addEventListener('click', () => {
    el('introOverlay').classList.add('hidden');
    runCountdown();
  });

  async function runCountdown() {
    const overlay = el('countdownOverlay');
    const numberEl = el('countdownNumber');
    overlay.classList.remove('hidden');
    const steps = ['3', '2', '1', 'GO!'];
    for (let i = 0; i < steps.length; i++) {
      const isLast = i === steps.length - 1;
      numberEl.textContent = steps[i];
      numberEl.className = isLast ? 'countdown-go' : 'countdown-number';
      void numberEl.offsetWidth;
      numberEl.classList.add('play');
      if (isLast) sfx(playGo);
      else sfx(playTick);
      await new Promise((r) => setTimeout(r, 550));
    }
    overlay.classList.add('hidden');
    state = 'idle';
  }

  updateHud();
  requestAnimationFrame(frame);

  // Read-only introspection used by automated tests — never affects gameplay.
  window.__hugoPongDebug = () => ({ state, ball: { ...ball }, ballScreen: ballScreenPos(), view: { ...view } });
}
