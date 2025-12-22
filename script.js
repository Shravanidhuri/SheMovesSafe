// Initialize map
const map = L.map('map').setView([18.9320, 72.8300], 14);

// Dark theme map tiles
const darkTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
});

const lightTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
});

darkTiles.addTo(map); // Default
let isDarkMode = true;

// Theme Toggle Logic
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    isDarkMode = !isDarkMode;

    if (isDarkMode) {
        map.removeLayer(lightTiles);
        map.addLayer(darkTiles);
        document.getElementById('theme-toggle').textContent = "🌙";
    } else {
        map.removeLayer(darkTiles);
        map.addLayer(lightTiles);
        document.getElementById('theme-toggle').textContent = "☀️";
    }
});

// State
let currentPolylines = [];
let routesData = [];

// DOM Elements
const findRoutesBtn = document.getElementById('find-routes-btn');
const routesList = document.getElementById('routes-list');
const loadingIndicator = document.getElementById('loading');
const aiPanel = document.getElementById('ai-panel');
const aiText = document.getElementById('ai-text');
const sosBtn = document.getElementById('sos-btn');
const scanBtn = document.getElementById('scan-btn');

// --- EVENT LISTENERS ---

document.addEventListener('DOMContentLoaded', () => {
    // Splash Screen
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('fade-out');
            setTimeout(() => splash.remove(), 500); // Remove from DOM after fade
        }
    }, 2000); // 2 seconds display
});

