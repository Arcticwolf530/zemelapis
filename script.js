// ==========================================
// SUPABASE PRISIJUNGIMAS IR SEANSAS
// ==========================================
const SUPABASE_URL = 'https://hxbkmstegyimjkbnlgfa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lfVhNCx5D-iVDFOm44vjHQ_ErK0Zsnt';

const REMEMBER_KEY = 'zygiai_remember';
const authStorage = {
    getItem: (k) => localStorage.getItem(k) ?? sessionStorage.getItem(k),
    setItem: (k, v) => {
        const keep = localStorage.getItem(REMEMBER_KEY) !== '0';
        (keep ? localStorage : sessionStorage).setItem(k, v);
        (keep ? sessionStorage : localStorage).removeItem(k);
    },
    removeItem: (k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); }
};

let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { storage: authStorage, persistSession: true, autoRefreshToken: true }
    });
}

const TILE_URL = 'https://api.maptiler.com/maps/topo-v4/256/{z}/{x}/{y}.png?key=fyz6kNYuQtvSwaBwX6CJ';
const TILE_OPTIONS = { attribution: '&copy; MapTiler &copy; OpenStreetMap', maxZoom: 19 };
const DEFAULT_CENTER = [54.74622, 25.21294];
const DEFAULT_ZOOM = 13;
const LINE_WEIGHT = 6;

const ICONS = {
    walk: '<circle cx="13" cy="4" r="2"/><path d="M12 8l-2 5 3 3v5M10 13l-3 2M12 8l4 3"/>',
    hike: '<path d="M3 20l6-11 4 6 3-4 5 9z"/>',
    run: '<circle cx="14" cy="4" r="2"/><path d="M13 8l-3 4 4 2 1 6M10 12l-4 1M13 8l4 3h3"/>',
    bike: '<circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M5.5 17l4-8h5l4 8M9.5 9l2.5 8M14 6h2"/>',
    other: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>'
};
const ACTIVITIES = {
    walk:  { label: 'Ėjimas',   noun: 'ėjimas',     pace: true,  maxSpeed: 8,  minStep: 5 },
    hike:  { label: 'Žygis',    noun: 'žygis',      pace: true,  maxSpeed: 8,  minStep: 5 },
    run:   { label: 'Bėgimas',  noun: 'bėgimas',    pace: true,  maxSpeed: 12, minStep: 5 },
    bike:  { label: 'Dviratis', noun: 'važiavimas', pace: false, maxSpeed: 25, minStep: 8 },
    other: { label: 'Kita',     noun: 'užsiėmimas', pace: false, maxSpeed: 30, minStep: 8 }
};
let selectedActivity = 'walk';
const iconSvg = (type, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[type] || ICONS.other}</svg>`;

function fmtSpeedFor(type, ms) {
    const a = ACTIVITIES[type] || ACTIVITIES.walk;
    if (a.pace) {
        if (!(ms > 0.3)) return '--';
        const sec = Math.round(1000 / ms);
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} /km`;
    }
    return `${(ms * 3.6).toFixed(1)} km/h`;
}

let map = null;
let mapHistory = null;
let mapSocial = null;

const historyPolylineMap = new Map();
const socialPolylineMap = new Map();

const colors = ['#384a31', '#1f6feb', '#0e9f6e', '#e11d48', '#f59e0b', '#8b5cf6'];
let selectedColor = colors[0];
let linesData = [];
let publicLinesData = [];
let userProfiles = new Map();

let watchId = null, timerInterval = null, totalElapsed = 0;
let userMarker = null, accuracyCircle = null, isGpsRecording = false;
let currentLineData = null, currentPolyline = null;
let appStarted = false;
let currentUserId = null;

// AUTENTIFIKACIJOS VALDYMAS
const authContainer = document.getElementById('authContainer');
const appContainer = document.getElementById('appContainer');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authTitle = document.getElementById('authTitle');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const toggleAuthBtn = document.getElementById('toggleAuthBtn');
const toggleAuthText = document.getElementById('toggleAuthText');
const userEmailDisplay = document.getElementById('userEmailDisplay');
const logoutBtn = document.getElementById('logoutBtn');

