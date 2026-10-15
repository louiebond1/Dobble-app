"use strict";
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
const eligible = (g) =>
  g.players
    .map((p, i) => (p.items.length < g.limit ? i : -1))
    .filter((i) => i >= 0);
function create({ theme, budget = 20, limit = 5, name, token, code }) {
  assert(
    typeof theme === "string" && theme.trim().length >= 3 && theme.length <= 80,
    "Give your theme 3–80 characters.",
  );
  assert(
    Number.isInteger(budget) && budget >= 5 && budget <= 100,
    "Budget must be £5–£100.",
  );
  assert(
    Number.isInteger(limit) && limit >= 3 && limit <= 6,
    "Choose 3–6 items each.",
  );
  return {
    code,
    theme: theme.trim(),
    budget,
    limit,
    players: [{ name, token, money: budget, items: [], seen: Date.now() }],
    status: "lobby",
    rev: 0,
    round: 0,
    deck: [],
    bid: 0,
    leader: null,
    passed: [],
    votes: {},
    match: 0,
    host: "Invite the other player to get started.",
    history: [],
  };
}
function start(g, plan, now) {
  assert(g.players.length === 2, "You need two players.");
  assert(plan.items.length === 2 * g.limit, "Invalid auction plan.");
  g.deck = plan.items;
  g.base = plan.base;
  g.camera = plan.camera;
  g.status = "auction";
  g.round = 0;
  g.history = [];
  g.votes = {};
  g.match++;
  g.intro = plan.intro;
  g.host = plan.intro.replace("£20", "£" + g.budget);
  open(g, now);
}
function open(g, now) {
  g.bid = 0;
  g.leader = null;
  g.passed = [];
  g.deadline = now + 25000;
  if (g.round === g.deck.length) {
    g.status = "preparing";
    g.host = "The auction is complete. Preparing your final creations.";
    return;
  }
  const e = eligible(g);
  if (e.length === 1) {
    award(g, e[0], 0, now);
    return;
  }
  g.host = g.deck[g.round].line;
}
function award(g, i, price, now) {
  const item = { ...g.deck[g.round], price };
  g.players[i].items.push(item);
  g.players[i].money -= price;
  g.history.push({ round: g.round, player: i, item: item.name, price });
  g.last = { player: i, item: item.name, price };
  const name = g.players[i].name;
  const money = g.players[i].money;
  g.host =
    price === 0
      ? `${name} receives ${item.name} for free.`
      : `${name} bought ${item.name} for £${price}. £${money} remaining.`;
  g.round++;
  g.status = "sold";
  g.deadline = now + 1700;
}
function settle(g, now) {
  const active = eligible(g).filter(
    (i) => !g.passed.includes(i) && g.players[i].money > g.bid,
  );
  if (g.leader !== null && !active.some((i) => i !== g.leader)) {
    award(g, g.leader, g.bid, now);
    return;
  }
  if (g.leader === null && active.length === 0) {
    // Fair rotating priority. Every lot is allocated, even at £0. Never uses AI or a random winner.
    const e = eligible(g);
    const i = e.includes(g.round % 2) ? g.round % 2 : e[0];
    award(g, i, 0, now);
  }
}
function tick(g, now = Date.now()) {
  if (g.status === "sold" && now >= g.deadline) {
    g.status = "auction";
    open(g, now);
    g.rev++;
  }
  if (g.status === "auction" && now >= g.deadline) {
    if (g.leader !== null) award(g, g.leader, g.bid, now);
    else {
      g.passed = eligible(g);
      settle(g, now);
    }
    g.rev++;
  }
}
function act(g, i, b, now = Date.now()) {
  assert(
    b.rev === g.rev || (b.type === "vote" && b.match === g.match),
    "The auction moved on. Please try again.",
  );
  assert(i >= 0 && i < g.players.length, "Rejoin this game.");
  if (b.type === "vote") {
    assert(g.status === "voting", "Voting is not open.");
    assert(b.target === 0 || b.target === 1, "Choose a creation.");
    assert(g.votes[i] === undefined, "Your vote is locked.");
    g.votes[i] = b.target;
    if (Object.keys(g.votes).length === 2) {
      const n = Object.values(g.votes).filter((x) => x === 0).length;
      g.winner = n === 1 ? null : n === 2 ? 0 : 1;
      g.status = "results";
      g.host =
        g.winner === null
          ? "The vote is tied. You can play again or choose a new theme."
          : `${g.players[g.winner].name} wins.`;
    }
  } else {
    assert(g.status === "auction", "Wait for the next lot.");
    assert(eligible(g).includes(i), "Your collection is full.");
    assert(!g.passed.includes(i), "You passed on this lot.");
    assert(g.leader !== i, "You already lead this lot.");
    if (b.type === "bid") {
      assert(
        Number.isInteger(b.amount) && b.amount > g.bid,
        "Raise the bid by at least £1.",
      );
      assert(b.amount <= g.players[i].money, "That is over your budget.");
      g.bid = b.amount;
      g.leader = i;
      g.deadline = now + 15000;
      g.host = `£${b.amount}. ${g.players[i].name} is leading.`;
    } else {
      assert(b.type === "pass", "Unknown action.");
      g.passed.push(i);
    }
    settle(g, now);
  }
  g.rev++;
}
function view(g, me, mock) {
  const { deck, players, votes, ...v } = g;
  delete v.deadline;
  delete v.camera;
  return {
    ...v,
    me,
    mock,
    deadline: g.deadline,
    now: Date.now(),
    total: deck.length || g.limit * 2,
    item: g.status === "auction" ? deck[g.round] : null,
    players: players.map(({ token, ...p }) => ({
      ...p,
      online: Date.now() - p.seen < 12000,
    })),
    voted: votes[me] !== undefined,
    voteCount: Object.keys(votes).length,
    canBid:
      g.status === "auction" &&
      eligible(g).includes(me) &&
      !g.passed.includes(me) &&
      g.leader !== me &&
      players[me]?.money > g.bid,
  };
}
module.exports = { create, start, act, tick, view, eligible };
