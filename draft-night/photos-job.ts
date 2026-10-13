// Draws Draft Night v2 photos with Cloudflare Workers AI and prints them to the log in chunks, so they can be collected
// into the repository (public/draft-night/art). The job list comes from the repo: draft-night/photo-jobs.json.
// PHOTO_FROM / PHOTO_TO / PHOTO_STEP or PHOTO_KEYS choose which jobs this run draws. Runs once per deploy, then idles.
// When Cloudflare refuses a prompt (code 3030, e.g. a car brand name) the job's plain fallback description is used.
//
// Deployed as the Railway Function draft-night-photos (draft-night project), with CF_ACCOUNT_ID and CF_API_TOKEN
// referencing draft-night-web. Set PHOTO_JOBS_URL to the raw file at an exact commit: the branch URL can be cached
// by GitHub for several minutes and hand out an old list. Collect with draft-night/collect-photos.py.
import sharp from 'sharp';

const SRC = Bun.env.PHOTO_JOBS_URL || 'https://raw.githubusercontent.com/louiebond1/Dobble-app/claude/draft-night-quality-investigation-d2seh9/draft-night/photo-jobs.json';
const MODEL = Bun.env.PHOTO_MODEL || '@cf/black-forest-labs/flux-2-klein-9b';
const SIDE = Number(Bun.env.PHOTO_SIDE || 768), OUT = Number(Bun.env.PHOTO_OUT || 640), CHUNK = 16000;
const FROM = Number(Bun.env.PHOTO_FROM || 0), TO = Number(Bun.env.PHOTO_TO || 1e9), STEP = Number(Bun.env.PHOTO_STEP || 1);
const ONLY = (Bun.env.PHOTO_KEYS || '').split(',').filter(Boolean);
const PARALLEL = Number(Bun.env.PHOTO_PARALLEL || 3);

async function draw(job: { prompt: string; fallback?: string }): Promise<Uint8Array> {
  let prompt = job.prompt;
  for (let attempt = 0; attempt < 4; attempt++) {
    const body = new FormData();
    body.append('prompt', prompt); body.append('width', String(SIDE)); body.append('height', String(SIDE));
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${Bun.env.CF_ACCOUNT_ID}/ai/run/${MODEL}`, { method: 'POST', headers: { Authorization: 'Bearer ' + Bun.env.CF_API_TOKEN }, body, signal: AbortSignal.timeout(120000) });
    if (res.ok) {
      const d = await res.json() as any;
      if (d.result?.image) return Uint8Array.from(Buffer.from(d.result.image, 'base64'));
    }
    const err = res.ok ? 'empty image' : res.status + ' ' + (await res.text()).slice(0, 200);
    if (/3030|flagged/.test(err) && job.fallback && prompt !== job.fallback) prompt = job.fallback;
    console.log('PHOTORETRY|' + attempt + '|' + err.slice(0, 120));
    await Bun.sleep(2000 * (attempt + 1));
  }
  throw Error('Cloudflare gave no image after 4 tries');
}
async function shrink(bytes: Uint8Array) {
  try { return await sharp(bytes).resize(OUT, OUT, { fit: 'cover' }).jpeg({ quality: 80, mozjpeg: true }).toBuffer(); }
  catch (e) { console.log('PHOTONOTE|sharp unavailable, sending original: ' + String(e).slice(0, 120)); return Buffer.from(bytes); }
}

const all = await (await fetch(SRC + '?v=' + Date.now())).json() as Array<{ key: string; prompt: string; fallback?: string }>;
const jobs = all.map((j, i) => ({ ...j, i })).filter(j => ONLY.length ? ONLY.includes(j.key) : j.i >= FROM && j.i < TO && (j.i - FROM) % STEP === 0);
console.log(`PHOTOS START ${jobs.length} of ${all.length} ${MODEL}`);
let next = 0, made = 0;
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    try {
      const b64 = Buffer.from(await shrink(await draw(j))).toString('base64');
      const n = Math.ceil(b64.length / CHUNK);
      for (let i = 0; i < n; i++) { console.log(`PHOTO|${j.key}|${i}|${n}|${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`); await Bun.sleep(20); }
      made++;
    } catch (e) { console.log(`PHOTOFAIL|${j.key}|${String(e).slice(0, 300)}`); }
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
console.log(`PHOTOS DONE ${made}/${jobs.length}`);
await Bun.sleep(24 * 3600e3);
