// SUPABASE PRISIJUNGIMAS
const SUPABASE_URL = 'https://hxbkmstegyimjkbnlgfa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lfVhNCx5D-iVDFOm44vjHQ_ErK0Zsnt';

// „Prisiminti mane“: seansas saugomas localStorage (ilgam) arba sessionStorage (iki kortelės uždarymo)
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
const LINE_WEIGHT_ACTIVE = 10;

let map = null;
let mapHistory = null;
const historyPolylineMap = new Map();
const polylineMap = new Map();

const colors = ['#2563eb', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6'];
let selectedColor = colors[0];
let linesData = [];

let watchId = null, timerInterval = null, startTime = null, totalElapsed = 0;
let userMarker = null, accuracyCircle = null, isGpsRecording = false;
let currentLineData = null, currentPolyline = null;
let lastAltitude = null;

// DOM Elementai autentifikacijai
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

let authView = 'signin';          // signin | signup | verify | forgot | reset
let pendingEmail = '';            // el. paštas, kuriam išsiųstas kodas
let recoveryVerified = false;     // ar atstatymo kodas jau patvirtintas
let appStarted = false;
let currentUserId = null;

const AUTH_TITLES = {
    signin: 'Prisijungimas',
    signup: 'Registracija',
    verify: 'El. pašto patvirtinimas',
    forgot: 'Slaptažodžio atstatymas',
    reset: 'Naujas slaptažodis'
};

function setAuthMsg(text, isError = false) {
    authMsg.textContent = text || '';
    authMsg.classList.toggle('hidden', !text);
    authMsg.classList.toggle('error', !!isError);
}

function showAuthView(view) {
    authView = view;
    const main = view === 'signin' || view === 'signup';
    authTitle.textContent = AUTH_TITLES[view];
    authForm.classList.toggle('hidden', !main);
    authToggleRow.classList.toggle('hidden', !main);
    usernameGroup.classList.toggle('hidden', view !== 'signup');
    authRow.classList.toggle('hidden', view !== 'signin');
    otpForm.classList.toggle('hidden', view !== 'verify');
    forgotForm.classList.toggle('hidden', view !== 'forgot');
    resetForm.classList.toggle('hidden', view !== 'reset');
    authSubmitBtn.textContent = view === 'signup' ? 'Registruotis' : 'Prisijungti';
    toggleAuthText.textContent = view === 'signup' ? 'Jau turite paskyrą?' : 'Neturite paskyros?';
    toggleAuthBtn.textContent = view === 'signup' ? 'Prisijungti' : 'Registruotis';
    if (view === 'forgot') recoveryVerified = false;
    setAuthMsg('');
}

function applyRemember() {
    try { localStorage.setItem(REMEMBER_KEY, rememberMe.checked ? '1' : '0'); } catch (_) {}
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
    otpCode.value = '';
    showAuthView('verify');
    otpHint.textContent = `Išsiuntėme 6 skaitmenų kodą į ${email}. Įveskite jį žemiau (patikrinkite ir šlamšto aplanką).`;
    otpCode.focus();
}

const onlyDigits = (v) => v.replace(/\D/g, '');

// Prisijungimo / registracijos perjungimas
if (toggleAuthBtn) {
    toggleAuthBtn.onclick = (e) => {
        e.preventDefault();
        showAuthView(authView === 'signin' ? 'signup' : 'signin');
    };
}
document.querySelectorAll('.js-auth-back').forEach(b => b.onclick = () => showAuthView('signin'));
if (forgotBtn) forgotBtn.onclick = () => { forgotEmail.value = authEmail.value; showAuthView('forgot'); };

// Prisijungimo / Registracijos formos pateikimas
if (authForm) {
    authForm.onsubmit = (e) => {
        e.preventDefault();
        runBusy(authForm, async () => {
            const email = authEmail.value.trim();
            const password = authPassword.value.trim();

            if (authView === 'signup') {
                const username = authUsername.value.trim();
                if (username.length < 3) return setAuthMsg('Vartotojo vardas turi būti bent 3 simbolių', true);
                if (password.length < 6) return setAuthMsg('Slaptažodis turi būti bent 6 simbolių', true);

                applyRemember();
                const { data, error } = await supabaseClient.auth.signUp({
                    email, password, options: { data: { username } }
                });
                if (error) return setAuthMsg('Registracijos klaida: ' + error.message, true);
                if (data.user && data.user.identities && data.user.identities.length === 0) {
                    return setAuthMsg('Šis el. paštas jau užregistruotas. Prisijunkite.', true);
                }
                if (data.session) return initApp(data.user);   // jei patvirtinimas el. paštu išjungtas
                startVerify(email);
            } else {
                applyRemember();
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (error) {
                    if (error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message)) {
                        await supabaseClient.auth.resend({ type: 'signup', email });
                        return startVerify(email);
                    }
                    return setAuthMsg('Prisijungimo klaida: ' + error.message, true);
                }
                if (data.user) initApp(data.user);
            }
        });
    };
}