const authUsername = document.getElementById('authUsername');
const usernameGroup = document.getElementById('usernameGroup');
const authRow = document.getElementById('authRow');
const rememberMe = document.getElementById('rememberMe');
const forgotBtn = document.getElementById('forgotBtn');
const authToggleRow = document.getElementById('authToggleRow');
const otpForm = document.getElementById('otpForm');
const otpCode = document.getElementById('otpCode');
const otpHint = document.getElementById('otpHint');
const resendOtpBtn = document.getElementById('resendOtpBtn');
const forgotForm = document.getElementById('forgotForm');
const forgotEmail = document.getElementById('forgotEmail');
const resetForm = document.getElementById('resetForm');
const resetCode = document.getElementById('resetCode');
const resetPassword = document.getElementById('resetPassword');
const authMsg = document.getElementById('authMsg');

let authView = 'signin';
let pendingEmail = '';
let recoveryVerified = false;

const AUTH_TITLES = {
    signin: 'Prisijungimas',
    signup: 'Registracija',
    verify: 'El. pašto patvirtinimas',
    forgot: 'Slaptažodžio atstatymas',
    reset: 'Naujas slaptažodis'
};

function setAuthMsg(text, isError = false) {
    if (!authMsg) return;
    authMsg.textContent = text || '';
    authMsg.classList.toggle('hidden', !text);
    authMsg.classList.toggle('error', !!isError);
}

function showAuthView(view) {
    authView = view;
    const main = view === 'signin' || view === 'signup';
    if (authTitle) authTitle.textContent = AUTH_TITLES[view];
    if (authForm) authForm.classList.toggle('hidden', !main);
    if (authToggleRow) authToggleRow.classList.toggle('hidden', !main);
    if (usernameGroup) usernameGroup.classList.toggle('hidden', view !== 'signup');
    if (authRow) authRow.classList.toggle('hidden', view !== 'signin');
    if (otpForm) otpForm.classList.toggle('hidden', view !== 'verify');
    if (forgotForm) forgotForm.classList.toggle('hidden', view !== 'forgot');
    if (resetForm) resetForm.classList.toggle('hidden', view !== 'reset');
    if (authSubmitBtn) authSubmitBtn.textContent = view === 'signup' ? 'Registruotis' : 'Prisijungti';
    if (toggleAuthText) toggleAuthText.textContent = view === 'signup' ? 'Jau turite paskyrą?' : 'Neturite paskyros?';
    if (toggleAuthBtn) toggleAuthBtn.textContent = view === 'signup' ? 'Prisijungti' : 'Registruotis';
    if (view === 'forgot') recoveryVerified = false;
    setAuthMsg('');
}

function applyRemember() {
    try { localStorage.setItem(REMEMBER_KEY, rememberMe && rememberMe.checked ? '1' : '0'); } catch (_) {}
}

async function runBusy(form, fn) {
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try { await fn(); }
    catch (err) { setAuthMsg('Klaida: ' + err.message, true); }
    finally { if (btn) btn.disabled = false; }
}

function startVerify(email) {
    pendingEmail = email;
    if (otpCode) otpCode.value = '';
    showAuthView('verify');
    if (otpHint) otpHint.textContent = `Išsiuntėme 6 skaitmenų kodą į ${email}. Įveskite jį žemiau.`;
    if (otpCode) otpCode.focus();
}

const onlyDigits = (v) => v.replace(/\D/g, '');

if (toggleAuthBtn) {
    toggleAuthBtn.onclick = (e) => {
        e.preventDefault();
        showAuthView(authView === 'signin' ? 'signup' : 'signin');
    };
}
document.querySelectorAll('.js-auth-back').forEach(b => b.onclick = () => showAuthView('signin'));
if (forgotBtn) forgotBtn.onclick = () => {
    if (forgotEmail && authEmail) forgotEmail.value = authEmail.value;
    showAuthView('forgot');
};

if (otpCode) otpCode.oninput = () => otpCode.value = onlyDigits(otpCode.value);
if (resetCode) resetCode.oninput = () => resetCode.value = onlyDigits(resetCode.value);

