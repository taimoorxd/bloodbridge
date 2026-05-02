/* ============================================================
   BloodBridge — app.js
   Firebase Authentication + Firestore Integration
   Vanilla JavaScript — No Frameworks
   ============================================================ */

// ════════════════════════════════════════════════════════════
// 1. FIREBASE CONFIGURATION
// ════════════════════════════════════════════════════════════
/*
  ⚙️  SETUP INSTRUCTIONS:
  ─────────────────────────────────────────────────────────────
  1. Go to https://console.firebase.google.com/
  2. Click "Add project" → give it a name → Create
  3. In your project, click the web icon (</>)
  4. Register app → copy the firebaseConfig object below
  5. In Firebase Console → Build → Authentication
       → Get Started → Enable "Email/Password"
  6. In Firebase Console → Build → Firestore Database
       → Create Database → Start in test mode → Enable
  7. Replace the placeholder values below with YOUR config
  ─────────────────────────────────────────────────────────────
*/

const firebaseConfig = {
  apiKey:            "AIzaSyCWuIuGiM3Gs38fSgsZurq_UpvnNdJ5ak4",
  authDomain:        "bloodbridge-b7dba.firebaseapp.com",
  projectId:         "bloodbridge-b7dba",
  storageBucket:     "bloodbridge-b7dba.firebasestorage.app",
  messagingSenderId: "388871364561",
  appId:             "1:388871364561:web:a8432d9a329d1368920af0",
  measurementId:     "G-65GZ1Z4PF3"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firebase service references
const auth      = firebase.auth();
const db        = firebase.firestore();

// ════════════════════════════════════════════════════════════
// 2. GLOBAL STATE
// ════════════════════════════════════════════════════════════
let currentUser     = null;   // Firebase Auth user object
let currentUserData = null;   // Firestore user document data
let unsubRequests   = null;   // Listener unsubscribe function

// ════════════════════════════════════════════════════════════
// 3. AUTH STATE OBSERVER
//    Runs every time the user logs in or out
// ════════════════════════════════════════════════════════════
auth.onAuthStateChanged(async (user) => {
  currentUser = user;

  if (user) {
    // User is logged in — fetch their Firestore profile
    try {
      const doc = await db.collection('users').doc(user.uid).get();
      if (doc.exists) {
        currentUserData = doc.data();
      }
    } catch (e) {
      console.error('Error fetching user data:', e);
    }
    updateNavForAuth(true);
  } else {
    // User is logged out
    currentUserData = null;
    updateNavForAuth(false);
  }
});

// ════════════════════════════════════════════════════════════
// 4. NAVIGATION
// ════════════════════════════════════════════════════════════

/**
 * Show a page by its key and hide all others.
 * Keys: 'home' | 'auth' | 'dashboard' | 'find' | 'request'
 */
function showPage(pageKey) {
  // Guard: require login for dashboard
  if (pageKey === 'dashboard' && !currentUser) {
    showToast('Please log in first.', 'error');
    showPage('auth');
    return;
  }

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Show target page
  const target = document.getElementById('page-' + pageKey);
  if (target) target.classList.add('active');

  // Highlight active nav link
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === pageKey);
  });

  // Close mobile menu
  document.getElementById('navLinks').classList.remove('open');

  // Page-specific initialisation
  if (pageKey === 'dashboard')  initDashboard();
  if (pageKey === 'request')    initRequestPage();
  if (pageKey === 'home')       loadHomeStats();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Toggle the mobile hamburger menu */
function toggleMenu() {
  document.getElementById('navLinks').classList.toggle('open');
}

/** Update navbar links based on auth state */
function updateNavForAuth(isLoggedIn) {
  document.getElementById('navLogin').style.display    = isLoggedIn ? 'none'         : 'inline-flex';
  document.getElementById('navLogout').style.display   = isLoggedIn ? 'inline-block' : 'none';
  document.getElementById('navDashboard').style.display = isLoggedIn ? 'inline-block' : 'none';
}

