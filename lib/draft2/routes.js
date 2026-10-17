"use strict";
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const engine = require("./engine");
const { Store } = require("./store");
const { makeAI, catalogue } = require("./ai");
function draft2(app, options = {}) {
  const dir =
    options.dir ||
    process.env.DRAFT2_DATA_DIR ||
    path.join(__dirname, "../../data/draft2");
  const store = new Store(dir);
  const mock = options.mock ?? process.env.DRAFT2_IMAGES !== "live";
  if (!mock && !process.env.DRAFT2_DATA_DIR && !options.dir)
    throw Error("Live Draft Night needs a persistent DRAFT2_DATA_DIR.");
  const ai =
    options.ai ||
    makeAI(store, {
      mock,
      imageEnabled: !mock && process.env.DRAFT2_ENABLE_PAID === "1",
      textEnabled: process.env.DRAFT2_TEXT === "live",
      maxImages: Number(process.env.DRAFT2_MAX_IMAGES_PER_DAY) || 200,
      maxTexts: 30,
    });
  const rooms = new Map(store.load().map((g) => [g.code, g]));
  const running = new Set();
  const rates = new Map();
  const save = (g) => store.save(g);
  for (const g of rooms.values()) {
    if (g.status === "planning") {
      g.status = "lobby";
      g.error = "The host restarted. Choose a theme and start again.";
      g.rev++;
      save(g);
    }
    if (g.status === "preparing")
      for (let i = 0; i < 2; i++) {
        const id = `${g.code}:${g.match}:image:${i}`;
        if (store.job(id)?.status === "started")
          store.finish(id, "failed", null, {
            error: "Interrupted; retry disabled.",
          });
      }
  }
  function prepare(g) {
    if (g.status !== "preparing" || running.has(g.code)) return;
    running.add(g.code);
    Promise.all(
      [0, 1].map(async (i) => {
        try {
          await ai.image(g, i);
        } catch (e) {
          g.error = e.message;
        }
        g.rev++;
        save(g);
      }),
    )
      .then(() => {
        g.status = "voting";
        g.rev++;
        save(g);
      })
      .finally(() => running.delete(g.code));
  }
  function advance(g) {
    const rev = g.rev;
    engine.tick(g);
    if (rev !== g.rev) save(g);
    prepare(g);
  }
  const timer = setInterval(() => {
    for (const g of rooms.values()) advance(g);
  }, 300);
  timer.unref();
  const seat = (g, t) => g.players.findIndex((p) => p.token === t);
  const view = (g, i) => {
    const v = engine.view(g, i, ai.mock);
    v.images = g.players.map((_, p) => {
      const job = store.job(`${g.code}:${g.match}:image:${p}`);
      return {
        status: job?.status || "queued",
        url:
          job?.status === "ready"
            ? `/api/draft2/image/${g.code}/${g.match}/${p}?token=${g.players[i].token}`
            : null,
      };
    });
    return v;
  };
  const api = express.Router();
  api.use(express.json({ limit: "8kb" }));
  api.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    if (req.method === "POST" && req.get("Sec-Fetch-Site") === "cross-site")
      return res.status(403).json({ error: "Open Draft Night to play." });
    next();
  });
  const limited = (req) => {
    const k = req.ip;
    const now = Date.now();
    const r = rates.get(k);
    if (!r || now - r.since > 600000) {
      rates.set(k, { since: now, n: 1 });
      return false;
    }
    return ++r.n > 20;
  };
  const clean = (x) =>
    String(x || "Player")
      .replace(/[<>\x00-\x1f]/g, "")
      .trim()
      .slice(0, 18) || "Player";
  api.get("/themes", (req, res) =>
    res.json({
      themes: catalogue(),
      mock: ai.mock,
      custom: process.env.DRAFT2_TEXT === "live",
    }),
  );
  api.post("/create", (req, res) => {
    try {
      if (limited(req))
        throw Error("Too many new games. Please try again in a few minutes.");
      if (rooms.size >= 500)
        throw Error("The game server is full. Please try again later.");
      let code;
      do {
        code = crypto.randomBytes(3).toString("hex").toUpperCase();
      } while (rooms.has(code));
      const g = engine.create({
        ...req.body,
        name: clean(req.body.name),
        token: crypto.randomUUID(),
        code,
      });
      g.created = Date.now();
      rooms.set(code, g);
      save(g);
      res.json({ code, token: g.players[0].token, room: view(g, 0) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  api.post("/join", (req, res) => {
    try {
      const g = rooms.get(String(req.body.code || "").toUpperCase());
      if (!g) throw Error("That room was not found.");
      const i = seat(g, req.body.token);
      if (i >= 0)
        return res.json({
          code: g.code,
          token: g.players[i].token,
          room: view(g, i),
        });
      if (g.status !== "lobby" || g.players.length === 2)
        throw Error("That game is full or already started.");
      g.players.push({
        name: clean(req.body.name),
        token: crypto.randomUUID(),
        money: g.budget,
        items: [],
        seen: Date.now(),
      });
      g.rev++;
      save(g);
      res.json({ code: g.code, token: g.players[1].token, room: view(g, 1) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  api.use((req, res, next) => {
    const code = req.body?.code || req.query.code || req.path.split("/")[2];
    const g = rooms.get(String(code || "").toUpperCase());
    if (!g) return res.status(404).json({ error: "Room not found." });
    const i = seat(g, req.body?.token || req.query.token);
    if (i < 0)
      return res
        .status(403)
        .json({ error: "Use your original phone or join link." });
    req.game = g;
    req.me = i;
    g.players[i].seen = Date.now();
    advance(g);
    next();
  });
  api.get("/room", (req, res) => res.json(view(req.game, req.me)));
  api.get("/image/:code/:match/:player", (req, res) => {
    const id = `${req.game.code}:${Number(req.params.match)}:image:${Number(req.params.player)}`;
    const j = store.job(id);
    if (!j?.image) return res.sendStatus(404);
    res.type(ai.mock ? "svg" : "webp").send(Buffer.from(j.image));
  });
  api.post("/action", async (req, res) => {
    const g = req.game,
      i = req.me,
      b = req.body;
    try {
      if (b.rev !== g.rev && !(b.type === "vote" && b.match === g.match))
        throw Error("The auction moved on. Please try again.");
      if (b.type === "start") {
        if (i !== 0 || g.status !== "lobby" || g.players.length !== 2)
          throw Error("The host can start once both players join.");
        if (g.planAttempts >= 3)
          throw Error("Choose a featured theme for a new game.");
        g.planAttempts = (g.planAttempts || 0) + 1;
        g.status = "planning";
        g.error = null;
        g.rev++;
        save(g);
        try {
          const p = await ai.plan(
            g.theme,
            g.limit * 2,
            `${g.code}:${g.match + 1}:${g.planAttempts}`,
          );
          engine.start(g, p, Date.now());
          g.rev++;
          save(g);
        } catch (e) {
          g.status = "lobby";
          g.error = e.message;
          g.rev++;
          save(g);
          throw e;
        }
      } else if (b.type === "rematch") {
        if (i !== 0 || g.status !== "results")
          throw Error("The host can start a rematch after voting.");
        g.status = "lobby";
        g.players.forEach((p) => {
          p.money = g.budget;
          p.items = [];
        });
        g.history = [];
        g.votes = {};
        g.winner = null;
        g.round = 0;
        g.deck = [];
        g.error = null;
        g.planAttempts = 0;
        g.rev++;
        save(g);
      } else {
        engine.act(g, i, b);
        save(g);
      }
      res.json(view(g, i));
    } catch (e) {
      res.status(409).json({ error: e.message, room: view(g, i) });
    }
  });
  app.use("/api/draft2", api);
  const sweep = setInterval(() => {
    const cutoff = Date.now() - 86400000;
    for (const [code, g] of rooms) {
      if (g.created < cutoff && !running.has(code)) {
        rooms.delete(code);
        store.db.prepare("DELETE FROM rooms WHERE code=?").run(code);
        store.db.prepare("DELETE FROM jobs WHERE id LIKE ?").run(code + ":%");
      }
    }
    for (const [k, r] of rates)
      if (r.since < Date.now() - 600000) rates.delete(k);
  }, 600000);
  sweep.unref();
  return {
    rooms,
    store,
    close() {
      clearInterval(timer);
      clearInterval(sweep);
      store.close();
    },
  };
}
module.exports = { draft2 };
