// Run on the existing draft-night-verifier Railway Function, which already holds DRAFT_ADMIN_KEY.
// Fills one stored variant of the deduplicated catalogue, up to 300 new pictures per run.
// Daily picture and Cloudflare dollar limits remain enforced by the API. Stops at any failure; rerun later to resume.
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
async function verifyReplay(theme: string) {
  const before = await health(), started = Date.now();
  const res = await fetch(api + '/api/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme, name: 'Library check', capacity: 2, listed: false }) });
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
        if (before.pictures.made !== after.pictures.made) throw Error('Cache verification generated a new picture');
        log('cached-lobby', { theme, readyMs: Date.now() - started, pictures: state.prep.total, dailyMadeBefore: before.pictures.made, dailyMadeAfter: after.pictures.made, noNewPicturesDuringCheck: before.pictures.made === after.pictures.made });
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
  let plan: { themes: number; uniqueAssets: number } | null = null;
  // Backend and worker are staged together. Wait for the new API while it restarts.
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(api + '/api/cache-plan?key=' + encodeURIComponent(key));
      if (res.ok) {
        const current = await res.json() as { themes: number; uniqueAssets: number };
        if (current.themes === 250) { plan = current; break; }
      }
    } catch { /* restart in progress */ }
    await Bun.sleep(5000);
  }
  if (!plan) throw Error('The 250-theme catalogue/API was not ready after five minutes; deploy client then backend');
  log('plan', plan);
  // One final pass proves all distinct prompts exist; related themes share their item thumbnails.
  const passes = Math.ceil(plan.uniqueAssets / 300) + 1;
  for (let run = 1; run <= passes; run++) {
    const existing = await progress();
    if (existing.failed) log('retry-after-operator-restart', { error: existing.error });
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
        if (state.made === 0) {
          if (state.had !== plan.uniqueAssets) throw Error('Stored coverage does not match the cache plan');
          for (const theme of ['house', 'bedroom', 'island']) await verifyReplay(theme);
          log('complete', { assets: state.had, themes: plan.themes }); process.exit(0);
        }
        break;
      }
      if (Date.now() >= deadline) throw Error('Prefill still running after 12 hours; check its status before restarting');
      await Bun.sleep(5000);
    }
  }
  throw Error('More assets remain after the planned passes; inspect coverage before continuing');
} catch (error) { log('error', String(error)); process.exitCode = 1; }
