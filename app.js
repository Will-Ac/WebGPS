(function initTelemetryMapApp() {
  const FALLBACK_CENTER = [39.8283, -98.5795];
  const FALLBACK_ZOOM = 4;
  const FOCUS_ZOOM = 15;

  function setStatusMessage(message) {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = message || '';
  }

  function createMap() {
    const map = L.map('map', {
      zoomControl: true
    }).setView(FALLBACK_CENTER, FALLBACK_ZOOM);

    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    });

    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 18,
        attribution: 'Tiles &copy; Esri'
      }
    );

    const terrainLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
    });

    streetLayer.addTo(map);

    L.control
      .layers(
        {
          Streets: streetLayer,
          Satellite: satelliteLayer,
          Terrain: terrainLayer
        },
        null,
        { collapsed: false }
      )
      .addTo(map);

    return map;
  }

  function placeCurrentLocationMarker(map, lat, lng) {
    const marker = L.marker([lat, lng]).addTo(map);
    marker.bindPopup('Current device position').openPopup();
    return marker;
  }

  function requestCurrentLocation(map) {
    if (!navigator.geolocation) {
      setStatusMessage('Location unavailable: this browser does not support geolocation.');
      return;
    }

    setStatusMessage('Requesting your current location...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        map.setView([latitude, longitude], FOCUS_ZOOM);
        placeCurrentLocationMarker(map, latitude, longitude);
        setStatusMessage('Showing your current device position.');
      },
      (error) => {
        const details = error && error.message ? ` (${error.message})` : '';
        setStatusMessage(
          `Location unavailable. Using default map view.${details}`
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  const map = createMap();
  requestCurrentLocation(map);
})();
