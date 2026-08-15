const CONFIG = {
    BALLOONS: {
        "ACTIVE": ["SP6MPL-9", "SP6MPL-32", "SP6MPL-34"],
        "LANDED": ["SP6MPL-31", "SP6MPL-33", "SP6MPL-37", "SP6MPL-38", "SP6MPL-39", "SP6MPL-40"]
    },
    API: "https://api.sondehub.org/amateur/telemetry",
    INTERVAL: 30000
};
let mapObj = null, dataStorage = {}, vectorLines = {}, mapMarkers = {}, selectedID = null, isGrid = false, gridGroup = null;

document.addEventListener("DOMContentLoaded", () => {
    setInterval(() => { document.getElementById("live-clock").textContent = new Date().toISOString().substr(11, 8) + " UTC"; }, 1000);
    mapObj = L.map('map', { zoomControl: true, attributionControl: false }).setView([52.0, 19.0], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(mapObj);
    
    fetchTelemetry();
    setInterval(fetchTelemetry, CONFIG.INTERVAL);
    
    document.getElementById("balloon-search").addEventListener("input", (e) => {
        const v = e.target.value.toUpperCase();
        document.querySelectorAll(".balloon-item").forEach(n => {
            n.style.display = n.getAttribute("data-callsign").toUpperCase().includes(v) ? "block" : "none";
        });
    });
    document.getElementById("btn-fit-all").addEventListener("click", fitAll);
    document.getElementById("btn-toggle-grid").addEventListener("click", toggleGrid);
    
    setTimeout(() => { const p = document.getElementById("preloader"); if(p) { p.style.opacity = "0"; setTimeout(() => p.remove(), 500); } }, 1600);
});

async function fetchTelemetry() {
    try {
        const list = [...CONFIG.BALLOONS.ACTIVE, ...CONFIG.BALLOONS.LANDED];
        const res = await fetch(`${CONFIG.API}?requests=${list.join(',')}`);
        if(!res.ok) return;
        const json = await res.json();
        list.forEach(c => { if(json[c] && json[c].length > 0) dataStorage[c] = json[c]; });
        renderDashboard();
    } catch(e) { console.error("Data Link Disruption", e); }
}

function renderDashboard() {
    let act = 0, lnd = 0;
    const aList = document.getElementById("active-list"), lList = document.getElementById("landed-list");
    aList.innerHTML = ""; lList.innerHTML = "";

    Object.keys(dataStorage).sort().forEach(c => {
        const hist = dataStorage[c], last = hist[hist.length - 1], isA = CONFIG.BALLOONS.ACTIVE.includes(c);
        if(isA) act++; else lnd++;

        const altM = Math.round(last.alt), altFt = Math.round(last.alt * 3.28084), spd = last.speed ? Math.round(last.speed * 1.852) : 0;
        const timeStr = new Date(last.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        
        const div = document.createElement("div");
        div.className = `balloon-item \${selectedID === c ? (isA ? 'active-selected' : 'landed-selected') : ''}`;
        div.setAttribute("data-callsign", c);
        div.innerHTML = `<div class="item-main"><span class="item-callsign">\${c}</span><span class="item-time"><i class="fa-regular fa-clock"></i> \${timeStr}</span></div>
            <div class="item-telemetry"><span><i class="fa-solid fa-arrows-up-down"></i> \${altM}m (\&nbsp;\${altFt}ft)</span><span><i class="fa-solid fa-gauge-high"></i> \${spd} km/h</span></div>`;
        
        div.addEventListener("click", () => focusOn(c));
        if(isA) aList.appendChild(div); else lList.appendChild(div);

        const pts = hist.map(p => [p.lat, p.lon]);
        if(vectorLines[c]) {
            vectorLines[c].setLatLngs(pts);
        } else {
            vectorLines[c] = L.polyline(pts, { 
                color: isA ? '#00ff87' : '#ff0055', 
                weight: isA ? 3 : 2, 
                dashArray: isA ? null : '4,6', 
                opacity: 0.85 
            }).addTo(mapObj);
        }

        const htmlIcon = `<div style="position:relative;width:24px;height:24px;display:flex;justify-content:center;align-items:center;">
            <div style="position:absolute;width:100%;height:100%;border-radius:50%;background:\${isA?'rgba(0,255,135,0.15)':'rgba(255,0,85,0.1)'};border:1px solid \${isA?'#00ff87':'#ff0055'};opacity:0.6;"></div>
            <div style="width:6px;height:6px;border-radius:50%;background:\${isA?'#00ff87':'#ff0055'};box-shadow:0 0 8px \${isA?'#00ff87':'#ff0055'};"></div></div>`;
        
        const popupHtml = `<div class="popup-container"><div class="popup-header"><span class="popup-title">\${c}</span><span class="popup-status \${isA?'active':'landed'}">\${isA?'FLIGHT ACTIVE':'TERMINATED'}</span></div>
            <div class="popup-body">
            <div class="popup-row"><span class="lbl">LATITUDE</span><span class="val">\${last.lat.toFixed(5)}</span></div>
            <div class="popup-row"><span class="lbl">LONGITUDE</span><span class="val">\${last.lon.toFixed(5)}</span></div>
            <div class="popup-row"><span class="lbl">ALTITUDE</span><span class="val">\${altM} m / \${altFt} ft</span></div>
            <div class="popup-row"><span class="lbl">GROUND SPEED</span><span class="val">\${spd} km/h</span></div>
            <div class="popup-row"><span class="lbl">SATELLITES</span><span class="val">\${last.sats||'N/A'} GLONASS</span></div>
            <div class="popup-row"><span class="lbl">FEED TIMESTAMP</span><span class="val">\${new Date(last.time).toISOString().substr(11,8)} UTC</span></div></div></div>`;

        if(mapMarkers[c]) { 
            mapMarkers[c].setLatLng([last.lat, last.lon]); 
            mapMarkers[c].getPopup().setContent(popupHtml); 
        } else { 
            mapMarkers[c] = L.marker([last.lat, last.lon], { icon: L.divIcon({ html: htmlIcon, className:'', iconSize:[24,24], iconAnchor:[12,12] }) }).addTo(mapObj).bindPopup(popupHtml, { className: 'corp-popup', offset:[0,-2] }); 
            mapMarkers[c].on('click', () => syncSelect(c)); 
        }
    });
    document.getElementById("count-active").textContent = act;
    document.getElementById("count-landed").textContent = lnd;
}

function focusOn(c) {
    syncSelect(c);
    if(dataStorage[c]) {
        const last = dataStorage[c][dataStorage[c].length - 1];
        mapObj.flyTo([last.lat, last.lon], 9, { animate: true, duration: 1.2 });
        setTimeout(() => { if(mapMarkers[c]) mapMarkers[c].openPopup(); }, 1200);
    }
}
function syncSelect(c) {
    selectedID = c;
    document.querySelectorAll(".balloon-item").forEach(n => {
        n.classList.remove("active-selected", "landed-selected");
        if(n.getAttribute("data-callsign") === c) n.classList.add(CONFIG.BALLOONS.ACTIVE.includes(c) ? "active-selected" : "landed-selected");
    });
}
function fitAll() {
    const g = L.featureGroup(Object.values(vectorLines));
    if(g.getLayers().length > 0) mapObj.fitBounds(g.getBounds(), { padding:[40,40], animate: true, duration: 0.8 });
}
function toggleGrid() {
    isGrid = !isGrid;
    const b = document.getElementById("btn-toggle-grid");
    if(isGrid) {
        b.style.background = "rgba(0, 242, 254, 0.15)";
        b.style.borderColor = "var(--neon-blue)";
        gridGroup = L.layerGroup();
        for(let l = -90; l <= 90; l += 2) L.polyline([[l, -180], [l, 180]], { color: 'rgba(0, 242, 254, 0.05)', weight: 1, interactive: false }).addTo(gridGroup);
        for(let o = -180; o <= 180; o += 2) L.polyline([[-90, o], [90, o]], { color: 'rgba(0, 242, 254, 0.05)', weight: 1, interactive: false }).addTo(gridGroup);
        gridGroup.addTo(mapObj);
    } else { b.style.background = "var(--bg-panel)"; b.style.borderColor = "var(--border-cyber)"; if(gridGroup) { mapObj.removeLayer(gridGroup); gridGroup = null; } }
}