// El. pašto patvirtinimas PIN kodu
if (otpForm) {
    otpForm.onsubmit = (e) => {
        e.preventDefault();
        runBusy(otpForm, async () => {
            const token = onlyDigits(otpCode.value);
            if (token.length !== 6) return setAuthMsg('Įveskite 6 skaitmenų kodą', true);
            applyRemember();
            const { data, error } = await supabaseClient.auth.verifyOtp({ email: pendingEmail, token, type: 'signup' });
            if (error) return setAuthMsg('Neteisingas arba pasibaigęs kodas', true);
            if (data.user) initApp(data.user);
        });
    };
}
if (resendOtpBtn) {
    resendOtpBtn.onclick = async () => {
        const { error } = await supabaseClient.auth.resend({ type: 'signup', email: pendingEmail });
        setAuthMsg(error ? 'Nepavyko išsiųsti: ' + error.message : 'Naujas kodas išsiųstas', !!error);
    };
}

// Pamiršau slaptažodį: 1) kodo užsakymas
if (forgotForm) {
    forgotForm.onsubmit = (e) => {
        e.preventDefault();
        runBusy(forgotForm, async () => {
            const email = forgotEmail.value.trim();
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
            if (error) return setAuthMsg('Klaida: ' + error.message, true);
            pendingEmail = email;
            resetCode.value = '';
            resetPassword.value = '';
            showAuthView('reset');
            setAuthMsg('Jei šis el. paštas užregistruotas, išsiuntėme 6 skaitmenų kodą.');
        });
    };
}

// Pamiršau slaptažodį: 2) kodas + naujas slaptažodis
if (resetForm) {
    resetForm.onsubmit = (e) => {
        e.preventDefault();
        runBusy(resetForm, async () => {
            const newPass = resetPassword.value.trim();
            if (newPass.length < 6) return setAuthMsg('Slaptažodis turi būti bent 6 simbolių', true);

            let user = null;
            if (!recoveryVerified) {
                const token = onlyDigits(resetCode.value);
                if (token.length !== 6) return setAuthMsg('Įveskite 6 skaitmenų kodą', true);
                applyRemember();
                const { data, error } = await supabaseClient.auth.verifyOtp({ email: pendingEmail, token, type: 'recovery' });
                if (error) return setAuthMsg('Neteisingas arba pasibaigęs kodas', true);
                recoveryVerified = true;
                user = data.user;
            }
            const { data: upd, error: upErr } = await supabaseClient.auth.updateUser({ password: newPass });
            if (upErr) return setAuthMsg('Nepavyko pakeisti slaptažodžio: ' + upErr.message, true);
            initApp(upd.user || user);
        });
    };
}

if (logoutBtn) {
    logoutBtn.onclick = async () => {
        await supabaseClient.auth.signOut();
        location.reload();
    };
}