// ════════════════════════════════════════════════════════════
// 5. TOAST NOTIFICATIONS
// ════════════════════════════════════════════════════════════

let toastTimer = null;

/**
 * Show a toast message at the bottom of the screen.
 * @param {string} message  - Text to display
 * @param {string} type     - 'success' | 'error' | 'info'
 * @param {number} duration - ms to show (default 3500)
 */
function showToast(message, type = 'info', duration = 3500) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + type;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// ════════════════════════════════════════════════════════════
// 6. AUTH — SIGNUP
// ════════════════════════════════════════════════════════════
async function handleSignup() {
  // Gather form values
  const name      = document.getElementById('signupName').value.trim();
  const phone     = document.getElementById('signupPhone').value.trim();
  const email     = document.getElementById('signupEmail').value.trim();
  const password  = document.getElementById('signupPassword').value;
  const bloodGroup = document.getElementById('signupBloodGroup').value;
  const city      = document.getElementById('signupCity').value.trim();

  // Validation
  if (!name || !phone || !email || !password || !bloodGroup || !city) {
    showToast('Please fill in all fields.', 'error'); return;
  }
  if (password.length < 6) {
    showToast('Password must be at least 6 characters.', 'error'); return;
  }

  // Button loading state
  const btn = document.querySelector('#signupForm .btn-primary');
  setLoading(btn, true, 'Creating Account...');

  try {
    // 1. Create Firebase Auth user
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const uid = userCredential.user.uid;

    // 2. Save user data to Firestore 'users' collection
    await db.collection('users').doc(uid).set({
      uid,
      name,
      phone,
      email,
      bloodGroup,
      city,
      availability: 'Available',       // default to available
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    currentUserData = { uid, name, phone, email, bloodGroup, city, availability: 'Available' };

    showToast('Account created! Welcome, ' + name + ' 🎉', 'success');
    showPage('dashboard');

  } catch (err) {
    showToast(friendlyAuthError(err.code), 'error');
  } finally {
    setLoading(btn, false, 'Create Account');
  }
}

// ════════════════════════════════════════════════════════════
// 7. AUTH — LOGIN
// ════════════════════════════════════════════════════════════
async function handleLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showToast('Please enter your email and password.', 'error'); return;
  }

  const btn = document.querySelector('#loginForm .btn-primary');
  setLoading(btn, true, 'Logging in...');

  try {
    await auth.signInWithEmailAndPassword(email, password);

    // Fetch profile after login
    const uid = auth.currentUser.uid;
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) currentUserData = doc.data();

    showToast('Welcome back! 🩸', 'success');
    showPage('dashboard');
  } catch (err) {
    showToast(friendlyAuthError(err.code), 'error');
  } finally {
    setLoading(btn, false, 'Login');
  }
}

// ════════════════════════════════════════════════════════════
// 8. AUTH — LOGOUT
// ════════════════════════════════════════════════════════════
async function handleLogout() {
  try {
    // Stop any active Firestore listeners
    if (unsubRequests) { unsubRequests(); unsubRequests = null; }
    await auth.signOut();
    currentUser = null;
    currentUserData = null;
    showToast('Logged out successfully.', 'info');
    showPage('home');
  } catch (err) {
    showToast('Logout failed. Try again.', 'error');
  }
}

// ════════════════════════════════════════════════════════════
// 9. AUTH — SWITCH TAB
// ════════════════════════════════════════════════════════════
function switchAuthTab(tab) {
  document.getElementById('loginForm').style.display  = tab === 'login'  ? 'block' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('tabLogin').classList.toggle('active',  tab === 'login');
  document.getElementById('tabSignup').classList.toggle('active', tab === 'signup');
}

// ════════════════════════════════════════════════════════════
// 10. DASHBOARD — INIT
// ════════════════════════════════════════════════════════════
async function initDashboard() {
  if (!currentUser) return;

  // Make sure we have latest profile
  if (!currentUserData) {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists) currentUserData = doc.data();
  }

  renderProfileView();
  loadMyRequests();
}

