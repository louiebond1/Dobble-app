// Does bidding pay? A player who never bids (and takes free picks) against players who bid by value.
// node draft-night/investigation/strategy.js
const { loadThemes } = require('../../lib/draftnight/spec');
const { createRoom, addPlayer, act, tick } = require('../../lib/draftnight/engine');
const themes = loadThemes();
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
for (const n of [2, 3, 4, 6]) {
  const sum = { passive: 0, bidder: 0, passiveShow: 0, bidderShow: 0, auctions: 0, picks: 0 }; let G = 0;
  for (const t of themes) for (let s = 1; s <= 60; s++) {
    let now = 1e9; const room = createRoom({ theme: t, budget: 100, rounds: 5, capacity: n, rng: rng(s * 97 + n), clock: () => now });
    for (let i = 0; i < n; i++) addPlayer(room, 'P' + i);
    const mv = (p, m) => act(room, p, { round: room.r, lot: room.auction && room.auction.lot, seen: room.auction && room.auction.bid, ...m });
    room.players.forEach(p => { p.seen = now; }); mv(0, { type: 'start' });
    while (room.status === 'playing') {
      room.players.forEach(p => { p.seen = now; });
      if (room.phase === 'bidding') {
        const p = room.auction.turn, pl = room.players[p], lot = room.rounds[room.r].lots[room.auction.lot];
        const value = p === 0 ? 0 : Math.floor(pl.budget / (room.rounds.length - room.r) * [0, 0.4, 1, 2][lot.tier] * (0.6 + room.rng() * 0.8));
        if (room.auction.bid + 1 <= Math.min(value, pl.budget)) mv(p, { type: 'bid', amount: room.auction.bid + 1 }); else mv(p, { type: 'pass' });
      } else if (room.phase === 'picking') { const p = room.pick.order[room.pick.turn]; mv(p, { type: 'pick', id: room.rounds[room.r].lots.find(l => l.state === 'waiting').id }); }
      else { now += 6000; tick(room); }
    }
    const pts = p => room.players[p].items.reduce((a, id) => a + t.index[id].tier, 0), show = p => room.players[p].items.filter(id => t.index[id].tier === 3).length;
    sum.passive += pts(0); sum.passiveShow += show(0);
    for (let p = 1; p < n; p++) { sum.bidder += pts(p) / (n - 1); sum.bidderShow += show(p) / (n - 1); }
    for (const h of room.history) if (h.winner !== null) { if (h.how === 'pick') sum.picks++; else sum.auctions++; }
    G++;
  }
  console.log(`${n} players: never-bids scores ${(sum.passive / G).toFixed(2)} (${(sum.passiveShow / G).toFixed(2)} showpieces) vs value bidders ${(sum.bidder / G).toFixed(2)} (${(sum.bidderShow / G).toFixed(2)} showpieces); allocations by auction ${(100 * sum.auctions / (sum.auctions + sum.picks)).toFixed(0)}%, by free choice ${(100 * sum.picks / (sum.auctions + sum.picks)).toFixed(0)}%`);
}