// Automatinis prisijungimas, jei išsaugotas seansas („Prisiminti mane“)
if (supabaseClient) {
    supabaseClient.auth.getSession().then(({ data }) => {
        if (data && data.session && authView !== 'reset') initApp(data.session.user);
    });
}

function initApp(user) {
    if (appStarted) return;
    appStarted = true;
    currentUserId = user.id;

    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    userEmailDisplay.textContent = user.email;

    // Sukuriamas pagrindinis žemėlapis
    map = createMap('map');
    uzkrautiIsSupabase();
}

function createMap(id) {
    const m = L.map(id, {
        zoomControl: false,
        renderer: L.canvas({ tolerance: 14 })
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    return m;
}

const colorPalette = document.getElementById('colorPalette');
const customColorInput = document.getElementById('customColor');
const lineNameInput = document.getElementById('lineName');
const lineSelect = document.getElementById('lineSelect');
const deleteSelect = document.getElementById('deleteSelect');
const gpsDrawBtn = document.getElementById('gpsDrawBtn');
const statsPanel = document.getElementById('statsPanel');
const historyEmpty = document.getElementById('history-empty');

const infoCard = document.getElementById('info-card');
const cardTitle = document.getElementById('card-title');
const cardDot = document.getElementById('card-dot');
const cardDuration = document.getElementById('card-duration');
const cardDistance = document.getElementById('card-distance');
const cardSpeed = document.getElementById('card-speed');
const cardElevation = document.getElementById('card-elevation');
const cardDate = document.getElementById('card-date');
const closeBtn = document.getElementById('close-btn');
const sharePublic = document.getElementById('sharePublic');
const cardShare = document.getElementById('card-share');
const cardPublicToggle = document.getElementById('card-public-toggle');
let cardLine = null;

// Žygio viešumo perjungimas info kortelėje
if (cardPublicToggle) {
    cardPublicToggle.onchange = async () => {
        if (!cardLine) return;
        const want = cardPublicToggle.checked;
        const { data, error } = await supabaseClient.from('zygiai')
            .update({ is_public: want }).eq('id', cardLine.id).eq('user_id', currentUserId).select();
        if (error || !data || !data.length) {
            cardPublicToggle.checked = !want;
            alert('Nepavyko pakeisti žygio viešumo');
        } else {
            cardLine.isPublic = want;
        }
    };
}

let selectedPoly = null;
function clearSelection() {
    if (selectedPoly) {
        selectedPoly.setStyle({ weight: LINE_WEIGHT, opacity: 0.85 });
        selectedPoly = null;
    }
}
function closeCard() {
    infoCard.classList.add('hidden');
    clearSelection();
}
if (closeBtn) closeCard();
if (map) map.on('click', closeCard);

function showRouteCard(line, poly) {
    clearSelection();
    if (poly) {
        selectedPoly = poly;
        poly.setStyle({ weight: LINE_WEIGHT_ACTIVE, opacity: 1 });
        poly.bringToFront();
    }
    cardTitle.textContent = line.social ? line.name : `#${line.id}: ${line.name}`;
    cardDot.style.background = line.color;
    cardDuration.textContent = formatTime(line.duration || 0);
    cardDistance.textContent = formatDist(line.distance || 0);

    const km = (line.distance || 0) / 1000;
    const hrs = (line.duration || 0) / 3600;
    cardSpeed.textContent = hrs > 0 && km > 0 ? (km / hrs).toFixed(1) + ' km/h' : '0.0 km/h';
    cardElevation.textContent = `${Math.round(line.elevationGain || 0)} m`;
    cardDate.textContent = line.social ? `@${line.author} · ${line.date || '-'}` : (line.date || '-');

    cardLine = line;
    const canShare = !line.social && !(isGpsRecording && line === currentLineData);
    cardShare.classList.toggle('hidden', !canShare);
    cardPublicToggle.checked = !!line.isPublic;

    infoCard.classList.remove('hidden');
}

// Skilčių perjungimas
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach(item => {
    item.onclick = () => {
        const tabName = item.getAttribute('data-tab');
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        tabContents.forEach(tab => tab.classList.remove('active'));
        document.getElementById(`tab-${tabName}`).classList.add('active');
        closeCard();

        if (tabName === 'record') {
            setTimeout(() => map && map.invalidateSize(), 50);
        } else if (tabName === 'history') {
            if (!mapHistory) {
                mapHistory = createMap('map-history');
                mapHistory.setView(map.getCenter(), map.getZoom());
                mapHistory.on('click', closeCard);
            }
            setTimeout(() => {
                mapHistory.invalidateSize({ pan: false });
                renderHistoryPolylines();
            }, 50);
        } else if (tabName === 'social') {
            if (!mapSocial) {
                mapSocial = createMap('map-social');
                mapSocial.setView(map.getCenter(), map.getZoom());
                mapSocial.on('click', closeCard);
            }
            setTimeout(() => {
                mapSocial.invalidateSize({ pan: false });
                loadSocial();
            }, 50);
        }
    };
});

// Spalvų paletė
colors.forEach((color, i) => {
    const swatch = document.createElement('div');
    swatch.className = `color-swatch ${i === 0 ? 'selected' : ''}`;
    swatch.style.backgroundColor = color;
    swatch.onclick = () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        selectedColor = color;
        customColorInput.value = color;
    };
    if (colorPalette) colorPalette.appendChild(swatch);
});

if (customColorInput) {
    customColorInput.oninput = (e) => {
        selectedColor = e.target.value;
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    };
}

const formatTime = (sec) => {
    sec = Math.floor(sec);
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    const h = Math.floor(sec / 3600);
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
};

const formatDist = (m) => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';

const calcDist = (pts) => {
    let d = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        d += L.latLng(pts[i]).distanceTo(L.latLng(pts[i + 1]));
    }
    return d;
};