if (authForm) {
    authForm.onsubmit = async (e) => {
        e.preventDefault();
        applyRemember();
        const email = authEmail.value.trim();
        const password = authPassword.value;

        if (authView === 'signup') {
            const username = authUsername.value.trim();
            if (username.length < 3) return setAuthMsg('Vartotojo vardas turi būti bent 3 simbolių!', true);

            await runBusy(authForm, async () => {
                const { error } = await supabaseClient.auth.signUp({
                    email,
                    password,
                    options: { data: { username } }
                });
                if (error) throw error;
                await supabaseClient.auth.signOut();
                startVerify(email);
                setAuthMsg('Registracija sėkminga! Įveskite el. paštu gautą kodą.');
            });
        } else {
            await runBusy(authForm, async () => {
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (error) throw error;
                initApp(data.user);
            });
        }
    };
}

if (otpForm) {
    otpForm.onsubmit = async (e) => {
        e.preventDefault();
        const token = otpCode.value.trim();
        if (token.length !== 6) return setAuthMsg('Įveskite 6 skaitmenų kodą!', true);

        await runBusy(otpForm, async () => {
            const { error } = await supabaseClient.auth.verifyOtp({
                email: pendingEmail,
                token,
                type: 'signup'
            });
            if (error) throw error;
            setAuthMsg('El. paštas patvirtintas! Galite prisijungti.');
            setTimeout(() => showAuthView('signin'), 1500);
        });
    };
}

if (logoutBtn) {
    logoutBtn.onclick = async () => {
        await supabaseClient.auth.signOut();
        location.reload();
    };
}

if (supabaseClient) {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
            initApp(session.user);
        } else {
            if (authContainer) authContainer.classList.remove('hidden');
        }
    });
}

// PROGRAMOS PALEIDIMAS IR DUOMENŲ UŽKROVIMAS
async function initApp(user) {
    currentUserId = user.id;
    if (authContainer) authContainer.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');
    if (userEmailDisplay) userEmailDisplay.textContent = user.email;

    if (!appStarted) {
        appStarted = true;
        initMaps();
        setupUIEvents();
        await loadProfiles();
        await loadSavedHikes();
        await loadPublicHikes();
    }
}

async function loadProfiles() {
    try {
        const { data, error } = await supabaseClient.from('profiles').select('id, username');
        if (!error && data) {
            data.forEach(p => userProfiles.set(p.id, p.username));
        }
    } catch (e) { console.error('Profilių klaida:', e); }
}

function getUsername(userId) {
    return userProfiles.get(userId) || ('zygininkas_' + String(userId).substring(0, 6));
}

