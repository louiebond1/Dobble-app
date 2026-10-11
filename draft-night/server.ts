// Draft Night API. Runs as a single-file Railway Function (Bun).
// The client lives in Dobble-app/public/draft-night.html and calls this API cross-origin.
// Keep this file well under 96KB: Railway passes it to the container as one base64 argument.

// pic: the description its picture is made from, when that differs from visual (a typed theme reusing a preset item's picture).
type Cost = { used: number; limit: number };
const GAME_COST_MICROS = 58_000; // $0.058, conservatively below 7p including 20% VAT at $1 = £1.
function newCost(used = 0): Cost { return { used, limit: GAME_COST_MICROS }; }
function reserve(c: Cost | undefined, micros: number) { if (!c) return; if (c.used + micros > c.limit) throw Error('Game AI budget reached'); c.used += micros; }

type Item = { name: string; blurb: string; visual: string; pic?: string };
type Mode = 'property' | 'build' | 'collection';
// bases: the starting options auctioned first (one per player). base: what everyone holds before winning one.
type Theme = { id: string; title: string; emoji: string; mode: Mode; noun: string; label: string; startLabel: string; base: Item | null; scene: string; spatial?: boolean; setupCost?: number; bases: Item[]; items: Item[]; bad: Item[]; created: number };
// rev: a reverse auction for a dud (players bid in secret to avoid it). key: its picture.
type Lot = Item & { kind: 'base' | 'add'; rev?: boolean; key: string };
type Player = { name: string; color: string; budget: number; won: number[]; base: number | null; cpu: boolean; seen: number; device: string };
type Entry = { p: number; a: number | null; why?: string };
// elig: who may receive this lot. sealed: secret reverse-auction bids, never sent to other players before the reveal.
type Auction = { bid: number; leader: number | null; turn: number | null; passed: boolean[]; phase: 'bidding' | 'sealed' | 'sold' | 'unsold'; deadline: number; log: Entry[]; result: { winner: number | null; price: number; note: string; bids?: Entry[] } | null; rev: boolean; elig: boolean[]; sealed: Array<number | null> };
type World = { v: number; state: string; busy: boolean; tries: number };
type Room = {
  cost: Cost; code: string; rev: number; created: number; auctionCount: number; listed: boolean; notice: string; sig?: string; status: 'lobby' | 'playing' | 'finished'; theme: Theme; budget: number; capacity: number; cpu: boolean;
  players: Player[]; tokens: string[]; deckBases: Item[]; deckAdds: Item[]; deckBad: Item[]; lots: Lot[]; lot: number; auction: Auction;
  revK: number; revFor: number; history: Array<{ lot: number; winner: number | null; price: number; paid?: number[] }>; lotImg: Record<string, string>; art: Record<string, string>; baseImg: string; imageError: string; worlds: World[]; verdict: string | null;
};

const env = (k: string, d: string) => String(Bun.env[k] || d);
const TURN_MS = Number(env('DRAFT_TURN_MS', '30000'));
const AWAY_MS = Number(env('DRAFT_AWAY_MS', '20000'));
const SOLD_MS = Number(env('DRAFT_SOLD_MS', '2400'));
const UNSOLD_MS = Number(env('DRAFT_UNSOLD_MS', '1600'));
const CPU_MS = Number(env('DRAFT_CPU_MS', '900'));
const REVEAL_MS = Number(env('DRAFT_REVEAL_MS', '5000'));
const REV_SHARE = Number(env('DRAFT_REVERSE_SHARE', '0.125'));
const LOTS_PER_PLAYER = 5;
const MAX_PLAYERS = 6;
const COLORS = ['#FF7A59', '#4EA8FF', '#3FD4A2', '#FFC145', '#B48CFF', '#FF6FAE'];
const API = env('OPENAI_BASE_URL', 'https://api.openai.com/v1');
const CLIENT_URL = env('DRAFT_CLIENT_URL', 'https://dobble-app-production.up.railway.app/draft-night.html');
let clock = () => Date.now();

// ---------- Curated themes ----------
// Each line: Name|short blurb shown to players|visual description used for image generation (what it looks like and where it goes).
const parse = (s: string): Item[] => s.trim().split('\n').map(l => { const [name, blurb, visual] = l.split('|').map(x => x.trim()); return { name, blurb, visual: visual || blurb }; });

// Preset themes live in the client site's draft-night-themes.json: 75 or so items each is far beyond this file's 96KB limit.
// Each list line there is Name|blurb|visual, as above. Loaded at start-up; requests wait for it.
const THEMES_URL = env('DRAFT_THEMES_URL', new URL('/draft-night-themes.json', CLIENT_URL).href);
const PRESETS: Theme[] = [];
let presetsReady: Promise<void> | null = null;
function loadPresets(): Promise<void> {
  return presetsReady ??= (async () => {
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(THEMES_URL, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw Error('Themes ' + r.status);
        const d = await r.json() as any, lines = (x: string[]) => parse(x.join('\n'));
        PRESETS.splice(0, PRESETS.length, ...d.themes.map((t: any) => ({ ...t, bases: lines(t.bases), items: lines(t.items), bad: lines(t.bad), created: 0 })));
        return;
      } catch (e) {
        console.error('Loading themes failed', String(e));
        if (i >= 2) { presetsReady = null; throw e; }
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  })();
}
const ALIASES: Record<string, string> = { house: 'house', home: 'house', 'dream house': 'house', 'dream home': 'house', property: 'house', mansion: 'house', pancake: 'pancakes', pancakes: 'pancakes', 'pancake stack': 'pancakes', burger: 'burger', burgers: 'burger', hamburger: 'burger', cheeseburger: 'burger', pizza: 'pizza', pizzas: 'pizza', 'gaming setup': 'gaming', 'gaming set up': 'gaming', 'gaming station': 'gaming', 'gaming room': 'gaming', 'gaming desk': 'gaming', garage: 'garage', 'dream garage': 'garage', 'car collection': 'garage', 'supercar collection': 'garage' };
function presetFor(topic: string) {
  const t = topic.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\b(the|my|a|an|our|best|ultimate|perfect|dream|build|your|of)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const id = ALIASES[t] || ALIASES[topic.toLowerCase().trim()];
  return PRESETS.find(p => p.id === id) || null;
}

// Cache identical starting scenes and item art between games, with in-flight deduplication.
// Cache is instance-local; persistent object storage can be attached later.
const sharedArt = new Map<string, Uint8Array>();
const sharedPending = new Map<string, Promise<Uint8Array>>();
async function reusableArt(prompt: string, quality: string, cost?: Cost, side = 1024): Promise<Uint8Array> {
  const key = env('DRAFT_CF_MODEL', '@cf/black-forest-labs/flux-2-klein-4b') + ':' + quality + ':' + prompt;
  const cached = sharedArt.get(key);
  if (cached) { sharedArt.delete(key); sharedArt.set(key,cached); return cached; }
  if (sharedPending.has(key)) return sharedPending.get(key)!;
  const promise = makeImage(prompt, [], quality, cost, side).then(bytes => {
    sharedArt.set(key, bytes);
    while (sharedArt.size > 250) sharedArt.delete(sharedArt.keys().next().value!);
    return bytes;
  });
  sharedPending.set(key, promise);
  try { return await promise; } finally { sharedPending.delete(key); }
}
const WORLD_BATCH = Math.max(1, Number(env('DRAFT_WORLD_BATCH','2')) || 2);

// ---------- Picture library ----------
// Starting-scene and item pictures depend only on their prompt, so they are kept permanently in a storage bucket and
// reused by every later game; only players' own creations are made per game. Phones load stored pictures straight from
// the bucket through signed links. Up to DRAFT_ART_VARIANTS versions of each picture are kept for variety: a game uses
// any version already stored and never pays for a second one (only the prefill run makes extra versions).
const ART = env('ART_BUCKET', '') && env('ART_KEY_ID', '') ? new Bun.S3Client({ bucket: env('ART_BUCKET', ''), endpoint: env('ART_ENDPOINT', ''), region: env('ART_REGION', 'auto'), accessKeyId: env('ART_KEY_ID', ''), secretAccessKey: env('ART_SECRET', ''), virtualHostedStyle: env('ART_PATH_STYLE', '') !== '1' }) : null;
const VARIANTS = clampN(Number(env('DRAFT_ART_VARIANTS', '2')), 1, 4);
function clampN(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, Math.round(n) || lo)); }
const stored = new Set<string>(), signed = new Map<string, { url: string; until: number }>();
const artName = async (prompt: string, quality: string) => {
  const model = CF_ACCOUNT && CF_TOKEN ? CF_MODEL : env('DRAFT_IMAGE_MODEL', 'gpt-image-2.5-flare');
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(model + '|' + quality + '|' + prompt)));
  return 'art/' + Array.from(h.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
};
async function isStored(k: string) {
  if (stored.has(k)) return true;
  try { if (await ART!.file(k).exists()) { stored.add(k); return true; } } catch (e) { console.error('Library check failed', String(e)); }
  return false;
}
async function store(k: string, bytes: Uint8Array) {
  try { await ART!.file(k).write(bytes, { type: 'image/jpeg' }); stored.add(k); return true; } catch (e) { console.error('Library save failed', String(e)); return false; }
}
// The picture for a prompt, as { key } in the library and, when needed for picture edits, its bytes.
async function libraryArt(prompt: string, quality: string, want: number, needBytes: boolean, cost?: Cost): Promise<{ key?: string; bytes?: Uint8Array }> {
  if (!ART) return { bytes: await reusableArt(prompt, quality, cost, needBytes ? 1024 : 512) };
  const name = await artName(prompt, quality);
  for (const v of [want, ...Array.from({ length: VARIANTS }, (_, i) => i).filter(i => i !== want)]) {
    const k = name + '-' + v + '.jpg';
    if (await isStored(k)) {
      if (!needBytes) return { key: k };
      try { return { key: k, bytes: new Uint8Array(await ART.file(k).arrayBuffer()) }; } catch (e) { console.error('Library read failed', String(e)); }
    }
  }
  const bytes = await reusableArt(prompt, quality, cost, needBytes ? 1024 : 512), k = name + '-' + want + '.jpg';
  return (await store(k, bytes)) ? { key: k, bytes } : { bytes };
}
// Signed links last a day; a fresh one is made after 12 hours.
function artUrl(k: string) {
  const s = signed.get(k);
  if (s && s.until > clock()) return s.url;
  const url = ART!.file(k).presign({ expiresIn: 86400 });
  signed.set(k, { url, until: clock() + 12 * 3600e3 });
  return url;
}
// Prefill: makes every preset theme's library pictures ahead of time, one at a time behind live games, and stops at the
// first failure (such as Cloudflare's daily allowance running out) so it can simply be run again later.
const fill = { running: false, made: 0, had: 0, failed: 0, left: 0, error: '' };
async function prefill(ids: string[], variants: number, max: number) {
  const jobs: Array<{ prompt: string; quality: string; side: number }> = [];
  for (const t of PRESETS.filter(x => !ids.length || ids.includes(x.id))) {
    const fake = { theme: t } as Room;
    if (t.base?.visual) jobs.push({ prompt: basePrompt(fake), quality: WORLD_Q, side: 1024 });
    for (const it of t.bases) jobs.push({ prompt: lotPrompt(fake, it, 'base'), quality: WORLD_Q, side: 1024 });
    for (const it of [...t.items, ...t.bad]) jobs.push({ prompt: lotPrompt(fake, it, 'add'), quality: ITEM_Q, side: 512 });
  }
  Object.assign(fill, { running: true, made: 0, had: 0, failed: 0, left: jobs.length * variants, error: '' });
  try {
    // Round v makes sure each picture has at least v + 1 stored versions, whichever slots games already filled.
    for (let v = 0; v < variants; v++) for (const j of jobs) {
      fill.left--;
      const name = await artName(j.prompt, j.quality), have: number[] = [];
      for (let i = 0; i < VARIANTS; i++) if (await isStored(name + '-' + i + '.jpg')) have.push(i);
      if (have.length > v) { fill.had++; continue; }
      if (fill.made >= max) continue;
      const k = name + '-' + Array.from({ length: VARIANTS }, (_, i) => i).find(i => !have.includes(i)) + '.jpg';
      try {
        const bytes = await new Promise<Uint8Array>((ok, no) => enqueue(5, () => makeImage(j.prompt, [], j.quality, undefined, j.side).then(ok, no)));
        if (await store(k, bytes)) fill.made++; else throw Error('Could not save to the library');
      } catch (e) { fill.failed++; fill.error = String(e).slice(0, 300); return; }
    }
  } finally { fill.running = false; }
}

