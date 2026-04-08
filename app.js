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

  function createOverlayLabel(lat, lng, className, text) {
    return L.marker([lat, lng], {
      interactive: false,
      icon: L.divIcon({
        className,
        html: `<span class="overlay-label-text">${text}</span>`,
        iconSize: null,
        iconAnchor: [0, 0]
      }),
      zIndexOffset: 800,
      keyboard: false
    });
  }

  function calculateLabelPosition(map, startLat, startLng, endLat, endLng, distancePixels) {
    const startPoint = map.project([startLat, startLng]);
    const endPoint = map.project([endLat, endLng]);
    const midPoint = L.point(
      (startPoint.x + endPoint.x) / 2,
      (startPoint.y + endPoint.y) / 2
    );
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const aboveX = normalY < 0 ? normalX : -normalX;
    const aboveY = normalY < 0 ? normalY : -normalY;

    return {
      above: map.unproject(
        L.point(midPoint.x + aboveX * distancePixels, midPoint.y + aboveY * distancePixels)
      ),
      below: map.unproject(
        L.point(midPoint.x - aboveX * distancePixels, midPoint.y - aboveY * distancePixels)
      )
    };
  }

  function positionOverlayLabels(map, overlayState) {
    if (!overlayState.devicePosition || !overlayState.distanceLabel || !overlayState.bearingLabel) {
      return;
    }

    const aircraftLat = MOCK_DRONE_POSITION.latitude;
    const aircraftLng = MOCK_DRONE_POSITION.longitude;
    const labelPositions = calculateLabelPosition(
      map,
      overlayState.devicePosition.latitude,
      overlayState.devicePosition.longitude,
      aircraftLat,
      aircraftLng,
      16
    );

    overlayState.distanceLabel.setLatLng(labelPositions.above);
    overlayState.bearingLabel.setLatLng(labelPositions.below);
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

    const aircraftLat = MOCK_DRONE_POSITION.latitude;
    const aircraftLng = MOCK_DRONE_POSITION.longitude;
    overlayState.devicePosition = {
      latitude: deviceLat,
      longitude: deviceLng
    };
    const linePoints = [
      [deviceLat, deviceLng],
      [aircraftLat, aircraftLng]
    ];
    overlayState.line.setLatLngs(linePoints);

    const distanceMeters = calculateDistanceMeters(deviceLat, deviceLng, aircraftLat, aircraftLng);
    const bearingDegrees = calculateBearingDegrees(deviceLat, deviceLng, aircraftLat, aircraftLng);

    if (!overlayState.distanceLabel) {
      overlayState.distanceLabel = createOverlayLabel(
        deviceLat,
        deviceLng,
        'leaflet-control-distance-label',
        `${Math.round(distanceMeters)} m`
      ).addTo(map);
    } else {
      overlayState.distanceLabel.getElement().innerHTML = `<span class="overlay-label-text">${Math.round(distanceMeters)} m</span>`;
    }

    if (!overlayState.bearingLabel) {
      overlayState.bearingLabel = createOverlayLabel(
        deviceLat,
        deviceLng,
        'leaflet-control-bearing-label',
        `${Math.round(bearingDegrees)}°`
      ).addTo(map);
    } else {
      overlayState.bearingLabel.getElement().innerHTML = `<span class="overlay-label-text">${Math.round(bearingDegrees)}°</span>`;
    }

    positionOverlayLabels(map, overlayState);

    if (!overlayState.isLabelPositionBound) {
      map.on('zoom move', () => {
        positionOverlayLabels(map, overlayState);
      });
      overlayState.isLabelPositionBound = true;
    }
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
    bearingLabel: null,
    devicePosition: null,
    isLabelPositionBound: false
  };
  placeMockDroneMarker(map);
  requestCurrentLocation(map, overlayState);
})();