// Supabase duomenų sinchronizacija
async function uzkrautiIsSupabase() {
    // Filtruojame pagal savo user_id, nes viešų žygių RLS taisyklė leidžia matyti ir kitų žygius
    const { data, error } = await supabaseClient.from('zygiai').select('*').eq('user_id', currentUserId);
    if (data) {
        linesData = data.map(item => ({
            id: item.id,
            name: item.title || 'Maršrutas',
            color: item.color || '#2563eb',
            points: item.coordinates || [],
            distance: item.distance || 0,
            duration: item.duration || 0,
            elevationGain: item.elevationGain || 0,
            date: item.date || '-',
            isPublic: !!item.is_public
        }));

        linesData.forEach(line => {
            if (line.points && line.points.length > 0) {
                createPolyline(line);
            }
        });
        updateSelects();
    }
}

async function isaugotiISupabase(line) {
    // Paimame dabartinio prisijungusio vartotojo informaciją
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { data, error } = await supabaseClient.from('zygiai').insert([{
        title: line.name,
        coordinates: line.points,
        color: line.color,
        distance: line.distance,
        duration: line.duration,
        elevationGain: line.elevationGain,
        date: line.date,
        is_public: !!line.isPublic,
        user_id: user.id // <--- Priskiriame prisijungusio vartotojo ID dėl RLS apsaugos
    }]).select();

    if (error) {
        console.error("Klaida išsaugant į Supabase:", error.message);
    } else if (data && data.length > 0) {
        line.id = data[0].id;
        updateSelects();
    }
}

async function istrintiIsSupabase(id) {
    await supabaseClient.from('zygiai').delete().eq('id', id);
}

function createPolyline(line) {
    if (polylineMap.has(line.id)) return;
    const poly = L.polyline(line.points, { color: line.color, weight: LINE_WEIGHT, opacity: 0.85 }).addTo(map);
    poly.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        showRouteCard(line, poly);
    });
    polylineMap.set(line.id, poly);
}

