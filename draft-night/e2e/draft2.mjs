// Offline browser acceptance test. No API keys or paid provider requests are used.
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + "/playwright");
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dn2-browser-"));
const out = process.argv[2] || "shots/draft2";
fs.mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: "3988",
    DRAFT2_DATA_DIR: temp,
    DRAFT2_IMAGES: "mock",
    DRAFT2_TEXT: "off",
    OPENAI_API_KEY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => {
    if (String(d).includes("listening")) resolve();
  });
  server.once("error", reject);
  server.once("exit", () => reject(Error("Server exited")));
});
const options = process.env.DRAFT2_CHROMIUM
  ? {
      executablePath: process.env.DRAFT2_CHROMIUM,
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-zygote",
        "--disable-software-rasterizer",
        "--disable-gpu-compositing",
        "--use-gl=angle",
        "--use-angle=swiftshader",
      ],
    }
  : {};
let browser;
const errors = [],
  providerRequests = [];
let result = {};
try {
  browser = await pw.chromium.launch({ headless: true, ...options });
  const phone = {
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  };
  const a = await browser.newContext(phone),
    b = await browser.newContext(phone);
  const p = await a.newPage(),
    q = await b.newPage();
  p.setDefaultTimeout(12000);
  q.setDefaultTimeout(12000);
  for (const page of [p, q]) {
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (/openai.com|cloudflare.com/.test(r.url()))
        providerRequests.push(r.url());
    });
  }
  const snap = async (page, name) => {
    console.log("Screenshot: " + name);
    await page.screenshot({
      path: path.join(out, name + ".png"),
      fullPage: true,
    });
  };
  const base = "http://127.0.0.1:3988";
  await p.goto(base + "/draft-night.html");
  await p.getByRole("button", { name: "Let’s play" }).waitFor();
  await p.evaluate(() => document.fonts.ready);
  await snap(p, "01-home-phone");
  await p.setViewportSize({ width: 1440, height: 1000 });
  await snap(p, "02-home-desktop");
  await p.setViewportSize(phone.viewport);
  await p.locator('[data-theme="Dream Pasta"]').click();
  await p.getByLabel("Your name").fill("Louie");
  await p.getByLabel("Items each").selectOption("5");
  await p.getByRole("button", { name: "Open the studio" }).click();
  await p.locator(".big-code").waitFor();
  const code = (await p.locator(".big-code").textContent()).trim();
  await snap(p, "03-lobby");
  await q.goto(base + "/draft-night.html?room=" + code);
  await q.getByLabel("Your name").fill("Ariel");
  await q.getByRole("button", { name: "I’m in" }).click();
  await p.getByRole("button", { name: "Lights. Bids. Action." }).waitFor();
  await p.getByRole("button", { name: "Lights. Bids. Action." }).click();
  await p.locator("[data-bid]:not([disabled])").first().waitFor();
  await snap(p, "04-auction-phone");
  // Cross-phone leading bid is visible; reloading preserves the player's seat and budget.
  await p.locator("[data-bid]").first().click();
  await q.getByText("Louie is leading", { exact: false }).waitFor();
  await b.setOffline(true);
  await new Promise((r) => setTimeout(r, 800));
  await b.setOffline(false);
  await q.reload();
  await q.getByText("Louie is leading", { exact: false }).waitFor();
  await p.reload();
  await p.getByRole("button", { name: "You’re in the lead" }).waitFor();
  await q.getByRole("button", { name: "Pass", exact: true }).click();
  await p.locator(".sold-stamp").waitFor();
  await snap(p, "05-sold");
  const deadline = Date.now() + 70000;
  while (Date.now() < deadline) {
    if (await p.locator("[data-vote]").count()) break;
    for (const page of [p, q]) {
      const pass = page.getByRole("button", { name: "Pass", exact: true });
      if ((await pass.count()) && (await pass.isEnabled()))
        await pass.click().catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 220));
  }
  await p.locator("[data-vote]").first().waitFor({ timeout: 10000 });
  await snap(p, "06-reveal");
  assert.equal(await p.locator(".creation img").count(), 2);
  assert.equal(await q.locator(".creation img").count(), 2);
  await p.locator('[data-inspect="0"]').click();
  await p.locator("dialog[open]").waitFor();
  await p.getByRole("button", { name: "Close", exact: true }).click();
  await p.locator('[data-vote="0"]').click();
  await q.locator('[data-vote="1"]').click();
  await p.getByRole("heading", { name: "A SHARED CROWN." }).waitFor();
  await snap(p, "07-result-phone");
  await p.setViewportSize({ width: 1280, height: 900 });
  await snap(p, "08-result-desktop");
  result = {
    code,
    headings: await p.locator("h1").allTextContents(),
    counts: await p.locator(".creation .chip").count(),
  };
  await p.getByRole("button", { name: "Run it back" }).click();
  await p.getByRole("button", { name: "Lights. Bids. Action." }).waitFor();
  await q.locator(".big-code").waitFor();
  // Layout matrix: no sideways overflow; ensure bidding remains in the viewport on common phones.
  await p.getByRole("button", { name: "Lights. Bids. Action." }).click();
  await p.locator("[data-bid]").first().waitFor();
  result.layouts = [];
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [430, 932],
    [1440, 900],
  ]) {
    await p.setViewportSize({ width, height });
    const layout = await p.evaluate(() => ({
      w: innerWidth,
      h: innerHeight,
      scroll: document.documentElement.scrollWidth,
      buttonBottom: document.querySelector(".bid-bar").getBoundingClientRect()
        .bottom,
    }));
    assert.ok(layout.scroll <= width, JSON.stringify(layout));
    assert.ok(layout.buttonBottom <= height, JSON.stringify(layout));
    result.layouts.push(layout);
    await snap(p, `layout-${width}`);
  }
  for (const url of [
    "/",
    "/draft-night-v2.html",
    "/draft-night-legacy.html",
    "/api/dn/themes",
    "/gofish",
    "/memory",
    "/reaction",
    "/draft2.js",
    "/draft2.css",
  ]) {
    const r = await p.request.get(base + url);
    assert.equal(r.status(), 200, url);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(providerRequests, []);
  console.log(JSON.stringify({ ...result, errors, providerRequests }, null, 2));
  fs.writeFileSync(
    path.join(out, "result.json"),
    JSON.stringify({ ...result, errors, providerRequests }, null, 2),
  );
} catch (e) {
  console.error(e);
  if (browser) {
    for (const [i, ctx] of browser.contexts().entries()) {
      const page = ctx.pages()[0];
      if (page) {
        await page
          .screenshot({
            path: path.join(out, "failure-" + i + ".png"),
            fullPage: true,
          })
          .catch(() => {});
        console.error(
          await page
            .locator("body")
            .innerText()
            .catch(() => ""),
        );
      }
    }
  }
  throw e;
} finally {
  await browser?.close();
  server.kill();
  fs.rmSync(temp, { recursive: true, force: true });
}
