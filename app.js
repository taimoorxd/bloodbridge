/* ============================================================
   BloodBridge — app.js  (Updated v2)
   Separate Donor & Requester Accounts
   Firebase Authentication + Firestore Integration
   ============================================================ */

// ════════════════════════════════════════════════════════════
// 1. FIREBASE CONFIGURATION
// ════════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            "AIzaSyCWuIuGiM3Gs38fSgsZurq_UpvnNdJ5ak4",
  authDomain:        "bloodbridge-b7dba.firebaseapp.com",
  projectId:         "bloodbridge-b7dba",
  storageBucket:     "bloodbridge-b7dba.firebasestorage.app",
  messagingSenderId: "388871364561",
  appId:             "1:388871364561:web:a8432d9a329d1368920af0",
  measurementId:     "G-65GZ1Z4PF3"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// ════════════════════════════════════════════════════════════
// 2. GLOBAL STATE
// ════════════════════════════════════════════════════════════
let currentUser     = null;
let currentUserData = null;
let unsubRequests   = null;
let authInitialised = false;

// Tracks selected account type in signup form
let selectedAccountType = 'donor';

// ════════════════════════════════════════════════════════════
// 3. AUTH STATE OBSERVER
// ════════════════════════════════════════════════════════════
auth.onAuthStateChanged(async (user) => {
  currentUser = user;

  if (user) {
    try {
      const doc = await db.collection('users').doc(user.uid).get();
      if (doc.exists) currentUserData = doc.data();
    } catch (e) {
      console.error('Error fetching user data:', e);
    }
    updateNavForAuth(true);
    if (!authInitialised) showPage('dashboard');
  } else {
    currentUserData = null;
    updateNavForAuth(false);
    if (!authInitialised) showPage('home');
  }

  authInitialised = true;
});

// ════════════════════════════════════════════════════════════
// 4. NAVIGATION
// ════════════════════════════════════════════════════════════
function showPage(pageKey) {
  if (pageKey === 'dashboard' && !currentUser) {
    showToast('Please log in first.', 'error');
    showPage('auth');
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const target = document.getElementById('page-' + pageKey);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === pageKey);
  });

  document.getElementById('navLinks').classList.remove('open');

  // Page-specific init
  if (pageKey === 'dashboard') initDashboard();
  if (pageKey === 'find')      loadAllDonors();
  if (pageKey === 'request')   initRequestPage();
  if (pageKey === 'home')      loadHomeStats();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMenu() {
  document.getElementById('navLinks').classList.toggle('open');
}

function updateNavForAuth(isLoggedIn) {
  document.getElementById('navLogin').style.display     = isLoggedIn ? 'none'         : 'inline-flex';
  document.getElementById('navLogout').style.display    = isLoggedIn ? 'inline-block' : 'none';
  document.getElementById('navDashboard').style.display = isLoggedIn ? 'inline-block' : 'none';
}

// ════════════════════════════════════════════════════════════
// 5. TOAST NOTIFICATIONS
// ════════════════════════════════════════════════════════════
let toastTimer = null;

function showToast(message, type = 'info', duration = 3500) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ════════════════════════════════════════════════════════════
// 6. ACCOUNT TYPE SELECTOR (Signup)
// ════════════════════════════════════════════════════════════

/** Called when user clicks a type option in signup form */
function selectAcctType(type) {
  selectedAccountType = type;

  document.getElementById('typeOptDonor').classList.toggle('selected', type === 'donor');
  document.getElementById('typeOptRequester').classList.toggle('selected', type === 'requester');

  // Show/hide blood group row
  document.getElementById('bloodGroupRow').style.display  = type === 'donor' ? 'flex' : 'none';
  document.getElementById('cityOnlyRow').style.display    = type === 'requester' ? 'block' : 'none';

  const subtitle = document.getElementById('signupSubtitle');
  if (subtitle) {
    subtitle.textContent = type === 'donor'
      ? 'Register as a blood donor — appear in the donor directory'
      : 'Register as a patient — post blood requests for donors to see';
  }
}