/** Render the profile read-only view */
function renderProfileView() {
  if (!currentUserData) return;
  const d = currentUserData;

  document.getElementById('profileAvatar').textContent = d.name ? d.name[0].toUpperCase() : '?';
  document.getElementById('dName').textContent   = d.name   || '—';
  document.getElementById('dEmail').textContent  = d.email  || '—';
  document.getElementById('dPhone').textContent  = d.phone  || '—';
  document.getElementById('dCity').textContent   = d.city   || '—';

  const bloodEl = document.getElementById('dBlood');
  bloodEl.textContent = d.bloodGroup || '—';

  const statusEl = document.getElementById('dStatus');
  const isAvail  = d.availability === 'Available';
  statusEl.textContent = isAvail ? '✅ Available' : '❌ Not Available';
  statusEl.className   = 'status-badge ' + (isAvail ? 'available' : 'unavailable');

  // Sync toggle
  document.getElementById('availToggle').checked = isAvail;
}

// ════════════════════════════════════════════════════════════
// 11. DASHBOARD — EDIT PROFILE
// ════════════════════════════════════════════════════════════
function toggleEdit() {
  const view    = document.getElementById('profileView');
  const editDiv = document.getElementById('profileEdit');
  const editing = editDiv.style.display === 'block';

  if (editing) {
    // Cancel — go back to view
    editDiv.style.display = 'none';
    view.style.display    = 'block';
    document.getElementById('editBtn').textContent = '✏️ Edit';
  } else {
    // Open edit and pre-fill
    const d = currentUserData || {};
    document.getElementById('editName').value          = d.name        || '';
    document.getElementById('editPhone').value         = d.phone       || '';
    document.getElementById('editBloodGroup').value    = d.bloodGroup  || 'O+';
    document.getElementById('editCity').value          = d.city        || '';
    document.getElementById('editAvailability').value  = d.availability || 'Available';

    view.style.display    = 'none';
    editDiv.style.display = 'block';
    document.getElementById('editBtn').textContent = '✕ Cancel';
  }
}

async function saveProfile() {
  if (!currentUser) return;

  const updates = {
    name:         document.getElementById('editName').value.trim(),
    phone:        document.getElementById('editPhone').value.trim(),
    bloodGroup:   document.getElementById('editBloodGroup').value,
    city:         document.getElementById('editCity').value.trim(),
    availability: document.getElementById('editAvailability').value
  };

  if (!updates.name || !updates.city) {
    showToast('Name and city are required.', 'error'); return;
  }

  try {
    await db.collection('users').doc(currentUser.uid).update(updates);
    // Update local cache
    currentUserData = { ...currentUserData, ...updates };
    renderProfileView();
    toggleEdit();
    showToast('Profile updated! ✅', 'success');
  } catch (err) {
    showToast('Update failed: ' + err.message, 'error');
  }
}

// ════════════════════════════════════════════════════════════
// 12. AVAILABILITY TOGGLE
// ════════════════════════════════════════════════════════════
async function toggleAvailability() {
  if (!currentUser) return;
  const isAvail = document.getElementById('availToggle').checked;
  const status  = isAvail ? 'Available' : 'Not Available';

  try {
    await db.collection('users').doc(currentUser.uid).update({ availability: status });
    if (currentUserData) currentUserData.availability = status;
    renderProfileView();
    showToast('Status set to: ' + status, 'success');
  } catch (err) {
    showToast('Failed to update status.', 'error');
  }
}

