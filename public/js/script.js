const socket = io();

// --- Geolokacija: samodejno pošiljanje ---
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            socket.emit('send-location', { latitude, longitude });
        },
        (error) => {
            console.error('Error getting geolocation: ', error);
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
} else {
    console.error('Geolocation is not supported by this browser.');
}

// --- Ročni vnos iz obrazca (če obstaja) ---
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('locationForm');
    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const latitude = document.getElementById('latitude').value;
            const longitude = document.getElementById('longitude').value;
            socket.emit('send-location', { latitude, longitude });
        });
    }
});

// --- Inicializacija zemljevida ---
const map = L.map('map').setView([46.056946, 14.505751], 8);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

const markers = {};
let routingControl;

// --- Navigacijska puščica ---
const navIcon = L.icon({
    iconUrl: './images/gesi.png',
    iconSize: [60, 60],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15]
});
const navMarker = L.marker([0, 0], { icon: navIcon }).addTo(map);
navMarker.setOpacity(0);

let customMarkerCount = 0;

// --- Več markerjev z klikom na mapo ---
const customMarkers = [];
map.on('click', function (e) {
    customMarkerCount++;
    const pointName = `T${customMarkerCount}`;
    const { lat, lng } = e.latlng;
    const marker = L.marker([lat, lng]).addTo(map)
        .bindPopup(`Točka: <b>${pointName}</b><br>Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}`)
        .openPopup();
    customMarkers.push(marker);

    marker.on('contextmenu', function () {
        map.removeLayer(marker);
        const idx = customMarkers.indexOf(marker);
        if (idx > -1) customMarkers.splice(idx, 1);
    });
});

// --- Sprejemanje lokacij prek socket.io ---
socket.on('receive-location', (data) => {
    const { id } = data;
    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);

    if (isNaN(latitude) || isNaN(longitude)) {
        console.warn('Prejete napačne koordinate:', data);
        return;
    }

    map.setView([latitude, longitude], 19);

    if (markers[id]) {
        markers[id].setLatLng([latitude, longitude]);
    } else {
        markers[id] = L.marker([latitude, longitude]).addTo(map);
    }

    // Prikaz poti med dvema markerjema
    if (Object.keys(markers).length === 2) {
        const [id1, id2] = Object.keys(markers);
        const latlngs = [
            markers[id1].getLatLng(),
            markers[id2].getLatLng()
        ];

        if (routingControl) {
            routingControl.setWaypoints(latlngs);
        } else {
            routingControl = L.Routing.control({
                waypoints: latlngs,
                routeWhileDragging: true,
                createMarker: () => null,
                lineOptions: {
                    styles: [{ color: 'blue', weight: 5 }]
                }
            }).addTo(map);
        }
    }

    // Posodobi navigacijsko puščico
    navMarker.setLatLng([latitude, longitude]);
    navMarker.setOpacity(1);

    // Ne skrivaj markerja uporabnika
    if (markers[id]) {
        markers[id].setOpacity(1);
    }
});

// --- Odstranjevanje markerjev ob odklopu uporabnika ---
socket.on('user-disconnect', (data) => {
    const { id } = data;
    if (markers[id]) {
        map.removeLayer(markers[id]);
        delete markers[id];
    }

    if (routingControl && Object.keys(markers).length < 2) {
        map.removeControl(routingControl);
        routingControl = null;
    }

    if (Object.keys(markers).length === 0) {
        navMarker.setOpacity(0);
    }
});

// --- Rotacija navigacijske puščice glede na orientacijo naprave ---
window.addEventListener('deviceorientation', (event) => {
    const { alpha } = event;
    if (alpha !== null) {
        const rotation = alpha;
        navMarker.setIcon(L.icon({
            iconUrl: 'https://static-00.iconduck.com/assets.00/map-arrow-up-icon-1857x2048-1scitnd4.png',
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            popupAnchor: [0, -15],
            className: `rotate-${Math.round(rotation)}`
        }));
    }
});

