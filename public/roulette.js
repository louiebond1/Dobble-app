const el = (id) => document.getElementById(id);

const filtersPanel = el('filtersPanel');
const spinningPanel = el('spinningPanel');
const resultPanel = el('resultPanel');
const committedPanel = el('committedPanel');
const completeFormPanel = el('completeFormPanel');
const completeDonePanel = el('completeDonePanel');
const historyPanel = el('historyPanel');

const ALL_PANELS = [
  filtersPanel,
  spinningPanel,
  resultPanel,
  committedPanel,
  completeFormPanel,
  completeDonePanel,
  historyPanel,
];

function showPanel(panel) {
  ALL_PANELS.forEach((p) => p.classList.toggle('hidden', p !== panel));
}

const filters = { duration: '', budget: '', mood: '', location: '' };
let currentDate = null;
let photoDataUrl = null;

document.querySelectorAll('.chip-row').forEach((row) => {
  const key = row.dataset.filter;
  row.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      filters[key] = chip.dataset.value;
      row.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
      hapticTap();
    });
  });
  // Default to "Any" selected.
  row.querySelector('.chip').classList.add('active');
});

const DURATION_LABEL = {
  '20min': '20 min', '1hr': '1 hr', '2-3hr': '2-3 hrs', evening: 'An evening', halfday: 'Half a day', fullday: 'A full day',
};
const BUDGET_LABEL = { free: 'Free', '£': '£', '££': '££', '£££': '£££' };
const LOCATION_LABEL = { home: '🏠 At home', outside: '🌳 Out and about', either: '🏠🌳 Either' };
const EFFORT_LABEL = {
  '20min': 'Low effort', '1hr': 'Low effort', '2-3hr': 'Medium effort', evening: 'Medium effort',
  halfday: 'High effort', fullday: 'High effort',
};
const CATEGORY_EMOJI = {
  food: '🍕', chaos: '😂', romantic: '❤️', memory: '📸', athome: '🏠', adventure: '🌎', creative: '🎨', game: '🎮',
};

const SPIN_CYCLE_EMOJI = ['🍕', '😂', '❤️', '📸', '🏠', '🌎', '🎨', '🎮', '🎲'];

el('spinBtn').addEventListener('click', spin);
el('spinAgainBtn').addEventListener('click', spin);
el('doneSpinAgainBtn').addEventListener('click', spin);

async function spin() {
  hapticTap();
  showPanel(spinningPanel);
  const reel = el('slotReel');
  let cycling = true;
  (function cycle() {
    if (!cycling) return;
    reel.textContent = SPIN_CYCLE_EMOJI[Math.floor(Math.random() * SPIN_CYCLE_EMOJI.length)];
    setTimeout(cycle, 90);
  })();

  const surpriseMe = el('surpriseMe').checked;
  const body = surpriseMe ? { surpriseMe: true } : { ...filters };

  const [res] = await Promise.all([
    fetch('/api/dates/spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json()),
    new Promise((resolve) => setTimeout(resolve, 1400)),
  ]);

  cycling = false;
  currentDate = res.date;
  renderResult(currentDate);
  playSuccess();
  hapticSuccess();
  showPanel(resultPanel);
}

function renderResult(d) {
  el('resultCategory').textContent = `${CATEGORY_EMOJI[d.category] || '🎲'} ${d.category}`;
  el('resultTitle').textContent = d.title;
  el('resultDesc').textContent = d.description;
  el('resultInstructions').textContent = d.instructions || '';
  const meta = [
    BUDGET_LABEL[d.budget] || d.budget,
    DURATION_LABEL[d.duration] || d.duration,
    LOCATION_LABEL[d.location] || d.location,
    EFFORT_LABEL[d.duration] || '',
  ].filter(Boolean);
  el('resultMeta').innerHTML = meta.map((m) => `<span class="meta-pill">${m}</span>`).join('');
  const challengeEl = el('resultChallenge');
  if (d.challenge) {
    challengeEl.textContent = `🎯 Challenge: ${d.challenge}`;
    challengeEl.classList.remove('hidden');
  } else {
    challengeEl.classList.add('hidden');
  }
  el('cupSetupLink').classList.toggle('hidden', d.id !== 'game-014');
}

el('resultBackBtn').addEventListener('click', () => showPanel(filtersPanel));

el('letsDoItBtn').addEventListener('click', () => {
  hapticSuccess();
  el('committedTitle').textContent = currentDate.title;
  showPanel(committedPanel);
});

el('notYetBtn').addEventListener('click', () => showPanel(filtersPanel));
el('skipBtn').addEventListener('click', () => showPanel(filtersPanel));

el('didItBtn').addEventListener('click', () => {
  el('completeFormTitle').textContent = currentDate.title;
  el('ratingInput').value = 8;
  el('ratingValue').textContent = '8';
  el('noteInput').value = '';
  el('favouriteInput').checked = false;
  el('photoPreview').classList.add('hidden');
  el('photoInput').value = '';
  photoDataUrl = null;
  showPanel(completeFormPanel);
});

el('ratingInput').addEventListener('input', () => {
  el('ratingValue').textContent = el('ratingInput').value;
});

el('photoInput').addEventListener('change', () => {
  const file = el('photoInput').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    photoDataUrl = reader.result;
    el('photoPreview').src = photoDataUrl;
    el('photoPreview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

el('saveCompleteBtn').addEventListener('click', async () => {
  const rating = parseInt(el('ratingInput').value, 10);
  const note = el('noteInput').value.trim();
  const favourite = el('favouriteInput').checked;
  const res = await fetch('/api/dates/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateId: currentDate.id, rating, note, favourite, photo: photoDataUrl }),
  }).then((r) => r.json());

  if (!res.ok) return;
  playSuccess();
  hapticSuccess();
  renderStats('doneStats', res.stats);
  showPanel(completeDonePanel);
});

el('doneHistoryBtn').addEventListener('click', loadHistory);
el('historyBtn').addEventListener('click', loadHistory);
el('historyBackBtn').addEventListener('click', () => showPanel(filtersPanel));

async function loadHistory() {
  const res = await fetch('/api/dates/history').then((r) => r.json());
  renderStats('historyStats', res.stats);
  const list = el('datesList');
  if (!res.entries.length) {
    list.innerHTML = '<p class="dates-empty">No dates logged yet — spin the wheel and make some memories!</p>';
  } else {
    list.innerHTML = res.entries
      .map((e) => {
        const date = new Date(e.completedAt).toLocaleDateString();
        const photo = e.photo ? `<img class="dates-thumb" src="${e.photo}" alt="" />` : '';
        const fav = e.favourite ? ' ⭐' : '';
        const note = e.note ? `<p class="dates-note">${escapeHtml(e.note)}</p>` : '';
        return `<div class="dates-entry">${photo}<div class="dates-entry-body"><div class="dates-entry-head"><strong>${escapeHtml(e.title)}${fav}</strong><span>${e.rating}/10</span></div><div class="dates-entry-date">${date}</div>${note}</div></div>`;
      })
      .join('');
  }
  showPanel(historyPanel);
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function renderStats(targetId, stats) {
  const bits = [`<span class="stat-pill">${stats.completed} dates completed</span>`];
  if (stats.bestRated) bits.push(`<span class="stat-pill">Best: ${escapeHtml(stats.bestRated.title)} (${stats.bestRated.rating}/10)</span>`);
  if (stats.favourite) bits.push(`<span class="stat-pill">⭐ Favourite: ${escapeHtml(stats.favourite.title)}</span>`);
  el(targetId).innerHTML = bits.join('');
}
