import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, getDocs, addDoc, doc, getDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let eventsCache = [];

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadEvents() {
  const grid = document.getElementById('events-grid');
  const select = document.getElementById('f-event');
  try {
    const q = query(collection(db, 'events'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    eventsCache = [];
    snap.forEach(d => eventsCache.push({ id: d.id, ...d.data() }));

    document.getElementById('stat-events').textContent = eventsCache.filter(e => e.active).length;

    if (eventsCache.length === 0) {
      grid.innerHTML = '<p style="color:var(--text-dim);">No events posted yet. Check back soon.</p>';
      return;
    }

    grid.innerHTML = eventsCache.map(ev => `
      <div class="event-card">
        <h3>${escapeHtml(ev.title)}</h3>
        <div class="tagline">${escapeHtml(ev.tagline || '')}</div>
        <div class="meta">
          <span>${escapeHtml(ev.eventDate || 'Date TBA')}</span>
          <span>PKR ${escapeHtml(ev.feePkr || '—')}</span>
        </div>
        <p class="desc">${escapeHtml(ev.description || '')}</p>
        <button class="btn-secondary" style="margin-top:8px; align-self:flex-start;" onclick="window.selectEvent('${ev.id}')">View & register</button>
      </div>
    `).join('');

    select.innerHTML = '<option value="">Select an event</option>' +
      eventsCache.map(ev => `<option value="${ev.id}">${escapeHtml(ev.title)}</option>`).join('');

  } catch (err) {
    grid.innerHTML = '<p style="color:#fca5a5;">Could not load events. Check your Firebase setup.</p>';
    console.error(err);
  }
}

window.selectEvent = function (eventId) {
  const select = document.getElementById('f-event');
  select.value = eventId;
  renderEventDetails(eventId);
  document.getElementById('register').scrollIntoView({ behavior: 'smooth' });
};

function renderEventDetails(eventId) {
  const ev = eventsCache.find(e => e.id === eventId);
  const paymentBox = document.getElementById('payment-box');
  const curriculumSection = document.getElementById('curriculum-section');
  const curriculumWeeks = document.getElementById('curriculum-weeks');
  const curriculumTitle = document.getElementById('curriculum-title');

  if (!ev) {
    paymentBox.innerHTML = '<h3>Payment details</h3><p style="color:var(--text-dim); font-size:13.5px;">Select an event above to see payment details.</p>';
    curriculumSection.style.display = 'none';
    return;
  }

  paymentBox.innerHTML = `
    <h3>Payment details — ${escapeHtml(ev.title)}</h3>
    <div class="pay-row"><span>Amount</span><span>PKR ${escapeHtml(ev.feePkr || '—')}</span></div>
    <div class="pay-row"><span>EasyPaisa</span><span>${escapeHtml(ev.easypaisa || '—')}</span></div>
    <div class="pay-row"><span>JazzCash</span><span>${escapeHtml(ev.jazzcash || '—')}</span></div>
    <div class="pay-row"><span>Account title</span><span>${escapeHtml(ev.accountTitle || '—')}</span></div>
    <p style="color:var(--text-dim); font-size:13px; margin-top:14px;">Send the fee, then enter the transaction ID in the form. Keep your receipt until you get your access code.</p>
  `;

  if (Array.isArray(ev.curriculum) && ev.curriculum.length > 0) {
    curriculumTitle.textContent = `Curriculum — ${ev.title}`;
    curriculumWeeks.innerHTML = ev.curriculum.map(w => `
      <div class="week">
        <div class="week-num">${escapeHtml(w.week)}</div>
        <div><h4>${escapeHtml(w.title)}</h4><p>${escapeHtml(w.description)}</p></div>
      </div>
    `).join('');
    curriculumSection.style.display = 'block';
  } else {
    curriculumSection.style.display = 'none';
  }
}

document.getElementById('f-event').addEventListener('change', (e) => {
  renderEventDetails(e.target.value);
});

document.getElementById('reg-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('reg-status');
  const eventId = document.getElementById('f-event').value;
  const ev = eventsCache.find(x => x.id === eventId);

  if (!eventId) {
    statusEl.textContent = 'Please select an event first.';
    statusEl.className = 'status-msg show err';
    return;
  }

  const data = {
    eventId,
    eventTitle: ev ? ev.title : '',
    name: document.getElementById('f-name').value.trim(),
    email: document.getElementById('f-email').value.trim(),
    whatsapp: document.getElementById('f-whatsapp').value.trim(),
    education: document.getElementById('f-education').value,
    txnId: document.getElementById('f-txn').value.trim(),
    submittedAt: new Date().toISOString(),
    approved: false,
    accessCode: null
  };

  try {
    await addDoc(collection(db, 'registrations'), data);
    statusEl.textContent = "Registration submitted. We'll verify your payment and send your access code on WhatsApp within 24 hours.";
    statusEl.className = 'status-msg show ok';
    document.getElementById('reg-form').reset();
    document.getElementById('payment-box').innerHTML = '<h3>Payment details</h3><p style="color:var(--text-dim); font-size:13.5px;">Select an event above to see payment details.</p>';
  } catch (err) {
    statusEl.textContent = 'Something went wrong saving your registration. Please try again.';
    statusEl.className = 'status-msg show err';
    console.error(err);
  }
});

window.checkAccessCode = async function () {
  const input = document.getElementById('access-code-input').value.trim().toUpperCase();
  const statusEl = document.getElementById('unlock-status');
  const notesGrid = document.getElementById('notes-grid');
  if (!input) return;

  try {
    const codeDoc = await getDoc(doc(db, 'codes', input));
    if (codeDoc.exists() && codeDoc.data().valid) {
      const codeData = codeDoc.data();
      const ev = eventsCache.find(e => e.id === codeData.eventId);
      statusEl.textContent = 'Unlocked. Your notes are below.';
      statusEl.className = 'status-msg show ok';

      if (ev && Array.isArray(ev.curriculum)) {
        notesGrid.innerHTML = ev.curriculum.map(w => `
          <div class="note-card unlocked">
            <h4>Week ${escapeHtml(w.week)} — ${escapeHtml(w.title)}</h4>
            <p>${escapeHtml(w.description)}</p>
          </div>
        `).join('');
      } else {
        notesGrid.innerHTML = '<p style="color:var(--text-dim);">Notes for your event will appear here once the organizer adds them.</p>';
      }
    } else {
      statusEl.textContent = 'Code not recognized. Check your WhatsApp message and try again.';
      statusEl.className = 'status-msg show err';
    }
  } catch (err) {
    statusEl.textContent = "Couldn't verify right now. Please try again in a moment.";
    statusEl.className = 'status-msg show err';
    console.error(err);
  }
};

loadEvents();
