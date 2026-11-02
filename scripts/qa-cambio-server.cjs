// QA-only Cambio server: the real engine and shipped UI, plus a way to stack
// the next deal so powers, matches and penalties can be played on purpose.
// Never used in production. Run: node scripts/qa-cambio-server.cjs [port]
const http = require('http'), path = require('path'), os = require('os');
const express = require('express'), {Server} = require('socket.io');
const {cambio} = require('../lib/cambio');

const SUITS = ['♠', '♥', '♣', '♦'];
const full = () => SUITS.flatMap(suit => Array.from({length: 13}, (_, i) => `${i + 1}${suit}`));
let queue = [];
const original = Math.random;
Math.random = () => queue.length ? queue.shift() : original();

// Fisher–Yates inverse: the random values that turn the unshuffled deck into `order`.
function plan(order) {
  const cards = full(), values = [];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = cards.indexOf(order[i]);
    if (j < 0 || j > i) throw Error('Impossible order');
    values.push((j + .5) / (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return values;
}
// louie/ariel: four cards each (index 0..3). draws: next cards drawn, in order.
function stack({louie = [], ariel = [], draws = []}) {
  const used = new Set([...louie, ...ariel, ...draws]);
  const rest = full().filter(c => !used.has(c));
  const hand = list => { const out = [...list]; while (out.length < 4) out.push(rest.shift()); return out; };
  const l = hand(louie), a = hand(ariel);
  const order = [...l, ...a, ...rest, ...[...draws].reverse()];
  if (order.length !== 52) throw Error('Bad stack');
  queue = plan(order);
}

function start(port = 0) {
  const app = express(), server = http.createServer(app), io = new Server(server);
  const dir = require('fs').mkdtempSync(path.join(os.tmpdir(), 'cambio-qa-'));
  io.on('connection', cambio(io, {saveFile: path.join(dir, 'cambio-match.json')}));
  app.use(express.json());
  app.post('/qa/stack', (req, res) => { try { stack(req.body); res.json({ok: true}); } catch (e) { res.status(400).json({error: e.message}); } });
  app.use(express.static(path.join(__dirname, '../public')));
  return new Promise(resolve => server.listen(port, () => resolve({server, io, port: server.address().port})));
}
module.exports = {start, stack};
if (require.main === module) start(Number(process.argv[2]) || 3200).then(({port}) => console.log('Cambio QA on http://localhost:' + port));
