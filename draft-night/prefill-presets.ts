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
try {
  await health();
  // The six current pools contain 581 assets. A third pass verifies that nothing remains to generate.
  for (let run = 1; run <= 3; run++) {
    const existing = await progress();
    if (existing.running) throw Error('Another prefill is already running');
    const res = await fetch(api + '/api/prefill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, variants: 1, max: 300 }) });
    if (!res.ok) throw Error('Prefill HTTP ' + res.status);
    log('started', { run });
    const deadline = Date.now() + 30 * 60_000;
    let lastLog = 0;
    while (true) {
      const state = await progress();
      if (!state.running || Date.now() - lastLog >= 30_000) { log('progress', { run, ...state }); lastLog = Date.now(); }
      if (state.failed) throw Error(state.error || 'Prefill failed');
      if (!state.running) {
        await health();
        if (state.made === 0) { log('complete', { assets: state.had }); process.exit(0); }
        break;
      }
      if (Date.now() >= deadline) throw Error('Prefill still running after 30 minutes; check its status before restarting');
      await Bun.sleep(5000);
    }
  }
  throw Error('More assets remain after three runs; check before continuing');
} catch (error) { log('error', String(error)); process.exitCode = 1; }