// ════════════════════════════════════════════════════════════
// 13. MY REQUESTS — Real-time listener
// ════════════════════════════════════════════════════════════
function loadMyRequests() {
  if (!currentUser) return;

  const container = document.getElementById('myRequests');
  container.innerHTML = '<div class="loading-spinner"></div>';

  // Unsubscribe previous listener if any
  if (unsubRequests) unsubRequests();

  // Real-time listener filtered by current user's uid
  unsubRequests = db.collection('requests')
    .where('uid', '==', currentUser.uid)
    .orderBy('createdAt', 'desc')
    .limit(10)
    .onSnapshot(snapshot => {
      if (snapshot.empty) {
        container.innerHTML = `
          <div class="empty-state" style="padding:30px 0">
            <div class="empty-icon">📋</div>
            <h3>No requests yet</h3>
            <p>Post a blood request and it'll appear here.</p>
          </div>`;
        return;
      }

      container.innerHTML = snapshot.docs.map(doc => {
        const r = doc.data();
        const urgencyClass = (r.urgency || 'normal').toLowerCase();
        const date = r.createdAt ? formatDate(r.createdAt.toDate()) : 'Just now';
        return `
          <div class="request-item">
            <div class="req-info">
              <h4>${escHtml(r.patientName)} — ${escHtml(r.bloodGroup)}</h4>
              <p>📍 ${escHtml(r.city)} &nbsp;|&nbsp; 📞 ${escHtml(r.contact)} &nbsp;|&nbsp; ${date}</p>
            </div>
            <span class="urgency-pill ${urgencyClass}">${escHtml(r.urgency)}</span>
          </div>`;
      }).join('');
    }, err => {
      console.error(err);
      container.innerHTML = '<p style="color:var(--red);padding:16px">Failed to load requests.</p>';
    });
}

