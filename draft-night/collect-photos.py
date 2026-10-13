"""Collects Draft Night photos printed by the Railway job draft-night-photos (PHOTO|key|i|n|base64 log lines).
Save its logs (Railway get-logs, filter "PHOTO|") to JSON files, then:
    python3 draft-night/collect-photos.py <logs.json>... --out public/draft-night/art [--sheet sheet.jpg]
Later chunks for a key replace earlier ones, so a re-drawn photo wins.
"""
import json, sys, base64, os, collections, argparse, glob

ap = argparse.ArgumentParser()
ap.add_argument('logs', nargs='+'); ap.add_argument('--out', required=True); ap.add_argument('--sheet')
a = ap.parse_args()
# key -> (run timestamp of chunk 0) -> {i: chunk}; keep the newest complete set per key.
sets = collections.defaultdict(lambda: collections.defaultdict(dict)); total = {}; fails = []
for f in a.logs:
    entries = sorted(json.load(open(f))['deploy'], key=lambda e: e['timestamp'])
    current = {}
    for e in entries:
        m = e['message']
        if m.startswith('PHOTO|'):
            _, key, i, n, chunk = m.split('|', 4)
            if i == '0': current[key] = e['timestamp']
            sets[key][current.get(key, '')][int(i)] = chunk; total[(key, current.get(key, ''))] = int(n)
        elif m.startswith('PHOTOFAIL|'): fails.append(m.split('|')[1])
done, bad = 0, []
for key, runs in sets.items():
    for stamp in sorted(runs, reverse=True):
        parts, n = runs[stamp], total[(key, stamp)]
        if len(parts) == n:
            data = base64.b64decode(''.join(parts[i] for i in range(n)))
            path = os.path.join(a.out, key + '.jpg'); os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, 'wb').write(data); done += 1; break
    else: bad.append(key)
print(f'{done} photos written to {a.out}; incomplete: {bad}; failed in job: {sorted(set(fails) - set(sets))}')
if a.sheet:
    from PIL import Image, ImageDraw, ImageFont
    files = sorted(glob.glob(a.out + '/**/*.jpg', recursive=True)); T, pad, cols = 220, 30, 8
    sheet = Image.new('RGB', (cols * T, ((len(files) + cols - 1) // cols) * (T + pad)), (20, 20, 20)); d = ImageDraw.Draw(sheet)
    try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
    except Exception: font = ImageFont.load_default()
    for i, f in enumerate(files):
        x, y = (i % cols) * T, (i // cols) * (T + pad)
        sheet.paste(Image.open(f).convert('RGB').resize((T - 4, T - 4)), (x + 2, y + 2)); d.text((x + 3, y + T), os.path.relpath(f, a.out)[-36:], fill=(230, 230, 230), font=font)
    sheet.save(a.sheet, quality=80)
