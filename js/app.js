// Configuration - Pre-filled with your explicit callsigns
const MY_BALLOONS = {
    "ACTIVE": ["SP6MPL-9", "SP6MPL-32", "SP6MPL-34"],
    "LANDED": ["SP6MPL-31", "SP6MPL-33", "SP6MPL-37", "SP6MPL-38", "SP6MPL-39", "SP6MPL-40"]
};

// Initialize Leaflet Map with a sleek dark tile layer
const map = L.map('map').setView([52.0, 19.0], 5); // Centered on Central Europe / Poland

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

// Keep track of balloon markers, tracks, and telemetry data objects
const balloonLayers = {};

// Update the statistics cards in the UI sidebar
function updateStatsCounters() {
    document.getElementById('count-active').textContent = MY_BALLOONS.ACTIVE.length;
    document.getElementById('count-landed').textContent = MY_BALLOONS.LANDED.length;
}

// Fetch current positions and full telemetry history for a specific callsign
async function fetchBalloonData(callsign, isActive) {
    try {
        // Sondehub API endpoint for full tracking history of a payload
        const response = await fetch(`https://api.amateur.sondehub.org/v1/payload/${callsign}`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        
        const data = await response.json();
        
        // Data format can be an object with keys or an array; handle safely
        if (!data || Object.keys(data).length === 0) return null;
        
        // Extract updates and sort chronologically by time
        const positions = Object.values(data).sort((a, b) => new Date(a.time) - new Date(b.time));
        if (positions.length === 0) return null;
        
        const latest = positions[positions.length - 1];
        return {
            callsign: callsign,
            isActive: isActive,
            latest: latest,
            history: positions
        };
    } catch (error) {
        console.error(`Failed to load data for ${callsign}:`, error);
        return null;
    }
}

// Render data to map and side panels
function renderBalloon(balloon) {
    if (!balloon) return;

    const { callsign, isActive, latest, history } = balloon;
    const latlngs = history.map(pos => [pos.lat, pos.lon]);
    
    // Pick color scheme based on flight status
    const trackColor = isActive ? '#10b981' : '#ef4444';
    const dashStyle = isActive ? '0' : '5, 5'; // Dashed line for landed missions
    
    // 1. Draw or update flight path polyline
    if (balloonLayers[callsign]?.track) {
        map.removeLayer(balloonLayers[callsign].track);
    }
    
    const trackLine = L.polyline(latlngs, {
        color: trackColor,
        weight: 3,
        opacity: 0.8,
        dashArray: dashStyle
    }).addTo(map);

    // 2. Draw or update map marker at latest coordinates
    if (balloonLayers[callsign]?.marker) {
        map.removeLayer(balloonLayers[callsign].marker);
    }

    // Dynamic clean SVG marker representing a balloon payload
    const markerHtml = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="9" r="7" fill="${trackColor}" fill-opacity="0.3" stroke="${trackColor}" stroke-width="2"/>
            <path d="M12 16L12 22" stroke="${trackColor}" stroke-width="1.5" stroke-dasharray="2 2"/>
            <circle cx="12" cy="9" r="2" fill="${trackColor}"/>
        </svg>
    `;
    
    const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-balloon-icon',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    const marker = L.marker([latest.lat, latest.lon], { icon: customIcon }).addTo(map);
    
    // Add context-rich telemetry popup window
    const altMeters = latest.alt ? Math.round(latest.alt) : 'N/A';
    const altFeet = latest.alt ? Math.round(latest.alt * 3.28084) : 'N/A';
    const speedKmh = latest.vel_h ? Math.round(latest.vel_h * 3.6) : '0';
    const lastSeen = new Date(latest.time).toLocaleString();

    const popupContent = `
        <div class="popup-title">${callsign} [${isActive ? 'ACTIVE' : 'LANDED'}]</div>
        <div class="popup-grid">
            <span>Alt:</span> <span>${altMeters} m (${altFeet} ft)</span>
            <span>Speed:</span> <span>${speedKmh} km/h</span>
            <span>Satellites:</span> <span>${latest.sats || 'N/A'}</span>
            <span>Last Telemetry:</span> <span>${lastSeen}</span>
        </div>
    `;
    marker.bindPopup(popupContent);

    // Store layers references
    balloonLayers[callsign] = { marker, track: trackLine, latest };

    // 3. Render side-panel listing card item
    const targetListId = isActive ? 'active-list' : 'landed-list';
    const listContainer = document.getElementById(targetListId);
    
    // Remove loading notice if present
    if (listContainer.querySelector('.loading')) {
        listContainer.innerHTML = '';
    }

    // Append custom interactive card element
    const item = document.createElement('li');
    item.className = 'balloon-item';
    item.innerHTML = `
        <div class="balloon-header">
            <span class="balloon-callsign">${callsign}</span>
            <span class="balloon-badge ${isActive ? 'active-badge' : 'landed-badge'}">${isActive ? 'FLYING' : 'LANDED'}</span>
        </div>
        <div class="balloon-details">
            <div>Alt: ${altMeters} m</div>
            <div>Speed: ${speedKmh} km/h</div>
        </div>
    `;
    
    // Map panning action trigger when row card item gets clicked
    item.addEventListener('click', () => {
        map.setView([latest.lat, latest.lon], 8);
        marker.openPopup();
    });

    listContainer.appendChild(item);
}

// Global orchestration initialization routine
async function initTracker() {
    updateStatsCounters();
    
    // Clear lists initially to load real elements
    document.getElementById('active-list').innerHTML = MY_BALLOONS.ACTIVE.length === 0 ? '<li>None configured</li>' : '';
    document.getElementById('landed-list').innerHTML = MY_BALLOONS.LANDED.length === 0 ? '<li>None configured</li>' : '';

    const allFetchPromises = [];

    // Load active arrays
    MY_BALLOONS.ACTIVE.forEach(callsign => {
        allFetchPromises.push(fetchBalloonData(callsign, true).then(renderBalloon));
    });

    // Load passive / ended arrays
    MY_BALLOONS.LANDED.forEach(callsign => {
        allFetchPromises.push(fetchBalloonData(callsign, false).then(renderBalloon));
    });

    // Wait for all initial network handshakes to finish mapping datasets
    await Promise.all(allFetchPromises);

    // Automatically zoom/fit map frame dynamically bounding all loaded entities seamlessly
    const activeLayers = Object.values(balloonLayers).map(b => [b.latest.lat, b.latest.lon]);
    if (activeLayers.length > 0) {
        map.fitBounds(activeLayers, { padding: [50, 50] });
    }
}

// Initialize application on DOM load completion
document.addEventListener('DOMContentLoaded', initTracker);