// ════════════════════════════════════════════════════════════
// 14. FIND DONORS — Search & Display
// ════════════════════════════════════════════════════════════
async function searchDonors() {
  const bloodGroup = document.getElementById('searchBlood').value;
  const city       = document.getElementById('searchCity').value.trim().toLowerCase();
  const grid       = document.getElementById('donorsGrid');
  const header     = document.getElementById('resultsHeader');

  // Show loading
  grid.innerHTML = '<div class="loading-spinner"></div>';
  header.style.display = 'none';

  try {
    // Build query — start with all available users
    let query = db.collection('users').where('availability', '==', 'Available');

    // Filter by blood group if selected
    if (bloodGroup) query = query.where('bloodGroup', '==', bloodGroup);

    const snapshot = await query.get();

    let donors = snapshot.docs.map(d => d.data());

    // Client-side city filter (case-insensitive partial match)
    if (city) {
      donors = donors.filter(d => d.city && d.city.toLowerCase().includes(city));
    }

    // Hide current user from results
    if (currentUser) {
      donors = donors.filter(d => d.uid !== currentUser.uid);
    }

    // Update results header
    header.style.display = 'flex';
    document.getElementById('resultsCount').textContent =
      `${donors.length} donor${donors.length !== 1 ? 's' : ''} found`;

    const filterParts = [];
    if (bloodGroup) filterParts.push(bloodGroup);
    if (city) filterParts.push(city.charAt(0).toUpperCase() + city.slice(1));
    document.getElementById('resultsFilter').textContent =
      filterParts.length ? '→ ' + filterParts.join(', ') : '';

    if (donors.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">😔</div>
          <h3>No donors found</h3>
          <p>Try a different blood group or city. You can also post a <a href="#" onclick="showPage('request')">blood request</a>.</p>
        </div>`;
      return;
    }

    // Render donor cards
    grid.innerHTML = donors.map(d => renderDonorCard(d)).join('');

  } catch (err) {
    console.error(err);
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Search failed</h3>
        <p>${err.message}</p>
      </div>`;
  }
}

/** Build HTML for a single donor card */
function renderDonorCard(d) {
  const initial     = d.name ? d.name[0].toUpperCase() : '?';
  const phone       = d.phone || '';
  const cleanPhone  = phone.replace(/\s+/g, '');
  const waMessage   = encodeURIComponent(`Hi ${d.name}, I found you on BloodBridge and urgently need ${d.bloodGroup} blood. Can you help?`);
  const waLink      = `https://wa.me/${cleanPhone.replace('+', '')}?text=${waMessage}`;
  const callLink    = `tel:${cleanPhone}`;

  return `
    <div class="donor-card">
      <div class="donor-card-header">
        <div class="donor-avatar">${initial}</div>
        <div>
          <div class="donor-name">${escHtml(d.name)}</div>
          <div class="donor-city">📍 ${escHtml(d.city)}</div>
        </div>
      </div>
      <div class="donor-meta">
        <span class="donor-blood-group">${escHtml(d.bloodGroup)}</span>
        <span class="status-badge available">✅ Available</span>
      </div>
      <div class="donor-actions">
        <a href="${callLink}" class="btn-call">📞 Call</a>
        <a href="${waLink}" class="btn-wa" target="_blank" rel="noopener">💬 WhatsApp</a>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// 15. REQUEST BLOOD PAGE — Init & Submit
// ════════════════════════════════════════════════════════════
function initRequestPage() {
  const authNotice  = document.getElementById('requestAuthNotice');
  const formWrap    = document.getElementById('requestFormWrap');

  // Show notice or form depending on auth state
  if (!currentUser) {
    authNotice.style.display = 'flex';
    formWrap.style.opacity   = '0.4';
    formWrap.style.pointerEvents = 'none';
  } else {
    authNotice.style.display = 'none';
    formWrap.style.opacity   = '1';
    formWrap.style.pointerEvents = 'auto';
  }

  loadRecentRequests();
}

async function submitRequest() {
  if (!currentUser) {
    showToast('You must be logged in to post a request.', 'error');
    showPage('auth');
    return;
  }

  const patientName = document.getElementById('reqPatient').value.trim();
  const contact     = document.getElementById('reqContact').value.trim();
  const bloodGroup  = document.getElementById('reqBlood').value;
  const city        = document.getElementById('reqCity').value.trim();
  const urgency     = document.querySelector('input[name="urgency"]:checked')?.value || 'Normal';
  const notes       = document.getElementById('reqNotes').value.trim();

  // Validation
  if (!patientName || !contact || !bloodGroup || !city) {
    showToast('Please fill in all required fields (*).', 'error'); return;
  }

  const btn = document.querySelector('#requestFormWrap .btn-primary');
  setLoading(btn, true, 'Submitting...');

  try {
    await db.collection('requests').add({
      uid:         currentUser.uid,
      postedBy:    currentUserData?.name || 'Anonymous',
      patientName,
      contact,
      bloodGroup,
      city,
      urgency,
      notes,
      createdAt:   firebase.firestore.FieldValue.serverTimestamp()
    });

    showToast('Blood request posted! 🩸 Donors will be notified.', 'success');

    // Reset form
    document.getElementById('reqPatient').value = '';
    document.getElementById('reqContact').value = '';
    document.getElementById('reqBlood').value   = '';
    document.getElementById('reqCity').value    = '';
    document.getElementById('reqNotes').value   = '';
    document.querySelector('input[name="urgency"][value="Normal"]').checked = true;

    loadRecentRequests();

  } catch (err) {
    showToast('Failed to submit request: ' + err.message, 'error');
  } finally {
    setLoading(btn, false, 'Submit Blood Request');
  }
}

/** Load the most recent blood requests (public) */
async function loadRecentRequests() {
  const container = document.getElementById('recentRequests');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const snapshot = await db.collection('requests')
      .orderBy('createdAt', 'desc')
      .limit(8)
      .get();

    if (snapshot.empty) {
      container.innerHTML = '<p style="color:var(--gray-500);font-size:0.88rem;text-align:center;padding:20px 0">No requests yet.</p>';
      return;
    }

    container.innerHTML = snapshot.docs.map(doc => {
      const r = doc.data();
      const urgencyClass = (r.urgency || 'normal').toLowerCase();
      const date = r.createdAt ? formatDate(r.createdAt.toDate()) : 'Just now';
      return `
        <div class="recent-req-item">
          <div class="recent-req-header">
            <span class="recent-req-name">🩸 ${escHtml(r.bloodGroup)} — ${escHtml(r.patientName)}</span>
            <span class="urgency-pill ${urgencyClass}">${escHtml(r.urgency)}</span>
          </div>
          <div class="recent-req-meta">
            📍 ${escHtml(r.city)} &nbsp;|&nbsp; 📞 ${escHtml(r.contact)} &nbsp;|&nbsp; ${date}
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    container.innerHTML = '<p style="color:var(--red);font-size:0.88rem;padding:16px 0">Failed to load requests.</p>';
  }
}

