// Local stand-in for the OpenAI endpoints Draft Night uses, for browser end-to-end runs.
// Images are rendered cards showing exactly what was requested, so screenshots reveal which
// items went into which player's picture. Usage: node mock-openai.mjs [port]
import http from 'node:http';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');

const port = Number(process.argv[2] || 4010);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0));
const delay = Number(process.env.MOCK_DELAY || 1200);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
let renderChain = Promise.resolve();
const hue = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function render(title, lines, h) {
  const job = renderChain.then(async () => {
    await page.setContent(`<body style="margin:0;width:512px;height:512px;background:hsl(${h} 35% 22%);color:#fff;font:600 22px system-ui;display:flex;flex-direction:column;justify-content:center;padding:28px;box-sizing:border-box">
      <div style="font-size:30px;margin-bottom:14px">${esc(title)}</div>${lines.map(l => `<div style="font-weight:500;opacity:.9;margin:3px 0">${esc(l)}</div>`).join('')}</body>`);
    return page.screenshot({ type: 'jpeg', quality: 70 });
  });
  renderChain = job.catch(() => {});
  return job;
}
function themeReply(content) {
  const subject = /Subject: "(.*)"/.exec(content)[1];
  const n = Number(/N = (\d+)/.exec(content)[1]);
  if (/^pam$/i.test(subject) && !content.includes('confirmed')) return { status: 'ambiguous', question: 'Who or what is Pam?', options: [{ label: "Pam's dream birthday cake", topic: 'birthday cake' }, { label: 'A pampering spa day', topic: 'spa day' }, { label: "Pam's dream house", topic: 'dream house' }], title: '', emoji: '', kind: 'build', noun: '', label: '', base_name: '', base_blurb: '', base_visual: '', scene: '', items: [] };
  const title = subject.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 24);
  return { status: 'ok', question: '', options: [], title, emoji: '✨', kind: 'build', noun: subject.toLowerCase(), label: 'Upgrade', base_name: 'Plain ' + subject.toLowerCase(), base_blurb: 'The starting point', base_visual: 'a plain ' + subject, scene: 'Even light, whole subject visible', items: Array.from({ length: n }, (_, i) => ({ name: title + ' extra ' + (i + 1), blurb: 'Mock item for testing', visual: 'mock item ' + (i + 1) + ' placed on the ' + subject })) };
}

http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  try {
    if (req.url.endsWith('/chat/completions')) {
      const body = JSON.parse(raw);
      const user = body.messages[1].content;
      const out = body.response_format.json_schema.schema.properties.verdict ? { verdict: 'Mock judge: everyone built something lovely, but the tidiest creation takes the crown.' } : themeReply(user);
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
    }
    let prompt, title, lines;
    if (req.url.endsWith('/images/edits')) {
      const form = await new Request('http://x', { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: raw }).formData();
      prompt = form.get('prompt');
      const base = /Edit this photograph of a (.*?) \(/.exec(prompt)?.[1] || 'world';
      const had = /already contains these purchased items, which must stay exactly as they are: (.*?)\./.exec(prompt)?.[1] || '';
      const added = [...prompt.matchAll(/^- (.*?):/gm)].map(m => m[1]);
      title = base;
      lines = [...had.split(', ').filter(Boolean).map(x => '• ' + x), ...added.map(x => '+ ' + x)];
    } else {
      prompt = JSON.parse(raw).prompt;
      const subject = /The property is (.*?)\. Show/.exec(prompt)?.[1] || /Subject: (.*?)\. Show/.exec(prompt)?.[1] || /photograph of (.*?) as a single/.exec(prompt)?.[1] || prompt.slice(0, 80);
      title = subject.split(/,| with /)[0].slice(0, 60);
      lines = [];
    }
    const img = await render(title, lines, hue(title));
    await new Promise(r => setTimeout(r, delay));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [{ b64_json: img.toString('base64') }] }));
  } catch (e) {
    res.statusCode = 500; res.end(String(e));
  }
}).listen(port, () => console.log('mock openai on', port));
