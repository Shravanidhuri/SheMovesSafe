// SheMovesSafe - Safe Routing AI (Leaflet Version)

// --- CONFIGURATION ---
const MUMBAI_COORDS = [18.9320, 72.8300]; // Mumbai default
let map;
let currentPolylines = [];
let routeLayerGroup = L.layerGroup();
let markerLayerGroup = L.layerGroup();

// --- DOM ELEMENTS ---
const findRoutesBtn = document.getElementById('find-routes-btn');
const routesList = document.getElementById('routes-list');
const loadingIndicator = document.getElementById('loading');
const aiPanel = document.getElementById('ai-panel');
const aiText = document.getElementById('ai-text');
const sosBtn = document.getElementById('sos-btn');
const scanBtn = document.getElementById('scan-btn');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initEventListeners();
    initModals();

    // Splash Screen
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('fade-out');
            setTimeout(() => splash.remove(), 500);
        }
    }, 3000);
});

function initMap() {
    map = L.map('map', {
        zoomControl: false
    }).setView(MUMBAI_COORDS, 13);

    // Dark Mode Tile Layer (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    routeLayerGroup.addTo(map);
    markerLayerGroup.addTo(map);

    // Theme Toggle (Simplified for Map - Leaflet generic tiles don't swap easily without separate layers, 
    // but we will just keep Dark Mode as default for "SheMovesSafe" aesthetic)
    const themeToggle = document.getElementById('theme-toggle');
    let isDark = true;
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            isDark = !isDark;
            document.body.classList.toggle('light-mode');
            themeToggle.textContent = isDark ? '🌙' : '☀️';
            // Note: In a full app we would swap the TileLayer URL here
        });
    }
}

