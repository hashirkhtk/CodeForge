import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, getDocs, addDoc, doc, setDoc, updateDoc, deleteDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let eventsCache = [];
let weekCount = 0;

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ---------- Auth ----------
onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';
    loadEvents();
    loadRegistrations();
  } else {
    document.getElementById('login-view').style.display = 'block';
    document.getElementById('dashboard-view').style.display = 'none';
  }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('login-status');
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    statusEl.textContent = 'Could not sign in. Check your email and password.';
    statusEl.className = 'status-msg show err';
  }
});

window.handleSignOut = function () {
  signOut(auth);
};

// ---------- Tabs ----------
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ---------- Curriculum week rows ----------
window.addWeekRow = function (week = '', title = '', description = '') {
  weekCount++;
  const id = 'week-row-' + weekCount;
  const container = document.getElementById('week-inputs');
  const row = document.createElement('div');
  row.className = 'week-input-row';
  row.id = id;
  row.innerHTML = `
    <input type="text" placeholder="1" class="week-num-input" value="${escapeHtml(week)}">
    <input type="text" placeholder="Week title" class="week-title-input" value="${escapeHtml(title)}">
    <input type="text" placeholder="Short description" class="week-desc-input" value="${escapeHtml(description)}">
    <button type="button" class="mini-btn secondary" onclick="document.getElementById('${id}').remove()">Remove</button>
  `;
  container.appendChild(row);
};

function collectWeeks() {
  const rows = document.querySelectorAll('.week-input-row');
  const weeks = [];
  rows.forEach(row => {
    const week = row.querySelector('.week-num-input').value.trim();
    const title = row.querySelector('.week-title-input').value.trim();
    const description = row.querySelector('.week-desc-input').value.trim();
    if (title) weeks.push({ week, title, description });
  });
  return weeks;
}

// ---------- Events ----------
document.getElementById('event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('event-status');
  const data = {
    title: document.getElementById('ev-title').value.trim(),
    tagline: document.getElementById('ev-tagline').value.trim(),
    description: document.getElementById('ev-description').value.trim(),
    eventDate: document.getElementById('ev-date').value.trim(),
    feePkr: document.getElementById('ev-fee').value.trim(),
    easypaisa: document.getElementById('ev-easypaisa').value.trim(),
    jazzcash: document.getElementById('ev-jazzcash').value.trim(),
    accountTitle: document.getElementById('ev-account-title').value.trim(),
    curriculum: collectWeeks(),
    active: document.getElementById('ev-active').checked,
    createdAt: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, 'events'), data);
    statusEl.textContent = 'Event saved.';
    statusEl.className = 'status-msg show ok';
    document.getElementById('event-form').reset();
    document.getElementById('week-inputs').innerHTML = '';
    loadEvents();
  } catch (err) {
    statusEl.textContent = 'Could not save the event. Please try again.';
    statusEl.className = 'status-msg show err';
    console.error(err);
  }
});

async function loadEvents() {
  const list = document.getElementById('events-list');
  const filter = document.getElementById('reg-filter');
  try {
    const q = query(collection(db, 'events'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    eventsCache = [];
    snap.forEach(d => eventsCache.push({ id: d.id, ...d.data() }));

    if (eventsCache.length === 0) {
      list.innerHTML = '<p style="color:var(--text-dim);">No events yet. Add one above.</p>';
    } else {
      list.innerHTML = eventsCache.map(ev => `
        <div class="data-row">
          <div><strong>${escapeHtml(ev.title)}</strong><br><span style="color:var(--text-dim); font-size:12px;">${escapeHtml(ev.eventDate || '')}</span></div>
          <div style="color:var(--text-dim);">PKR ${escapeHtml(ev.feePkr || '—')}</div>
          <div><span class="badge ${ev.active ? 'active' : 'inactive'}">${ev.active ? 'active' : 'inactive'}</span></div>
          <div style="display:flex; gap:6px;">
            <button class="mini-btn secondary" onclick="toggleEventActive('${ev.id}', ${!ev.active})">${ev.active ? 'Deactivate' : 'Activate'}</button>
            <button class="mini-btn secondary" onclick="deleteEvent('${ev.id}')">Delete</button>
          </div>
        </div>
      `).join('');
    }

    filter.innerHTML = '<option value="">All events</option>' +
      eventsCache.map(ev => `<option value="${ev.id}">${escapeHtml(ev.title)}</option>`).join('');

  } catch (err) {
    list.innerHTML = '<p style="color:#fca5a5;">Could not load events.</p>';
    console.error(err);
  }
}

window.toggleEventActive = async function (eventId, newState) {
  try {
    await updateDoc(doc(db, 'events', eventId), { active: newState });
    loadEvents();
  } catch (err) {
    alert('Could not update the event.');
  }
};

window.deleteEvent = async function (eventId) {
  if (!confirm('Delete this event? This cannot be undone.')) return;
  try {
    await deleteDoc(doc(db, 'events', eventId));
    loadEvents();
  } catch (err) {
    alert('Could not delete the event.');
  }
};

// ---------- Registrations ----------
document.getElementById('reg-filter').addEventListener('change', loadRegistrations);

async function loadRegistrations() {
  const container = document.getElementById('registrations-list');
  const filterVal = document.getElementById('reg-filter').value;
  container.innerHTML = '<p style="color:var(--text-dim);">Loading…</p>';
  try {
    const snap = await getDocs(collection(db, 'registrations'));
    let rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
    if (filterVal) rows = rows.filter(r => r.eventId === filterVal);
    rows.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));

    if (rows.length === 0) {
      container.innerHTML = '<p style="color:var(--text-dim);">No registrations yet.</p>';
      return;
    }

    container.innerHTML = rows.map(r => `
      <div class="data-row">
        <div><strong>${escapeHtml(r.name)}</strong><br><span style="color:var(--text-dim); font-size:12px;">${escapeHtml(r.eventTitle)} &middot; ${escapeHtml(r.whatsapp)}</span></div>
        <div style="color:var(--text-dim); font-size:12.5px;">${escapeHtml(r.email)}<br>txn: ${escapeHtml(r.txnId)}</div>
        <div>${r.approved ? '<span class="badge approved">approved</span>' : '<span class="badge pending">pending</span>'}</div>
        <div style="text-align:right;">
          ${r.approved
            ? `<span class="code-shown">${escapeHtml(r.accessCode)}</span>`
            : `<button class="mini-btn" onclick="approveRegistration('${r.id}', '${r.eventId}')">Approve</button>`}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:#fca5a5;">Could not load registrations.</p>';
    console.error(err);
  }
}

window.approveRegistration = async function (regId, eventId) {
  try {
    const code = genCode();
    await setDoc(doc(db, 'codes', code), { valid: true, eventId, issuedAt: new Date().toISOString() });
    await updateDoc(doc(db, 'registrations', regId), { approved: true, accessCode: code });
    loadRegistrations();
  } catch (err) {
    alert('Could not approve this registration.');
    console.error(err);
  }
};

// Start with one empty week row for convenience
addWeekRow();