function renderHistoryPolylines() {
    if (!mapHistory) return;
    selectedPoly = null;
    historyPolylineMap.forEach(poly => mapHistory.removeLayer(poly));
    historyPolylineMap.clear();

    let count = 0;
    linesData.forEach(line => {
        if (!line.points || line.points.length === 0) return;
        const poly = L.polyline(line.points, { color: line.color, weight: LINE_WEIGHT, opacity: 0.85 }).addTo(mapHistory);
        poly.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            showRouteCard(line, poly);
        });
        historyPolylineMap.set(line.id, poly);
        count++;
    });
    historyEmpty.classList.toggle('hidden', count > 0);
}

const fitAllBtn = document.getElementById('fitAllBtn');
if (fitAllBtn) {
    fitAllBtn.onclick = () => {
        if (!mapHistory) return;
        const all = L.latLngBounds([]);
        historyPolylineMap.forEach(poly => all.extend(poly.getBounds()));
        if (all.isValid()) mapHistory.fitBounds(all, { padding: [60, 60], maxZoom: 17 });
    };
}

const toggleMenuBtn = document.getElementById('toggleMenuBtn');
if (toggleMenuBtn) {
    toggleMenuBtn.onclick = () => document.getElementById('drawMenu').classList.toggle('hidden');
}

document.querySelectorAll('input[name="lineOption"]').forEach(r => {
    r.onchange = (e) => lineSelect.classList.toggle('hidden', e.target.value !== 'continue');
});

function updateSelects() {
    if (!lineSelect || !deleteSelect) return;
    lineSelect.innerHTML = '';
    deleteSelect.innerHTML = '<option value="">-- Pasirinkite --</option>';
    linesData.forEach(l => {
        lineSelect.add(new Option(`#${l.id}: ${l.name}`, l.id));
        deleteSelect.add(new Option(`#${l.id}: ${l.name}`, l.id));
    });
}

// GPS Įrašymo logika
if (gpsDrawBtn) {
    gpsDrawBtn.onclick = () => isGpsRecording ? stopGps() : startGps();
}

function startGps() {
    if (!('geolocation' in navigator)) return alert('GPS nepalaikomas');

    closeCard();
    lastAltitude = null;
    const isContinue = document.querySelector('input[name="lineOption"]:checked').value === 'continue';

    if (isContinue && linesData.length > 0) {
        const id = parseInt(lineSelect.value);
        currentLineData = linesData.find(l => l.id === id);
        if (!currentLineData) return alert('Pasirinkite maršrutą');
        currentLineData.color = selectedColor;
        currentLineData.elevationGain = currentLineData.elevationGain || 0;

        createPolyline(currentLineData);
        currentPolyline = polylineMap.get(id);
        if (currentPolyline) currentPolyline.setStyle({ color: selectedColor });
        totalElapsed = currentLineData.duration || 0;
    } else {
        const id = linesData.length ? Math.max(...linesData.map(l => l.id)) + 1 : 1;
        currentLineData = {
            id, name: lineNameInput.value.trim() || `Žygis ${id}`,
            color: selectedColor, date: new Date().toLocaleDateString('lt-LT'),
            distance: 0, duration: 0, elevationGain: 0, points: [],
            isPublic: sharePublic.checked
        };
        linesData.push(currentLineData);
        createPolyline(currentLineData);
        currentPolyline = polylineMap.get(id);
        totalElapsed = 0;
    }

    watchId = navigator.geolocation.watchPosition(onGps, err => console.warn(err), { enableHighAccuracy: true });
    startTime = Date.now() - totalElapsed * 1000;
    timerInterval = setInterval(updateStats, 1000);

    isGpsRecording = true;
    gpsDrawBtn.textContent = 'Stabdyti GPS įrašymą';
    gpsDrawBtn.classList.add('active');
    statsPanel.classList.remove('hidden');
    document.getElementById('drawMenu').classList.add('hidden');
}

