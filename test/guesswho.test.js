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