function createMap(id) {
    const m = L.map(id, { zoomControl: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(m);
    L.control.zoom({ position: 'topright' }).addTo(m);
    return m;
}

function initMaps() {
    map = createMap('map');
    mapHistory = createMap('map-history');
    mapSocial = createMap('map-social');
}

// DUOMENŲ IŠSAUGOJIMAS IR UŽKROVIMAS IŠ SUPABASE
async function loadSavedHikes() {
    const { data, error } = await supabaseClient.from('zygiai').select('*').eq('user_id', currentUserId);
    if (error) { console.error('Klaida kraunant žygius:', error.message); return; }
    
    linesData = (data || []).map(item => ({
        id: item.id,
        user_id: item.user_id,
        name: item.pavadinimas || item.title || 'Žygis',
        color: item.spalva || item.color || '#384a31',
        points: item.koordinates || item.coordinates || [],
        distance: item.atstumas ? parseFloat(item.atstumas) : (item.distance || 0),
        duration: item.laikas ? parseTimeToSec(item.laikas) : (item.duration || 0),
        elevationGain: item.elevationGain || 0,
        is_public: !!item.is_public,
        date: item.created_at ? new Date(item.created_at).toLocaleDateString('lt-LT') : '-'
    }));

    renderHistoryPolylines();
}

async function loadPublicHikes() {
    const { data, error } = await supabaseClient.from('zygiai').select('*').eq('is_public', true);
    if (error) return;

    publicLinesData = (data || []).map(item => ({
        id: item.id,
        user_id: item.user_id,
        name: item.pavadinimas || item.title || 'Viešas žygis',
        color: item.spalva || item.color || '#10b981',
        points: item.koordinates || item.coordinates || [],
        distance: item.atstumas ? parseFloat(item.atstumas) : (item.distance || 0),
        duration: item.laikas ? parseTimeToSec(item.laikas) : (item.duration || 0),
        is_public: true
    }));

    renderSocialMap();
    renderUsersList();
}

async function isaugotiISupabase(lineData) {
    const sharePublicInput = document.getElementById('sharePublic');
    const isPublic = sharePublicInput ? sharePublicInput.checked : false;

    const payload = {
        user_id: currentUserId,
        pavadinimas: lineData.name,
        spalva: lineData.color,
        koordinates: lineData.points,
        atstumas: formatDist(lineData.distance),
        laikas: formatTime(lineData.duration),
        greitis: fmtSpeedFor('walk', lineData.duration > 0 ? lineData.distance / lineData.duration : 0),
        is_public: isPublic
    };

    try {
        const { data, error } = await supabaseClient.from('zygiai').insert([payload]).select();
        if (error) throw error;

        alert('Žygis sėkmingai išsaugotas!');
        await loadSavedHikes();
        await loadPublicHikes();
        return true;
    } catch (err) {
        console.error('Klaida išsaugant:', err);
        alert('Išsaugoti nepavyko: ' + err.message);
        return false;
    }
}

function parseTimeToSec(str) {
    if (!str || typeof str !== 'string') return 0;
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
}

const formatTime = (sec) => {
    sec = Math.floor(sec);
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    const h = Math.floor(sec / 3600);
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
};

const formatDist = (m) => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';

// ŽEMĖLAPIŲ ATVAIZDAVIMAS
function renderHistoryPolylines() {
    if (!mapHistory) return;
    historyPolylineMap.forEach(p => mapHistory.removeLayer(p));
    historyPolylineMap.clear();

    const bounds = L.latLngBounds();
    linesData.forEach(line => {
        if (!line.points || line.points.length < 2) return;
        const poly = L.polyline(line.points, { color: line.color, weight: LINE_WEIGHT }).addTo(mapHistory);
        historyPolylineMap.set(line.id, poly);
        bounds.extend(poly.getBounds());
    });

    if (linesData.length > 0 && bounds.isValid()) {
        mapHistory.fitBounds(bounds, { padding: [30, 30] });
    }
    renderHistoryList();
}

function renderSocialMap() {
    if (!mapSocial) return;
    socialPolylineMap.forEach(p => mapSocial.removeLayer(p));
    socialPolylineMap.clear();

    const empty = document.getElementById('social-empty');
    if (empty) empty.classList.toggle('hidden', publicLinesData.length > 0);

    const bounds = L.latLngBounds();
    publicLinesData.forEach(line => {
        if (!line.points || line.points.length < 2) return;
        const poly = L.polyline(line.points, { color: line.color, weight: LINE_WEIGHT }).addTo(mapSocial);
        socialPolylineMap.set(line.id, poly);
        bounds.extend(poly.getBounds());
    });

    if (publicLinesData.length > 0 && bounds.isValid()) {
        mapSocial.fitBounds(bounds, { padding: [30, 30] });
    }
}

function renderUsersList() {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;

    usersList.innerHTML = '';
    const userCounts = new Map();

    publicLinesData.forEach(line => {
        const uid = line.user_id;
        userCounts.set(uid, (userCounts.get(uid) || 0) + 1);
    });

    if (userCounts.size === 0) {
        usersList.innerHTML = '<div style="font-size:12px; color:var(--muted);">Nėra viešų žygių</div>';
        return;
    }

    userCounts.forEach((count, uid) => {
        const name = getUsername(uid);
        const row = document.createElement('div');
        row.className = 'user-row';
        row.innerHTML = `
            <div class="avatar">${name.charAt(0).toUpperCase()}</div>
            <div style="flex:1;">${name}</div>
            <div style="font-size:11px; color:var(--muted);">${count} žyg.</div>
        `;
        row.onclick = () => filterSocialByUser(uid);
        usersList.appendChild(row);
    });
}

function filterSocialByUser(uid) {
    const userLines = publicLinesData.filter(l => l.user_id === uid);
    const bounds = L.latLngBounds();
    userLines.forEach(l => {
        const poly = socialPolylineMap.get(l.id);
        if (poly) bounds.extend(poly.getBounds());
    });
    if (bounds.isValid()) mapSocial.fitBounds(bounds, { padding: [40, 40] });
}

function renderHistoryList() {
    const box = document.getElementById('history-items');
    if (!box) return;
    box.innerHTML = '';

    [...linesData].reverse().forEach(line => {
        const el = document.createElement('div');
        el.className = 'act-item';
        el.style.padding = '10px';
        el.style.borderBottom = '1px solid var(--line)';
        el.innerHTML = `
            <div style="font-weight:700; color:var(--ink);">${line.name}</div>
            <div style="font-size:12px; color:var(--muted);">${line.date} · ${formatDist(line.distance)} · ${formatTime(line.duration)}</div>
        `;
        box.appendChild(el);
    });
}

// GPS ĮRAŠYMAS
function setupUIEvents() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.onclick = () => {
            const tab = item.dataset.tab;
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            const target = document.getElementById(`tab-${tab}`);
            if (target) target.classList.add('active');

            setTimeout(() => {
                if (tab === 'record' && map) map.invalidateSize();
                if (tab === 'history' && mapHistory) mapHistory.invalidateSize();
                if (tab === 'social' && mapSocial) mapSocial.invalidateSize();
            }, 200);
        };
    });

    const toggleUsersBtn = document.getElementById('toggleUsersBtn');
    const usersMenu = document.getElementById('usersMenu');
    if (toggleUsersBtn && usersMenu) {
        toggleUsersBtn.onclick = () => usersMenu.classList.toggle('hidden');
    }

    const gpsDrawBtn = document.getElementById('gpsDrawBtn');
    const stopBtn = document.getElementById('stopBtn');
    const setupView = document.getElementById('setupView');
    const statsPanel = document.getElementById('statsPanel');

    if (gpsDrawBtn) {
        gpsDrawBtn.onclick = () => {
            if (!isGpsRecording) {
                isGpsRecording = true;
                const nameInput = document.getElementById('lineName');
                currentLineData = {
                    name: (nameInput && nameInput.value.trim()) || 'Žygis ' + new Date().toLocaleDateString('lt-LT'),
                    color: selectedColor,
                    points: [],
                    distance: 0,
                    duration: 0
                };

                setupView.classList.add('hidden');
                statsPanel.classList.remove('hidden');

                totalElapsed = 0;
                timerInterval = setInterval(() => {
                    totalElapsed++;
                    currentLineData.duration = totalElapsed;
                    document.getElementById('statTime').textContent = formatTime(totalElapsed);
                }, 1000);

                if ('geolocation' in navigator) {
                    watchId = navigator.geolocation.watchPosition(
                        (pos) => {
                            const lat = pos.coords.latitude;
                            const lng = pos.coords.longitude;
                            const pt = [lat, lng];

                            if (currentLineData.points.length > 0) {
                                const lastPt = currentLineData.points[currentLineData.points.length - 1];
                                currentLineData.distance += L.latLng(lastPt).distanceTo(L.latLng(pt));
                            }

                            currentLineData.points.push(pt);

                            if (!currentPolyline) {
                                currentPolyline = L.polyline(currentLineData.points, { color: selectedColor, weight: LINE_WEIGHT }).addTo(map);
                            } else {
                                currentPolyline.setLatLngs(currentLineData.points);
                            }

                            map.setView(pt, 16);
                            document.getElementById('statDistance').textContent = formatDist(currentLineData.distance);
                        },
                        (err) => console.error(err),
                        { enableHighAccuracy: true }
                    );
                }
            }
        };
    }

    if (stopBtn) {
        stopBtn.onclick = async () => {
            if (isGpsRecording) {
                isGpsRecording = false;
                clearInterval(timerInterval);
                if (watchId) navigator.geolocation.clearWatch(watchId);

                await isaugotiISupabase(currentLineData);

                if (currentPolyline) {
                    map.removeLayer(currentPolyline);
                    currentPolyline = null;
                }

                statsPanel.classList.add('hidden');
                setupView.classList.remove('hidden');
            }
        };
    }
}