// --- CSS za rotacijo ---
const style = document.createElement('style');
style.textContent = `
    .rotate-0 { transform: rotate(0deg); }
    .rotate-90 { transform: rotate(90deg); }
    .rotate-180 { transform: rotate(180deg); }
    .rotate-270 { transform: rotate(270deg); }
`;
document.head.appendChild(style);

// --- Dodaj Leaflet kontrolni meni z gumbom za dodajanje lokacije ---
L.Control.AddLocation = L.Control.extend({
    onAdd: function(map) {
        const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control leaflet-control-custom');
        btn.innerHTML = 'Dodaj lokacijo';
        btn.style.backgroundColor = '#fff';
        btn.style.padding = '5px 10px';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = 'bold';
        btn.style.marginBottom = '5px';

        L.DomEvent.on(btn, 'click', function(e) {
            L.DomEvent.stopPropagation(e);
            L.DomEvent.preventDefault(e);

            // Samodejno generirano ime točke
            const nextName = `T${customMarkerCount + 1}`;
            const popupContent = `
                <form id="addLocationForm" style="min-width:180px">
                    <label>Ime točke:<br>
                        <input type="text" id="popup-name" value="${nextName}" readonly style="width:150px; background:#eee"></label><br>
                    <label>Latitude:<br><input type="text" id="popup-latitude" required style="width:150px"></label><br>
                    <label>Longitude:<br><input type="text" id="popup-longitude" required style="width:150px"></label><br>
                    <button type="submit" style="margin-top:5px">Dodaj</button>
                </form>
            `;
            const center = map.getCenter();
            const popup = L.popup()
                .setLatLng(center)
                .setContent(popupContent)
                .openOn(map);

            setTimeout(() => {
                const form = document.getElementById('addLocationForm');
                if (form) {
                    form.addEventListener('submit', function(ev) {
                        ev.preventDefault();
                        const name = document.getElementById('popup-name').value;
                        const lat = parseFloat(document.getElementById('popup-latitude').value);
                        const lng = parseFloat(document.getElementById('popup-longitude').value);
                        if (!isNaN(lat) && !isNaN(lng)) {
                            customMarkerCount++;
                            const marker = L.marker([lat, lng]).addTo(map)
                                .bindPopup(`Točka: <b>${name}</b><br>Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}`)
                                .openPopup();
                            customMarkers.push(marker);
                            marker.on('contextmenu', function () {
                                map.removeLayer(marker);
                                const idx = customMarkers.indexOf(marker);
                                if (idx > -1) customMarkers.splice(idx, 1);
                            });
                            map.closePopup();
                        } else {
                            alert('Vnesi številčne koordinate!');
                        }
                    });
                }
            }, 100);
        });

        return btn;
    },
    onRemove: function(map) {}
});

// --- Dodaj Leaflet kontrolni meni z gumbom za brisanje ročnih markerjev ---
L.Control.ClearCustomMarkers = L.Control.extend({
    onAdd: function(map) {
        const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control leaflet-control-custom');
        btn.innerHTML = 'Pobriši ročni vnos';
        btn.style.backgroundColor = '#fff';
        btn.style.padding = '5px 10px';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = 'bold';

        L.DomEvent.on(btn, 'click', function(e) {
            L.DomEvent.stopPropagation(e);
            L.DomEvent.preventDefault(e);
            while (customMarkers.length > 0) {
                const marker = customMarkers.pop();
                map.removeLayer(marker);
            }
            customMarkerCount = 0; // <-- Dodano: ponastavi števec
        });

        return btn;
    },
    onRemove: function(map) {}
});

// Najprej dodaj gumb za dodajanje, nato za brisanje
L.control.addLocation = function(opts) {
    return new L.Control.AddLocation(opts);
}
L.control.clearCustomMarkers = function(opts) {
    return new L.Control.ClearCustomMarkers(opts);
}
L.control.addLocation({ position: 'topright' }).addTo(map);
L.control.clearCustomMarkers({ position: 'topright' }).addTo(map);