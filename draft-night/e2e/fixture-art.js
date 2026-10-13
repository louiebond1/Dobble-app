// Test stand-ins for the photo library: one small single-colour PNG per planned picture. Used by tests and browser
// runs to prove every tile shows a loaded image; never shipped (the real library is public/draft-night/art).
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { loadThemes } = require('../../lib/draftnight/spec');
const { photoJobs } = require('../../lib/draftnight/photos');

function png(r, g, b, size = 8) {
  const crc = buf => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 2;
  const rows = Buffer.concat(Array.from({ length: size }, (_, y) => Buffer.from([0, ...Array.from({ length: size }, (_, x) => [r, (g + x * 4) % 256, (b + y * 4) % 256]).flat()])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
function fixtureArt(dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-art-'))) {
  photoJobs(loadThemes()).forEach((j, i) => { const f = path.join(dir, j.key + '.png'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, png((i * 47) % 256, (i * 91) % 256, (i * 23) % 256, 32)); });
  return dir;
}
module.exports = { fixtureArt, png };
if (require.main === module) console.log(fixtureArt(process.argv[2]));
