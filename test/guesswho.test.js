const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../public/guesswho.js"), "utf8");
test("guess who: every face has a photo and every question splits the board", () => {
  const upTo = src.slice(0, src.indexOf("const app ="));
  const { FACES, QUESTIONS } = new Function(upTo + "; return { FACES, QUESTIONS };")();
  assert.ok(FACES.length >= 24);
  for (const f of FACES) assert.ok(fs.existsSync(path.join(__dirname, "../public", f.src.split("?")[0])), f.src);
  assert.equal(new Set(FACES.map((f) => f.id)).size, FACES.length);
  for (const q of QUESTIONS) {
    const n = FACES.filter((f) => f.tags.has(q.tag)).length;
    assert.ok(n > 0 && n < FACES.length, q.tag);
  }
});
test("guess who two-player: seats, secrets stay private, turns, answers, guesses", () => {
  const { guessWho } = require("../lib/guesswho");
  const sockets = new Map();
  const sent = [];
  const io = { sockets: { sockets }, to: (id) => ({ emit: (ev, d) => sent.push([id, ev, JSON.parse(JSON.stringify(d))]) }) };
  const connect = guessWho(io);
  function mk(id) {
    const h = {};
    const s = { id, data: {}, on: (e, f) => (h[e] = f), join() {}, leave() {} };
    sockets.set(id, s);
    connect(s);
    return { s, h, call: (e, p) => { let r; h[e](p, (x) => (r = x)); return r; } };
  }
  const L = mk("L"), A = mk("A"), X = mk("X");
  const last = (id) => [...sent].reverse().find((m) => m[0] === id && m[1] === "gw:state")[2];
  assert.equal(L.call("gw:join", { who: "louie" }).ok, true);
  assert.equal(X.call("gw:join", { who: "louie" }).error, "seat-taken");
  assert.equal(last("L").phase, "waiting");
  assert.equal(A.call("gw:join", { who: "ariel" }).ok, true);
  assert.equal(last("L").phase, "pick");
  assert.equal(L.call("gw:pick", { id: 0 }).ok, false);
  assert.equal(L.call("gw:pick", { id: 8 }).ok, true);
  assert.equal(A.call("gw:pick", { id: 14 }).ok, true);
  const turn = last("L").turn, T = turn === "louie" ? L : A, N = turn === "louie" ? A : L;
  // a secret never reaches the other phone
  assert.equal(last("L").mySecret, 8); assert.equal(last("L").opponentSecret, null);
  assert.equal(last("A").mySecret, 14); assert.equal(last("A").opponentSecret, null);
  assert.equal(N.call("gw:ask", { text: "Hat?" }).ok, false);
  assert.equal(T.call("gw:ask", { text: "Do they wear a hat?" }).ok, true);
  assert.equal(T.call("gw:answer", { yes: true }).ok, false);
  assert.equal(N.call("gw:answer", { yes: false }).ok, true);
  assert.equal(T.call("gw:guess", { id: 1 }).ok, false); // must finish flipping first
  assert.equal(T.call("gw:done").ok, true);
  assert.equal(last("L").turn, turn === "louie" ? "ariel" : "louie");
  // wrong guess passes the turn, right guess wins and reveals both secrets
  assert.equal(N.call("gw:guess", { id: 3 }).correct, false);
  assert.equal(last("L").turn, turn);
  const winnerSeat = T === L ? "louie" : "ariel";
  const target = T === L ? 14 : 8;
  assert.equal(T.call("gw:guess", { id: target }).correct, true);
  assert.equal(last("L").phase, "over"); assert.equal(last("L").winner, winnerSeat);
  assert.equal(last("L").opponentSecret, 14); assert.equal(last("A").opponentSecret, 8);
  assert.equal(last("L").record[winnerSeat], 1);
  assert.equal(T.call("gw:again").ok, true);
  assert.equal(last("A").phase, "pick");
  // disconnect frees the seat
  sockets.delete("A");
  A.h.disconnect();
  assert.equal(last("L").phase, "waiting");
  assert.equal(X.call("gw:join", { who: "ariel" }).ok, true);
});
