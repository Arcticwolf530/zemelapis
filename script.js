// „Supabase“ prisijungimo duomenys
const SUPABASE_URL = 'https://hxbkmstegyimjknblgfa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1fVHNCX5D-iVDFOm44vjHQ_ErK0Zsnt';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 1. Inicializuojame žemėlapį ties Lietuva
const map = L.map('map').setView([55.1694, 23.8813], 7);

// 2. Užkrauname OpenStreetMap atvirojo kodo žemėlapio kadrus
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// Kintamieji žymėjimui
let currentMode = 'marker'; // 'marker' arba 'line'
let pathPoints = [];
let currentPolyline = null;
let mapElements = [];

const statusText = document.getElementById('status-text');

// Mygtukų valdymas
document.getElementById('btn-add-marker')?.addEventListener('click', () => {
    currentMode = 'marker';
    if (statusText) statusText.innerText = 'Režimas: Pridėti tašką. Spustelėkite bet kur ant žemėlapio.';
});

document.getElementById('btn-draw-line')?.addEventListener('click', () => {
    currentMode = 'line';
    pathPoints = [];
    currentPolyline = L.polyline([], { color: '#007bff', weight: 4 }).addTo(map);
    mapElements.push(currentPolyline);
    if (statusText) statusText.innerText = 'Režimas: Brėžti maršrutą. Spaudinėkite ant žemėlapio ir junkite taškus į liniją.';
});

document.getElementById('btn-clear')?.addEventListener('click', () => {
    mapElements.forEach(element => map.removeLayer(element));
    mapElements = [];
    pathPoints = [];
    if (statusText) statusText.innerText = 'Žemėlapis išvalytas.';
});

// Paspaudimas ant žemėlapio
map.on('click', function(e) {
    const lat = e.latlng.lat.toFixed(5);
    const lng = e.latlng.lng.toFixed(5);

    if (currentMode === 'marker') {
        // Pridedame smeigtuką
        const marker = L.marker([lat, lng]).addTo(map);
        marker.bindPopup(`<b>Žygio taškas</b><br>Koordinatės: ${lat}, ${lng}`).openPopup();
        mapElements.push(marker);
    } 
    else if (currentMode === 'line') {
        // Pridedame tašką prie linijos
        pathPoints.push([lat, lng]);
        currentPolyline.setLatLngs(pathPoints);

        // Pridedame mažą taškelį susikirtimuose
        const circle = L.circleMarker([lat, lng], { radius: 4, color: '#007bff' }).addTo(map);
        mapElements.push(circle);
    }
});

// Registracija ir Prisijungimas
document.getElementById('btn-signup')?.addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!email || !password) {
        alert('Įveskite el. paštą ir slaptažodį!');
        return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) alert('Klaida registruojantis: ' + error.message);
    else alert('Registracija sėkminga! Galite prisijungti.');
});

document.getElementById('btn-login')?.addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!email || !password) {
        alert('Įveskite el. paštą ir slaptažodį!');
        return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        alert('Prisijungimo klaida: ' + error.message);
    } else {
        alert('Sėkmingai prisijungėte!');
        if (statusText) statusText.innerText = `Prisijungta kaip: ${data.user.email}`;
    }
});

// 3. Išsaugoti žygį į Supabase duomenų bazę
document.getElementById('btn-save')?.addEventListener('click', async () => {
    if (pathPoints.length === 0) {
        alert('Pirmiausia nubraižykite maršrutą žemėlapyje (pasirinkite "Brėžti maršrutą")!');
        return;
    }

    const title = prompt('Įveskite žygio pavadinimą:', 'Mano Žygis');
    if (!title) return;

    const { data, error } = await supabase.from('zygiai').insert([
        { title: title, coordinates: pathPoints }
    ]);

    if (error) {
        alert('Klaida saugant žygį: ' + error.message);
    } else {
        alert('Žygis sėkmingai išsaugotas duomenų bazėje!');
        location.reload();
    }
});

// 4. Funkcija, kuri paims visų vartotojų žygius iš duomenų bazės
async function uzkrautiVisusZygius() {
    const { data: zygiai, error } = await supabase
        .from('zygiai')
        .select('*');

    if (error) {
        console.error('Klaida užkraunant žygius:', error);
        return;
    }

    // Nupiešiame kiekvieną išsaugotą maršrutą žemėlapyje
    if (zygiai) {
        zygiai.forEach(zygis => {
            if (zygis.coordinates && zygis.coordinates.length > 0) {
                const polyline = L.polyline(zygis.coordinates, { color: '#ef4444', weight: 4 }).addTo(map);
                polyline.bindPopup(`<b>${zygis.title || 'Žygis'}</b>`);
            }
        });
    }
}

// Iškvietimas puslapio užkrovimo metu
uzkrautiVisusZygius();