function onGps(pos) {
    const { latitude: lat, longitude: lng, accuracy, speed, altitude } = pos.coords;
    const pt = [lat, lng];

    if (!userMarker) {
        userMarker = L.circleMarker(pt, { radius: 8, fillColor: '#2563eb', color: '#fff', weight: 3, fillOpacity: 1 }).addTo(map);
        accuracyCircle = L.circle(pt, { radius: accuracy, color: '#2563eb', fillOpacity: 0.1, weight: 1 }).addTo(map);
    } else {
        userMarker.setLatLng(pt);
        accuracyCircle.setLatLng(pt).setRadius(accuracy);
    }
    map.setView(pt, map.getZoom());

    const pts = currentLineData.points;
    if (!pts.length || L.latLng(pts[pts.length - 1]).distanceTo(L.latLng(pt)) > 3) {
        pts.push(pt);
    }

    if (altitude !== null && altitude !== undefined) {
        if (lastAltitude !== null) {
            const diff = altitude - lastAltitude;
            if (diff > 1.5) {
                currentLineData.elevationGain = (currentLineData.elevationGain || 0) + diff;
                lastAltitude = altitude;
            } else if (diff < -1.5) {
                lastAltitude = altitude;
            }
        } else {
            lastAltitude = altitude;
        }
    }

    currentLineData.distance = calcDist(pts);
    if (currentPolyline) currentPolyline.setLatLngs(pts);

    document.getElementById('statSpeed').textContent = `${(speed > 0 ? speed * 3.6 : 0).toFixed(1)} km/h`;
    document.getElementById('statElevation').textContent = `${Math.round(currentLineData.elevationGain || 0)} m`;
    updateStats();
}

function updateStats() {
    if (!isGpsRecording) return;
    totalElapsed = Math.floor((Date.now() - startTime) / 1000);
    currentLineData.duration = totalElapsed;

    document.getElementById('statTime').textContent = formatTime(totalElapsed);
    document.getElementById('statDistance').textContent = formatDist(currentLineData.distance);

    const km = currentLineData.distance / 1000;
    const hrs = totalElapsed / 3600;
    document.getElementById('statAvgSpeed').textContent = `${(hrs > 0 && km > 0 ? km / hrs : 0).toFixed(1)} km/h`;
}

async function stopGps() {
    navigator.geolocation.clearWatch(watchId);
    clearInterval(timerInterval);
    isGpsRecording = false;

    gpsDrawBtn.textContent = 'Pradėti GPS įrašymą';
    gpsDrawBtn.classList.remove('active');

    if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
    if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }

    statsPanel.classList.add('hidden');

    if (currentLineData && currentLineData.points.length > 0) {
        await isaugotiISupabase(currentLineData);
    }

    updateSelects();
}

const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
if (deleteSelectedBtn) {
    deleteSelectedBtn.onclick = async () => {
        const id = parseInt(deleteSelect.value);
        if (!id) return;

        if (isGpsRecording && currentLineData && currentLineData.id === id) {
            stopGps();
        }

        if (polylineMap.has(id)) {
            map.removeLayer(polylineMap.get(id));
            polylineMap.delete(id);
        }
        if (mapHistory && historyPolylineMap.has(id)) {
            mapHistory.removeLayer(historyPolylineMap.get(id));
            historyPolylineMap.delete(id);
        }

        linesData = linesData.filter(l => l.id !== id);
        await istrintiIsSupabase(id);
        updateSelects();
        closeCard();
    };
}

// ======================= SOCIALINĖ SKILTIS =======================
let mapSocial = null;
let socialData = [];
let socialProfiles = [];
let socialFilter = null;
let socialFitted = false;
const socialPolylineMap = new Map();
const socialEmpty = document.getElementById('social-empty');
const usersMenu = document.getElementById('usersMenu');
const usersList = document.getElementById('usersList');
const toggleUsersBtn = document.getElementById('toggleUsersBtn');