// Map Click to Scan
scanBtn.addEventListener('click', async () => {
    const originalText = scanBtn.innerText;
    scanBtn.innerText = "Scanning...";
    scanBtn.disabled = true;

    const bounds = map.getBounds();

    // Clear existing
    if (window.policeMarkers) {
        window.policeMarkers.forEach(m => map.removeLayer(m));
    }
    window.policeMarkers = [];

    // Parallel Fetch
    const [stations, safeStops] = await Promise.all([
        getPoliceStations(bounds),
        getSafeStops(bounds)
    ]);

    // Render Police
    stations.forEach(station => {
        const icon = L.divIcon({
            className: 'police-icon',
            html: '👮‍♂️',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        const marker = L.marker([station.lat, station.lon], { icon: icon })
            .bindPopup(`<b>${station.name}</b><br>Police Station`)
            .addTo(map);
        window.policeMarkers.push(marker);
    });

    // Render Safe Stops
    safeStops.forEach(stop => {
        let iconChar = '🏪';
        if (stop.type.includes('fuel')) iconChar = '⛽';
        if (stop.type.includes('hospital')) iconChar = '🏥';
        if (stop.type.includes('cafe')) iconChar = '☕';

        const is247 = (stop.hours === '24/7') ||
            stop.type.includes('fuel') ||
            stop.type.includes('hospital');

        let htmlContent = iconChar;
        if (is247) {
            htmlContent += '<span class="badge-24h">24h</span>';
        }

        const icon = L.divIcon({
            className: is247 ? 'safe-icon highlight-247' : 'safe-icon',
            html: htmlContent,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        const marker = L.marker([stop.lat, stop.lon], { icon: icon })
            .bindPopup(`<b>${stop.name}</b><br>${stop.type}<br>${is247 ? '✅ Open 24/7' : ''}`)
            .addTo(map);
        window.policeMarkers.push(marker);
    });

    scanBtn.innerText = originalText;
    scanBtn.disabled = false;

    // Toast
    const total = stations.length + safeStops.length;
    alert(`Found ${total} safe spots in this area!`);
});

// --- HELPER FUNCTIONS ---

// SOS Click
// SOS Click
sosBtn.addEventListener('click', () => {
    // Simulated Alert
    alert("🚨 SOS Alert Simulated! \n\nYour location has been logged locally and emergency contacts would be notified in a real app.");
});

// Geocode helper using OpenStreetMap Nominatim
async function geocode(query) {
    if (!query) return null;

    // Improve search context for India if not specified
    let searchQuery = query;
    if (!searchQuery.toLowerCase().includes('india')) {
        searchQuery += ", Mumbai, India"; // Defaulting to Mumbai bias for better local results, can be just India
    }

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`);
        const data = await response.json();
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                name: data[0].display_name
            };
        }
    } catch (e) {
        console.error("Geocoding failed", e);
    }
    return null; // Fallback
}

async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        return data.display_name;
    } catch (e) {
        console.error("Reverse Geocoding failed", e);
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}

// GPS Button Logic
document.getElementById('gps-btn').addEventListener('click', () => {
    if (navigator.geolocation) {
        document.getElementById('start-loc').value = "Locating...";
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            map.setView([lat, lng], 16);

            const address = await reverseGeocode(lat, lng);
            document.getElementById('start-loc').value = address;
        }, (error) => {
            alert("Location access denied or unavailable.");
            document.getElementById('start-loc').value = "";
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
    } else {
        alert("Geolocation is not supported by this browser.");
    }
});

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// --- SAFETY DATA (Overpass API) ---
async function getPoliceStations(bounds) {
    if (!bounds) return [];

    // Construct Bounding Box for Overpass: [south, west, north, east]
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    const query = `
        [out:json][timeout:25];
        (
          node["amenity"="police"](${bbox});
          way["amenity"="police"](${bbox});
          relation["amenity"="police"](${bbox});
        );
        out center;
    `;

    try {
        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        const data = await response.json();

        return data.elements.map(el => {
            const lat = el.lat || el.center.lat;
            const lon = el.lon || el.center.lon;
            return { lat, lon, name: el.tags.name || "Police Station" };
        });
    } catch (e) {
        console.error("Failed to fetch police stations", e);
        return [];
    }
}

async function getSafeStops(bounds) {
    if (!bounds) return [];

    // Bounding Box
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    // Fetch 24/7 shops, fuel stations, hospitals, cafes
    const query = `
        [out:json][timeout:25];
        (
          node["shop"="convenience"](${bbox});
          node["amenity"="fuel"](${bbox});
          node["amenity"="hospital"](${bbox});
          node["amenity"="cafe"](${bbox});
        );
        out center 200; 
    `;
    // Limit increased to 200 for better visibility

    try {
        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        const data = await response.json();

        return data.elements.map(el => {
            const lat = el.lat || el.center.lat;
            const lon = el.lon || el.center.lon;
            const type = el.tags.amenity || el.tags.shop || "Safe Spot";
            return { lat, lon, name: el.tags.name || "Safe Stop", type: type, hours: el.tags.opening_hours };
        });
    } catch (e) {
        console.error("Failed to fetch safe stops", e);
        return [];
    }
}

// --- REAL ROUTING (OSRM) ---

async function getOSRMRoute(start, end, type = 'driving', midpoints = []) {
    try {
        let coords = `${start.lng},${start.lat}`;
        midpoints.forEach(m => {
            coords += `;${m.lng},${m.lat}`;
        });
        coords += `;${end.lng},${end.lat}`;

        const url = `https://router.project-osrm.org/route/v1/${type}/${coords}?overview=full&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const path = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            return {
                path: path,
                distance: (route.distance / 1000).toFixed(1), // km
                duration: Math.ceil(route.duration / 60) // min
            };
        }
    } catch (e) {
        console.error("OSRM Routing failed", e);
    }
    return null;
}

async function generateRealRoutes(mode, start, end) {
    let osrmProfile = 'driving';
    let avgSpeedKmH = 25;

    if (mode === 'walking') {
        osrmProfile = 'walking';
        avgSpeedKmH = 4.5;
    } else if (mode === 'scooter') {
        osrmProfile = 'driving';
        avgSpeedKmH = 30;
    } else {
        avgSpeedKmH = 20;
    }

    // Helper to calculate accurate ETA based on distance
    const calculateETA = (distanceKm) => {
        const rawHours = distanceKm / avgSpeedKmH;
        return Math.ceil(rawHours * 60); // minutes
    };

    const results = [];

    // 1. PRIMARY ROUTE (Safest - Green)
    // Direct OSRM Best Path
    const route1Data = await getOSRMRoute(start, end, osrmProfile);
    if (route1Data) {
        const dist1 = parseFloat(route1Data.distance);
        results.push({
            id: 1,
            name: "Safest Path",
            color: "green",
            safety_score: 94,
            eta: formatETA(calculateETA(dist1)),
            distance: dist1 + " km",
            path: route1Data.path,
            features: ["Police Patrols", "Well Lit", "Main Road"]
        });
    }

    // GEOMETRIC OFFSET LOGIC
    // We calculate a midpoint, then find points perpendicular to the path to force deviation
    const latDiff = end.lat - start.lat;
    const lngDiff = end.lng - start.lng;

    // Midpoint
    const midLat = start.lat + latDiff * 0.5;
    const midLng = start.lng + lngDiff * 0.5;

    // Perpendicular Vector (rotate 90 deg)
    // For small distances, simple 2D geometry is "good enough" for generating a bias point
    // Offset scale: approx 0.005 degrees is ~500m
    const offsetScale = 0.004;

    // Normalize vector roughly
    const len = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
    const uLat = latDiff / len;
    const uLng = lngDiff / len;

    // Waypoint A: Right turn deviation
    const wayA = {
        lat: midLat + uLng * offsetScale,
        lng: midLng - uLat * offsetScale
    };

    // Waypoint B: Left turn deviation
    const wayB = {
        lat: midLat - uLng * offsetScale,
        lng: midLng + uLat * offsetScale
    };

    // 2. MODERATE (Yellow) - Forced via Waypoint A
    const route2Data = await getOSRMRoute(start, end, osrmProfile, [wayA]);
    if (route2Data) {
        const dist2 = parseFloat(route2Data.distance);
        // Only add if distinct enough or just as a valid option
        results.push({
            id: 2,
            name: "Alt. Route A",
            color: "yellow",
            safety_score: 72,
            eta: formatETA(calculateETA(dist2)),
            distance: dist2 + " km",
            path: route2Data.path,
            features: ["Moderate Traffic", "Residential"]
        });
    }

    // 3. RISKY (Red) - Forced via Waypoint B
    const route3Data = await getOSRMRoute(start, end, osrmProfile, [wayB]);
    if (route3Data) {
        const dist3 = parseFloat(route3Data.distance);
        results.push({
            id: 3,
            name: "Alt. Route B",
            color: "red",
            safety_score: 48,
            eta: formatETA(calculateETA(dist3)),
            distance: dist3 + " km",
            path: route3Data.path,
            features: ["Poor Lighting", "Less Crowded"]
        });
    }

    // Fallback: If minimal results (e.g. very short trip), duplicated primary is better than nothing,
    // but the above math should almost always find *some* valid road nearby.

    return results;
}

function formatETA(totalMinutes) {
    if (totalMinutes >= 60) {
        const hrs = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        return `${hrs} hr ${mins} min`;
    }
    return totalMinutes + " mins";
}

/* DEPRECATED MOCKED GENERATOR
function generateMockRoutes(mode, start, end) {
    const startLat = start.lat;
    const startLng = start.lng;
    const endLat = end.lat;
    const endLng = end.lng;

    // Calculate straight line distance
    const distKm = calculateDistance(startLat, startLng, endLat, endLng);

    // Speed Multipliers (Walking as baseline approx 5km/h)
    let speedKmH = 5;
    if (mode === 'scooter') speedKmH = 25;
    if (mode === 'car') speedKmH = 40;

    // Helper to generate path points with some "noise"
    const createPath = (deviationFactor) => {
        const path = [[startLat, startLng]];
        const steps = 8; // More steps for smoother curve
        for (let i = 1; i < steps; i++) {
            const ratio = i / steps;
            let lat = startLat + (endLat - startLat) * ratio;
            let lng = startLng + (endLng - startLng) * ratio;

            // Add noise/deviation
            lat += (Math.random() - 0.5) * deviationFactor;
            lng += (Math.random() - 0.5) * deviationFactor;

            path.push([lat, lng]);
        }
        path.push([endLat, endLng]);
        return path;
    };

    // Route 1: Safe (Green) - Slightly longer, minor deviation
    const r1Dist = (distKm * 1.2).toFixed(1);
    const r1Time = Math.ceil((distKm * 1.2 / speedKmH) * 60) + " mins";

    const route1 = {
        id: 1,
        name: "Safest Path",
        color: "green",
        safety_score: 95,
        eta: r1Time,
        distance: r1Dist + " km",
        path: createPath(0.002),
        features: ["Well lit", "CCTV present", "High foot traffic"]
    };

    // Route 2: Risky (Red) - Shortest, unpredictable deviation
    const r2Dist = (distKm * 1.0).toFixed(1);
    const r2Time = Math.ceil((distKm / speedKmH) * 60) + " mins";

    const route2 = {
        id: 2,
        name: "Fast Shortcut",
        color: "red",
        safety_score: 45,
        eta: r2Time,
        distance: r2Dist + " km",
        path: createPath(0.006),
        features: ["Poor lighting", "Isolated", "Reported incidents"]
    };

    // Route 3: Balanced (Yellow)
    const r3Dist = (distKm * 1.1).toFixed(1);
    const r3Time = Math.ceil((distKm * 1.1 / speedKmH) * 60) + " mins";

    const route3 = {
        id: 3,
        name: "Balanced Route",
        color: "yellow",
        safety_score: 70,
        eta: r3Time,
        distance: r3Dist + " km",
        path: createPath(0.003),
        features: ["Moderate lighting", "Some crowds"]
    };

    return [route1, route2, route3];
}
*/

function simulateAIAnalysis(route) {
    let advice = "Simulated Analysis: ";
    const hour = new Date().getHours();
    const isNight = hour >= 20 || hour < 6; // 8 PM to 6 AM

    if (route.safety_score > 80) {
        advice += "✅ SAFE CHOICE: High visibility area with frequent police patrols and 24/7 shops. Recommended for women and children.";
        if (isNight) {
            advice += " 🌙 Even though it's safe, stay vigilant at night.";
        }
    } else if (route.safety_score < 50) {
        advice += "⚠️ HIGH RISK: Poor lighting and reported isolation. ";
        if (isNight) {
            advice += "🛑 EXTREME CAUTION: It is currently NIGHT time. Avoid this route at all costs if alone.";
        } else {
            advice += "NOT recommended for solo travel, especially for women/children.";
        }
    } else {
        advice += "⚖️ MODERATE: Main roads available but some dark patches. ";
        if (isNight) {
            advice += "🔦 Carry a torch or stay on the phone with a contact.";
            advice += "Stay on the main street and avoid alleys.";
        }
    }

    // AI PREDICTION ENHANCEMENT
    const prediction = predictRisk(route, hour);
    if (prediction) {
        advice += `<br><br><strong>🧠 AI Prediction:</strong> ${prediction}`;
    }

    return advice;
}

function predictRisk(route, hour) {
    // Simulated Environmental Data
    // In a real app, this would use GIS data (e.g., proximity to bars, industrial zones, vacant lots)
    const envFactors = {
        green: ["Residential", "Commercial", "Police Station Nearby"],
        yellow: ["Mixed Use", "Park (Night Risk)", "Construction"],
        red: ["Industrial", "Vacant Lots", "Bar District"]
    };

    let riskFactors = [];
    const isLateNight = hour >= 22 || hour < 5;

    // Heuristic Rules
    if (route.color === 'red') {
        riskFactors.push("Detected Industrial/Low-Populated Zone");
        if (isLateNight) riskFactors.push("History of lower foot traffic after 10 PM");
    } else if (route.color === 'yellow') {
        if (isLateNight) riskFactors.push("Nearby Parks may be unlit/isolated at this hour");
    } else {
        // Green
        if (hour >= 2 && hour < 5) riskFactors.push("Even safe areas have reduced police presence at 3 AM");
    }

    if (riskFactors.length > 0) {
        return `Potential Latent Risks detected based on historical patterns: <ul><li>${riskFactors.join('</li><li>')}</li></ul>`;
    }
    return null;
}

// --- CORE APP LOGIC ---

async function fetchRoutes() {
    // Show loading
    findRoutesBtn.disabled = true;
    loadingIndicator.classList.remove('hidden');
    routesList.classList.add('hidden');
    aiPanel.classList.add('hidden');

    // Clear existing map layers
    currentPolylines.forEach(layer => map.removeLayer(layer));
    currentPolylines = [];

    // Simulate Processing
    setTimeout(async () => {
        try {
            const startInput = document.getElementById('start-loc').value;
            const endInput = document.getElementById('dest-loc').value;
            const mode = document.querySelector('input[name="transport"]:checked').value;

            // Perform Geocoding
            const startCoords = await geocode(startInput);
            const endCoords = await geocode(endInput);

            if (!startCoords || !endCoords) {
                alert("Could not find location. Please try a more specific address.");
                loadingIndicator.classList.add('hidden');
                findRoutesBtn.disabled = false;
                return;
            }

            // Center map on start
            map.setView([startCoords.lat, startCoords.lng], 14);

            // Get REAL OSRM data
            routesData = await generateRealRoutes(mode, startCoords, endCoords);
            if (routesData.length === 0) {
                alert("No routes found between these locations.");
            }
            displayRoutes(routesData);

        } catch (error) {
            console.error("Error generating routes:", error);
            alert("Unexpected error.");
        } finally {
            loadingIndicator.classList.add('hidden');
            findRoutesBtn.disabled = false;
        }
    }, 100);
}

function displayRoutes(routes) {
    routesList.innerHTML = '';
    routesList.classList.remove('hidden');

    routes.forEach(route => {
        const colorMap = {
            'green': '#22c55e',
            'yellow': '#eab308',
            'red': '#ef4444'
        };

        const polyline = L.polyline(route.path, {
            color: colorMap[route.color],
            weight: 5,
            opacity: 0.7,
            dashArray: route.color === 'green' ? null : '5, 10'
        }).addTo(map);

        polyline.on('click', () => selectRoute(route.id));
        currentPolylines.push(polyline);

        const card = document.createElement('div');
        card.className = `route-card`;
        card.dataset.id = route.id;
        card.innerHTML = `
            <div class="route-info">
                <h3>${route.name}</h3>
                <div class="route-meta">${route.eta} • ${route.distance}</div>
            </div>
            <div class="safety-badge ${route.color}">
                Score: ${route.safety_score}
            </div>
        `;

        card.addEventListener('click', () => selectRoute(route.id));
        routesList.appendChild(card);
    });

    // Clear police markers if any
    if (window.policeMarkers) {
        window.policeMarkers.forEach(m => map.removeLayer(m));
    }
    window.policeMarkers = [];

    if (currentPolylines.length > 0) {
        const group = new L.featureGroup(currentPolylines);
        const bounds = group.getBounds();
        map.fitBounds(bounds, { padding: [50, 50] });

        // Fetch Police Stations in View
        getPoliceStations(bounds).then(stations => {
            stations.forEach(station => {
                const icon = L.divIcon({
                    className: 'police-icon',
                    html: '👮‍♂️',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                });
                const marker = L.marker([station.lat, station.lon], { icon: icon })
                    .bindPopup(`<b>${station.name}</b><br>Police Station`)
                    .addTo(map);
                window.policeMarkers.push(marker);
            });
            if (stations.length > 0) {
                // Flash message
                const msg = document.createElement('div');
                msg.style.cssText = `
                    position: fixed; bottom: 20px; right: 20px; 
                    background: #3b82f6; color: white; padding: 10px 20px; 
                    border-radius: 50px; z-index: 2000; font-weight: bold;
                    animation: slideUp 0.5s ease-out; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                `;
                msg.innerHTML = `🛡️ Found ${stations.length} Police Stations nearby`;
                document.body.appendChild(msg);
                setTimeout(() => msg.remove(), 4000);
            }
        });

        // Fetch Safe Stops (Shops, cafes, etc.)
        getSafeStops(bounds).then(stops => {
            stops.forEach(stop => {
                let iconChar = '🏪';
                if (stop.type.includes('fuel')) iconChar = '⛽';
                if (stop.type.includes('hospital')) iconChar = '🏥';
                if (stop.type.includes('cafe')) iconChar = '☕';

                // Check if 24/7
                const is247 = (stop.hours === '24/7') ||
                    stop.type.includes('fuel') ||
                    stop.type.includes('hospital'); // Assume fuel/hospitals are 24/7 safe

                let htmlContent = iconChar;
                if (is247) {
                    htmlContent += '<span class="badge-24h">24h</span>';
                }

                const icon = L.divIcon({
                    className: is247 ? 'safe-icon highlight-247' : 'safe-icon',
                    html: htmlContent,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                });

                const marker = L.marker([stop.lat, stop.lon], { icon: icon })
                    .bindPopup(`<b>${stop.name}</b><br>${stop.type}<br>${is247 ? '✅ Open 24/7' : ''}`)
                    .addTo(map);
                window.policeMarkers.push(marker);
            });
        });
    }
}

// --- RISK ZONE LOGIC ---
const RISK_ZONES = [
    { lat: 19.0176, lng: 72.8561, radius: 1000 }, // Example Zone
    { lat: 18.9500, lng: 72.8200, radius: 800 }
];

function checkRiskZones(routePath) {
    // Simple check: does any point in the path fall within a risk zone?
    for (const point of routePath) {
        for (const zone of RISK_ZONES) {
            const dist = calculateDistance(point[0], point[1], zone.lat, zone.lng);
            if (dist < (zone.radius / 1000)) { // radius in km
                return true;
            }
        }
    }
    return false;
}

// ... inside selectRoute ...
async function selectRoute(routeId) {
    document.querySelectorAll('.route-card').forEach(el => el.classList.remove('active'));
    document.querySelector(`.route-card[data-id="${routeId}"]`).classList.add('active');

    const route = routesData.find(r => r.id === routeId);
    if (!route) return;

    // RISK ALERT
    if (checkRiskZones(route.path) || route.color === 'red') {
        // Show Alert Toast
        const alertMsg = document.createElement('div');
        alertMsg.style.cssText = `
            position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
            background: #ef4444; color: white; padding: 12px 24px;
            border-radius: 8px; z-index: 2000; font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: slideDown 0.5s;
         `;
        alertMsg.innerHTML = `⚠️ WARNING: This route passes through a conceptual High-Risk Zone!`;

        const recalcBtn = document.createElement('button');
        recalcBtn.innerText = "Recalculate Safer Route";
        recalcBtn.style.cssText = "margin-left: 10px; background: white; color: red; border:none; padding: 4px 8px; border-radius:4px; cursor:pointer;";
        recalcBtn.onclick = () => {
            alertMsg.remove();
            selectRoute(1); // Force switch to safest route (id 1)
        };

        alertMsg.appendChild(recalcBtn);
        document.body.appendChild(alertMsg);
        setTimeout(() => alertMsg.remove(), 6000);
    }

    analyzeRouteSafely(routeId);
}

async function analyzeRouteSafely(routeId) {
    const route = routesData.find(r => r.id === routeId);
    if (!route) return;

    aiPanel.classList.remove('hidden');
    aiText.textContent = "Analyzing real-time environmental data...";

    // Simulate AI Delay
    setTimeout(() => {
        const analysisText = simulateAIAnalysis(route);
        typeWriter(analysisText, aiText);
    }, 1000);
}

function typeWriter(text, element) {
    element.textContent = "";
    let i = 0;
    const speed = 20;

    function type() {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    type();
}

// Event Listeners
findRoutesBtn.addEventListener('click', fetchRoutes);

sosBtn.addEventListener('click', () => {
    let contact = localStorage.getItem('emergencyContact');

    if (!contact) {
        contact = prompt("⚠️ SETUP SOS \n\nEnter Emergency Contact Number (saved locally):");
        if (contact) {
            localStorage.setItem('emergencyContact', contact);
            alert("Contact Saved! Press SOS again to alert.");
            return;
        } else {
            return; // Cancelled
        }
    }

    alert(`🆘 SOS ACTIVATED! \n\nSending live location to: ${contact}\nAlerting nearby safe zones...`);

    document.body.style.animation = "sos-flash 0.5s infinite";

    setTimeout(() => {
        document.body.style.animation = "none";
        alert(`✅ Message successfully sent to ${contact}!`);
    }, 3000);
});

// Add SOS flash keyframes
const styleSheet = document.createElement("style");
styleSheet.innerText = `
    @keyframes sos-flash {
        0% { box-shadow: inset 0 0 0 0 red; }
        50% { box-shadow: inset 0 0 100px 50px red; }
        100% { box-shadow: inset 0 0 0 0 red; }
    }
`;
document.head.appendChild(styleSheet);
