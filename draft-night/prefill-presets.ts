// Run on the existing draft-night-verifier Railway Function, which already holds DRAFT_ADMIN_KEY.
// Fills one variant of the six preset pools, up to 300 new pictures per run. Stops at any failure.
const api = 'https://draft-night-web-production.up.railway.app';
const key = Bun.env.DRAFT_ADMIN_KEY;
const log = (label: string, value: unknown) => console.log('[preset-fill]', label, JSON.stringify(value));
if (!key) throw Error('DRAFT_ADMIN_KEY is missing');
async function health() {
  const res = await fetch(api + '/health');
  if (!res.ok) throw Error('Health HTTP ' + res.status);
  const body = await res.json(); log('health', body); return body;
}
async function progress() {
  const res = await fetch(api + '/api/prefill?key=' + encodeURIComponent(key!));
  if (!res.ok) throw Error('Prefill status HTTP ' + res.status);
  return await res.json() as { running: boolean; made: number; had: number; failed: number; left: number; error: string };
}
async function verifyReplay() {
  const before = await health(), started = Date.now();
  const res = await fetch(api + '/api/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: 'house', name: 'Library check', capacity: 2, listed: false }) });
  if (!res.ok) throw Error('Cached lobby HTTP ' + res.status);
  const game = await res.json() as { code: string; token: string };
  try {
    while (Date.now() - started < 30_000) {
      const room = await fetch(api + '/api/room?code=' + encodeURIComponent(game.code));
      if (!room.ok) throw Error('Cached room HTTP ' + room.status);
      const state = await room.json();
      if (state.prep.failed) throw Error('A cached lobby picture failed');
      if (state.prep.ready === state.prep.total) {
        const after = await health();
        log('cached-lobby', { readyMs: Date.now() - started, pictures: state.prep.total, dailyMadeBefore: before.pictures.made, dailyMadeAfter: after.pictures.made, noNewPicturesDuringCheck: before.pictures.made === after.pictures.made });
        return;
      }
      await Bun.sleep(250);
    }
    throw Error('Cached lobby was not ready within 30 seconds');
  } finally {
    await fetch(api + '/api/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: game.code, token: game.token }) });
  }
}

try {
  await health();
  // The six current pools contain 581 assets. A third pass verifies that nothing remains to generate.
  for (let run = 1; run <= 3; run++) {
    const existing = await progress();
    if (existing.failed) throw Error(existing.error || 'An earlier fill failed; inspect it before restarting');
    if (existing.running) { log('resumed', { run, ...existing }); }
    else {
      const res = await fetch(api + '/api/prefill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, variants: 1, max: 300 }) });
      if (!res.ok) throw Error('Prefill HTTP ' + res.status);
      log('started', { run });
    }
    const deadline = Date.now() + 12 * 60 * 60_000;
    let lastLog = 0;
    while (true) {
      const state = await progress();
      if (!state.running || Date.now() - lastLog >= 30_000) { log('progress', { run, ...state }); lastLog = Date.now(); }
      if (state.failed) throw Error(state.error || 'Prefill failed');
      if (!state.running) {
        await health();
        if (state.made === 0) { await verifyReplay(); log('complete', { assets: state.had }); process.exit(0); }
        break;
      }
      if (Date.now() >= deadline) throw Error('Prefill still running after 12 hours; check its status before restarting');
      await Bun.sleep(5000);
    }
  }
  throw Error('More assets remain after three runs; check before continuing');
} catch (error) { log('error', String(error)); process.exitCode = 1; }
