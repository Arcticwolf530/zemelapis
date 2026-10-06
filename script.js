// 0. SUPABASE PRISIJUNGIMAS
const SUPABASE_URL = 'https://hxbkmstegyimjkbnlgfa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lfVhNCx5D-iVDFOm44vjHQ_ErK0Zsnt';

// Saugus re-initialization patikrinimas (kad neišmestų SyntaxError)
let sbClient;
if (window.supabase) {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

let map = null;
let currentUser = null;
let isSignUpMode = false;

// DOM Elementai
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
const statusText = document.getElementById('status-text');
const deleteSelect = document.getElementById('deleteSelect');
const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
const routesList = document.getElementById('routesList');

// REŽIMO PERJUNGINĖJIMAS (Prisijungti / Registruotis)
if (toggleAuthBtn) {
    toggleAuthBtn.addEventListener('click', (e) => {
        e.preventDefault();
        isSignUpMode = !isSignUpMode;
        
        if (isSignUpMode) {
            authTitle.textContent = 'Registracija';
            authSubmitBtn.textContent = 'Registruotis';
            toggleAuthText.textContent = 'Jau turite paskyrą?';
            toggleAuthBtn.textContent = 'Prisijungti';
        } else {
            authTitle.textContent = 'Prisijungimas';
            authSubmitBtn.textContent = 'Prisijungti';
            toggleAuthText.textContent = 'Neturite paskyros?';
            toggleAuthBtn.textContent = 'Registruotis';
        }
    });
}

// AUTENTIFIKACIJOS FORMOS PATEIKIMAS
if (authForm) {
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = authEmail.value.trim();
        const password = authPassword.value.trim();

        if (!email || !password) {
            alert('Atsiprašome, įveskite el. paštą ir slaptažodį.');
            return;
        }

        if (password.length < 6) {
            alert('Slaptažodis turi būti bent 6 simbolių ilgio!');
            return;
        }

        authSubmitBtn.disabled = true;
        authSubmitBtn.textContent = 'Apdorojama...';

        try {
            if (isSignUpMode) {
                // REGISTRACIJA
                const { data, error } = await sbClient.auth.signUp({ email, password });

                if (error) {
                    alert('Registracijos klaida: ' + error.message);
                } else if (data.user) {
                    alert('Registracija sėkminga! Jei reikalaujama patvirtinimo, patikrinkite el. paštą. Dabar galite prisijungti.');
                    isSignUpMode = false;
                    authTitle.textContent = 'Prisijungimas';
                    authSubmitBtn.textContent = 'Prisijungti';
                    toggleAuthText.textContent = 'Neturite paskyros?';
                    toggleAuthBtn.textContent = 'Registruotis';
                }
            } else {
                // PRISIJUNGIMAS
                const { data, error } = await sbClient.auth.signInWithPassword({ email, password });

                if (error) {
                    alert('Prisijungimo klaida: ' + error.message);
                } else if (data.user) {
                    currentUser = data.user;
                    initApp(currentUser);
                }
            }
        } catch (err) {
            console.error('Klaida:', err);
            alert('Sistemos klaida: ' + err.message);
        } finally {
            authSubmitBtn.disabled = false;
            authSubmitBtn.textContent = isSignUpMode ? 'Registruotis' : 'Prisijungti';
        }
    });
}

// ATSIJUNGIMAS
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await sbClient.auth.signOut();
        location.reload();
    });
}

function initApp(user) {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    userEmailDisplay.textContent = user.email;

    // Žemėlapio inicializavimas
    map = L.map('map').setView([54.74622, 25.21294], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    initDrawingLogic();
    uzkrautiIsSupabase();
}

// ATSTUMO SKAIČIAVIMAS
function calculateDistance(points) {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = L.latLng(points[i][0], points[i][1]);
        const p2 = L.latLng(points[i + 1][0], points[i + 1][1]);
        total += p1.distanceTo(p2);
    }
    return total;
}

function formatDistance(meters) {
    return meters >= 1000 ? (meters / 1000).toFixed(2) + ' km' : Math.round(meters) + ' m';
}

// MARŠRUTŲ PIEŠIMO LOGIKA
let selectedColor = '#e6194B';
let linesData = [];
const polylineMap = new Map();
let isDrawingMode = false;
let isMouseDown = false;
let currentLineData = null;
let currentPolyline = null;