// ════════════════════════════════════════════════════════════
// 16. HOME PAGE — Live Stats Counter
// ════════════════════════════════════════════════════════════
async function loadHomeStats() {
  try {
    // Count total donors
    const usersSnap    = await db.collection('users').get();
    const requestsSnap = await db.collection('requests').get();

    animateCounter('statDonors',   usersSnap.size);
    animateCounter('statRequests', requestsSnap.size);
  } catch (e) {
    // If Firebase not yet configured, show placeholder
    document.getElementById('statDonors').textContent   = '—';
    document.getElementById('statRequests').textContent = '—';
  }
}

/**
 * Animate a number counter from 0 to target.
 * @param {string} elId   - element id
 * @param {number} target - end value
 */
function animateCounter(elId, target) {
  const el  = document.getElementById(elId);
  if (!el) return;
  let current = 0;
  const step  = Math.max(1, Math.floor(target / 40));
  const timer = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(timer); }
    el.textContent = current;
  }, 40);
}

// ════════════════════════════════════════════════════════════
// 17. UTILITIES
// ════════════════════════════════════════════════════════════

/** Set a button into loading state or back */
function setLoading(btn, isLoading, label) {
  if (!btn) return;
  btn.disabled   = isLoading;
  btn.textContent = isLoading ? '⏳ ' + label : label;
}

/** Escape HTML to prevent XSS */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format a JS Date to a short readable string */
function formatDate(date) {
  if (!date) return '';
  const now  = new Date();
  const diff = Math.floor((now - date) / 1000); // seconds ago

  if (diff < 60)   return 'Just now';
  if (diff < 3600) return Math.floor(diff / 60)  + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return date.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Turn Firebase auth error codes into user-friendly messages */
function friendlyAuthError(code) {
  const map = {
    'auth/email-already-in-use':    'This email is already registered. Try logging in.',
    'auth/invalid-email':           'Please enter a valid email address.',
    'auth/weak-password':           'Password must be at least 6 characters.',
    'auth/user-not-found':          'No account found with this email.',
    'auth/wrong-password':          'Incorrect password. Please try again.',
    'auth/too-many-requests':       'Too many attempts. Please wait and try again.',
    'auth/network-request-failed':  'Network error. Check your internet connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ════════════════════════════════════════════════════════════
// 18. BLOOD CARD CLICK — Quick search shortcut from home
// ════════════════════════════════════════════════════════════
document.querySelectorAll('.blood-card').forEach(card => {
  card.addEventListener('click', () => {
    const group = card.dataset.group;
    showPage('find');
    setTimeout(() => {
      document.getElementById('searchBlood').value = group;
      searchDonors();
    }, 100);
  });
});

// ════════════════════════════════════════════════════════════
// 19. NAVBAR SCROLL EFFECT
// ════════════════════════════════════════════════════════════
window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (window.scrollY > 20) {
    navbar.style.boxShadow = '0 4px 30px rgba(0,0,0,0.12)';
  } else {
    navbar.style.boxShadow = '0 2px 20px rgba(0,0,0,0.06)';
  }
});

// ════════════════════════════════════════════════════════════
// 20. INIT — Show home page on load
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  showPage('home');
});
