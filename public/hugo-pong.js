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

// Fast, non-visual simulation of a full throw — used for both the dotted
// aim preview and for automated testing. Returns the path plus outcome.
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

  let view = { width: 0, height: 0, dpr: 1, top: 0, bottom: 0, centerX: 0, xScale: 1, zScale: 1 };

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    view.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    view.width = rect.width;
    view.height = rect.height;
    canvas.width = Math.round(rect.width * view.dpr);
    canvas.height = Math.round(rect.height * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    view.top = rect.height * 0.2;
    view.bottom = rect.height - Math.max(96, rect.height * 0.14);
    view.centerX = rect.width / 2;
    view.xScale = Math.min(rect.width * 0.016, 8.6);
    view.zScale = 3.6;
  }
  window.addEventListener('resize', resize);
  resize();

  function project(worldX, worldY, worldZ) {
    const t = Math.min(1, worldY / WORLD.depth);
    const scale = 1 - t * 0.58;
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
    if (distToBall(px, py) > 60) return;
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
      previewPath = sim.path.filter((_, i) => i % 3 === 0);
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
    playWhoosh();
    hapticTap();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // --- Particles ----------------------------------------------------------
  function spawnSplash(worldX, worldY) {
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: worldX,
        y: worldY,
        z: 2 + Math.random() * 3,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.5) * 6,
        vz: 10 + Math.random() * 14,
        life: 0.5 + Math.random() * 0.3,
        age: 0,
        color: Math.random() > 0.5 ? '#d7f0c8' : '#eef8e0',
      });
    }
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
  }

  // --- Result handling ------------------------------------------------
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
      playSplash();
      hapticSuccess();
      showToast(cups.every((c) => c.sunk) ? '🍹 CLEARED!' : 'SPLASH!');
    } else {
      playMissThud();
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
    playCelebrate();
    el('endOverlay').classList.remove('hidden');
  }

  el('playAgainBtn').addEventListener('click', () => {
    cups = buildCups();
    throwsTaken = 0;
    score = 0;
    particles = [];
    ball = { ...ballStart, vx: 0, vy: 0, vz: 0, bounces: 0 };
    state = 'idle';
    hintShown = true;
    el('swipeHint').classList.remove('hidden');
    el('endOverlay').classList.add('hidden');
    el('resultToast').classList.add('hidden');
    updateHud();
  });

  // --- Drawing ----------------------------------------------------------
  function drawTable() {
    const w = view.width;
    const h = view.height;
    ctx.clearRect(0, 0, w, h);

    const nearHalfWidth = view.xScale * 22;
    const farHalfWidth = view.xScale * 22 * 0.42;
    const grad = ctx.createLinearGradient(0, view.top, 0, view.bottom);
    grad.addColorStop(0, '#4a2456');
    grad.addColorStop(1, '#722d5c');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(view.centerX - farHalfWidth, view.top);
    ctx.lineTo(view.centerX + farHalfWidth, view.top);
    ctx.lineTo(view.centerX + nearHalfWidth, view.bottom + 30);
    ctx.lineTo(view.centerX - nearHalfWidth, view.bottom + 30);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(view.centerX, view.top);
    ctx.lineTo(view.centerX, view.bottom + 30);
    ctx.stroke();
  }

  function drawShadow(worldX, worldY, worldZ, scale) {
    const p = project(worldX, worldY, 0);
    const heightFactor = Math.max(0.35, 1 - worldZ / 22);
    ctx.save();
    ctx.globalAlpha = 0.32 * heightFactor;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 9 * scale * heightFactor, 4 * scale * heightFactor, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCup(cup) {
    const remaining = remainingFraction();
    cup.radius = cupRadiusFor(cup, cup.sunk ? 1 : remaining);
    const p = project(cup.x, cup.y, 0);
    if (cup.sunk && cup.hitAnimT == null) return; // fully faded, nothing to draw

    let wiggle = 0;
    let popScale = 1;
    let alpha = 1;
    if (cup.sunk) {
      cup.hitAnimT += 1 / 60;
      const t = cup.hitAnimT;
      popScale = 1 + Math.max(0, 0.35 - t) * 1.4;
      alpha = Math.max(0, 1 - t / 0.7);
      if (alpha <= 0) {
        cup.hitAnimT = null;
        return;
      }
    }

    drawShadow(cup.x, cup.y, 0, p.scale);

    const size = 28 * p.scale * popScale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x + Math.sin(wiggle) * 2, p.y);

    // Cup body — tapered glass silhouette.
    const topW = size * 0.62;
    const botW = size * 0.44;
    const h = size * 0.92;
    ctx.beginPath();
    ctx.moveTo(-topW, -h);
    ctx.lineTo(topW, -h);
    ctx.lineTo(botW, 0);
    ctx.lineTo(-botW, 0);
    ctx.closePath();
    const bodyGrad = ctx.createLinearGradient(0, -h, 0, 0);
    bodyGrad.addColorStop(0, 'rgba(255,255,255,0.55)');
    bodyGrad.addColorStop(1, 'rgba(255,255,255,0.28)');
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.stroke();

    // Liquid fill (pale green Hugo Spritz).
    const liquidTopY = -h * 0.8;
    ctx.beginPath();
    ctx.moveTo(-topW * 0.92, liquidTopY);
    ctx.lineTo(topW * 0.92, liquidTopY);
    ctx.lineTo(botW * 0.9, -size * 0.04);
    ctx.lineTo(-botW * 0.9, -size * 0.04);
    ctx.closePath();
    const liquidGrad = ctx.createLinearGradient(0, liquidTopY, 0, 0);
    liquidGrad.addColorStop(0, '#d8f0c0');
    liquidGrad.addColorStop(1, '#a9d98c');
    ctx.fillStyle = liquidGrad;
    ctx.fill();

    // Liquid surface ellipse + bubbles.
    ctx.beginPath();
    ctx.ellipse(0, liquidTopY, topW * 0.9, size * 0.09, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(230,250,210,0.9)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    [[-topW * 0.3, -h * 0.5], [topW * 0.15, -h * 0.35], [0, -h * 0.62]].forEach(([bx, by]) => {
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(0.6, size * 0.028), 0, Math.PI * 2);
      ctx.fill();
    });

    // Ice cubes.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = 'rgba(190,220,230,0.9)';
    ctx.lineWidth = 1;
    [[-topW * 0.35, liquidTopY - size * 0.02], [topW * 0.25, liquidTopY + size * 0.03]].forEach(([ix, iy]) => {
      ctx.save();
      ctx.translate(ix, iy);
      ctx.rotate(0.4);
      ctx.fillRect(-size * 0.09, -size * 0.09, size * 0.18, size * 0.18);
      ctx.strokeRect(-size * 0.09, -size * 0.09, size * 0.18, size * 0.18);
      ctx.restore();
    });

    // Mint leaf.
    ctx.beginPath();
    ctx.moveTo(-topW * 0.1, liquidTopY - size * 0.02);
    ctx.quadraticCurveTo(-topW * 0.05, liquidTopY - size * 0.28, topW * 0.12, liquidTopY - size * 0.16);
    ctx.quadraticCurveTo(topW * 0.02, liquidTopY - size * 0.1, -topW * 0.1, liquidTopY - size * 0.02);
    ctx.closePath();
    ctx.fillStyle = '#4f9e5a';
    ctx.fill();

    // Lime wedge on the rim.
    ctx.save();
    ctx.translate(topW * 0.72, -h);
    ctx.rotate(-0.3);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.14, Math.PI * 0.15, Math.PI * 0.95);
    ctx.closePath();
    ctx.fillStyle = '#bfe25a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,150,30,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Glossy highlight streak.
    ctx.beginPath();
    ctx.moveTo(-topW * 0.55, -h * 0.9);
    ctx.lineTo(-botW * 0.6, -size * 0.12);
    ctx.lineWidth = Math.max(1.2, size * 0.06);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.restore();
  }

  function drawBall() {
    const p = ballScreenPos();
    drawShadow(ball.x, ball.y, ball.z, p.scale);
    const r = 9 * p.scale;
    ctx.save();
    ctx.translate(p.x, p.y);
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#f2d9d9');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,150,150,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawPreview() {
    if (!previewPath) return;
    ctx.save();
    for (let i = 0; i < previewPath.length; i++) {
      const pt = previewPath[i];
      const proj = project(pt.x, pt.y, pt.z);
      const alpha = 0.55 * (1 - i / previewPath.length);
      ctx.globalAlpha = Math.max(0.06, alpha);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 2.6 * proj.scale, 0, Math.PI * 2);
      ctx.fill();
    }
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
      ctx.arc(proj.x, proj.y, 3 * proj.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // --- Main loop ----------------------------------------------------------
  let lastT = null;
  function frame(t) {
    if (lastT == null) lastT = t;
    const dt = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;

    if (state === 'flying') {
      const event = stepBallOnce(ball, dt, cups);
      if (event) {
        if (event.type === 'sunk') resolveThrow('sunk', event.cup);
        else if (event.type === 'miss') resolveThrow('miss', null);
      }
    }
    updateParticles(dt);

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
      if (isLast) playGo();
      else playTick();
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
