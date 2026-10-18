import { store } from '../store.js';
import { tier, TIERS } from '../api.js';
import { esc } from '../ui.js';

const MODES = [
  { id: 'read', icon: '📖', title: 'Read Aloud', sub: 'Hear a child read, mark every word' },
  { id: 'grade', icon: '✅', title: 'Grade Answers', sub: 'Photo of answer sheets, marks + copying check' },
  { id: 'test', icon: '📝', title: 'Make a Test', sub: 'Questions from a textbook page' },
  { id: 'report', icon: '📊', title: 'Class Report', sub: 'Who needs help, what to reteach' },
  { id: 'listen', icon: '🔊', title: 'Read to Me', sub: 'Any page read aloud' },
  { id: 'oral', icon: '🎤', title: 'Oral Exam', sub: 'Adaptive spoken exam', pro: true },
  { id: 'bridge', icon: '🌍', title: 'Home Language', sub: 'Ask in your own language', pro: true },
  { id: 'students', icon: '👥', title: 'Students', sub: 'Class list and device data' }
];

export function render(view) {
  const t = tier();
  const s = store.state;
  const queued = s.queue.length;
  const hello = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  view.innerHTML = `
  <section class="home">
    <div class="home-hello">
      <div>
        <div class="hello">${hello}, teacher</div>
        <div class="hello-sub">Class 3 · ${s.students.length} students</div>
      </div>
      <div class="tier-pill tier-${t}">${esc(TIERS[t].name)}</div>
    </div>
    ${queued ? `<div class="banner warn">⏳ ${queued} item${queued > 1 ? 's' : ''} saved offline, will be graded when the network returns.</div>` : ''}
    <div class="mode-grid">
      ${MODES.map(m => {
        const lockedMode = m.pro && t !== 'pro';
        return `<button class="mode ${m.pro ? 'pro' : ''} ${lockedMode ? 'is-locked' : ''}" data-nav="${m.id}">
          <span class="mode-icon">${m.icon}</span>
          <span class="mode-title">${m.title}${m.pro ? ' <span class="pro-tag">PRO</span>' : ''}</span>
          <span class="mode-sub">${lockedMode ? 'Needs Pro (Gemma 4 E4B)' : m.sub}</span>
        </button>`;
      }).join('')}
    </div>
  </section>`;
}
