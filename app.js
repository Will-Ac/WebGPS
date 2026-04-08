(function initTelemetryMapApp() {
  const FALLBACK_CENTER = [39.8283, -98.5795];
  const FALLBACK_ZOOM = 4;
  const FOCUS_ZOOM = 15;
  const MAX_MAP_ZOOM = 19;
  const ROTATION_THRESHOLD_DEGREES = 20;
  const MOCK_DRONE_POSITION = {
    latitude: 51.4733071,
    longitude: -2.5859117
  };
  const EARTH_RADIUS_METERS = 6371000;

  function setStatusMessage(message) {
    const statusEl = document.getElementById('status-message');
    if (!statusEl) {
      return;
    }
    statusEl.textContent = message || '';
  }

  function normalizeBearing(degrees) {
    return (degrees % 360 + 360) % 360;
  }

  function shortestAngleDeltaDegrees(nextAngle, previousAngle) {
    return ((nextAngle - previousAngle + 540) % 360) - 180;
  }

  function calculateTouchMidpoint(touchA, touchB) {
    return {
      x: (touchA.clientX + touchB.clientX) / 2,
      y: (touchA.clientY + touchB.clientY) / 2
    };
  }

  function calculateTouchDistance(touchA, touchB) {
    return Math.hypot(touchB.clientX - touchA.clientX, touchB.clientY - touchA.clientY);
  }

  function calculateTouchAngleDegrees(touchA, touchB) {
    return (Math.atan2(touchB.clientY - touchA.clientY, touchB.clientX - touchA.clientX) * 180) / Math.PI;
  }

  function createMapTypeControl(map, layersByName) {
    const control = L.control({ position: 'topright' });
    let container;
    let panel;
    let dismissHandler;
    let currentLayerName = 'Streets';

    function applyLayerSelection(nextLayerName) {
      if (!layersByName[nextLayerName] || nextLayerName === currentLayerName) {
        return;
      }

      map.removeLayer(layersByName[currentLayerName]);
      layersByName[nextLayerName].addTo(map);
      currentLayerName = nextLayerName;
    }

    function closePanel() {
      if (!panel) {
        return;
      }
      panel.hidden = true;
      if (dismissHandler) {
        document.removeEventListener('pointerdown', dismissHandler, true);
        dismissHandler = null;
      }
    }

    function openPanel() {
      if (!panel) {
        return;
      }
      panel.hidden = false;
      dismissHandler = (event) => {
        if (!container.contains(event.target)) {
          closePanel();
        }
      };
      document.addEventListener('pointerdown', dismissHandler, true);
    }

    function togglePanel() {
      if (!panel) {
        return;
      }
      if (panel.hidden) {
        openPanel();
      } else {
        closePanel();
      }
    }

    control.onAdd = () => {
      container = L.DomUtil.create('div', 'leaflet-control leaflet-maptype');
      const button = L.DomUtil.create('button', 'leaflet-maptype-button', container);
      button.type = 'button';
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
      button.textContent = 'Layers';

      panel = L.DomUtil.create('div', 'leaflet-maptype-panel', container);
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Map type options');
      panel.hidden = true;

      Object.keys(layersByName).forEach((layerName) => {
        const optionLabel = L.DomUtil.create('label', 'leaflet-maptype-option', panel);
        const optionInput = L.DomUtil.create('input', '', optionLabel);
        optionInput.type = 'radio';
        optionInput.name = 'map-type';
        optionInput.value = layerName;
        optionInput.checked = layerName === currentLayerName;

        const optionText = L.DomUtil.create('span', '', optionLabel);
        optionText.textContent = layerName;

        optionInput.addEventListener('change', () => {
          applyLayerSelection(layerName);
          closePanel();
          button.setAttribute('aria-expanded', 'false');
        });
      });

      button.addEventListener('click', () => {
        togglePanel();
        button.setAttribute('aria-expanded', String(!panel.hidden));
      });

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      return container;
    };

    control.onRemove = () => {
      closePanel();
    };

    return control;
  }

  function attachMapRotationGesture(map) {
    const mapContainer = map.getContainer();
    const mapPane = map.getPane('mapPane');
    const rotatePane = mapPane || map._mapPane;
    const gestureState = {
      active: false,
      rotateEnabled: false,
      midpoint: null,
      initialDistance: 0,
      initialAngle: 0,
      rotationBaseline: 0,
      mapBearing: 0
    };

    function refreshCompass(bearing) {
      const compassArrow = document.getElementById('north-compass-arrow');
      if (!compassArrow) {
        return;
      }
      compassArrow.style.transform = `rotate(${-bearing}deg)`;
    }

    function applyMapRotation() {
      if (!rotatePane) {
        return;
      }
      const rawTransform = rotatePane.style.transform || '';
      const withoutRotate = rawTransform.replace(/\s?rotate\([^)]*\)/g, '').trim();
      const baseTransform = withoutRotate || 'translate3d(0px, 0px, 0px)';
      rotatePane.style.transform = `${baseTransform} rotate(${gestureState.mapBearing}deg)`;
    }

    function setTransformOriginAtMidpoint(midpoint) {
      if (!rotatePane || !midpoint) {
        return;
      }
      const rect = mapContainer.getBoundingClientRect();
      const originX = midpoint.x - rect.left;
      const originY = midpoint.y - rect.top;
      rotatePane.style.transformOrigin = `${originX}px ${originY}px`;
    }

    function resetGesture() {
      gestureState.active = false;
      gestureState.rotateEnabled = false;
      gestureState.midpoint = null;
      gestureState.initialDistance = 0;
      gestureState.initialAngle = 0;
      gestureState.rotationBaseline = 0;
    }

    function onTouchStart(event) {
      if (event.touches.length !== 2) {
        return;
      }

      const firstTouch = event.touches[0];
      const secondTouch = event.touches[1];
      gestureState.active = true;
      gestureState.rotateEnabled = false;
      gestureState.midpoint = calculateTouchMidpoint(firstTouch, secondTouch);
      gestureState.initialDistance = calculateTouchDistance(firstTouch, secondTouch);
      gestureState.initialAngle = calculateTouchAngleDegrees(firstTouch, secondTouch);
      gestureState.rotationBaseline = gestureState.initialAngle;
      setTransformOriginAtMidpoint(gestureState.midpoint);
    }

    function onTouchMove(event) {
      if (!gestureState.active || event.touches.length !== 2) {
        return;
      }

      const firstTouch = event.touches[0];
      const secondTouch = event.touches[1];
      const currentMidpoint = calculateTouchMidpoint(firstTouch, secondTouch);
      const currentDistance = calculateTouchDistance(firstTouch, secondTouch);
      const currentAngle = calculateTouchAngleDegrees(firstTouch, secondTouch);

      gestureState.midpoint = currentMidpoint;
      setTransformOriginAtMidpoint(currentMidpoint);

      if (!gestureState.rotateEnabled) {
        const angleFromStart = shortestAngleDeltaDegrees(currentAngle, gestureState.initialAngle);
        if (Math.abs(angleFromStart) >= ROTATION_THRESHOLD_DEGREES) {
          gestureState.rotateEnabled = true;
          gestureState.rotationBaseline = currentAngle;
        }
      } else {
        const incrementalAngle = shortestAngleDeltaDegrees(currentAngle, gestureState.rotationBaseline);
        gestureState.mapBearing = normalizeBearing(gestureState.mapBearing + incrementalAngle);
        gestureState.rotationBaseline = currentAngle;
        applyMapRotation();
        refreshCompass(gestureState.mapBearing);
      }

      gestureState.initialDistance = currentDistance;
    }

    function onTouchEnd(event) {
      if (event.touches.length < 2) {
        resetGesture();
      }
    }

    mapContainer.addEventListener('touchstart', onTouchStart, { passive: true });
    mapContainer.addEventListener('touchmove', onTouchMove, { passive: true });
    mapContainer.addEventListener('touchend', onTouchEnd, { passive: true });
    mapContainer.addEventListener('touchcancel', onTouchEnd, { passive: true });

    map.on('move zoom zoomanim', () => {
      applyMapRotation();
      refreshCompass(gestureState.mapBearing);
    });

    applyMapRotation();
    refreshCompass(gestureState.mapBearing);
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

    const layersByName = {
      Streets: streetLayer,
      Satellite: satelliteLayer,
      Terrain: terrainLayer
    };

    streetLayer.addTo(map);

    createMapTypeControl(map, layersByName).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);
    L.control.northCompass({ position: 'topright' }).addTo(map);

    attachMapRotationGesture(map);

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

  function calculateLineAngleDegrees(map, startLat, startLng, endLat, endLng) {
    const startPoint = map.project([startLat, startLng]);
    const endPoint = map.project([endLat, endLng]);
    return toDegrees(Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x));
  }

  function applyLabelAngle(labelMarker, angleDegrees) {
    if (!labelMarker) {
      return;
    }

    const element = labelMarker.getElement();
    if (!element) {
      return;
    }

    const textEl = element.querySelector('.overlay-label-text');
    if (!textEl) {
      return;
    }

    textEl.style.transform = `rotate(${angleDegrees}deg)`;
  }

  function positionOverlayLabels(map, overlayState) {
    if (!overlayState.devicePosition || !overlayState.distanceLabel || !overlayState.bearingLabel) {
      return;
    }

    const aircraftLat = MOCK_DRONE_POSITION.latitude;
    const aircraftLng = MOCK_DRONE_POSITION.longitude;
    const startLat = overlayState.devicePosition.latitude;
    const startLng = overlayState.devicePosition.longitude;
    const labelPositions = calculateLabelPosition(
      map,
      startLat,
      startLng,
      aircraftLat,
      aircraftLng,
      3
    );
    const lineAngleDegrees = calculateLineAngleDegrees(
      map,
      startLat,
      startLng,
      aircraftLat,
      aircraftLng
    );

    overlayState.distanceLabel.setLatLng(labelPositions.above);
    overlayState.bearingLabel.setLatLng(labelPositions.below);
    applyLabelAngle(overlayState.distanceLabel, lineAngleDegrees);
    applyLabelAngle(overlayState.bearingLabel, lineAngleDegrees);
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

  L.Control.NorthCompass = L.Control.extend({
    onAdd() {
      const container = L.DomUtil.create('div', 'leaflet-control leaflet-north-compass');
      const ring = L.DomUtil.create('div', 'leaflet-north-compass-ring', container);
      const arrow = L.DomUtil.create('div', 'leaflet-north-compass-arrow', ring);
      arrow.id = 'north-compass-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      container.setAttribute('aria-label', 'Compass showing north direction');
      container.setAttribute('role', 'img');

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      return container;
    }
  });

  L.control.northCompass = (options) => new L.Control.NorthCompass(options);

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