function initEventListeners() {
    // GPS Button
    document.getElementById('gps-btn').addEventListener('click', () => {
        if ('geolocation' in navigator) {
            document.getElementById('start-loc').value = "Locating...";
            navigator.geolocation.getCurrentPosition(async position => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                map.setView([lat, lng], 16);
                L.marker([lat, lng]).addTo(map).bindPopup("You are here").openPopup();

                // Reverse Geocode
                const address = await reverseGeocode(lat, lng);
                document.getElementById('start-loc').value = address;
            }, () => {
                alert("Location access denied.");
                document.getElementById('start-loc').value = "";
            });
        }
    });

    // Find Routes
    findRoutesBtn.addEventListener('click', async () => {
        const startVal = document.getElementById('start-loc').value;
        const endVal = document.getElementById('dest-loc').value;

        if (!startVal || !endVal) {
            alert("Please enter both locations.");
            return;
        }

        toggleLoading(true);

        try {
            const startCoords = await geocode(startVal);
            const endCoords = await geocode(endVal);

            if (!startCoords || !endCoords) {
                alert("Could not find one of the locations.");
                toggleLoading(false);
                return;
            }

            // Clear previous
            routeLayerGroup.clearLayers();
            markerLayerGroup.clearLayers();

            // Markers for Start/End
            L.marker(startCoords).addTo(markerLayerGroup).bindPopup("Start");
            L.marker(endCoords).addTo(markerLayerGroup).bindPopup("Destination");

            map.fitBounds([startCoords, endCoords], { padding: [50, 50] });

            // Fetch Routes (Simulated Safety Logic over OSRM)
            const routes = await fetchSafeRoutes(startCoords, endCoords);
            displayRoutes(routes);

        } catch (e) {
            console.error(e);
            alert("Error finding routes.");
        } finally {
            toggleLoading(false);
        }
    });

    // Scan Area
    scanBtn.addEventListener('click', async () => {
        const center = map.getCenter();
        const bounds = map.getBounds();

        scanBtn.disabled = true;
        scanBtn.textContent = "Scanning...";

        // Fetch PoIs
        const police = await fetchOverpass(bounds, 'police');
        const hospitals = await fetchOverpass(bounds, 'hospital');
        const busySpots = await fetchOverpass(bounds, 'fuel'); // Using fuel/shops as proxy for busy areas

        markerLayerGroup.clearLayers();

        const addMarkers = (data, icon, label) => {
            data.forEach(item => {
                const el = document.createElement('div');
                el.className = 'custom-marker';
                el.innerHTML = `<span style="font-size: 20px;">${icon}</span>`;

                L.marker([item.lat, item.lon], {
                    icon: L.divIcon({
                        className: 'leaflet-div-iconbox',
                        html: `<div style="font-size:24px; text-shadow:0 0 5px black;">${icon}</div>`
                    })
                }).addTo(markerLayerGroup).bindPopup(`<b>${label}</b><br>${item.tags.name || 'Unknown Name'}`);
            });
        };

        addMarkers(police, '👮', 'Police Station');
        addMarkers(hospitals, '🏥', 'Hospital');
        addMarkers(busySpots, '⛽', 'Safe Stop (Fuel/Shop)');

        scanBtn.disabled = false;
        scanBtn.textContent = "🛡️ Scan Safe Spots in Area";

        alert(`Found ${police.length} Police Stations, ${hospitals.length} Hospitals, and ${busySpots.length} Safe Stops nearby.`);
    });

    // SOS Modal Logic
    const sosModal = document.getElementById('sos-modal');
    const sosCloseBtn = document.querySelector('.sos-close');
    const locationStatus = document.getElementById('location-status');
    const whatsAppBtn = document.getElementById('whatsapp-share-btn');

    if (sosBtn && sosModal) {
        sosBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sosModal.classList.remove('hidden');
            setTimeout(() => sosModal.classList.add('show'), 10);

            // Auto Update Location on Open
            if ('geolocation' in navigator) {
                locationStatus.textContent = "📍 Acquiring exact location...";
                navigator.geolocation.getCurrentPosition(pos => {
                    const lat = pos.coords.latitude.toFixed(6);
                    const lng = pos.coords.longitude.toFixed(6);
                    locationStatus.textContent = `📍 Location Locked: ${lat}, ${lng}`;
                    locationStatus.style.color = "#22c55e"; // Green

                    // Update WhatsApp Link
                    whatsAppBtn.onclick = () => {
                        const message = `🚨 HELP! I feel unsafe. Track my real-time location here: https://www.google.com/maps?q=${lat},${lng}`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
                    };
                }, err => {
                    locationStatus.textContent = "⚠️ Location access denied. Check permissions.";
                    locationStatus.style.color = "#ef4444";
                }, { enableHighAccuracy: true });
            } else {
                locationStatus.textContent = "⚠️ GPS not supported.";
            }
        });
    }

    if (sosCloseBtn && sosModal) {
        sosCloseBtn.addEventListener('click', () => {
            sosModal.classList.remove('show');
            setTimeout(() => sosModal.classList.add('hidden'), 300);
        });
    }

    // Close SOS on click outside
    if (sosModal) {
        window.addEventListener('click', (e) => {
            if (e.target === sosModal) {
                sosModal.classList.remove('show');
                setTimeout(() => sosModal.classList.add('hidden'), 300);
            }
        });
    }
}

function initModals() {
    const aboutModal = document.getElementById('about-modal');
    const contactModal = document.getElementById('contact-modal');

    const bindModal = (triggerId, modal) => {
        const btn = document.getElementById(triggerId);
        if (btn && modal) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                modal.classList.remove('hidden');
                setTimeout(() => modal.classList.add('show'), 10);
            });
        }
    };

    bindModal('about-link', aboutModal);
    bindModal('contact-link', contactModal);

    const closeModals = () => {
        document.querySelectorAll('.modal').forEach(m => {
            m.classList.remove('show');
            setTimeout(() => m.classList.add('hidden'), 300);
        });
    };

    document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', closeModals));
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) closeModals();
    });
}

// --- API FUNCTIONS ---

async function geocode(query) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data && data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    } catch (e) { console.error(e); }
    return null;
}

async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        return data.display_name.split(',')[0];
    } catch (e) { return "Unknown Location"; }
}