// ---------- State ----------
const rooms = new Map<string, Room>();
const themes = new Map<string, Theme>();
const images = new Map<string, Uint8Array>();
const timers = new Map<string, any>();
const retries = new Map<string, number>();

const shuffle = <T,>(a: T[]): T[] => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const cleanName = (x: any, d: string) => String(x || '').replace(/[^\p{L}\p{N} '\-]/gu, '').trim().slice(0, 16) || d;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function newCode() { let c = ''; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)]).join(''); } while (rooms.has(c)); return c; }
function sweep() { const cut = clock() - 8 * 3600e3; for (const [k, r] of rooms) if (r.created < cut) { rooms.delete(k); clearTimeout(timers.get(k)); for (const key of images.keys()) if (key.startsWith(k + '/')) images.delete(key); } for (const [k, t] of themes) if (t.created < clock() - 3600e3) themes.delete(k); }

// ---------- Auction engine ----------
const bump = (r: Room) => { r.rev++; };
const isBaseLot = (r: Room) => r.lots[r.lot]?.kind === 'base';
// Themes with starting options auction them first, one per player, before any additions.
const hasBases = (t: Theme) => t.bases.length > 0;
// Everyone finishes with exactly their share of the lots (starting option included): 12 lots for 2 players is 6 each.
// An uneven split gives some players one more (15 for 2 is 8 and 7); the auctions decide who.
// In the lobby it is worked out from the seats; once started, from the players actually playing.
function quota(r: Room) {
  const L = r.status === 'lobby' ? r.auctionCount : r.lots.length, n = r.status === 'lobby' ? r.capacity : r.players.length;
  return { lo: Math.floor(L / n), hi: Math.ceil(L / n) };
}
// Who may receive the current lot so that everyone can still finish with their share: nobody already at the most they
// can hold, and once the lots left are exactly what the players below their share still need, only those players.
// This keeps "items still owed ≤ lots left ≤ room left" true after every lot, so every lot always has a taker.
function recipients(r: Room) {
  const { lo, hi } = quota(r), left = r.lots.length - r.lot, base = isBaseLot(r);
  const need = r.players.map(p => Math.max(0, lo - p.won.length)), owed = need.reduce((s, x) => s + x, 0);
  return r.players.map((p, i) => (base ? p.base === null : !hasBases(r.theme) || p.base !== null) && p.won.length < hi && (owed < left || need[i] > 0));
}
const eligible = (r: Room, p: number) => r.status === 'playing' && !!r.auction.elig[p];
const eligibleSeats = (r: Room) => r.players.map((_, i) => i).filter(i => eligible(r, i));
const canAct = (r: Room, p: number) => eligible(r, p) && !r.auction.passed[p] && r.auction.leader !== p;
const away = (r: Room, p: number) => !r.players[p].cpu && clock() - r.players[p].seen > AWAY_MS;
// A funded player may give an opening lot to their broke opponent, if both can still receive it.
function giftTarget(r: Room, p: number): number | null {
  const a = r.auction, other = 1 - p;
  return r.players.length === 2 && !a.rev && a.phase === 'bidding' && a.leader === null && eligible(r, p) && eligible(r, other) && r.players[p].budget > 0 && r.players[other].budget === 0 ? other : null;
}

function beginLot(r: Room) {
  const n = r.players.length, rev = !!r.lots[r.lot].rev;
  r.auction = { bid: 0, leader: null, turn: null, passed: Array(n).fill(false), phase: rev ? 'sealed' : 'bidding', deadline: 0, log: [], result: null, rev, elig: recipients(r), sealed: Array(n).fill(null) };
  const seats = eligibleSeats(r);
  // Only one player can take it: no bidding, it is theirs for free.
  if (seats.length === 1) {
    const p = seats[0], full = r.players.every((x, i) => i === p || x.won.length >= quota(r).hi);
    award(r, p, 0, isBaseLot(r) ? 'Last one left: theirs for free' : full ? 'Everyone else has their full set' : 'They need every lot left to finish their set');
    return;
  }
  if (!seats.length) { closeLot(r); return; }
  if (rev) {
    r.auction.deadline = clock() + TURN_MS;
    for (const p of seats) if (r.players[p].cpu) r.auction.sealed[p] = cpuDodge(r, p);
    return;
  }
  passTo(r, (r.lot % n) - 1);
}
// Moves the turn to the next player who can still raise; resolves the lot when nobody can.
function passTo(r: Room, from: number) {
  const a = r.auction, n = r.players.length;
  for (let i = 0; i < n; i++) if (canAct(r, i) && r.players[i].budget < a.bid + 1) { a.passed[i] = true; a.log.push({ p: i, a: null, why: 'out of money' }); }
  let next: number | null = null;
  for (let k = 1; k <= n; k++) { const p = (((from + k) % n) + n) % n; if (canAct(r, p)) { next = p; break; } }
  if (next === null) { closeLot(r); return; }
  a.turn = next;
  a.deadline = clock() + (r.players[next].cpu ? CPU_MS : away(r, next) ? 0 : TURN_MS);
}
function closeLot(r: Room) {
  const a = r.auction;
  if (a.leader !== null) return award(r, a.leader, a.bid, '');
  // Every lot goes to someone: if nobody who can take it could afford £1, it is drawn at random among them.
  const seats = eligibleSeats(r);
  if (seats.length) return award(r, seats[Math.floor(Math.random() * seats.length)], 0, 'No bids: drawn at random');
  a.phase = 'unsold'; a.turn = null; a.result = { winner: null, price: 0, note: 'No bids' }; a.deadline = clock() + UNSOLD_MS;
  r.history.push({ lot: r.lot, winner: null, price: 0 });
}
// paid: what each player paid to dodge a reverse lot (the receiver pays nothing). bids: the revealed secret bids.
function award(r: Room, p: number, price: number, note: string, paid?: number[], bids?: Entry[]) {
  const pl = r.players[p], a = r.auction;
  if (!eligible(r, p) || price > pl.budget || price < 0 || paid?.[p] || paid?.some((x, i) => x < 0 || x > r.players[i].budget)) throw Error('Invalid allocation');
  pl.budget -= price; pl.won.push(r.lot); if (r.lots[r.lot].kind === 'base') pl.base = r.lot;
  paid?.forEach((x, i) => { r.players[i].budget -= x; });
  r.history.push(paid ? { lot: r.lot, winner: p, price, paid } : { lot: r.lot, winner: p, price });
  a.phase = 'sold'; a.turn = null; a.bid = price; a.leader = p; a.result = bids ? { winner: p, price, note, bids } : { winner: p, price, note };
  a.deadline = clock() + (bids ? REVEAL_MS : SOLD_MS);
  void ensureWorld(r, p);
}
function nextLot(r: Room) {
  r.lot++;
  // Finishing flushes any wins still waiting for a batched picture edit, so every final picture shows everything.
  if (r.lot >= r.lots.length) { r.status = 'finished'; r.auction.turn = null; r.players.forEach((_, p) => void ensureWorld(r, p)); void judge(r); return; }
  beginLot(r);
}
function bid(r: Room, p: number, amount: number, why?: string) {
  const a = r.auction;
  if (a.phase !== 'bidding' || a.turn !== p) throw Error('It is not your turn');
  if (!Number.isSafeInteger(amount) || amount <= a.bid || amount > r.players[p].budget) throw Error('Invalid bid');
  a.bid = amount; a.leader = p; a.log.push(why ? { p, a: amount, why } : { p, a: amount });
  passTo(r, p);
}
function pass(r: Room, p: number, why?: string) {
  const a = r.auction;
  if (a.phase !== 'bidding' || a.turn !== p) throw Error('It is not your turn');
  const gift = giftTarget(r, p);
  if (gift !== null) {
    a.log.push({ p, a: null, why: why || 'gave it to their opponent' });
    return award(r, gift, 0, r.players[p].name + ' passed it to ' + r.players[gift].name + ' for free');
  }
  // Every lot sells: whoever opens must bid at least £1. Only running out of money excuses it.
  if (a.leader === null && r.players[p].budget >= 1) throw Error('You open the bidding: bid at least £1');
  a.passed[p] = true; a.log.push(why ? { p, a: null, why } : { p, a: null });
  passTo(r, p);
}
function forcePass(r: Room, p: number, why: string) {
  const a = r.auction;
  a.passed[p] = true; a.log.push({ p, a: null, why });
  passTo(r, p);
}
// ---------- Reverse auctions ----------
// Everyone who could be landed with a dud bids in secret (£0 up to their money) to avoid it. All bids are revealed
// together: the lowest bidder gets the dud for free and everyone else pays what they bid to escape it.
// A tie for lowest is drawn at random among the tied players.
function seal(r: Room, p: number, amount: number) {
  const a = r.auction;
  if (a.phase !== 'sealed' || !eligible(r, p)) throw Error('You are safe from this one');
  if (a.sealed[p] !== null) throw Error('Your bid is already locked in');
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > r.players[p].budget) throw Error('Invalid bid');
  a.sealed[p] = amount;
}
// Bids missing at the deadline, or from players who have stopped polling, count as £0.
function reveal(r: Room) {
  const a = r.auction, seats = eligibleSeats(r);
  const bids: Entry[] = seats.map(p => a.sealed[p] === null ? { p, a: 0, why: away(r, p) ? 'away' : 'no bid in time' } : { p, a: a.sealed[p] });
  bids.sort((x, y) => y.a! - x.a!);
  const low = bids[bids.length - 1].a!, tied = bids.filter(b => b.a === low).map(b => b.p);
  const loser = tied[Math.floor(Math.random() * tied.length)];
  const paid = r.players.map((_, i) => i === loser ? 0 : bids.find(b => b.p === i)?.a || 0);
  award(r, loser, 0, tied.length > 1 ? `Tied at £${low}: drawn at random` : '', paid, bids);
}
// A dud takes one of the CPU's remaining slots, so it pays more to dodge when it has few left.
function cpuDodge(r: Room, p: number) {
  const pl = r.players[p], slots = Math.max(1, quota(r).hi - pl.won.length);
  return Math.min(pl.budget, Math.floor((pl.budget / slots) * (0.2 + Math.random() * 0.6)));
}
function cpuMove(r: Room, p: number) {
  const pl = r.players[p], a = r.auction, lot = r.lots[r.lot];
  const share = Math.max(1, quota(r).hi - pl.won.length);
  let value = lot.kind === 'base' ? pl.budget * (0.25 + Math.random() * 0.3) : (pl.budget / share) * (0.6 + Math.random() * 0.9);
  value = Math.floor(Math.min(value, pl.budget));
  if (giftTarget(r, p) !== null && value < 1) pass(r, p);
  else if (a.bid < value || a.leader === null) bid(r, p, Math.min(pl.budget, a.bid + (value - a.bid > 5 && Math.random() < 0.5 ? 2 : 1)));
  else pass(r, p);
}
// Advances any timers that have expired. Called on every request and by a per-room timeout.
function tick(r: Room) {
  let guard = 0;
  while (r.status === 'playing' && guard++ < 200) {
    const a = r.auction, now = clock();
    if (a.phase === 'bidding' && a.turn !== null) {
      const p = a.turn;
      if (a.deadline > now && !away(r, p)) break;
      if (r.players[p].cpu) { if (a.deadline > now) break; cpuMove(r, p); }
      else if (giftTarget(r, p) !== null) pass(r, p, away(r, p) ? 'away' : 'time ran out');
      else if (a.leader === null) bid(r, p, 1, away(r, p) ? 'away, opened automatically' : 'time ran out, opened automatically');
      else forcePass(r, p, away(r, p) ? 'away' : 'time ran out');
    } else if (a.phase === 'sealed') {
      // Reveal once every bid is in, the time is up, or everyone still to bid has stopped polling.
      if (a.deadline > now && !eligibleSeats(r).every(p => a.sealed[p] !== null || away(r, p))) break;
      reveal(r);
    } else if (a.deadline <= now) nextLot(r);
    else break;
    bump(r);
  }
  schedule(r);
}
function schedule(r: Room) {
  clearTimeout(timers.get(r.code));
  if (r.status !== 'playing') return;
  const wait = clamp(r.auction.deadline - clock(), 0, 60000) + 25;
  const t = setTimeout(() => { if (rooms.get(r.code) === r) tick(r); }, wait);
  t?.unref?.(); timers.set(r.code, t);
}
// Each addition has a 1 in 8 chance (DRAFT_REVERSE_SHARE) of being a dud, so some games have none and some two or more.
// Decided once per addition and remembered, so the lobby's picture prefetch and the game agree. Starting options never are.
function revCount(r: Room, adds: number) {
  for (; r.revFor < adds; r.revFor++) if (Math.random() < REV_SHARE) r.revK++;
  return Math.min(r.deckBad.length, r.revK);
}
function start(r: Room) {
  const n = r.players.length, nb = hasBases(r.theme) ? n : 0, adds = Math.max(0, r.auctionCount - nb), k = revCount(r, adds);
  const good: Lot[] = r.deckAdds.slice(0, adds - k).map((x, i) => ({ ...x, kind: 'add', key: 'add' + i }));
  const bad: Lot[] = r.deckBad.slice(0, k).map((x, i) => ({ ...x, kind: 'add', key: 'bad' + i, rev: true }));
  // Spread the duds out: one at a random spot in each of k equal stretches of the additions.
  const T = good.length + bad.length, at = new Set<number>();
  for (let j = 0; j < k; j++) { const s = Math.floor((j * T) / k), e = Math.floor(((j + 1) * T) / k); at.add(s + Math.floor(Math.random() * (e - s))); }
  const mixed = Array.from({ length: T }, (_, t) => (at.has(t) ? bad.shift() : good.shift())!);
  r.lots = [...r.deckBases.slice(0, nb).map((x, i) => ({ ...x, kind: 'base' as const, key: 'lot' + i })), ...mixed];
  r.status = 'playing'; r.lot = 0;
  prefetch(r, adds);
  r.worlds = r.players.map(() => ({ v: r.baseImg === 'ready' ? 0 : -1, state: 'idle', busy: false, tries: 0 }));
  beginLot(r);
}

// ---------- Images ----------
// Each player's world is a chain of edits. Version v shows the base plus their first v acquisitions
// (property: v=1 is exactly the house photo they bid on). Each new version edits the previous image,
// so the original creation and earlier purchases stay put. Versions only ever move forwards.
// Cheapest settings that still look right: a side-by-side test showed low quality on this model keeps houses, placement
// and earlier items as well as medium, while gpt-image-1-mini drifted (wrong angle, items in the wrong place).
const ITEM_Q = env('DRAFT_ITEM_QUALITY', 'low');
const WORLD_Q = env('DRAFT_WORLD_QUALITY', 'low');
// Extras that add input cost; edits stayed faithful without them in the same test.
const HIGH_FIDELITY = env('DRAFT_HIGH_FIDELITY', '') === '1';
const ITEM_REFERENCE = env('DRAFT_ITEM_REFERENCE', '') === '1';
const STYLE = 'Photorealistic, natural light, crisp detail, consistent colour grading. No text, captions, labels, logos, watermarks or people.';
const queue: Array<{ pri: number; run: () => Promise<void> }> = [];
let running = 0;
const MAX_JOBS = Number(env('DRAFT_IMAGE_CONCURRENCY', '4'));
function enqueue(pri: number, run: () => Promise<void>) { queue.push({ pri, run }); queue.sort((a, b) => a.pri - b.pri); pump(); }
function pump() {
  while (running < MAX_JOBS && queue.length) {
    const job = queue.shift()!; running++;
    job.run().catch(() => {}).finally(() => { running--; pump(); });
  }
}
const imgKey = (r: Room, k: string) => r.code + '/' + k;
function worldKey(r: Room, p: number, v: number) {
  if (v < 0) return '';
  if (v === 0) return 'base';
  if (hasBases(r.theme) && v === 1) return 'lot' + r.players[p].won[0];
  return 'w' + p + '-' + v;
}
// Item pictures describe the thing without naming it: with the name in the prompt, FLUX sometimes wrote it across the picture.
function lotPrompt(r: Room, it: Item, kind: string) {
  const t = r.theme;
  if (t.spatial) return `${t.scene}. ${kind === 'base' ? 'Show the whole undeveloped starting landscape' : 'Show this full-size development in its natural outdoor setting'}: ${it.visual}. Real aerial drone photography, with all land and structures at realistic scale. Depict the actual place itself, never a printed photograph, tabletop, tray, miniature, model or collage. ${kind === 'base' ? 'No resorts, roads or attractions unless explicitly described; leave ample usable land for later purchases.' : 'Only the described development, no other attractions.'} Square framing. ${STYLE}`;
  if (kind === 'base' && t.mode === 'property') return `${t.scene}. The property is ${it.visual}. Show it exactly as described at its true real-world size, with nothing that is not described: no swimming pool, no hot tub, no cars, no extra buildings or grounds unless described. Square framing with the whole property visible. ${STYLE}`;
  if (kind === 'base') return `${t.scene}. Subject: ${it.visual}. Show it exactly as described, plain, with nothing added on or around it, leaving space for additions later. Square framing. ${STYLE}`;
  return `Clear photograph of ${(it.pic || it.visual).replace(/ (on|in|beside|across|over|into|outside|by|at|under|above|scattered|draped|layered|piled|replacing|parked|leaning|sitting|standing|strung|fitted|attached|added|clamped|mounted|squeezed|clearly)\b.*$/i, '') || it.name} as a single isolated subject, centred and filling most of the frame, on a plain softly lit warm-grey background. Square framing. ${STYLE}`;
}
function basePrompt(r: Room) {
  const t = r.theme;
  if (t.spatial) return lotPrompt(r, t.base!, 'base');
  return `${t.scene}. Subject: ${t.base!.visual}. Show it plain and unembellished, exactly as described, with clear space around and on it so additions can be placed later. Square framing. ${STYLE}`;
}
const LUXURIES = ['swimming pool', 'hot tub', 'supercar', 'tennis court', 'helicopter', 'extra storeys', 'larger garden or extra land', 'outbuildings'];
function worldPrompt(r: Room, p: number, from: number, to: number, withRef = false) {
  const t = r.theme, pl = r.players[p];
  const acq = pl.won.map(i => r.lots[i]);
  const adds = acq.filter(x => x.kind === 'add');
  const collection = t.mode === 'collection';
  const already: Lot[] = [];
  const fresh = acq.slice(0, to).filter(x => x.kind === 'add');
  const baseName = hasBases(t) ? (acq[0]?.name || t.noun) : t.base!.name;
  const lines = fresh.map(x => `- ${x.name}: ${x.visual}.`).join('\n');
  const keep = already.length ? `It already contains these purchased items, which must stay exactly as they are: ${already.map(x => x.name).join(', ')}.` : 'Nothing has been added to it yet.';
  let forbid = 'Do not add anything else that is not listed.';
  if (t.spatial) {
    forbid = `This is the actual full-size ${t.noun}, viewed from the air, never a tabletop, tray, miniature, printed photograph or collage. Build each purchase into the landscape at realistic scale with its footprint clearly visible. Keep the coastline, terrain, land area and previous purchases intact. Add only purchased developments; do not introduce extra buildings or attractions.`;
  } else if (t.mode === 'property') {
    const owned = adds.map(x => (x.name + ' ' + x.visual).toLowerCase()).join(' ');
    // A shed, office or caravan they own is an outbuilding, so outbuildings are not forbidden then.
    const missing = LUXURIES.filter(l => !owned.includes(l.split(' ')[0]) && !(l === 'outbuildings' && /shed|office|sauna|greenhouse|coop|caravan/.test(owned)));
    forbid = `Show each new item at its true real-world size next to the house; it must not cover, overlap or replace any part of the house. Do not enlarge the house or its plot and do not change its architecture. Do not add: ${missing.join(', ')}, or any other feature that is not listed above.`;
  } else if (t.mode === 'build') forbid = `Do not add any other toppings, ingredients, accessories or objects. Keep the ${t.noun} the same size and shape.`;
  else forbid = `The complete collection contains exactly ${fresh.length} purchased additions. Show EVERY listed addition as a separate, recognisable item, including every vehicle; do not merge, substitute or omit any. Arrange the collection side by side or in distinct rows appropriate to the subject, with enough space and widen the view as needed to show every member. Keep the original setting, style and lighting. Vehicles must all be full-size with plausible proportions, never miniature or toy-sized. If the garage is small, use its forecourt or extend the visible parking area in the same architectural style rather than shrinking, overlapping or hiding cars. Do not invent additional items.`;
  if (collection) return `Use this original starting photograph of ${baseName} as the architectural reference. Original base description: ${acq[0]?.visual}. Rebuild the complete collection from this inventory, not from an earlier partial picture:\n${lines}\n${forbid} ${STYLE}`;
  return `Use this ORIGINAL CLEAN STARTING photograph of a ${t.mode === 'property' ? baseName.toLowerCase() : t.noun} (${baseName}). Preserve the original base identity, camera, setting and lighting. Original base description: ${hasBases(t) ? acq[0]?.visual : t.base?.visual}. Rebuild from the complete inventory below. Every listed purchase, including duds, must be visible. Do not invent related ingredients: maple syrup does not imply pancakes, and an empty plate stays an empty plate unless food was purchased. No unlisted foods, cars or attractions. ${keep}\nAdd ONLY the following purchased item${fresh.length > 1 ? 's' : ''}, each clearly recognisable and naturally placed:\n${lines}\n${forbid} ${withRef ? 'The second image is a reference photo of the purchased item: reproduce that item, not its background.' : ''} ${STYLE}`.trim();
}
async function openaiImage(prompt: string, refs: Uint8Array[], quality: string): Promise<Uint8Array> {
  const key = Bun.env.OPENAI_API_KEY; if (!key) throw Error('No image key');
  const model = env('DRAFT_IMAGE_MODEL', 'gpt-image-2.5-flare');
  const call = async (full: boolean) => {
    let body: any; const headers: Record<string, string> = { Authorization: 'Bearer ' + key };
    const params: Record<string, string> = { model, prompt, size: '1024x1024', quality, output_format: 'jpeg' };
    if (!refs.length) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(params); }
    else {
      body = new FormData();
      for (const [k, v] of Object.entries(params)) body.append(k, v);
      if (full && HIGH_FIDELITY) body.append('input_fidelity', 'high');
      const use = full ? refs : refs.slice(0, 1);
      use.forEach((b, i) => body.append(use.length > 1 ? 'image[]' : 'image', new Blob([b as BlobPart], { type: 'image/jpeg' }), 'ref' + i + '.jpg'));
    }
    return fetch(API + '/images/' + (refs.length ? 'edits' : 'generations'), { method: 'POST', headers, body, signal: AbortSignal.timeout(120000) });
  };
  let res = await call(true);
  if (res.status === 400) { console.error('Image request rejected, retrying simplified:', (await res.text()).slice(0, 300)); res = await call(false); }
  if (!res.ok) throw Error('Image service ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const d = await res.json() as any; const b64 = d.data?.[0]?.b64_json;
  if (!b64) throw Error('Empty image');
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}
// Cloudflare Workers AI (FLUX.2 klein 4B) is used whenever its account and token are set: on the same house and burger
// chains it kept the house, angle and earlier items at roughly a tenth of OpenAI's price per picture. OpenAI is the fallback.
const CF_ACCOUNT = env('CF_ACCOUNT_ID', ''), CF_TOKEN = env('CF_API_TOKEN', '');
const CF_MODEL = env('DRAFT_CF_MODEL', '@cf/black-forest-labs/flux-2-klein-4b');
const imagesOn = () => Boolean((CF_ACCOUNT && CF_TOKEN) || Bun.env.OPENAI_API_KEY);
async function cloudflareImage(prompt: string, refs: Uint8Array[], cost?: Cost, side = 1024, model = CF_MODEL): Promise<Uint8Array> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const body = new FormData();
    // A flagged output gets one fresh attempt with neutral photographic wording. Keep the subject, scale and placement.
    const wording = attempt ? 'Realistic photograph of the described scene. ' + prompt.replace(STYLE, 'Natural daylight, sharp detail, realistic proportions, an unlabelled photograph.') : prompt;
    body.append('prompt', wording); body.append('width', String(side)); body.append('height', String(side));
    const tiles = Math.ceil(side / 512) ** 2;
    const micros = model.endsWith('flux-2-klein-4b') ? tiles * (287 + 59 * Math.min(refs.length, 4)) : model.endsWith('flux-2-klein-9b') ? 15000 + 2000 * Math.min(refs.length, 4) : 0;
    if (!micros) throw Error('Unpriced image model: blocked by cost guard');
    reserve(cost, micros); await reserveCloudflare(micros);
    refs.slice(0, 4).forEach((b, i) => body.append('input_image_' + i, new Blob([b as BlobPart], { type: 'image/jpeg' }), 'ref' + i + '.jpg'));
    const res = await fetch(`${env('CF_API_BASE', 'https://api.cloudflare.com/client/v4')}/accounts/${CF_ACCOUNT}/ai/run/${model}`, { method: 'POST', headers: { Authorization: 'Bearer ' + CF_TOKEN }, body, signal: AbortSignal.timeout(120000) });
    if (!res.ok) {
      const error = await res.text();
      let flagged = false;
      try { flagged = JSON.parse(error).errors?.some((e: any) => Number(e.code) === 3030); } catch {}
      if (!attempt && flagged) continue;
      throw Error('Cloudflare image ' + res.status + ' ' + error.slice(0, 200));
    }
    const d = await res.json() as any; const b64 = d.result?.image;
    if (!b64) throw Error('Empty image');
    return Uint8Array.from(Buffer.from(b64, 'base64'));
  }
  throw Error('Cloudflare image failed');
}
// Hard daily cap on pictures made (DRAFT_DAILY_PICTURES), across games and prefill. The count lives in the picture
// library, so the server sleeping or restarting does not reset it. Past the cap, games carry on with item lists.
const DAILY = Number(env('DRAFT_DAILY_PICTURES', '300'));
let usage = { day: '', n: 0, fallbacks: 0, cfMicros: 0, ready: Promise.resolve() };
async function spend() {
  const day = new Date(clock()).toISOString().slice(0, 10), f = 'meta/usage-' + day + '.json';
  if (usage.day !== day) {
    const u = { day, n: 0, fallbacks: 0, cfMicros: 0, ready: Promise.resolve() };
    u.ready = ART ? ART.file(f).text().then(t => { const d = JSON.parse(t); u.n += Number(d.n) || 0; u.fallbacks += Number(d.fallbacks) || 0; u.cfMicros += Number(d.cfMicros) || (u.n * 1384); }, () => {}) : u.ready;
    usage = u;
  }
  const u = usage; await u.ready;
  if (u.n >= DAILY) throw Error('Daily picture limit reached');
  u.n++;
  await saveUsage(u);
}
// A picture that fails (refused, or out of allowance) gives its place back.
async function refund() { const u = usage; u.n = Math.max(0, u.n - 1); await saveUsage(u); }
const saveUsage = (u: { day: string; n: number; fallbacks: number; cfMicros: number }) => ART ? ART.file('meta/usage-' + u.day + '.json').write(JSON.stringify({ n: u.n, fallbacks: u.fallbacks, cfMicros: u.cfMicros })).then(() => {}, () => {}) : Promise.resolve();
async function makeImage(prompt: string, refs: Uint8Array[], quality: string, cost?: Cost, side = 1024): Promise<Uint8Array> {
  await spend();
  try { return await makePicture(prompt, refs, quality, cost, side); } catch (e) { await refund(); throw e; }
}
async function makePicture(prompt: string, refs: Uint8Array[], quality: string, cost?: Cost, side = 1024): Promise<Uint8Array> {
  if (CF_ACCOUNT && CF_TOKEN) {
    try { return await cloudflareImage(prompt, refs, cost, side); }
    catch (e) {
      // Authorised fallback, separately bounded so provider failures cannot trigger unlimited paid images.
      const fallback = env('DRAFT_ALLOW_PAID_FALLBACK', '1') === '1';
      if (!fallback || outOfCredit(null, e)) throw e;
      console.error('Cloudflare image failed, trying stronger image model:', String(e));
      if (/budget reached|Cloudflare cost limit/.test(String(e))) throw e;
      return paidFallback(prompt, refs, quality, cost, side);
    }
  }
  if (cost) throw Error('Unpriced OpenAI image generation blocked by game cost guard');
  return openaiImage(prompt, refs, quality);
}
async function reserveCloudflare(micros: number) {
  const u = usage; await u.ready;
  // Same ceiling as 900 worst-case existing 4B requests: no increase to the previous daily spending limit.
  if (u.cfMicros + micros > DAILY * 1384) throw Error('Cloudflare cost limit reached');
  u.cfMicros += micros; await saveUsage(u);
}
async function paidFallback(prompt: string, refs: Uint8Array[], quality: string, cost?: Cost, side = 1024): Promise<Uint8Array> {
  if (CF_ACCOUNT && CF_TOKEN) return cloudflareImage(prompt, refs, cost, side, '@cf/black-forest-labs/flux-2-klein-9b');
  if (cost) throw Error('Unpriced OpenAI image generation blocked by game cost guard');
  return openaiImage(prompt, refs, quality);
}
async function compose(r: Room, prompt: string) {
  if (Bun.env.OPENAI_API_KEY) {
    const plan = await openaiJSON("You plan a photograph of a player's completed game creation. Give a short concrete composition that shows EVERY inventory item clearly. Infer scale from the subject. For multiple cars use a raised wide view of distinct parking bays in the garage and its forecourt; count them, assign each named car its own bay, and leave no vehicle hidden behind another. For food separate the purchased ingredients visibly on the original plate; never infer pancakes from syrup. For islands show each development in its own land area. Preserve the base identity and add no unpurchased things. Return layout in at most 110 words.", prompt, S({ layout: str }), 450, 45000, undefined, r.cost);
    if (plan.layout) prompt += '\nComposition: ' + String(plan.layout).slice(0, 1200);
  }
  return prompt;
}
async function checkCollection(r: Room, p: number, target: number, image: Uint8Array) {
  const owned = r.players[p].won.slice(0, target).map(i => r.lots[i]).filter(x => x.kind === 'add');
  const schema = S({ complete: { type: 'boolean' }, missing: { type: 'array', items: { type: 'string' } }, extras: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' } });
  return openaiJSON('Check this game creation photograph against the original base and exact purchased inventory. Each listed purchase must be separately visible and recognisable at a plausible real-world size. The original base and its explicitly described components are allowed: a butter dish or napkin described in the original base is never an extra. extras lists only new objects absent from BOTH the original base and purchased inventory. Reject invented extras and duplicate vehicles, including pancakes that were never purchased. Match each actual vehicle to exactly one purchased model: the visible vehicle count must equal the purchased vehicle count; another similar sports car is not a valid substitute. List extra or duplicate objects in extras. Every forced dud must also be present. Count the vehicles or collection members carefully: merged cars, toy-sized cars and obscured cars do not count. Do not accept a picture merely because it is attractive. Return complete=false when any purchase is missing, substituted or distorted; missing lists its inventory name and reason explains the defect. Do not require text labels or exact colours unless specified.', `Creation: ${r.theme.noun}\nOriginal base: ${r.lots[r.players[p].won[0]]?.visual || r.theme.base?.visual}\nPurchased inventory:\n${owned.map(x => x.name + ': ' + x.visual).join('\n')}`, schema, 500, 45000, image, r.cost, 'gpt-4.1');
}
// OpenAI answers 429 insufficient_quota when the account has no credit; retrying cannot help.
const CREDIT_MSG = 'Pictures are unavailable: the OpenAI account behind Draft Night has run out of credit. Add credit at platform.openai.com → Billing.';
// Limits that retrying cannot fix today: our own daily cap and Cloudflare's free daily allowance.
const LIMIT_MSG = "Today's picture allowance is used up, so this game shows item lists instead of pictures. It resets at midnight (UTC).";
function outOfCredit(r: Room | null, e: unknown) {
  const s = String(e); if (r && /Game AI budget reached/.test(s)) { r.imageError = 'This game has reached its picture budget. Your full purchases are still listed below.'; bump(r); return true; } const limit = /Daily picture limit|daily free allocation|Daily OpenAI fallback limit|Cloudflare cost limit/i.test(s), hit = limit || /insufficient_quota|no credits remaining|billing/i.test(s);
  if (hit && r) { r.imageError = limit ? LIMIT_MSG : CREDIT_MSG; bump(r); }
  return hit;
}
function genLot(r: Room, k: string, it: Item, kind: string, pri: number) {
  if (r.lotImg[k]) return;
  r.lotImg[k] = imagesOn() ? 'pending' : 'none';
  if (!imagesOn()) return;
  enqueue(pri, async () => {
    try {
      // Starting options are the first picture of a player's creation, so their bytes are kept for editing.
      const got = await libraryArt(lotPrompt(r, it, kind), kind === 'base' ? WORLD_Q : ITEM_Q, Math.floor(Math.random() * VARIANTS), kind === 'base', r.cost);
      if (got.bytes) images.set(imgKey(r, k), got.bytes);
      if (got.key) r.art[k] = got.key;
      r.lotImg[k] = 'ready';
    }
    catch (e) {
      console.error('Lot image failed', String(e));
      if (outOfCredit(r, e)) { r.lotImg[k] = 'error'; bump(r); return; }
      const n = (retries.get(imgKey(r, k)) || 0) + 1; retries.set(imgKey(r, k), n);
      r.lotImg[k] = n < 3 ? '' : 'error';
      if (n < 3) setTimeout(() => genLot(r, k, it, kind, pri), 3000 * n);
    }
    bump(r);
    if (r.status !== 'lobby') r.players.forEach((_, p) => void ensureWorld(r, p));
  });
}
function genBase(r: Room) {
  if (!r.theme.base?.visual) return;
  if (!imagesOn()) { r.baseImg = 'none'; return; }
  r.baseImg = 'pending';
  enqueue(0, async () => {
    try {
      const got = await libraryArt(basePrompt(r), WORLD_Q, Math.floor(Math.random() * VARIANTS), true, r.cost);
      if (got.bytes) images.set(imgKey(r, 'base'), got.bytes);
      if (got.key) r.art.base = got.key;
      r.baseImg = 'ready';
    }
    catch (e) {
      console.error('Base image failed', String(e));
      const n = (retries.get(imgKey(r, 'base')) || 0) + 1; retries.set(imgKey(r, 'base'), n);
      r.baseImg = 'error'; if (n < 3 && !outOfCredit(r, e)) setTimeout(() => genBase(r), 3000 * n);
    }
    if (r.status !== 'lobby') r.worlds.forEach((w, p) => { if (w.v < 0 && r.baseImg === 'ready') w.v = 0; void ensureWorld(r, p); });
    bump(r);
  });
}
async function ensureWorld(r: Room, p: number) {
  const w = r.worlds[p], pl = r.players[p];
  if (!w || w.busy) return;
  if (!imagesOn()) { w.state = 'none'; return; }
  const property = hasBases(r.theme);
  if (w.v < 0 && r.baseImg === 'ready') { w.v = 0; bump(r); }
  if (property && pl.base !== null && w.v < 1 && r.lotImg['lot' + pl.base] === 'ready') { w.v = 1; bump(r); }
  const target = pl.won.length;
  if (w.v < (property ? 1 : 0) || w.v >= target) { if (w.v >= target) w.state = 'ready'; return; }
  // Batch consecutive wins into one edit; the owned-item list is still updated immediately.
  const completed = r.status === 'finished' || target >= quota(r).hi;
  if (target > w.v && !completed && target - w.v < WORLD_BATCH) { w.state = 'ready'; return; }
  w.busy = true; w.state = 'updating'; bump(r);
  const from = w.v;
  enqueue(-1, async () => {
    try {
      // Collections always rebuild the complete inventory from the clean won base; partial edits can drop cars.
      const reference = property ? 1 : 0;
      const prev = images.get(imgKey(r, worldKey(r, p, reference)));
      if (!prev) throw Error('Missing previous world');
      const refs = [prev];
      const lotRef = images.get(imgKey(r, lotImageKey(r, pl.won[from])));
      if (ITEM_REFERENCE && lotRef && target - from === 1) refs.push(lotRef);
      let prompt = worldPrompt(r, p, from, target, refs.length > 1);
      if (completed) prompt = await compose(r, prompt);
      let out = await makeImage(prompt, refs, WORLD_Q, r.cost);
      // Final collections are checked against the actual inventory, not trusted just because generation succeeded.
      if (completed && Bun.env.OPENAI_API_KEY) {
        const checked = await checkCollection(r, p, target, out);
        if (!checked.complete || checked.extras?.length) {
          if (env('DRAFT_ALLOW_PAID_FALLBACK', '1') !== '1') throw Error('Creation picture incomplete: ' + checked.reason);
          await spend();
          try { out = await paidFallback(prompt + '\nCorrect these defects from the rejected draft: ' + checked.reason + '. Missing purchases: ' + checked.missing.join(', '), refs, env('DRAFT_FALLBACK_WORLD_QUALITY', 'medium'), r.cost); }
          catch (e) { await refund(); throw e; }
          const verified = await checkCollection(r, p, target, out);
          if (!verified.complete || verified.extras?.length) throw Error('Creation picture incomplete after fallback: ' + verified.reason);
        }
      }
      images.set(imgKey(r, worldKey(r, p, target)), out);
      if (target > w.v) w.v = target;
      w.state = 'ready'; w.tries = 0;
    } catch (e) {
      w.tries++; w.state = w.tries > 2 || outOfCredit(r, e) || /Creation picture incomplete|Game AI budget reached|Unpriced/.test(String(e)) ? 'error' : 'retrying';
      console.error('World image failed', String(e));
    } finally {
      w.busy = false; bump(r);
      if (w.state === 'retrying') setTimeout(() => void ensureWorld(r, p), 4000);
      else if (w.v < pl.won.length && w.state !== 'error') void ensureWorld(r, p);
    }
  });
}
// adds: how many additions the game will have; about one in five of them is a dud (see start).
function prefetch(r: Room, adds: number) {
  const k = revCount(r, adds);
  if (hasBases(r.theme)) r.deckBases.slice(0, r.capacity).forEach((it, i) => genLot(r, 'lot' + i, it, 'base', 1 + i / 100));
  r.deckAdds.slice(0, adds - k).forEach((it, i) => genLot(r, 'add' + i, it, 'add', 2 + i / 100));
  r.deckBad.slice(0, k).forEach((it, i) => genLot(r, 'bad' + i, it, 'add', 2 + i / 100));
}
const lotImageKey = (r: Room, i: number) => r.lots[i]?.key || '';

// ---------- Text AI ----------
async function openaiJSON(system: string, user: string, schema: any, maxTokens: number, timeout = 45000, image?: Uint8Array, cost?: Cost, modelOverride?: string) {
  const key = Bun.env.OPENAI_API_KEY; if (!key) throw Error('AI is not configured');
  const model = modelOverride || env('DRAFT_TEXT_MODEL', 'gpt-4.1-mini');
  const input = Buffer.byteLength(system + user + JSON.stringify(schema), 'utf8') + 512 + (image ? 3000 : 0);
  const rates = model === 'gpt-4.1-mini' ? [0.4, 1.6] : model === 'gpt-4.1' ? [2, 8] : null;
  if (cost && !rates) throw Error('Unpriced text model blocked by game cost guard');
  const reserved = Math.ceil(input * (rates?.[0] || 0) + maxTokens * (rates?.[1] || 0));
  reserve(cost, reserved);
  const res = await fetch(API + '/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(timeout),
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: image ? 0 : 0.7, response_format: { type: 'json_schema', json_schema: { name: image ? 'creation_check' : 'out', strict: true, schema } }, messages: [{ role: 'system', content: system }, { role: 'user', content: image ? [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + Buffer.from(image).toString('base64'), detail: 'high' } }] : user }] }),
  });
  if (!res.ok) throw Error('AI service ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const d = await res.json() as any;
  if (cost && rates && d.usage) { const actual = Math.ceil(d.usage.prompt_tokens * rates[0] + d.usage.completion_tokens * rates[1]); cost.used += actual - reserved; }
  return JSON.parse(d.choices?.[0]?.message?.content || '{}');
}
const S = (props: Record<string, any>) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const str = { type: 'string' };
const THEME_SCHEMA = S({
  status: { type: 'string', enum: ['ok', 'ambiguous'] }, question: str,
  options: { type: 'array', items: S({ label: str, topic: str }) },
  title: str, emoji: str, kind: { type: 'string', enum: ['build', 'collection'] }, scope: { type: 'string', enum: ['object', 'environment'] }, noun: str, label: str,
  base_name: str, base_blurb: str, base_visual: str, scene: str, start_label: str,
  bases: { type: 'array', items: S({ name: str, blurb: str, visual: str }) },
  items: { type: 'array', items: S({ name: str, blurb: str, visual: str }) },
  bad_items: { type: 'array', items: S({ name: str, blurb: str, visual: str }) },
});
const THEME_SYSTEM = `You set up rounds of Draft Night, a party auction game. Players type a subject; every player starts with the same plain BASE and wins items at auction that visibly change their own version of it. Images of each player's creation are generated from your descriptions, so everything must be concrete and photographable.

Decide what the subject means:
- If it is clear (e.g. "Pancakes", "Burgers", "Supercars", "Dream bedroom", "Garden", "Gaming setup", "Holiday", "Football team"), return status "ok".
- If it is a person's name, a nickname or in-joke, a single vague word, or could mean several quite different things to build, return status "ambiguous" with one short question and 3 or 4 concrete options (label: what players see, e.g. "Pam's dream birthday cake"; topic: a precise subject to build). Never invent a meaning for a name. When ambiguous, leave the other text fields empty and items empty.

When ok:
- First identify what the player wants to DESIGN, not just objects associated with the keyword. This is a dream-building auction: each win should be an exciting choice that visibly transforms the creation and makes the final comparison fun.
- scope "environment": a whole outdoor place, island, city, country, resort, zoo or theme park. scope "object": food, a vehicle, room, setup or collection. Match EVERY purchase to that scale. Never turn designing a place into packing for a trip, a survival kit, souvenirs or a tray of themed accessories unless explicitly requested.
- For "desert island" or "dream island", players design an entire tropical island. Starting options are distinct undeveloped whole islands (lagoon island, volcanic island, jungle island), not a beach close-up. Additions include Motorway, Beach Resort, Theme Park, Lazy River, Water Park, Marina, Airport, Overwater Villas, Beach Club and Waterfall. These are examples, not a fixed list: generate varied substantial developments, landscapes, attractions and infrastructure. No single surfboard, snorkel, shell, towel or sunglasses. Duds also operate at island scale, e.g. an abandoned resort or traffic-clogged road.
- Apply the same reasoning to every subject: a city gets districts, stadiums and transport; a zoo gets animal habitats and attractions; a bedroom gets furnishings; pancakes get toppings. Choose purchases for impact on THIS creation, not loose keyword relevance. Buildings and infrastructure belonging to the subject are allowed and encouraged.
- Each regular auction should make someone think "I want that" or offer an interesting trade-off. Avoid routine administrative filler (lost-and-found booths, recycling bins, ticket offices), tiny props in large places, near-duplicates or several upgrades for the same attraction. Zoo lots should mostly offer distinct animal habitats with visible animals, plus memorable attractions; a city's lots should favour recognisable destinations and major infrastructure. Cheap options can still be desirable. Keep undesirable purchases in bad_items, not padded into the regular list.
- A collection means collecting the members themselves: a football squad gets recognisable footballers, a car collection gets cars, a band gets musicians. Never substitute supporting equipment (boots, shirts, whistles, water bottles) for the members. Real named people are allowed only when explicitly relevant to the requested roster or collection. Starting options for a squad are different empty pitches or stadiums, not individual positions or players. Do not change the player's goal into outfitting an accessory kit.
- Every starting option is the ENTIRE subject with a different layout or natural character: a whole city site, whole zoo site or whole island. Never replace it with one district, one enclosure, one beach close-up or a photograph of the place.
- For scope "environment", kind is "build" and scene is a consistent wide oblique aerial drone photograph of the actual whole place, with space for several large developments. Never a tabletop, tray, diorama, model, printed photograph, mood board or collage. Each visual states footprint and placement on the land; starting options contain no unpurchased developments.
- kind "build": each player improves ONE object (a pancake stack, a burger, a car, a bedroom, a garden). kind "collection": each player assembles separate things inside one shared container scene (a garage of cars, a football squad on a pitch, a holiday suitcase).
- base_name/base_blurb/base_visual: what everyone holds before the first round, e.g. "Empty bun" for burgers or "Empty plate" for pancakes.
- bases: exactly 8 distinct STARTING OPTIONS that players bid on first (each player wins exactly one), e.g. burgers: Beef Burger, Cheeseburger, Chicken Burger, Veggie Plant Burger; pancakes: Buttermilk Pancakes, Belgian Waffle, French Crêpes; supercars: a garage style. Each visual describes the whole plain starting thing in the scene with nothing added (max 25 words). start_label: one word for these lots (e.g. "Burger", "Base", "Garage"). Never a house unless the subject is about houses.
- scene: one sentence on camera angle, surface/setting and lighting so the whole base and every addition is visible.
- noun: 1-3 words for what each player builds (e.g. "pancake stack", "garage"). label: one word for an auction lot (e.g. "Topping", "Upgrade", "Car", "Signing").
- items: exactly N distinct additions (not starting options), real, instantly recognisable things that make sense for THIS subject and can be seen in the picture. Use plain common names people know ("Nutella", "Maple Syrup", "Carbon-Fibre Wheels", "Rooftop Pool"). Mix desirable and cheaper options; one or two may be funny-but-plausible (e.g. "Bacon" on pancakes). Never include unrelated objects, characters, mascots, plush toys, fantasy concepts or buildings unrelated to the subject. Named people are only allowed for a relevant roster or collection as described above.
- bad_items: exactly 8 distinct DUDS for reverse auctions, where players bid to avoid them: things nobody wants on THIS subject that are funny, harmless and clearly visible in the picture (house: Mouldy Shed, Leaking Roof, Rusty Caravan; pancakes: Ketchup, Sardines, Raw Onion). Same rules as items, never gross-out, cruel or about people.
- blurb: at most 7 natural words. visual: at most 22 words describing what it looks like and exactly where it goes on the base.
- title: 1-3 words. emoji: one emoji.`;
async function interpret(topic: string, n: number, confirmed: boolean): Promise<any> {
  const cost = newCost();
  let out = await openaiJSON(THEME_SYSTEM, `Subject: ${JSON.stringify(topic)}\nN = ${n}${confirmed ? '\nThe players have already confirmed this meaning, so status must be "ok".' : ''}`, THEME_SCHEMA, 3000, 45000, undefined, cost, env('DRAFT_PLANNER_MODEL', 'gpt-4.1'));
  if (out.status === 'ambiguous' && !confirmed && Array.isArray(out.options) && out.options.length >= 2)
    return { status: 'ambiguous', question: String(out.question || 'What are you building?').slice(0, 120), options: out.options.slice(0, 4).map((o: any) => ({ label: String(o.label).slice(0, 48), topic: String(o.topic).slice(0, 80) })) };
  // A second pass judges the proposed auctions as a game, rather than accepting keyword associations.
  out = await openaiJSON(THEME_SYSTEM, `Subject: ${JSON.stringify(topic)}\nN = ${n}\nThe players have already confirmed this meaning, so status must be "ok".\nReview and improve this proposed game: ${JSON.stringify(out)}\nReplace weak, repetitive, mundane or wrong-scale auctions. Check the ENTIRE starting subject is shown and every purchase changes the intended creation. For a football squad, ALL regular lots must be distinct named footballers, never equipment, generic positions or referees. For a zoo, show the actual animals in each habitat description. Return the complete corrected theme using the schema.`, THEME_SCHEMA, 3000, 45000, undefined, cost);
  const seen = new Set<string>();
  const items: Item[] = (Array.isArray(out.items) ? out.items : []).map((x: any) => ({ name: String(x.name || '').trim().slice(0, 32), blurb: String(x.blurb || '').trim().slice(0, 60), visual: String(x.visual || '').trim().slice(0, 200) }))
    .filter((x: Item) => x.name && x.visual && !seen.has(x.name.toLowerCase()) && seen.add(x.name.toLowerCase()));
  const clean = (x: any): Item => ({ name: String(x.name || '').trim().slice(0, 32), blurb: String(x.blurb || '').trim().slice(0, 60), visual: String(x.visual || '').trim().slice(0, 220) });
  const bases = (Array.isArray(out.bases) ? out.bases : []).map(clean).filter((x: Item) => x.name && x.visual && !seen.has(x.name.toLowerCase()) && seen.add(x.name.toLowerCase()));
  const bad = (Array.isArray(out.bad_items) ? out.bad_items : []).map(clean).filter((x: Item) => x.name && x.visual && !seen.has(x.name.toLowerCase()) && seen.add(x.name.toLowerCase())).slice(0, 10);
  if (items.length < LOTS_PER_PLAYER * 2 || bases.length < 2) throw Error('Could not build that theme. Try describing it a little more.');
  // An item with the same name as a preset item borrows that item's picture description, so its picture comes from the library.
  const known = new Map(PRESETS.flatMap(p => [...p.items, ...p.bad]).map(x => [x.name.toLowerCase(), x.visual] as const));
  for (const x of [...items, ...bad]) { const v = known.get(x.name.toLowerCase()); if (v) x.pic = v; }
  const t: Theme = {
    id: crypto.randomUUID().slice(0, 8), title: String(out.title || topic).slice(0, 28), emoji: String(out.emoji || '✨').slice(0, 4),
    setupCost: cost.used, mode: out.scope === 'environment' ? 'build' : out.kind === 'collection' ? 'collection' : 'build', spatial: out.scope === 'environment', noun: String(out.noun || topic).slice(0, 24).toLowerCase(), label: String(out.label || 'Lot').slice(0, 14),
    base: { name: String(out.base_name || 'Nothing yet').slice(0, 32), blurb: String(out.base_blurb || '').slice(0, 60), visual: String(out.base_visual || '').slice(0, 240) },
    startLabel: String(out.start_label || 'Base').slice(0, 14), scene: String(out.scene || 'Clear, evenly lit photograph showing the whole subject').slice(0, 240), bases, items, bad, created: clock(),
  };
  themes.set(t.id, t);
  return { status: 'ok', theme: themeSummary(t) };
}
function themeSummary(t: Theme) {
  return { id: t.id, title: t.title, emoji: t.emoji, mode: t.mode, noun: t.noun, label: t.label, startLabel: t.startLabel, hasBases: hasBases(t), base: t.base && { name: t.base.name, blurb: t.base.blurb }, maxPlayers: Math.min(MAX_PLAYERS, hasBases(t) ? Math.min(t.bases.length, Math.floor(t.items.length / 4)) : Math.floor(t.items.length / 5)), starts: t.bases.slice(0, 8).map(x => x.name), examples: t.items.slice(0, 8).map(x => x.name), duds: t.bad.length > 0 };
}
async function judge(r: Room) {
  if (!Bun.env.OPENAI_API_KEY) return;
  try {
    const lists = r.players.map(p => `${p.name}: ${p.won.map(i => r.lots[i].name + (r.lots[i].rev ? ' (dud)' : '')).join(', ') || 'nothing'} (spent £${r.budget - p.budget})`).join('\n');
    const out = await openaiJSON('You are the witty host of Draft Night, a party auction game. Players each built their own version of the theme. Items marked (dud) were forced on them in reverse auctions. Crown the best creation on taste, combination and value. Reply with one or two warm, funny sentences (max 45 words) that name the winner. Never insult anyone.', `Theme: ${r.theme.title} (${r.theme.noun})\n${lists}`, S({ verdict: str }), 200, 20000, undefined, r.cost);
    r.verdict = String(out.verdict || '').slice(0, 320) || null; bump(r);
  } catch (e) { console.error('Judge failed', String(e)); }
}