if (toggleUsersBtn) toggleUsersBtn.onclick = () => usersMenu.classList.toggle('hidden');

async function loadSocial() {
    const [routesRes, profilesRes] = await Promise.all([
        supabaseClient.from('zygiai').select('*').eq('is_public', true).order('id', { ascending: false }).limit(300),
        supabaseClient.from('profiles').select('id, username').limit(500)
    ]);
    if (routesRes.error) return console.error('Klaida kraunant viešus žygius:', routesRes.error.message);

    socialProfiles = profilesRes.data || [];
    const names = new Map(socialProfiles.map(p => [p.id, p.username]));
    socialData = (routesRes.data || []).map(item => ({
        id: item.id,
        social: true,
        userId: item.user_id,
        author: names.get(item.user_id) || 'Žygininkas',
        name: item.title || 'Maršrutas',
        color: item.color || '#2563eb',
        points: item.coordinates || [],
        distance: item.distance || 0,
        duration: item.duration || 0,
        elevationGain: item.elevationGain || 0,
        date: item.date || '-',
        isPublic: true
    }));
    if (socialFilter && !socialProfiles.some(p => p.id === socialFilter)) socialFilter = null;

    renderUsersMenu();
    renderSocialPolylines();
    if (!socialFitted && socialPolylineMap.size) { fitSocial(); socialFitted = true; }
}

function renderSocialPolylines() {
    if (!mapSocial) return;
    selectedPoly = null;
    socialPolylineMap.forEach(poly => mapSocial.removeLayer(poly));
    socialPolylineMap.clear();

    let count = 0;
    socialData.forEach(line => {
        if (socialFilter && line.userId !== socialFilter) return;
        if (!line.points || line.points.length === 0) return;
        const poly = L.polyline(line.points, { color: line.color, weight: LINE_WEIGHT, opacity: 0.85 }).addTo(mapSocial);
        poly.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            showRouteCard(line, poly);
        });
        socialPolylineMap.set(line.id, poly);
        count++;
    });
    socialEmpty.classList.toggle('hidden', count > 0);
}

function fitSocial() {
    if (!mapSocial) return;
    const all = L.latLngBounds([]);
    socialPolylineMap.forEach(poly => all.extend(poly.getBounds()));
    if (all.isValid()) mapSocial.fitBounds(all, { padding: [60, 60], maxZoom: 17 });
}

function makeUserRow(id, name, count) {
    const row = document.createElement('div');
    row.className = 'user-row' + (socialFilter === id ? ' active' : '');
    row.setAttribute('role', 'button');
    row.tabIndex = 0;

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = (name || '?').charAt(0).toUpperCase();
    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = name;            // textContent – saugu, vartotojo vardas nėra interpretuojamas kaip HTML
    const cnt = document.createElement('span');
    cnt.className = 'count';
    cnt.textContent = count;
    row.append(avatar, label, cnt);

    row.onclick = () => {
        socialFilter = id;
        renderUsersMenu();
        renderSocialPolylines();
        fitSocial();
        usersMenu.classList.add('hidden');
        closeCard();
    };
    return row;
}

function renderUsersMenu() {
    usersList.innerHTML = '';
    const counts = {};
    socialData.forEach(l => { counts[l.userId] = (counts[l.userId] || 0) + 1; });

    usersList.appendChild(makeUserRow(null, 'Visi žygininkai', socialData.length));
    [...socialProfiles]
        .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || a.username.localeCompare(b.username))
        .forEach(p => {
            const label = p.id === currentUserId ? `${p.username} (Jūs)` : p.username;
            usersList.appendChild(makeUserRow(p.id, label, counts[p.id] || 0));
        });
}