function initDrawingLogic() {
    const colors = ['#e6194B', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6'];
    const colorPalette = document.getElementById('colorPalette');
    const customColorInput = document.getElementById('customColor');

    if (colorPalette) {
        colorPalette.innerHTML = '';
        colors.forEach((color, index) => {
            const swatch = document.createElement('div');
            swatch.style.width = '24px';
            swatch.style.height = '24px';
            swatch.style.borderRadius = '50%';
            swatch.style.backgroundColor = color;
            swatch.style.cursor = 'pointer';
            swatch.style.border = index === 0 ? '2px solid black' : '2px solid transparent';

            swatch.addEventListener('click', () => {
                Array.from(colorPalette.children).forEach(s => s.style.border = '2px solid transparent');
                swatch.style.border = '2px solid black';
                selectedColor = color;
                if (customColorInput) customColorInput.value = color;
            });

            colorPalette.appendChild(swatch);
        });
    }

    if (customColorInput) {
        customColorInput.addEventListener('input', (e) => {
            selectedColor = e.target.value;
        });
    }

    const toggleMenuBtn = document.getElementById('toggleMenuBtn');
    if (toggleMenuBtn) {
        toggleMenuBtn.addEventListener('click', () => {
            document.getElementById('drawMenu').classList.toggle('hidden');
        });
    }

    const startDrawBtn = document.getElementById('startDrawBtn');
    const stopDrawBtn = document.getElementById('stopDrawBtn');

    if (startDrawBtn) {
        startDrawBtn.addEventListener('click', () => {
            const nameInput = document.getElementById('lineName');
            const name = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : 'Maršrutas';
            currentLineData = { id: Date.now(), name, color: selectedColor, points: [], distance: 0 };
            
            currentPolyline = L.polyline([], { color: selectedColor, weight: 5 }).addTo(map);
            polylineMap.set(currentLineData.id, currentPolyline);

            isDrawingMode = true;
            map.dragging.disable();
            if (statusText) statusText.textContent = 'Piešimo režimas ĮJUNGTAS. Laikykite pelės mygtuką ir braukite per žemėlapį.';
            startDrawBtn.classList.add('hidden');
            if (stopDrawBtn) stopDrawBtn.classList.remove('hidden');
        });
    }

    if (stopDrawBtn) {
        stopDrawBtn.addEventListener('click', () => {
            isDrawingMode = false;
            map.dragging.enable();
            if (statusText) statusText.textContent = 'Piešimo režimas IŠJUNGTAS.';
            if (startDrawBtn) startDrawBtn.classList.remove('hidden');
            stopDrawBtn.classList.add('hidden');
        });
    }

    map.on('mousedown', (e) => {
        if (!isDrawingMode) return;
        isMouseDown = true;
        currentLineData.points.push([e.latlng.lat, e.latlng.lng]);
        currentPolyline.setLatLngs(currentLineData.points);
    });

    map.on('mousemove', (e) => {
        if (!isDrawingMode || !isMouseDown) return;
        currentLineData.points.push([e.latlng.lat, e.latlng.lng]);
        currentPolyline.setLatLngs(currentLineData.points);
    });

    map.on('mouseup', async () => {
        if (!isDrawingMode || !isMouseDown) return;
        isMouseDown = false;

        currentLineData.distance = calculateDistance(currentLineData.points);
        const distText = formatDistance(currentLineData.distance);

        currentPolyline.bindPopup(`<b>${currentLineData.name}</b><br>Atstumas: ${distText}`);

        linesData.push(currentLineData);
        await isaugotiISupabase(currentLineData);
        atnaujintiSarasus();
    });

    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', async () => {
            const idToDelete = parseInt(deleteSelect.value);
            if (!idToDelete) return;

            const poly = polylineMap.get(idToDelete);
            if (poly) {
                map.removeLayer(poly);
                polylineMap.delete(idToDelete);
            }

            linesData = linesData.filter(l => l.id !== idToDelete);
            await istrintiIsSupabase(idToDelete);
            atnaujintiSarasus();
        });
    }
}

// SĄRAŠO ATNAUJINIMAS
function atnaujintiSarasus() {
    if (!deleteSelect || !routesList) return;

    deleteSelect.innerHTML = '<option value="">-- Pasirinkite maršrutą --</option>';
    routesList.innerHTML = '';

    if (linesData.length === 0) {
        routesList.innerHTML = '<p style="color: #888; font-size: 0.9rem;">Maršrutų nėra...</p>';
        return;
    }

    linesData.forEach(line => {
        const distText = formatDistance(line.distance || 0);

        const opt = document.createElement('option');
        opt.value = line.id;
        opt.textContent = `${line.name} (${distText})`;
        deleteSelect.appendChild(opt);

        const item = document.createElement('div');
        item.style.padding = '8px';
        item.style.marginBottom = '6px';
        item.style.background = '#f8f9fa';
        item.style.borderRadius = '4px';
        item.style.cursor = 'pointer';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.borderLeft = `5px solid ${line.color}`;

        item.innerHTML = `<span><strong>${line.name}</strong></span> <span style="color: #666; font-size: 0.85rem;">${distText}</span>`;

        item.addEventListener('click', () => {
            const poly = polylineMap.get(line.id);
            if (poly) {
                map.fitBounds(poly.getBounds());
                poly.openPopup();
            }
        });

        routesList.appendChild(item);
    });
}

// SUPABASE OPERACIJOS
async function uzkrautiIsSupabase() {
    try {
        const { data, error } = await sbClient.from('zygiai').select('*');
        if (error) {
            console.error('Klaida kraunant duomenis:', error);
            return;
        }

        if (data) {
            linesData = data.map(item => ({
                id: item.id,
                name: item.title || 'Maršrutas',
                color: item.color || '#007bff',
                points: item.coordinates || [],
                distance: item.distance || calculateDistance(item.coordinates || [])
            }));

            linesData.forEach(line => {
                const distText = formatDistance(line.distance);
                const poly = L.polyline(line.points, { color: line.color, weight: 5 })
                    .bindPopup(`<b>${line.name}</b><br>Atstumas: ${distText}`)
                    .addTo(map);
                polylineMap.set(line.id, poly);
            });

            atnaujintiSarasus();
        }
    } catch (e) {
        console.error('Klaida užkraunant iš Supabase:', e);
    }
}

async function isaugotiISupabase(line) {
    try {
        const { data, error } = await sbClient.from('zygiai').insert([{ 
            title: line.name, 
            coordinates: line.points, 
            color: line.color,
            distance: line.distance
        }]).select();

        if (error) {
            console.error('Klaida išsaugant:', error);
        } else if (data && data.length > 0) {
            line.id = data[0].id;
        }
    } catch (e) {
        console.error('Klaida išsaugant maršrutą:', e);
    }
}

async function istrintiIsSupabase(id) {
    try {
        const { error } = await sbClient.from('zygiai').delete().eq('id', id);
        if (error) console.error('Klaida trinant:', error);
    } catch (e) {
        console.error('Klaida trinant maršrutą:', e);
    }
}