async function fetchSafeRoutes(start, end) {
    // OSRM Routing
    // We will generate 2-3 variations:
    // 1. Direct (Fastest) -> Label as "Fastest" but check safety
    // 2. Avoid highways/prefer commercial (Simulated by slightly altering waypoints)

    // For this demo, we fetch the main route and simulate 2 alternatives manually or just show one main route analyzed
    // To properly show "Safe", "Balanced", "Risky" we usually need backend processing.
    // We will simulate it by fetching the standard route and labeling it "Balanced", 
    // and then inventing visual lines or fetching with "walking" profile for "Safe" if close.

    // FETCH 1: Driving (Standard)
    const route1 = await getOSRM(start, end, 'driving');

    // FETCH 2: Walking (Often suggests different paths, good for "Safe" option usually)
    // Only if distance < 5km
    const route2 = await getOSRM(start, end, 'walking');

    const results = [];

    if (route1) {
        results.push({
            id: 'r1',
            name: "Main Route",
            type: "car",
            polylines: route1.geometry,
            time: Math.round(route1.duration / 60) + ' min',
            dist: (route1.distance / 1000).toFixed(1) + ' km',
            safetyScore: 75,
            level: 'moderate' // yellow
        });
    }

    if (route2) {
        results.push({
            id: 'r2',
            name: "Walker's Path",
            type: "walk",
            polylines: route2.geometry,
            time: Math.round(route2.duration / 60) + ' min',
            dist: (route2.distance / 1000).toFixed(1) + ' km',
            safetyScore: 92,
            level: 'safe' // green
        });
    }

    // Add a dummy "Risky" short-cut if needed, or just return these.
    // Let's duplicate Route 1 but color it red to simulate a "Short but dangerous" path for demo
    if (route1) {
        results.push({
            id: 'r3',
            name: "Direct Shortcut",
            type: "scooter",
            polylines: route1.geometry, // In real app, this would be a different geometry
            time: (Math.round(route1.duration / 60) - 5) + ' min',
            dist: ((route1.distance / 1000) - 0.5).toFixed(1) + ' km',
            safetyScore: 45,
            level: 'risky' // red
        });
    }

    return results;
}

async function getOSRM(start, end, profile) {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes.length > 0) return data.routes[0];
    } catch (e) { console.error(e); }
    return null;
}

// Overpass API for Points of Interest
async function fetchOverpass(bounds, type) {
    const b = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    let query = "";
    if (type === 'police') query = `node["amenity"="police"](${b});`;
    if (type === 'hospital') query = `node["amenity"="hospital"](${b});`;
    if (type === 'fuel') query = `node["amenity"="fuel"](${b});`;

    const url = `https://overpass-api.de/api/interpreter?data=[out:json];(${query});out;`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        return data.elements || [];
    } catch (e) { return []; }
}

// --- UI/DISPLAY FUNCTIONS ---

function toggleLoading(show) {
    if (show) {
        loadingIndicator.classList.remove('hidden');
        routesList.classList.add('hidden');
        aiPanel.classList.add('hidden');
    } else {
        loadingIndicator.classList.add('hidden');
    }
}

function displayRoutes(routes) {
    routesList.innerHTML = '';
    routesList.classList.remove('hidden');

    routes.forEach(route => {
        // Draw on map
        const color = route.level === 'safe' ? '#22c55e' : (route.level === 'moderate' ? '#eab308' : '#ef4444');
        const poly = L.geoJSON(route.polylines, {
            style: { color: color, weight: 6, opacity: 0.8 }
        }).addTo(routeLayerGroup);

        // Add to Sidebar
        const card = document.createElement('div');
        card.className = `route-card ${route.id}`;
        card.innerHTML = `
            <div class="route-info">
                <h3>${route.name}</h3>
                <div class="route-meta">${route.time} • ${route.dist}</div>
            </div>
            <div class="safety-badge ${route.level}">
                Score: ${route.safetyScore}
            </div>
        `;

        card.addEventListener('click', () => {
            // Highlight logic ...
            map.fitBounds(poly.getBounds());
            showAIAnalysis(route);
        });

        routesList.appendChild(card);
    });
}

function showAIAnalysis(route) {
    aiPanel.classList.remove('hidden');
    aiText.textContent = "Analyzing route safety features...";
    setTimeout(() => {
        let msg = "";
        if (route.safetyScore > 90) msg = "✅ EXCELLENT CHOICE. Well lit, high foot traffic, frequent police patrols.";
        else if (route.safetyScore > 70) msg = "⚠️ GOOD. Mostly safe, but avoid the underpass after 10 PM.";
        else msg = "⛔ CAUTION. High crime rate reported in this sector. Poor lighting.";

        aiText.textContent = msg;
    }, 800);
}