// ════════════════════════════════════════════════════════════
// 7. AUTH — SIGNUP
// ════════════════════════════════════════════════════════════
async function handleSignup() {
  const name      = document.getElementById('signupName').value.trim();
  const phone     = document.getElementById('signupPhone').value.trim();
  const email     = document.getElementById('signupEmail').value.trim();
  const password  = document.getElementById('signupPassword').value;
  const acctType  = selectedAccountType; // 'donor' or 'requester'

  // Get city depending on which row is visible
  const city = acctType === 'donor'
    ? document.getElementById('signupCity').value.trim()
    : document.getElementById('signupCityRequester').value.trim();

  // Blood group only for donors
  const bloodGroup = acctType === 'donor'
    ? document.getElementById('signupBloodGroup').value
    : '';

  // Validation
  if (!name || !phone || !email || !password || !city) {
    showToast('Please fill in all fields.', 'error'); return;
  }
  if (acctType === 'donor' && !bloodGroup) {
    showToast('Please select your blood group.', 'error'); return;
  }
  if (password.length < 6) {
    showToast('Password must be at least 6 characters.', 'error'); return;
  }

  const btn = document.querySelector('#signupForm .btn-primary');
  setLoading(btn, true, 'Creating Account...');

  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const uid = userCredential.user.uid;

    const userData = {
      uid,
      name,
      phone,
      email,
      city,
      accountType: acctType,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (acctType === 'donor') {
      userData.bloodGroup   = bloodGroup;
      userData.availability = 'Available';
    }

    await db.collection('users').doc(uid).set(userData);
    currentUserData = { ...userData };

    const roleLabel = acctType === 'donor' ? 'Donor' : 'Patient/Requester';
    showToast(`Account created! Welcome, ${name} — registered as ${roleLabel} 🎉`, 'success');
    showPage('dashboard');

  } catch (err) {
    showToast(friendlyAuthError(err.code), 'error');
  } finally {
    setLoading(btn, false, 'Create Account');
  }
}

