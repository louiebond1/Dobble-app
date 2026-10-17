const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const E = require("../lib/draft2/engine");
const { builtin, makeAI, prompt } = require("../lib/draft2/ai");
const { Store } = require("../lib/draft2/store");
const { draft2 } = require("../lib/draft2/routes");
function game(limit = 5, budget = 20) {
  const g = E.create({
    theme: "Dream Pasta",
    name: "Louie",
    token: "a",
    code: "ABC123",
    budget,
    limit,
  });
  g.players.push({
    name: "Ariel",
    token: "b",
    money: budget,
    items: [],
    seen: 0,
  });
  E.start(g, builtin(g.theme, limit * 2), 0);
  return g;
}
function move(g, i, type, amount) {
  E.act(g, i, { rev: g.rev, type, amount }, 0);
}
test("1,000 complete games: exact collections, no overspend, every lot allocated once", () => {
  let seed = 42;
  const rnd = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32;
  for (let k = 0; k < 1000; k++) {
    const g = game(3 + (k % 4), 5 + (k % 30));
    let moves = 0;
    while (g.status !== "preparing") {
      assert.ok(++moves < 250);
      if (g.status === "sold") {
        E.tick(g, g.deadline + 1);
        continue;
      }
      const can = E.eligible(g).filter(
        (i) => !g.passed.includes(i) && g.leader !== i,
      );
      const i = can[Math.floor(rnd() * can.length)];
      const p = g.players[i];
      if (p.money > g.bid && rnd() > 0.45) move(g, i, "bid", g.bid + 1);
      else move(g, i, "pass");
    }
    for (const p of g.players) {
      assert.equal(p.items.length, g.limit);
      assert.ok(p.money >= 0);
      assert.equal(
        p.money + p.items.reduce((s, x) => s + x.price, 0),
        g.budget,
      );
    }
    assert.equal(
      new Set(g.players.flatMap((p) => p.items.map((x) => x.name))).size,
      g.limit * 2,
    );
  }
});
test("stale, duplicate, unaffordable, fractional, negative and self raises are rejected", () => {
  const g = game();
  assert.throws(
    () => E.act(g, 0, { rev: -1, type: "bid", amount: 1 }),
    /moved/,
  );
  for (const n of [-1, 0, 0.5, 21]) assert.throws(() => move(g, 0, "bid", n));
  move(g, 0, "bid", 1);
  assert.throws(() => move(g, 0, "bid", 2), /already lead/);
  assert.throws(() => E.act(g, 1, { rev: 0, type: "pass" }), /moved/);
});
test("pass: the other player gets the lot free when nobody bid, and the passer cannot take part again", () => {
  const g = game();
  move(g, 0, "pass");
  assert.equal(g.status, "sold");
  assert.deepEqual([g.last.player, g.last.price], [1, 0]);
  assert.deepEqual(
    g.players.map((p) => p.items.length),
    [0, 1],
  );
  assert.equal(g.players[1].money, g.budget);
  assert.match(g.host, /Louie passed\. Ariel receives .* for free\./);
  assert.throws(() => move(g, 0, "bid", 1), /Wait for the next lot/);
  assert.throws(() => move(g, 0, "pass"), /Wait for the next lot/);
});
test("pass: the other player pays the current bid when they are leading", () => {
  const g = game();
  move(g, 0, "bid", 3);
  move(g, 1, "pass");
  assert.deepEqual([g.last.player, g.last.price], [0, 3]);
  assert.deepEqual(
    g.players.map((p) => p.money),
    [g.budget - 3, g.budget],
  );
  assert.match(g.host, /Ariel passed\. Louie bought .* for £3\./);
  // Outbid, then pass: the new leader pays their own bid, never the old one.
  const h = game();
  move(h, 0, "bid", 2);
  move(h, 1, "bid", 5);
  move(h, 0, "pass");
  assert.deepEqual([h.last.player, h.last.price], [1, 5]);
});
test("pass: both players cannot pass the same lot; a second pass is refused and the lot stays with the first non-passer", () => {
  const g = game();
  const rev = g.rev;
  E.act(g, 0, { rev, type: "pass" }, 0);
  assert.throws(() => E.act(g, 1, { rev, type: "pass" }, 0), /moved/);
  assert.throws(
    () => E.act(g, 1, { rev: g.rev, type: "pass" }, 0),
    /Wait for the next lot/,
  );
  assert.equal(g.last.player, 1);
  assert.equal(g.players[0].items.length, 0);
  // Next lot: a fresh start for both, so the earlier passer may now bid or pass.
  E.tick(g, g.deadline + 1);
  assert.equal(g.status, "auction");
  assert.deepEqual(g.passed, []);
  move(g, 0, "bid", 1);
  assert.equal(g.leader, 0);
});
test("no bids before the timer: nobody is marked as having passed, and free priority alternates", () => {
  const g = game();
  const who = [];
  while (g.status !== "preparing") {
    E.tick(g, g.deadline + 1);
    if (g.status === "sold") {
      assert.deepEqual(g.passed, [], "a silent lot passes nobody");
      who.push(g.last.player);
    }
  }
  assert.deepEqual(who.slice(0, 4), [0, 1, 0, 1]);
  assert.deepEqual(
    g.players.map((p) => p.items.length),
    [5, 5],
  );
  // A player who had passed is never picked, even when it is their turn in the rotation.
  const h = game();
  h.passed = [0];
  E.tick(h, h.deadline + 1);
  assert.equal(h.last.player, 1);
  h.status = "auction";
  h.passed = [0, 1];
  assert.throws(() => E.tick(h, h.deadline + 1), /No player can take this lot/);
  assert.throws(() => {
    h.passed = [0];
    h.deck[h.round] = { name: "x", line: "", visual: "x", tag: "T" };
    E.act(h, 0, { rev: h.rev, type: "pass" }, 0);
  }, /passed/);
});
test("500 random games: no lot ever goes to a player who passed it; pass and timeout prices are right", () => {
  let seed = 7;
  const rnd = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32;
  for (let k = 0; k < 500; k++) {
    const g = game(3 + (k % 4), 5 + (k % 25));
    const passers = new Set();
    let moves = 0,
      seen = 0;
    while (g.status !== "preparing") {
      assert.ok(++moves < 400);
      if (g.status === "sold") {
        passers.clear();
        E.tick(g, g.deadline + 1);
        continue;
      }
      const can = E.eligible(g).filter(
        (i) => !g.passed.includes(i) && g.leader !== i,
      );
      const r = rnd();
      const leader = g.leader,
        bid = g.bid;
      let expect; // who must receive the lot, and at what price, if this move ends it
      if (r < 0.25) {
        E.tick(g, g.deadline + 1);
        expect =
          leader === null ? { free: true } : { player: leader, price: bid };
      } else {
        const i = can[Math.floor(rnd() * can.length)];
        if (g.players[i].money > g.bid && r < 0.65) {
          move(g, i, "bid", g.bid + 1);
          expect = { player: i, price: bid + 1 };
        } else {
          passers.add(i);
          move(g, i, "pass");
          expect = { player: 1 - i, price: leader === 1 - i ? bid : 0 };
        }
      }
      if (g.history.length > seen) {
        const h = g.history[g.history.length - 1];
        assert.ok(!passers.has(h.player), "awarded to a player who passed");
        assert.ok(!g.passed.includes(h.player), "awarded to a flagged passer");
        if (expect.free) assert.equal(h.price, 0);
        else
          assert.deepEqual([h.player, h.price], [expect.player, expect.price]);
        seen = g.history.length;
      }
    }
    for (const p of g.players) {
      assert.equal(p.items.length, g.limit);
      assert.equal(
        p.money + p.items.reduce((s, x) => s + x.price, 0),
        g.budget,
      );
    }
    assert.equal(g.history.length, g.limit * 2);
  }
});
test("zero budgets still finish with exact collections, and the view leaks no tokens or future deck", () => {
  const g = game();
  move(g, 0, "pass");
  assert.ok(!JSON.stringify(E.view(g, 0, true)).includes("token"));
  assert.equal(E.view(g, 0, true).deck, undefined);
  g.players.forEach((p) => (p.money = 0));
  while (g.status !== "preparing") E.tick(g, g.deadline + 1);
  assert.deepEqual(
    g.players.map((p) => p.items.length),
    [5, 5],
  );
});
test("timeouts award leader, draws and unanimous votes have no arbitrary tie break", () => {
  const g = game();
  move(g, 1, "bid", 2);
  E.tick(g, g.deadline + 1);
  assert.equal(g.last.player, 1);
  for (const votes of [
    [0, 1],
    [0, 0],
    [1, 1],
  ]) {
    const v = game();
    v.status = "voting";
    E.act(v, 0, { rev: v.rev, type: "vote", target: votes[0] });
    E.act(v, 1, { rev: v.rev, type: "vote", target: votes[1] });
    assert.equal(v.winner, votes[0] === votes[1] ? votes[0] : null);
    assert.throws(
      () => E.act(v, 1, { rev: v.rev, type: "vote", target: 1 }),
      /not open/,
    );
  }
});
test("persistent generation reservation survives restart, daily caps and failures consume allowance", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dn2-"));
  let s = new Store(dir);
  assert.equal(s.reserve("a", "images", 1), true);
  s.close();
  s = new Store(dir);
  assert.equal(s.reserve("a", "images", 1), false);
  assert.throws(() => s.reserve("b", "images", 1), /allowance/);
  s.finish("a", "failed");
  assert.throws(() => s.reserve("b", "images", 1), /allowance/);
  s.close();
  fs.rmSync(dir, { recursive: true });
});
test("image pipeline refuses incomplete games; final prompts use actual ownership; duplicate jobs produce only two mock images", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dn2-"));
  const s = new Store(dir),
    ai = makeAI(s),
    g = game();
  await assert.rejects(ai.image(g, 0), /complete/);
  while (g.status !== "preparing") {
    if (g.status === "sold") E.tick(g, g.deadline + 1);
    else {
      move(g, 0, "pass");
      if (g.status === "auction") move(g, 1, "pass");
    }
  }
  assert.ok(prompt(g, 0).includes(g.players[0].items[0].name));
  await Promise.all([ai.image(g, 0), ai.image(g, 0), ai.image(g, 1)]);
  assert.equal(s.db.prepare("SELECT COUNT(*) n FROM jobs").get().n, 2);
  assert.equal(s.job("ABC123:1:image:0").status, "ready");
  s.close();
  fs.rmSync(dir, { recursive: true });
});
test("HTTP: auth, simultaneous bids, reconnect, saved games, mock reveal, voting and rematch", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dn2-"));
  let app, service, server, base;
  const boot = async () => {
    app = express();
    service = draft2(app, { dir, mock: true });
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = "http://127.0.0.1:" + server.address().port;
  };
  const stop = async () => {
    await new Promise((r) => server.close(r));
    service.close();
  };
  await boot();
  const post = async (p, b) => {
    const r = await fetch(base + "/api/draft2/" + p, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    const a = (
      await post("create", {
        name: "Louie",
        theme: "Dream Pasta",
        limit: 3,
        budget: 20,
      })
    ).data;
    const b = (await post("join", { name: "Ariel", code: a.code })).data;
    let g = service.rooms.get(a.code);
    assert.equal(
      (
        await post("action", {
          code: a.code,
          token: "bad",
          rev: g.rev,
          type: "start",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await post("action", {
          code: a.code,
          token: a.token,
          rev: g.rev,
          type: "start",
        })
      ).status,
      200,
    );
    let rev = g.rev;
    const race = await Promise.all([
      post("action", {
        code: a.code,
        token: a.token,
        rev,
        type: "bid",
        amount: 1,
      }),
      post("action", {
        code: a.code,
        token: b.token,
        rev,
        type: "bid",
        amount: 1,
      }),
    ]);
    assert.deepEqual(race.map((x) => x.status).sort(), [200, 409]);
    await stop();
    await boot();
    g = service.rooms.get(a.code);
    assert.equal(g.bid, 1);
    assert.equal(g.players[0].token, a.token);
    while (!["preparing", "voting"].includes(g.status)) {
      if (g.status === "sold") {
        g.deadline = 0;
        E.tick(g);
      } else {
        g.deadline = 0;
        E.tick(g);
      }
    }
    service.store.save(g);
    await new Promise((r) => setTimeout(r, 1300));
    assert.equal(g.status, "voting");
    assert.equal(
      service.store.db
        .prepare("SELECT COUNT(*) n FROM jobs WHERE image IS NOT NULL")
        .get().n,
      2,
    );
    for (const [i, p] of [a, b].entries())
      assert.equal(
        (
          await post("action", {
            code: p.code,
            token: p.token,
            rev: g.rev,
            type: "vote",
            target: i,
          })
        ).status,
        200,
      );
    assert.equal(g.status, "results");
    assert.equal(g.winner, null);
    const im = await fetch(
      base + `/api/draft2/image/${a.code}/1/0?token=${a.token}`,
    );
    assert.equal(im.status, 200);
    assert.match(await im.text(), /STUDIO PREVIEW/);
    assert.equal(
      (
        await post("action", {
          code: a.code,
          token: a.token,
          rev: g.rev,
          type: "rematch",
        })
      ).status,
      200,
    );
    assert.equal(g.status, "lobby");
    assert.deepEqual(
      g.players.map((x) => x.items.length),
      [0, 0],
    );
  } finally {
    await stop();
    fs.rmSync(dir, { recursive: true });
  }
});
test("live-provider transport mocked: two requests only, no retries after failure, text plans cached", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dn2-"));
  const s = new Store(dir),
    original = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    const b = JSON.parse(opts.body);
    calls.push({ url, body: b });
    if (url.endsWith("chat/completions"))
      return {
        ok: true,
        json: async () => ({
          choices: [
            { message: { content: JSON.stringify(builtin("Dream Pasta", 6)) } },
          ],
          usage: { prompt_tokens: 500, completion_tokens: 700 },
        }),
      };
    return { ok: false };
  };
  try {
    const ai = makeAI(s, {
      mock: false,
      key: "test-key-not-real",
      imageEnabled: true,
      textEnabled: true,
      maxImages: 2,
    });
    await ai.plan("A magnificent imaginary moon café", 6, "theme1");
    await ai.plan("A magnificent imaginary moon café", 6, "theme2");
    assert.equal(calls.length, 1);
    const g = game(3);
    while (g.status !== "preparing") {
      if (g.status === "sold") E.tick(g, g.deadline + 1);
      else E.tick(g, g.deadline + 1);
    }
    assert.equal(await ai.image(g, 0), "failed");
    assert.equal(await ai.image(g, 0), "failed");
    assert.equal(await ai.image(g, 1), "failed");
    assert.equal(calls.length, 3);
    for (const c of calls.slice(1)) {
      assert.equal(c.body.n, 1);
      assert.equal(c.body.model, "gpt-image-1.5");
      assert.equal(c.body.quality, "medium");
    }
    assert.equal(s.job("ABC123:1:image:0").status, "failed");
    const v = game();
    v.status = "voting";
    const rev = v.rev;
    E.act(v, 0, { rev, match: v.match, type: "vote", target: 0 });
    E.act(v, 1, { rev, match: v.match, type: "vote", target: 1 });
    assert.equal(v.status, "results");
    assert.equal(v.winner, null);
  } finally {
    global.fetch = original;
    s.close();
    fs.rmSync(dir, { recursive: true });
  }
});
test("gateway: live images use the shared token, never the OpenAI key; exactly two requests per match; no retry", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dn2-"));
  const s = new Store(dir);
  const seen = [];
  const real = global.fetch;
  global.fetch = async (url, opts) => {
    seen.push({
      url,
      auth: opts.headers.Authorization,
      body: JSON.parse(opts.body),
    });
    return Response.json({
      data: [{ b64_json: Buffer.from("img").toString("base64") }],
      usage: {},
    });
  };
  try {
    const ai = makeAI(s, {
      mock: false,
      key: undefined,
      imageEnabled: true,
      gatewayUrl: "https://gw.example/images",
      gatewayToken: "shared-token",
      maxImages: 50,
    });
    const g = game();
    for (let k = 0; k < 10; k++) {
      const i = k % 2;
      g.players[i].items.push({
        name: "Item " + k,
        visual: "visual " + k,
        price: 1,
      });
    }
    g.status = "preparing";
    await Promise.all([ai.image(g, 0), ai.image(g, 0), ai.image(g, 1)]);
    assert.equal(seen.length, 2);
    assert.ok(
      seen.every(
        (x) =>
          x.url === "https://gw.example/images" &&
          x.auth === "Bearer shared-token",
      ),
    );
    assert.ok(
      seen.every((x) => /^[A-Z0-9]{6}:\d+:image:[01]$/.test(x.body.id)),
    );
    assert.ok(seen[0].body.prompt.includes("5 purchased"));
    g.match++;
    global.fetch = async () => new Response("no", { status: 500 });
    assert.equal(await ai.image(g, 0), "failed");
    assert.equal(await ai.image(g, 0), "failed");
  } finally {
    global.fetch = real;
    s.close();
    fs.rmSync(dir, { recursive: true });
  }
});
test("gateway function: auth, whitelist, once per id, daily cap, key only server-side", async () => {
  const { stripTypeScriptTypes } = require("node:module");
  const src = stripTypeScriptTypes(
    fs.readFileSync(
      path.join(__dirname, "../draft-night/image-gateway.ts"),
      "utf8",
    ),
  )
    .replace("export async function handle", "async function handle")
    .replace(/export default[\s\S]*$/, "module.exports = { handle };");
  const m = { exports: {} };
  new Function("module", "Bun", src)(m, { env: {} });
  const env = {
    IMAGE_GATEWAY_TOKEN: "t",
    OPENAI_API_KEY: "sk-secret",
    IMAGE_GATEWAY_DAILY_MAX: "2",
  };
  const calls = [];
  const fake = async (url, o) => {
    calls.push({ url, o });
    return Response.json({ data: [{ b64_json: "QQ==" }], usage: { x: 1 } });
  };
  const req = (b, tok = "t") =>
    new Request("https://gw/images", {
      method: "POST",
      headers: { authorization: "Bearer " + tok },
      body: JSON.stringify(b),
    });
  const p = "x".repeat(40);
  assert.equal(
    (
      await m.exports.handle(
        req({ id: "ABC123:1:image:0", prompt: p }, "bad"),
        env,
        fake,
      )
    ).status,
    401,
  );
  assert.equal(
    (await m.exports.handle(req({ id: "nope", prompt: p }), env, fake)).status,
    400,
  );
  const ok = await m.exports.handle(
    req({
      id: "ABC123:1:image:0",
      prompt: p,
      model: "gpt-4",
      size: "4096x4096",
      quality: "high",
    }),
    env,
    fake,
  );
  assert.equal(ok.status, 200);
  assert.equal(JSON.stringify(await ok.json()).includes("sk-secret"), false);
  const sent = JSON.parse(calls[0].o.body);
  assert.equal(sent.model, "gpt-image-1.5");
  assert.equal(sent.size, "1024x1024");
  assert.equal(calls[0].o.headers.Authorization, "Bearer sk-secret");
  assert.equal(
    (
      await m.exports.handle(
        req({ id: "ABC123:1:image:0", prompt: p }),
        env,
        fake,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await m.exports.handle(
        req({ id: "ABC123:1:image:1", prompt: p }),
        env,
        fake,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await m.exports.handle(
        req({ id: "ABC123:2:image:0", prompt: p }),
        env,
        fake,
      )
    ).status,
    429,
  );
  assert.equal(calls.length, 2);
  assert.equal(
    (await m.exports.handle(new Request("https://gw/health"), env, fake))
      .status,
    200,
  );
});
