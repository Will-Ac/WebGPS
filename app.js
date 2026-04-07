(function initTelemetryMapApp() {
  const FALLBACK_CENTER = [39.8283, -98.5795];
  const FALLBACK_ZOOM = 4;
  const FOCUS_ZOOM = 15;
  const MAX_MAP_ZOOM = 19;
  const MOCK_DRONE_POSITION = {
    latitude: 51.4733071,
    longitude: -2.5859117
  };
  const EARTH_RADIUS_METERS = 6371000;

  function setStatusMessage(message) {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = message || '';
  }

  function createMap() {
    const map = L.map('map', {
      zoomControl: false,
      maxZoom: MAX_MAP_ZOOM
    }).setView(FALLBACK_CENTER, FALLBACK_ZOOM);

    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: MAX_MAP_ZOOM,
      attribution: '&copy; OpenStreetMap contributors'
    });

    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: MAX_MAP_ZOOM,
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

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);

    return map;
  }

  function placeCurrentLocationMarker(map, lat, lng) {
    const marker = L.marker([lat, lng]).addTo(map);
    marker.bindPopup('Current device position').openPopup();
    return marker;
  }

  function placeMockDroneMarker(map) {
    const marker = L.circleMarker([MOCK_DRONE_POSITION.latitude, MOCK_DRONE_POSITION.longitude], {
      radius: 8,
      color: '#c62828',
      fillColor: '#e53935',
      fillOpacity: 0.95,
      weight: 2
    }).addTo(map);
    marker.bindPopup('Mock drone position');
    return marker;
  }

  function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
  }

  function toDegrees(radians) {
    return (radians * 180) / Math.PI;
  }

  function normalizeBearing(degrees) {
    return (degrees + 360) % 360;
  }

  function calculateDistanceMeters(fromLat, fromLng, toLat, toLng) {
    const dLat = toRadians(toLat - fromLat);
    const dLng = toRadians(toLng - fromLng);
    const fromLatRad = toRadians(fromLat);
    const toLatRad = toRadians(toLat);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(fromLatRad) * Math.cos(toLatRad) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_METERS * c;
  }

  function calculateBearingDegrees(fromLat, fromLng, toLat, toLng) {
    const fromLatRad = toRadians(fromLat);
    const toLatRad = toRadians(toLat);
    const dLngRad = toRadians(toLng - fromLng);
    const y = Math.sin(dLngRad) * Math.cos(toLatRad);
    const x =
      Math.cos(fromLatRad) * Math.sin(toLatRad) -
      Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(dLngRad);
    const bearing = toDegrees(Math.atan2(y, x));
    return normalizeBearing(bearing);
  }

  function calculateMidpoint(fromLat, fromLng, toLat, toLng) {
    return {
      latitude: (fromLat + toLat) / 2,
      longitude: (fromLng + toLng) / 2
    };
  }

  function createOverlayLabel(lat, lng, className, text, offset) {
    return L.marker([lat, lng], {
      interactive: false,
      icon: L.divIcon({
        className,
        html: text,
        iconAnchor: [0, 0]
      }),
      zIndexOffset: 800,
      keyboard: false
    }).setLatLng([lat + offset, lng]);
  }

  function updateDeviceToAircraftOverlay(map, deviceLat, deviceLng, overlayState) {
    if (!overlayState.line) {
      overlayState.line = L.polyline([], {
        color: '#1d4ed8',
        weight: 2,
        dashArray: '6 6',
        opacity: 0.9
      }).addTo(map);
    }

    if (overlayState.distanceLabel) {
      map.removeLayer(overlayState.distanceLabel);
    }

    if (overlayState.bearingLabel) {
      map.removeLayer(overlayState.bearingLabel);
    }

    const aircraftLat = MOCK_DRONE_POSITION.latitude;
    const aircraftLng = MOCK_DRONE_POSITION.longitude;
    const linePoints = [
      [deviceLat, deviceLng],
      [aircraftLat, aircraftLng]
    ];
    overlayState.line.setLatLngs(linePoints);

    const midpoint = calculateMidpoint(deviceLat, deviceLng, aircraftLat, aircraftLng);
    const distanceMeters = calculateDistanceMeters(deviceLat, deviceLng, aircraftLat, aircraftLng);
    const bearingDegrees = calculateBearingDegrees(deviceLat, deviceLng, aircraftLat, aircraftLng);

    overlayState.distanceLabel = createOverlayLabel(
      midpoint.latitude,
      midpoint.longitude,
      'leaflet-control-distance-label',
      `${Math.round(distanceMeters)} m`,
      0.0011
    ).addTo(map);

    overlayState.bearingLabel = createOverlayLabel(
      midpoint.latitude,
      midpoint.longitude,
      'leaflet-control-bearing-label',
      `${Math.round(bearingDegrees)}°`,
      -0.0011
    ).addTo(map);
  }

  function requestCurrentLocation(map, overlayState) {
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
        updateDeviceToAircraftOverlay(map, latitude, longitude, overlayState);
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
  const overlayState = {
    line: null,
    distanceLabel: null,
    bearingLabel: null
  };
  placeMockDroneMarker(map);
  requestCurrentLocation(map, overlayState);
})();
