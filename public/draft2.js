"use strict";
const app = document.querySelector("#app");
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const glyphs = ["✳", "◈", "⌂", "☼", "≋", "✺", "▥", "↗", "♧", "✶", "⬡", "⚑"];
let themes = [
  "Dream Pasta",
  "Ultimate Burger",
  "Dream House",
  "Private Island",
  "Water Park",
  "Dream Zoo",
  "Luxury Hotel",
  "Perfect Holiday",
  "Dream Restaurant",
  "Worst Date Ever",
  "Zombie Survival Base",
  "Football Team",
];
let clockOffset = 0;
let session = JSON.parse(localStorage.getItem("draft2-session") || "null"),
  room = null,
  page = "home",
  chosen = "Dream Pasta",
  busy = false,
  sound = false,
  audio,
  renderKey = "",
  polling = false,
  offline = false;
const preloaded = new Map(),
  failedImages = new Set();
function imagesReady(v) {
  return v.images.every(
    (x) =>
      x.status !== "ready" ||
      preloaded.get(x.url) === "ready" ||
      failedImages.has(x.url),
  );
}
function preload(v) {
  if (!["voting", "results"].includes(v.status)) return;
  for (const im of v.images) {
    if (im.status !== "ready" || preloaded.has(im.url)) continue;
    preloaded.set(im.url, "loading");
    const img = new Image();
    img.src = im.url;
    img
      .decode()
      .then(() => preloaded.set(im.url, "ready"))
      .catch(() => failedImages.add(im.url))
      .finally(() => {
        if (room?.code === v.code && room?.match === v.match) {
          renderKey = "";
          render();
        }
      });
  }
}
const toast = (t) => {
  const el = $("#toast");
  el.textContent = t;
  el.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.style.display = "none"), 4500);
};
function beep(win = false) {
  if (!sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.connect(g);
    g.connect(audio.destination);
    o.frequency.setValueAtTime(win ? 660 : 330, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      win ? 990 : 440,
      audio.currentTime + 0.1,
    );
    g.gain.setValueAtTime(0.04, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
    o.start();
    o.stop(audio.currentTime + 0.18);
  } catch {}
}
$("#sound").onclick = () => {
  sound = !sound;
  $("#sound").setAttribute(
    "aria-label",
    sound ? "Disable sound" : "Enable sound",
  );
  $("#sound").style.color = sound ? "var(--acid)" : "";
  beep();
};
async function api(path, body) {
  const r = await fetch("/api/draft2/" + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) {
    if (data.room) update(data.room);
    throw Error(data.error || "Could not connect to the game.");
  }
  return data;
}
function remember(data) {
  session = { code: data.code, token: data.token };
  localStorage.setItem("draft2-session", JSON.stringify(session));
  history.replaceState({}, "", location.pathname + "?room=" + data.code);
  renderKey = "";
  update(data.room);
}
function update(v) {
  clockOffset = v.now - Date.now();
  const key = JSON.stringify([
    v.rev,
    v.players.map((p) => p.online),
    v.images.map((x) => x.status),
  ]);
  room = v;
  preload(v);
  if (page !== "game" || key !== renderKey) {
    page = "game";
    renderKey = key;
    render();
  }
  const c = $("#connection");
  c.textContent = offline ? "RECONNECTING" : "ROOM " + v.code;
}
async function poll() {
  if (!session || polling || page !== "game") return;
  polling = true;
  try {
    const v = await api(
      "room?code=" + session.code + "&token=" + session.token,
    );
    offline = false;
    update(v);
  } catch (e) {
    offline = true;
    $("#connection").textContent = "RECONNECTING";
    if (/not found|original phone/.test(e.message)) {
      session = null;
      localStorage.removeItem("draft2-session");
      room = null;
      page = "home";
      render();
      toast(e.message);
    }
  } finally {
    polling = false;
  }
}
setInterval(poll, 650);
async function action(type, extra = {}) {
  if (busy || !room) return;
  busy = true;
  try {
    const v = await api("action", {
      ...session,
      rev: room.rev,
      match: room.match,
      type,
      ...extra,
    });
    if (type === "bid") {
      beep();
      navigator.vibrate?.(15);
    }
    update(v);
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
  }
}
const host = (t) =>
  `<div class="host"><span class="host-face" aria-hidden="true">✳</span><p><b>GAME UPDATE</b>${esc(t)}</p></div>`;
function player(p, i, full = false) {
  return `<div class="player p${i} ${room?.leader === i ? "leading" : ""}"><div class="player-top"><span class="avatar">${esc(p.name.slice(0, 2).toUpperCase())}</span><span class="player-name">${esc(p.name)}${room.me === i ? " <small>YOU</small>" : ""}</span><strong class="player-money">£${p.money}</strong></div><div class="slots">${Array.from({ length: room.limit }, (_, n) => `<i class="slot ${n < p.items.length ? "filled" : ""}"></i>`).join("")}</div><small>${p.items.length}/${room.limit} collected · ${p.online ? "connected" : "reconnecting"}</small>${
    full
      ? `<div class="collection-preview">${p.items
          .slice(-3)
          .map((x) => `<span class="chip">${esc(x.name)}</span>`)
          .join(
            "",
          )}</div><button class="collection-button" data-collection="${i}">View collection ↗</button>`
      : ""
  }</div>`;
}
function themeTiles(all = false) {
  return `<div class="theme-grid">${themes
    .slice(0, all ? 12 : 4)
    .map(
      (t, i) =>
        `<button class="theme-tile" data-theme="${esc(t)}" style="--accent:${["var(--coral)", "var(--mint)", "var(--purple)", "var(--acid)"][i % 4]}"><span class="glyph" aria-hidden="true">${glyphs[i]}</span><small>0${i + 1} ↗</small><b>${esc(t)}</b></button>`,
    )
    .join("")}</div>`;
}
function home() {
  return `<section class="hero enter"><div><p class="eyebrow">A GAME FOR TWO</p><h1 class="display">DRAFT<em>NIGHT.</em></h1><p class="description">Choose a theme, bid for items and compare what you’ve made.</p><div class="actions"><button class="primary" data-nav="themes">Play <span class="arrow">↗</span></button><button class="secondary" data-nav="join">Join game</button></div><div class="how"><span><b>01</b> CHOOSE A THEME</span><span><b>02</b> BID FOR ITEMS</span><span><b>03</b> COMPARE CREATIONS</span></div>${session ? '<button class="text-button" data-resume>↪ Back to your game</button>' : ""}</div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="poster"><small>YOUR COLLECTION</small><span class="asterisk">✳</span><div class="display">BID.<br>BUILD.<br>REVEAL.</div></div><span class="sticker">2<br>PLAYERS</span><span class="sticker bid-sticker">£20 EACH</span></div></section><section class="theme-section"><div class="section-line"><h2>Featured themes</h2><button class="text-button" data-surprise>Surprise me ↗</button></div>${themeTiles()}</section><p class="footnote">2 PLAYERS · SEPARATE PHONES</p>`;
}
function setup() {
  return `<section class="center enter"><p class="eyebrow">GAME SETTINGS</p><h1 class="display">${esc(chosen)}</h1><p class="description">Choose your theme and settings.</p><form id="create-form" class="form"><label for="name">Your name</label><input id="name" name="name" maxlength="18" required placeholder="Your name" value="${esc(localStorage.getItem("draft2-name") || "")}"><label for="theme">Theme</label><input id="theme" name="theme" maxlength="80" minlength="3" required value="${esc(chosen)}"><div class="settings"><div><label for="budget">Budget each</label><select id="budget" name="budget"><option value="20">£20</option><option value="30">£30</option><option value="50">£50</option></select></div><div><label for="limit">Items each</label><select id="limit" name="limit"><option value="5">5 items</option><option value="3">3 items</option><option value="4">4</option><option value="6">6 items</option></select></div></div><div class="rule-note">2 players on separate phones. Every item finds a home. £1 minimum raises. Pass and you’re out of that lot. If nobody bids, free ownership alternates. Equal votes mean a draw.</div><button class="primary" type="submit">Create game <span class="arrow">↗</span></button></form><button class="text-button" data-nav="themes">← Choose another theme</button></section>`;
}
function lobby() {
  const g = room;
  return `<section class="center enter"><p class="eyebrow">LOBBY</p><h1 class="display">${esc(g.theme)}</h1><p class="muted">Share the invite link with the other player.</p><button class="big-code text-button" data-copy>${g.code}</button><div class="actions wide-actions"><button class="secondary" data-copy>Copy invite ↗</button><button class="text-button" data-share-invite>Share link</button></div><div class="players" style="margin-top:28px">${g.players.map((p, i) => player(p, i)).join("")}${g.players.length < 2 ? '<div class="player"><span class="avatar" style="background:#ffffff15;color:var(--muted)">?</span><p class="muted" style="margin-top:10px">Waiting for player two…</p></div>' : ""}</div><p class="muted" style="margin:22px 0">£${g.budget} each · ${g.limit} items each · ${g.limit * 2} secret lots</p>${g.error ? `<p class="danger-note">${esc(g.error)}</p>` : ""}${g.me === 0 ? `<button class="primary" data-action="start" ${g.players.length < 2 ? "disabled" : ""}>${g.players.length < 2 ? "Waiting for player two" : "Start game ↗"}</button>` : '<p class="eyebrow">WAITING FOR THE HOST TO START</p>'}${g.mock ? '<p class="footnote">PREVIEW · FINAL IMAGES ARE MOCKS · NO IMAGE SPEND</p>' : ""}<div class="rule-note">Bid or pass before the clock runs out. A pass lasts for this lot. Nobody bids? Ownership alternates for free. Full collection? The remaining lots go to the other player. Vote for either creation. A split vote is a draw.</div></section>`;
}
function auction() {
  const g = room,
    sold = g.status === "sold";
  return `<div class="game-top"><h1 class="display">${esc(g.theme)}</h1><span class="round">LOT ${Math.min(g.round + (sold ? 0 : 1), g.total)} <span style="color:#61556f">/</span> ${g.total}</span></div><div class="progress"><span style="width:${(g.round / g.total) * 100}%"></span></div><div class="auction-layout"><section><div class="stage ${sold ? "sold" : ""} enter" data-stage="${g.round}-${g.status}">${sold ? `<span class="sold-stamp display">SOLD!</span><h2 class="display">${esc(g.last.item)}</h2><p class="price">${esc(g.players[g.last.player].name)} · ${g.last.price ? "£" + g.last.price : "FREE"}</p>` : `<span class="lot-num">LOT ${String(g.round + 1).padStart(2, "0")}</span><span class="lot-tag">${esc(g.item.tag)}</span><span class="lot-symbol" aria-hidden="true">${glyphs[g.round % glyphs.length]}</span><h2 class="display lot-title">${esc(g.item.name)}</h2><p class="price">£${g.bid}</p><p class="price-label">${g.leader === null ? "No bids yet" : esc(g.players[g.leader].name) + " is leading"} · <span data-clock></span></p>`}</div>${host(g.host)}<div class="bid-bar"><button class="secondary" data-action="pass" ${sold || g.leader === g.me || g.passed.includes(g.me) || g.players[g.me].items.length >= g.limit ? "disabled" : ""}>Pass</button><button class="primary" data-bid="${g.bid + 1}" ${!g.canBid ? "disabled" : ""}>${sold ? "Next item…" : g.leader === g.me ? "You’re in the lead ↗" : g.passed.includes(g.me) ? "You passed this lot" : g.players[g.me].items.length >= g.limit ? "Collection complete" : "Bid £" + (g.bid + 1) + " ↗"}</button><button class="secondary" data-bid="${g.bid + 3}" ${!g.canBid || g.players[g.me].money < g.bid + 3 ? "disabled" : ""}>+£3</button></div><p class="bid-note">${g.players[g.me].money === 0 ? "Out of money? You can still receive free lots." : g.passed.includes(g.me) ? "You can bid again on the next item." : "If you pass, the other player gets this lot at their bid, or free if nobody has bid."}</p></section><aside class="sidebar"><div class="players">${g.players.map((p, i) => player(p, i, true)).join("")}</div></aside></div>`;
}
function preparing() {
  return `<section class="center enter"><p class="eyebrow">THE AUCTION IS OVER</p><div class="spinner" aria-hidden="true">✳</div><h1 class="display">PREPARING<br>YOUR CREATIONS.</h1><p class="description">${room.mock ? "Preparing the preview images." : "Creating the final images using your purchased items."}</p><div class="studio-status">${room.players.map((p, i) => `<span>${esc(p.name)} · ${esc({ queued: "Waiting", started: "Generating", ready: "Ready", failed: "Unavailable" }[room.images[i].status])}</span>`).join("")}</div>${host("Your collections are complete. The final images will appear together.")}<p class="footnote">BOTH CREATIONS WILL BE REVEALED TOGETHER</p></section>`;
}
function creation(p, i, result) {
  const im = room.images[i];
  return `<article class="creation p${i} ${result && room.winner === i ? "winner" : ""}">${im.status === "ready" && !failedImages.has(im.url) ? `<img src="${esc(im.url)}" alt="${esc(p.name)}’s finished ${esc(room.theme)}${room.mock ? " (mock preview)" : ""}" data-inspect="${i}">` : '<div class="image-failed"><b>IMAGE UNAVAILABLE</b><p>Your collection is saved below.<br>No paid retry was made.</p></div>'}<h2>${esc(p.name)}</h2><p class="muted">£${room.budget - p.money} spent · ${p.items.length} items</p><div class="collection-preview">${p.items.map((x) => `<span class="chip">${esc(x.name)}</span>`).join("")}</div>${!result ? `<button class="secondary" data-vote="${i}" ${room.voted ? "disabled" : ""}>${room.voted ? "Vote locked ✓" : "Vote for " + esc(p.name) + " ↗"}</button>` : ""}</article>`;
}
function showdown() {
  const g = room,
    result = g.status === "results";
  return `<section class="showdown-head enter"><p class="eyebrow">${result ? "RESULTS" : "YOUR FINISHED CREATIONS"}</p><h1 class="display">${result ? (g.winner === null ? "IT’S A DRAW." : esc(g.players[g.winner].name) + " WINS.") : "COMPARE CREATIONS."}</h1>${result ? `<span class="result-ribbon">${g.winner === null ? "EQUAL VOTES" : "WINNER"}</span>` : `<p class="muted" style="margin-top:14px">Choose your favourite creation.</p>`}${g.mock ? '<p class="footnote">MOCK FINAL IMAGES · YOUR ACTUAL PURCHASES ARE LISTED BELOW</p>' : ""}</section><div class="showdown">${g.players.map((p, i) => creation(p, i, result)).join("")}</div>${host(result ? g.host : g.voted ? `${g.voteCount}/2 votes are in. Your decision is locked.` : "Take a look at both creations before voting.")}<div class="actions wide-actions">${result ? `${g.me === 0 ? '<button class="primary" data-action="rematch">Play again ↻</button>' : '<p class="muted">Your host can start a rematch.</p>'}<button class="secondary" data-new-theme>New theme ↗</button><button class="text-button" data-share-result>Share result ↗</button>` : ""}</div>`;
}
function render() {
  let html = "";
  if (page === "home") html = home();
  else if (page === "themes")
    html = `<section class="enter"><p class="eyebrow">CHOOSE A THEME</p><h1 class="display" style="font-size:70px;margin:18px 0 26px">WHAT WILL<br>YOU MAKE?</h1>${themeTiles(true)}<div class="actions"><button class="primary" data-custom>Custom theme ↗</button><button class="secondary" data-surprise>Surprise me</button></div></section>`;
  else if (page === "setup") html = setup();
  else if (page === "join")
    html = `<section class="center enter"><p class="eyebrow">JOIN A GAME</p><h1 class="display">JOIN GAME.</h1><form id="join-form" class="form"><label for="name">Your name</label><input id="name" name="name" required maxlength="18" placeholder="Your name" value="${esc(localStorage.getItem("draft2-name") || "")}"><label for="code">Room code</label><input id="code" name="code" pattern="[a-fA-F0-9]{6}" maxlength="6" required placeholder="ABC123" value="${esc(new URLSearchParams(location.search).get("room") || "")}"><button class="primary">Join game ↗</button></form><button class="text-button" data-nav="home">← Back to home</button></section>`;
  else if (room) {
    if (room.status === "lobby") html = lobby();
    else if (room.status === "planning")
      html = `<section class="center"><div class="spinner">✳</div><h1 class="display">PREPARING<br>THE AUCTION.</h1><p class="muted">Choosing the items for your theme.</p></section>`;
    else if (["auction", "sold"].includes(room.status)) html = auction();
    else if (room.status === "preparing") html = preparing();
    else html = imagesReady(room) ? showdown() : preparing();
  }
  app.innerHTML = html;
  clock();
  if (
    room?.status === "results" &&
    imagesReady(room) &&
    page === "game" &&
    render.lastStatus !== "results"
  ) {
    beep(true);
    confetti();
  }
  render.lastStatus = room?.status;
}
function clock() {
  const el = $("[data-clock]");
  if (el && room)
    el.textContent =
      Math.max(
        0,
        Math.ceil((room.deadline - Date.now() - clockOffset) / 1000),
      ) + "s";
}
setInterval(clock, 250);
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const el = document.createElement("div");
  el.className = "confetti";
  el.innerHTML = Array.from(
    { length: 40 },
    (_, i) =>
      `<i style="left:${i * 2.5}%;animation-delay:${(i % 8) * 0.1}s;transform:rotate(${i * 41}deg)"></i>`,
  ).join("");
  document.body.append(el);
  setTimeout(() => el.remove(), 4500);
}
function modal(html) {
  $("#modal-body").innerHTML = html;
  $("#modal").showModal();
}
$("#close-modal").onclick = () => $("#modal").close();
const invite = () => location.origin + "/draft-night.html?room=" + room.code;
async function share(text, url) {
  try {
    if (navigator.share)
      await navigator.share({ title: "Draft Night", text, url });
    else {
      await navigator.clipboard.writeText(text + " " + url);
      toast("Link copied.");
    }
  } catch (e) {
    if (e.name !== "AbortError")
      toast("Sharing is unavailable in this browser.");
  }
}
app.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  if (b.dataset.nav) {
    page = b.dataset.nav;
    render();
  } else if (b.hasAttribute("data-resume")) {
    page = "game";
    renderKey = "";
    await poll();
  } else if (b.dataset.theme) {
    chosen = b.dataset.theme;
    page = "setup";
    render();
  } else if (b.hasAttribute("data-custom")) {
    chosen = "Custom theme";
    page = "setup";
    render();
    $("#theme").value = "";
    $("#theme").placeholder = "Enter a theme";
    $("#theme").focus();
  } else if (b.hasAttribute("data-surprise")) {
    chosen = themes[Math.floor(Math.random() * themes.length)];
    page = "setup";
    render();
  } else if (b.dataset.action) await action(b.dataset.action);
  else if (b.dataset.bid)
    await action("bid", { amount: Number(b.dataset.bid) });
  else if (b.dataset.vote !== undefined)
    await action("vote", { target: Number(b.dataset.vote) });
  else if (b.dataset.collection !== undefined) {
    const p = room.players[Number(b.dataset.collection)];
    modal(
      `<h2>${esc(p.name)}’s collection</h2>${p.items.length ? p.items.map((x) => `<div class="owned-row">${esc(x.name)}<span>${x.price ? "£" + x.price : "FREE"}</span></div>`).join("") : '<p class="muted">An empty canvas. For now.</p>'}`,
    );
  } else if (b.hasAttribute("data-copy")) {
    try {
      await navigator.clipboard.writeText(invite());
      toast("Invite copied.");
    } catch {
      modal(`<h2>Invite link</h2><p class="muted">${esc(invite())}</p>`);
    }
  } else if (b.hasAttribute("data-share-invite"))
    await share("Join my Draft Night game: " + room.theme, invite());
  else if (b.hasAttribute("data-share-result"))
    await share(
      `${room.winner === null ? "A draw" : room.players[room.winner].name + " wins"} in ${room.theme} on Draft Night.`,
      location.origin + "/draft-night.html",
    );
  else if (b.hasAttribute("data-new-theme")) {
    session = null;
    localStorage.removeItem("draft2-session");
    room = null;
    page = "themes";
    history.replaceState({}, "", location.pathname);
    render();
  }
});
app.addEventListener("click", (e) => {
  const img = e.target.closest("[data-inspect]");
  if (img)
    modal(
      `<h2>${esc(room.players[Number(img.dataset.inspect)].name)}’s creation</h2><img src="${esc(img.src)}" alt="${esc(img.alt)}">`,
    );
});
app.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  busy = true;
  const b = e.target.querySelector('button[type="submit"],button');
  b.disabled = true;
  try {
    const f = new FormData(e.target);
    localStorage.setItem("draft2-name", f.get("name"));
    const data =
      e.target.id === "join-form"
        ? await api("join", {
            name: f.get("name"),
            code: f.get("code").toUpperCase(),
            token: session?.token,
          })
        : await api("create", {
            name: f.get("name"),
            theme: f.get("theme"),
            budget: Number(f.get("budget")),
            limit: Number(f.get("limit")),
          });
    remember(data);
  } catch (err) {
    toast(err.message);
    b.disabled = false;
  } finally {
    busy = false;
  }
});
(async () => {
  try {
    const data = await api("themes");
    themes = data.themes;
  } catch {}
  const code = new URLSearchParams(location.search).get("room");
  if (code && session?.code !== code) {
    page = "join";
    render();
  } else if (session) {
    page = "game";
    await poll();
  } else render();
})();