// ════════════════════════════════════════════════════════════
// 8. AUTH — LOGIN
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
// 9. AUTH — LOGOUT
// ════════════════════════════════════════════════════════════
async function handleLogout() {
  try {
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
// 10. AUTH — SWITCH TAB
// ════════════════════════════════════════════════════════════
function switchAuthTab(tab) {
  document.getElementById('loginForm').style.display  = tab === 'login'  ? 'block' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('tabLogin').classList.toggle('active',  tab === 'login');
  document.getElementById('tabSignup').classList.toggle('active', tab === 'signup');

  // Reset account type selector to donor on each open
  if (tab === 'signup') selectAcctType('donor');
}

// ════════════════════════════════════════════════════════════
// 11. DASHBOARD — INIT (Role-Based)
// ════════════════════════════════════════════════════════════
async function initDashboard() {
  if (!currentUser) return;

  if (!currentUserData) {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists) currentUserData = doc.data();
  }

  const acctType = currentUserData?.accountType || 'donor';

  // Update dashboard header
  const dashTitle    = document.getElementById('dashTitle');
  const dashSubtitle = document.getElementById('dashSubtitle');
  if (acctType === 'donor') {
    dashTitle.textContent    = '🩸 Donor Dashboard';
    dashSubtitle.textContent = 'Manage your donor profile and availability';
  } else {
    dashTitle.textContent    = '💉 Patient Dashboard';
    dashSubtitle.textContent = 'Manage your profile and blood requests';
  }

  // Show role badge
  const roleBadgeWrap = document.getElementById('roleBadgeWrap');
  const roleBadge     = document.getElementById('roleBadge');
  roleBadgeWrap.style.display = 'block';
  roleBadge.textContent = acctType === 'donor' ? '🩸 Donor Account' : '💉 Patient / Requester Account';
  roleBadge.className = 'role-badge ' + (acctType === 'donor' ? 'role-donor' : 'role-requester');

  // Show/hide blood group row in profile view
  const bloodRow = document.getElementById('bloodRow');
  const statusRow = document.getElementById('statusRow');
  if (bloodRow)  bloodRow.style.display  = acctType === 'donor' ? 'flex' : 'none';
  if (statusRow) statusRow.style.display = acctType === 'donor' ? 'flex' : 'none';

  // Show/hide availability toggle (donors only)
  const availCard = document.getElementById('availCardSection');
  if (availCard) availCard.style.display = acctType === 'donor' ? 'block' : 'none';

  // Show/hide my requests card (requesters only)
  const reqCard = document.getElementById('myRequestsCardSection');
  if (reqCard) reqCard.style.display = acctType === 'requester' ? 'block' : 'none';

  // Show/hide edit form rows
  const editBloodRow   = document.getElementById('editBloodRow');
  const editCityOnly   = document.getElementById('editCityOnlyRow');
  const editAvailRow   = document.getElementById('editAvailRow');
  if (editBloodRow) editBloodRow.style.display = acctType === 'donor' ? 'flex' : 'none';
  if (editCityOnly) editCityOnly.style.display = acctType === 'requester' ? 'block' : 'none';
  if (editAvailRow) editAvailRow.style.display = acctType === 'donor' ? 'block' : 'none';

  // Build quick actions based on role
  const quickActionsWrap = document.getElementById('quickActionsWrap');
  if (quickActionsWrap) {
    if (acctType === 'donor') {
      quickActionsWrap.innerHTML = `
        <button class="action-btn" onclick="showPage('find')"><span>🔍</span> View Donor Directory</button>
        <button class="action-btn" onclick="showPage('request')"><span>💉</span> View Blood Requests</button>
        <button class="action-btn" onclick="handleLogout()"><span>🚪</span> Logout</button>`;
    } else {
      quickActionsWrap.innerHTML = `
        <button class="action-btn" onclick="showPostRequestForm()"><span>🩸</span> Post a Blood Request</button>
        <button class="action-btn" onclick="showPage('find')"><span>🔍</span> Find Donors</button>
        <button class="action-btn" onclick="showPage('request')"><span>📋</span> View All Requests</button>
        <button class="action-btn" onclick="handleLogout()"><span>🚪</span> Logout</button>`;
    }
  }

  renderProfileView();

  if (acctType === 'requester') loadMyRequests();
}

// ════════════════════════════════════════════════════════════
// 12. DASHBOARD — RENDER PROFILE
// ════════════════════════════════════════════════════════════
function renderProfileView() {
  if (!currentUserData) return;
  const d = currentUserData;

  document.getElementById('profileAvatar').textContent = d.name ? d.name[0].toUpperCase() : '?';
  document.getElementById('dName').textContent  = d.name  || '—';
  document.getElementById('dEmail').textContent = d.email || '—';
  document.getElementById('dPhone').textContent = d.phone || '—';
  document.getElementById('dCity').textContent  = d.city  || '—';

  const bloodEl = document.getElementById('dBlood');
  if (bloodEl) bloodEl.textContent = d.bloodGroup || '—';

  const statusEl = document.getElementById('dStatus');
  if (statusEl && d.accountType === 'donor') {
    const isAvail = d.availability === 'Available';
    statusEl.textContent = isAvail ? '✅ Available' : '❌ Not Available';
    statusEl.className   = 'status-badge ' + (isAvail ? 'available' : 'unavailable');
    const toggle = document.getElementById('availToggle');
    if (toggle) toggle.checked = isAvail;
  }
}

// ════════════════════════════════════════════════════════════
// 13. DASHBOARD — EDIT PROFILE
// ════════════════════════════════════════════════════════════
function toggleEdit() {
  const view    = document.getElementById('profileView');
  const editDiv = document.getElementById('profileEdit');
  const editing = editDiv.style.display === 'block';

  if (editing) {
    editDiv.style.display = 'none';
    view.style.display    = 'block';
    document.getElementById('editBtn').textContent = '✏️ Edit';
  } else {
    const d = currentUserData || {};
    document.getElementById('editName').value = d.name  || '';
    document.getElementById('editPhone').value = d.phone || '';

    const acctType = d.accountType || 'donor';
    if (acctType === 'donor') {
      document.getElementById('editBloodGroup').value   = d.bloodGroup  || 'O+';
      document.getElementById('editCity').value         = d.city        || '';
      document.getElementById('editAvailability').value = d.availability || 'Available';
    } else {
      document.getElementById('editCityOnly').value = d.city || '';
    }

    view.style.display    = 'none';
    editDiv.style.display = 'block';
    document.getElementById('editBtn').textContent = '✕ Cancel';
  }
}

async function saveProfile() {
  if (!currentUser) return;
  const acctType = currentUserData?.accountType || 'donor';

  const updates = {
    name:  document.getElementById('editName').value.trim(),
    phone: document.getElementById('editPhone').value.trim(),
  };

  if (acctType === 'donor') {
    updates.bloodGroup   = document.getElementById('editBloodGroup').value;
    updates.city         = document.getElementById('editCity').value.trim();
    updates.availability = document.getElementById('editAvailability').value;
  } else {
    updates.city = document.getElementById('editCityOnly').value.trim();
  }

  if (!updates.name || !updates.city) {
    showToast('Name and city are required.', 'error'); return;
  }

  try {
    await db.collection('users').doc(currentUser.uid).update(updates);
    currentUserData = { ...currentUserData, ...updates };
    renderProfileView();
    toggleEdit();
    showToast('Profile updated! ✅', 'success');
  } catch (err) {
    showToast('Update failed: ' + err.message, 'error');
  }
}

// ════════════════════════════════════════════════════════════
// 14. AVAILABILITY TOGGLE (Donors only)
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
// 15. MY REQUESTS — Real-time listener (Requester Dashboard)
// ════════════════════════════════════════════════════════════
function loadMyRequests() {
  if (!currentUser) return;

  const container = document.getElementById('myRequests');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner"></div>';

  if (unsubRequests) unsubRequests();

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
              ${r.notes ? `<p style="font-size:0.8rem;color:var(--gray-500);margin-top:2px">📝 ${escHtml(r.notes)}</p>` : ''}
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
// 16. FIND DONORS — Auto-load all donors on page open
// ════════════════════════════════════════════════════════════
async function loadAllDonors() {
  await searchDonors();
}

async function searchDonors() {
  const bloodGroup = document.getElementById('searchBlood')?.value || '';
  const city       = document.getElementById('searchCity')?.value.trim().toLowerCase() || '';
  const avail      = document.getElementById('searchAvail')?.value || '';

  const grid   = document.getElementById('donorsGrid');
  const header = document.getElementById('resultsHeader');
  if (!grid) return;

  grid.innerHTML   = '<div class="loading-spinner" style="grid-column:1/-1"></div>';
  if (header) header.style.display = 'flex';

  try {
    // Start query — filter by availability if requested
    let query = db.collection('users').where('accountType', '==', 'donor');
    if (avail === 'Available') query = query.where('availability', '==', 'Available');
    if (bloodGroup) query = query.where('bloodGroup', '==', bloodGroup);

    const snapshot = await query.get();
    let donors = snapshot.docs.map(d => d.data());

    // Client-side city filter
    if (city) {
      donors = donors.filter(d => d.city && d.city.toLowerCase().includes(city));
    }

    // Hide current user from results
    if (currentUser) {
      donors = donors.filter(d => d.uid !== currentUser.uid);
    }

    // Sort: available first
    donors.sort((a, b) => {
      if (a.availability === 'Available' && b.availability !== 'Available') return -1;
      if (b.availability === 'Available' && a.availability !== 'Available') return 1;
      return 0;
    });

    // Update header
    const countEl  = document.getElementById('resultsCount');
    const filterEl = document.getElementById('resultsFilter');
    if (countEl) countEl.textContent = `${donors.length} donor${donors.length !== 1 ? 's' : ''} listed`;
    const filterParts = [];
    if (bloodGroup) filterParts.push(bloodGroup);
    if (city)       filterParts.push(city.charAt(0).toUpperCase() + city.slice(1));
    if (avail)      filterParts.push(avail + ' only');
    if (filterEl)   filterEl.textContent = filterParts.length ? '→ ' + filterParts.join(', ') : '→ All Donors';

    if (donors.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">😔</div>
          <h3>No donors found</h3>
          <p>Try adjusting your filters. You can also <a href="#" onclick="showPage('request')">browse blood requests</a>.</p>
        </div>`;
      return;
    }

    grid.innerHTML = donors.map(d => renderDonorCard(d)).join('');

  } catch (err) {
    console.error(err);
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Failed to load donors</h3>
        <p>${err.message}</p>
      </div>`;
  }
}

/** Build HTML for a single donor card */
function renderDonorCard(d) {
  const initial    = d.name ? d.name[0].toUpperCase() : '?';
  const phone      = d.phone || '';
  const cleanPhone = phone.replace(/\s+/g, '');
  const waMessage  = encodeURIComponent(`Hi ${d.name}, I found you on BloodBridge and urgently need ${d.bloodGroup} blood. Can you help?`);
  const waLink     = `https://wa.me/${cleanPhone.replace('+', '')}?text=${waMessage}`;
  const callLink   = `tel:${cleanPhone}`;
  const isAvail    = d.availability === 'Available';

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
        <span class="status-badge ${isAvail ? 'available' : 'unavailable'}">${isAvail ? '✅ Available' : '❌ Unavailable'}</span>
      </div>
      <div class="donor-contact-row">
        <span style="font-size:0.82rem;color:var(--gray-500)">📞 ${escHtml(d.phone || 'N/A')}</span>
      </div>
      <div class="donor-actions">
        <a href="${callLink}" class="btn-call">📞 Call</a>
        <a href="${waLink}" class="btn-wa" target="_blank" rel="noopener">💬 WhatsApp</a>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// 17. BLOOD REQUESTS PAGE — Init & Load All Requests
// ════════════════════════════════════════════════════════════
function initRequestPage() {
  const acctType = currentUserData?.accountType;

  // Show "Post Request" button only for logged-in requesters
  const postBtn = document.getElementById('postReqTopBtn');
  if (postBtn) {
    postBtn.style.display = (currentUser && acctType === 'requester') ? 'inline-flex' : 'none';
  }

  // Load all requests
  loadAllRequests();
}

/** Show the post request form (in the requests page or dashboard) */
function showPostRequestForm() {
  // If not logged in, redirect to auth
  if (!currentUser) {
    showToast('Please log in as a Patient/Requester to post a request.', 'error');
    showPage('auth');
    return;
  }

  // If logged in as donor, block
  if (currentUserData?.accountType === 'donor') {
    showToast('Only Patient/Requester accounts can post blood requests.', 'error');
    return;
  }

  // Navigate to request page and show form
  showPage('request');
  setTimeout(() => {
    const section = document.getElementById('postRequestSection');
    if (section) {
      section.style.display = 'block';
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
}

function hidePostRequestForm() {
  const section = document.getElementById('postRequestSection');
  if (section) section.style.display = 'none';
}

/** Load all blood requests with optional filters */
async function loadAllRequests() {
  const bloodFilter   = document.getElementById('reqFilterBlood')?.value || '';
  const cityFilter    = document.getElementById('reqFilterCity')?.value.trim().toLowerCase() || '';
  const urgencyFilter = document.getElementById('reqFilterUrgency')?.value || '';

  const grid       = document.getElementById('requestsGrid');
  const countEl    = document.getElementById('reqResultsCount');
  const filterEl   = document.getElementById('reqResultsFilter');
  if (!grid) return;

  grid.innerHTML = '<div class="loading-spinner" style="grid-column:1/-1"></div>';

  try {
    let query = db.collection('requests').orderBy('createdAt', 'desc');
    if (bloodFilter)   query = db.collection('requests').where('bloodGroup', '==', bloodFilter).orderBy('createdAt', 'desc');
    if (urgencyFilter) query = db.collection('requests').where('urgency', '==', urgencyFilter).orderBy('createdAt', 'desc');
    if (bloodFilter && urgencyFilter) {
      query = db.collection('requests')
        .where('bloodGroup', '==', bloodFilter)
        .where('urgency', '==', urgencyFilter)
        .orderBy('createdAt', 'desc');
    }

    const snapshot = await query.limit(50).get();
    let requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Client-side city filter
    if (cityFilter) {
      requests = requests.filter(r => r.city && r.city.toLowerCase().includes(cityFilter));
    }

    // Update count
    if (countEl) countEl.textContent = `${requests.length} request${requests.length !== 1 ? 's' : ''} listed`;
    const filterParts = [];
    if (bloodFilter)   filterParts.push(bloodFilter);
    if (cityFilter)    filterParts.push(cityFilter.charAt(0).toUpperCase() + cityFilter.slice(1));
    if (urgencyFilter) filterParts.push(urgencyFilter);
    if (filterEl)      filterEl.textContent = filterParts.length ? '→ ' + filterParts.join(', ') : '→ All Requests';

    if (requests.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💉</div>
          <h3>No requests found</h3>
          <p>No blood requests match your filters. Try different criteria.</p>
        </div>`;
      return;
    }

    grid.innerHTML = requests.map(r => renderRequestCard(r)).join('');

  } catch (err) {
    console.error(err);
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Failed to load requests</h3>
        <p>${err.message}</p>
      </div>`;
  }
}

/** Build HTML for a single request card */
function renderRequestCard(r) {
  const phone      = r.contact || '';
  const cleanPhone = phone.replace(/\s+/g, '');
  const waMessage  = encodeURIComponent(`Hi, I saw your blood request on BloodBridge for ${r.bloodGroup} blood. I'd like to help.`);
  const waLink     = `https://wa.me/${cleanPhone.replace('+', '')}?text=${waMessage}`;
  const callLink   = `tel:${cleanPhone}`;
  const urgencyClass = (r.urgency || 'normal').toLowerCase();
  const date       = r.createdAt ? formatDate(r.createdAt.toDate()) : 'Just now';
  const initial    = r.patientName ? r.patientName[0].toUpperCase() : '?';

  return `
    <div class="donor-card request-dir-card">
      <div class="donor-card-header">
        <div class="donor-avatar req-avatar">${initial}</div>
        <div>
          <div class="donor-name">${escHtml(r.patientName)}</div>
          <div class="donor-city">📍 ${escHtml(r.city)} &nbsp;·&nbsp; ${date}</div>
        </div>
      </div>
      <div class="donor-meta">
        <span class="donor-blood-group">${escHtml(r.bloodGroup)}</span>
        <span class="urgency-pill ${urgencyClass}">${escHtml(r.urgency)}</span>
      </div>
      <div class="donor-contact-row">
        <span style="font-size:0.82rem;color:var(--gray-500)">📞 ${escHtml(r.contact || 'N/A')}</span>
      </div>
      ${r.notes ? `<div style="font-size:0.82rem;color:var(--gray-700);background:var(--gray-100);padding:8px 10px;border-radius:6px">📝 ${escHtml(r.notes)}</div>` : ''}
      <div class="donor-actions">
        <a href="${callLink}" class="btn-call">📞 Call</a>
        <a href="${waLink}" class="btn-wa" target="_blank" rel="noopener">💬 WhatsApp</a>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// 18. SUBMIT BLOOD REQUEST
// ════════════════════════════════════════════════════════════
async function submitRequest() {
  if (!currentUser) {
    showToast('You must be logged in to post a request.', 'error');
    showPage('auth');
    return;
  }

  if (currentUserData?.accountType !== 'requester') {
    showToast('Only Patient/Requester accounts can post blood requests.', 'error');
    return;
  }

  const patientName = document.getElementById('reqPatient').value.trim();
  const contact     = document.getElementById('reqContact').value.trim();
  const bloodGroup  = document.getElementById('reqBlood').value;
  const city        = document.getElementById('reqCity').value.trim();
  const urgency     = document.querySelector('input[name="urgency"]:checked')?.value || 'Normal';
  const notes       = document.getElementById('reqNotes').value.trim();

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

    showToast('Blood request posted! 🩸 Donors will see this.', 'success');

    // Reset form
    document.getElementById('reqPatient').value = '';
    document.getElementById('reqContact').value = '';
    document.getElementById('reqBlood').value   = '';
    document.getElementById('reqCity').value    = '';
    document.getElementById('reqNotes').value   = '';
    document.querySelector('input[name="urgency"][value="Normal"]').checked = true;

    hidePostRequestForm();
    loadAllRequests();

    // Also refresh my requests if on dashboard
    if (document.getElementById('myRequests')) loadMyRequests();

  } catch (err) {
    showToast('Failed to submit request: ' + err.message, 'error');
  } finally {
    setLoading(btn, false, 'Submit Blood Request');
  }
}

// ════════════════════════════════════════════════════════════
// 19. HOME PAGE — Live Stats Counter
// ════════════════════════════════════════════════════════════
async function loadHomeStats() {
  try {
    const donorsSnap   = await db.collection('users').where('accountType', '==', 'donor').get();
    const requestsSnap = await db.collection('requests').get();
    animateCounter('statDonors',   donorsSnap.size);
    animateCounter('statRequests', requestsSnap.size);
  } catch (e) {
    document.getElementById('statDonors').textContent   = '—';
    document.getElementById('statRequests').textContent = '—';
  }
}

function animateCounter(elId, target) {
  const el = document.getElementById(elId);
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
// 20. UTILITIES
// ════════════════════════════════════════════════════════════
function setLoading(btn, isLoading, label) {
  if (!btn) return;
  btn.disabled    = isLoading;
  btn.textContent = isLoading ? '⏳ ' + label : label;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(date) {
  if (!date) return '';
  const now  = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return Math.floor(diff / 60)  + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return date.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

function friendlyAuthError(code) {
  const map = {
    'auth/email-already-in-use':   'This email is already registered. Try logging in.',
    'auth/invalid-email':          'Please enter a valid email address.',
    'auth/weak-password':          'Password must be at least 6 characters.',
    'auth/user-not-found':         'No account found with this email.',
    'auth/wrong-password':         'Incorrect password. Please try again.',
    'auth/too-many-requests':      'Too many attempts. Please wait and try again.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ════════════════════════════════════════════════════════════
// 21. BLOOD CARD CLICK — Quick search shortcut from home
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
// 22. NAVBAR SCROLL EFFECT
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
// 23. INIT
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Auth state change handles page routing automatically
});