// ---------- HTTP ----------
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const reply = (v: any, status = 200) => Response.json(v, { status, headers: { ...CORS, 'Cache-Control': 'no-store' } });
const fail = (m: string, status = 400) => reply({ error: m }, status);

function prep(r: Room) {
  const states = [...Object.values(r.lotImg), ...(r.theme.base?.visual ? [r.baseImg] : [])].filter(x => x !== 'none');
  return { total: states.length, ready: states.filter(x => x === 'ready').length, failed: states.filter(x => x === 'error').length, error: r.imageError, enabled: imagesOn() };
}
function view(r: Room, me = -1) {
  const a = r.auction;
  return {
    cost: r.cost, me, listed: r.listed, notice: r.notice, code: r.code, rev: r.rev, now: clock(), status: r.status, budget: r.budget, capacity: r.capacity, auctionCount: r.auctionCount, maxWins: quota(r).hi, minWins: quota(r).lo, cpu: r.cpu,
    theme: { ...themeSummary(r.theme), examples: undefined, starts: undefined },
    players: r.players.map((p, i) => ({ name: p.name, color: p.color, budget: p.budget, won: p.won, base: p.base, cpu: p.cpu, away: !p.cpu && (r.status === 'playing' ? away(r, i) : clock() - p.seen > AWAY_MS) })),
    // Only lots that have already come up are sent, so nobody can peek at what is next.
    lots: r.lots.slice(0, r.lot + 1).map((l, i) => ({ name: l.name, blurb: l.blurb, kind: l.kind, rev: !!l.rev, img: r.lotImg[lotImageKey(r, i)] || 'none', key: lotImageKey(r, i) })),
    lot: r.lot, total: r.status === 'lobby' ? r.auctionCount : r.lots.length,
    // Secret bids: everyone sees who has locked one in, but only their own amount until the reveal.
    auction: { giveTo: a.turn === null ? null : giftTarget(r, a.turn), bid: a.bid, leader: a.leader, turn: a.turn, passed: a.passed, phase: a.phase, deadline: a.deadline, log: a.log.slice(-6), result: a.result, rev: a.rev, elig: a.elig, sealed: a.sealed.map(x => x !== null), mine: a.sealed[me] ?? null },
    worlds: r.worlds.map((w, p) => ({ v: w.v, state: w.state, key: worldKey(r, p, w.v) })),
    base: { state: r.baseImg }, prep: prep(r),
    history: r.history, verdict: r.verdict,
  };
}
function join(r: Room, name: string, cpu = false, device = '') {
  const taken = new Set(r.players.map(p => p.name.toLowerCase()));
  let nm = name, k = 2; while (taken.has(nm.toLowerCase())) nm = name.slice(0, 13) + ' ' + k++;
  r.players.push({ name: nm, color: COLORS[r.players.length], budget: r.budget, won: [], base: null, cpu, seen: clock(), device });
  r.tokens.push(crypto.randomUUID());
  r.worlds.push({ v: -1, state: 'idle', busy: false, tries: 0 });
  bump(r);
  return r.players.length - 1;
}
// ---------- Quick Play ----------
// Seats are handed out by the server in request order (Bun runs one request at a time), so two phones can never get the same seat.
// Before the game starts a seat is freed when its player leaves or stops polling; the next human becomes host if the host goes.
const LOBBY_IDLE_MS = Number(env('DRAFT_LOBBY_IDLE_MS', '120000'));
const device = (x: any) => String(x || '').replace(/[^\w-]/g, '').slice(0, 64);
const seatOf = (r: Room, token: any) => token ? r.tokens.indexOf(String(token)) : -1;
function unseat(r: Room, p: number, why: string) {
  const gone = r.players[p].name;
  r.players.splice(p, 1); r.tokens.splice(p, 1); r.worlds.splice(p, 1);
  r.players.forEach((pl, i) => { pl.color = COLORS[i]; });
  if (!r.players.some(pl => !pl.cpu)) { close(r); return; }
  r.notice = p === 0 ? `${gone} ${why}. ${r.players[0].name} is now the host.` : `${gone} ${why}.`;
  bump(r);
}
function close(r: Room) {
  rooms.delete(r.code); clearTimeout(timers.get(r.code));
  for (const key of images.keys()) if (key.startsWith(r.code + '/')) images.delete(key);
}
function tidy(r: Room) {
  if (r.status !== 'lobby') return;
  for (let i = r.players.length - 1; i > 0; i--) if (!r.players[i].cpu && clock() - r.players[i].seen > LOBBY_IDLE_MS) unseat(r, i, 'left');
  // Who looks away is part of what everyone sees, so a change counts as a new revision.
  const sig = r.players.map(p => !p.cpu && clock() - p.seen > AWAY_MS ? 1 : 0).join('');
  if (rooms.get(r.code) === r && sig !== r.sig) { r.sig = sig; bump(r); }
}
// Waiting rooms anyone can join: in the lobby, listed, not full and with a host who is still there.
function openRooms() {
  const out = [];
  for (const r of rooms.values()) {
    tidy(r);
    if (rooms.get(r.code) !== r || !r.listed || r.status !== 'lobby' || r.players.length >= r.capacity || clock() - r.players[0].seen > LOBBY_IDLE_MS) continue;
    out.push({ code: r.code, host: r.players[0].name, theme: { title: r.theme.title, emoji: r.theme.emoji }, players: r.players.map(p => p.name), capacity: r.capacity, seat: r.players.length + 1, auctionCount: r.auctionCount, budget: r.budget, created: r.created });
  }
  return out.sort((a, b) => b.created - a.created).slice(0, 20);
}
async function handle(req: Request): Promise<Response> {
  const u = new URL(req.url);
  if (!PRESETS.length) await loadPresets().catch(() => {});
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (u.pathname === '/' || u.pathname === '/index.html') return Response.redirect(CLIENT_URL, 302);
  if (u.pathname === '/health') return reply({ ok: true, images: imagesOn(), provider: CF_ACCOUNT && CF_TOKEN ? 'cloudflare' : 'openai', sharedArtCount: sharedArt.size, worldBatch: WORLD_BATCH, library: Boolean(ART), variants: VARIANTS, pictures: { day: usage.day, made: usage.n, cap: DAILY } });
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) as any : {};
  const room = () => rooms.get(String(u.searchParams.get('code') || body.code || '').toUpperCase());

  if (u.pathname === '/api/img') {
    const r = rooms.get(String(u.searchParams.get('code') || '').toUpperCase());
    const k = String(u.searchParams.get('k') || ''), lib = r && r.art[k];
    if (lib) try { return new Response(null, { status: 302, headers: { ...CORS, Location: artUrl(lib), 'Cache-Control': 'private, max-age=3600' } }); } catch (e) { console.error('Library link failed', String(e)); }
    const data = r && images.get(imgKey(r, k));
    return data ? new Response(data as BodyInit, { headers: { ...CORS, 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=21600, immutable' } }) : new Response('Not ready', { status: 404, headers: CORS });
  }
  // Prefill the picture library (admin only): POST { key, themes?: ['house'], variants?: 1, max?: 40 }; GET ?key= for progress.
  if (u.pathname === '/api/prefill') {
    const admin = env('DRAFT_ADMIN_KEY', '');
    if (!admin || (body.key || u.searchParams.get('key')) !== admin) return fail('Not found', 404);
    if (!ART) return fail('No picture library is configured');
    if (req.method === 'POST' && !fill.running) void prefill(Array.isArray(body.themes) ? body.themes.map(String) : [], clampN(Number(body.variants) || 1, 1, VARIANTS), clampN(Number(body.max) || 40, 1, 1000));
    return reply(fill);
  }
  if (u.pathname === '/api/presets') return reply({ presets: PRESETS.map(themeSummary), images: imagesOn() });
  if (u.pathname === '/api/theme' && req.method === 'POST') {
    const topic = String(body.topic || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (topic.length < 2) return fail('Tell us what you are building');
    const preset = presetFor(topic);
    if (preset) return reply({ status: 'ok', theme: themeSummary(preset) });
    try { return reply(await interpret(topic, clamp(Number(body.players) || 4, 4, MAX_PLAYERS) * LOTS_PER_PLAYER + 4, Boolean(body.confirmed))); }
    catch (e) { console.error('Theme failed', String(e)); return fail(outOfCredit(null, e) ? 'Typed themes are unavailable: the OpenAI account behind Draft Night has run out of credit. Pick a ready-made theme, or add credit at platform.openai.com.' : e instanceof Error && e.message.startsWith('Could not') ? e.message : 'Could not create that theme right now. Try again or pick a ready-made one.', 502); }
  }
  if (u.pathname === '/api/create' && req.method === 'POST') {
    sweep();
    const theme = PRESETS.find(p => p.id === body.theme) || themes.get(String(body.theme));
    if (!theme) return fail('That theme has expired. Please choose it again.');
    const cpu = Boolean(body.cpu);
    const maxP = themeSummary(theme).maxPlayers;
    const r: Room = {
      cost: newCost(theme.setupCost || 0), code: newCode(), rev: 1, created: clock(), status: 'lobby', theme, budget: clamp(Math.round(Number(body.budget) || 100), 5, 1000),
      capacity: cpu ? 2 : clamp(Math.round(Number(body.capacity) || 2), 2, maxP), auctionCount: 0, cpu, players: [], tokens: [], listed: !cpu && body.listed !== false, notice: '',
      deckBases: shuffle(theme.bases), deckAdds: shuffle(theme.items), deckBad: shuffle(theme.bad), lots: [], lot: 0,
      auction: { bid: 0, leader: null, turn: null, passed: [], phase: 'bidding', deadline: 0, log: [], result: null, rev: false, elig: [], sealed: [] },
      revK: 0, revFor: 0, history: [], lotImg: {}, art: {}, baseImg: 'none', imageError: '', worlds: [], verdict: null,
    };
    r.auctionCount = clamp(Math.round(Number(body.auctionCount) || r.capacity * LOTS_PER_PLAYER), r.capacity, Math.min(30, (hasBases(theme) ? r.capacity : 0) + theme.items.length));
    rooms.set(r.code, r);
    join(r, cleanName(body.name, 'Player 1'), false, device(body.device));
    if (cpu) join(r, 'CPU', true);
    // Every picture for the whole game is prepared while the lobby fills; the host starts once they are ready.
    genBase(r); prefetch(r, r.auctionCount - (hasBases(theme) ? r.capacity : 0));
    return reply({ code: r.code, player: 0, token: r.tokens[0], room: view(r, 0) });
  }
  if (u.pathname === '/api/join' && req.method === 'POST') {
    const r = room(); if (!r) return fail('That game has closed', 404);
    tick(r); tidy(r);
    if (rooms.get(r.code) !== r) return fail('That game has closed', 404);
    // The same phone joining again gets its own seat back instead of a duplicate player.
    const dev = device(body.device), mine = dev ? r.players.findIndex(p => !p.cpu && p.device === dev) : -1;
    if (mine >= 0) { r.players[mine].seen = clock(); return reply({ code: r.code, player: mine, token: r.tokens[mine], room: view(r, mine) }); }
    if (r.status !== 'lobby' || r.players.length >= r.capacity) return fail(r.status === 'lobby' ? 'That game just filled up' : 'That game has already started');
    const p = join(r, cleanName(body.name, 'Player ' + (r.players.length + 1)), false, dev);
    r.notice = '';
    return reply({ code: r.code, player: p, token: r.tokens[p], room: view(r, p) });
  }
  if (u.pathname === '/api/lobbies') return reply({ rooms: openRooms(), now: clock() });
  if (u.pathname === '/api/leave' && req.method === 'POST') {
    const r = room(); if (!r) return reply({ ok: true });
    const p = seatOf(r, body.token);
    if (p >= 0 && r.status === 'lobby') unseat(r, p, 'left');
    return reply({ ok: true });
  }
  if (u.pathname === '/api/room') {
    const r = room(); if (!r) return fail('Room not found', 404);
    // Players are identified by their token, so a seat number that moved (someone earlier left the lobby) still resolves.
    const p = seatOf(r, u.searchParams.get('t'));
    if (p >= 0) { const wasAway = away(r, p); r.players[p].seen = clock(); if (wasAway) bump(r); }
    tick(r); tidy(r);
    if (rooms.get(r.code) !== r) return fail('Room not found', 404);
    const me = seatOf(r, u.searchParams.get('t'));
    if (Number(u.searchParams.get('rev')) === r.rev) return reply({ same: true, rev: r.rev, now: clock(), me });
    return reply(view(r, me));
  }
  if (u.pathname === '/api/action' && req.method === 'POST') {
    const r = room(); if (!r) return fail('Room not found', 404);
    const p = seatOf(r, body.token);
    if (p < 0) return fail('Session expired. Please rejoin.', 403);
    r.players[p].seen = clock();
    tick(r);
    try {
      if (body.type === 'start') {
        if (p !== 0) return fail('Only the host can start');
        if (r.status !== 'lobby' || r.players.length < 2) return fail('Waiting for at least two players');
        const ready = prep(r);
        // Pictures first: the game only starts without them if the image service has failed and the host chooses to.
        if (ready.enabled && ready.ready + ready.failed < ready.total) return fail(`Still preparing pictures (${ready.ready}/${ready.total})`);
        if (ready.enabled && ready.failed && !body.force) return fail(r.imageError || 'Some pictures could not be made. Start anyway?');
        start(r);
      } else if (body.type === 'bid' || body.type === 'pass' || body.type === 'seal') {
        if (r.status !== 'playing') return fail('The auction is not running');
        // Optimistic check: the action must be based on the lot and price the player saw (a secret bid only needs the lot).
        if (Number(body.lot) !== r.lot || (body.type !== 'seal' && Number(body.seen) !== r.auction.bid)) return reply({ error: 'The bidding moved on. Check the new price.', room: view(r, p) }, 409);
        if (body.type === 'seal') seal(r, p, Number(body.amount)); else if (body.type === 'bid') bid(r, p, Number(body.amount)); else pass(r, p);
      } else return fail('Unknown action');
    } catch (e) { return reply({ error: e instanceof Error ? e.message : 'Action failed', room: view(r, p) }, 400); }
    bump(r); tick(r);
    return reply(view(r, p));
  }
  return fail('Not found', 404);
}
void loadPresets().catch(() => {});
Bun.serve({ hostname: '0.0.0.0', port: Number(Bun.env.PORT || 3000), async fetch(req) { try { return await handle(req); } catch (e) { console.error('Request failed', String(e)); return fail('Request failed', 500); } } });
