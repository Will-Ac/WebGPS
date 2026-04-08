(function initTelemetryMapApp() {
  const FALLBACK_CENTER = [39.8283, -98.5795];
  const FALLBACK_ZOOM = 4;
  const FOCUS_ZOOM = 15;
  const MAX_MAP_ZOOM = 19;
  const LABEL_OFFSET_PIXELS = 18;
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

  function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
  }

  function toDegrees(radians) {
    return (radians * 180) / Math.PI;
  }

  function normalizeBearing(degrees) {
    const normalized = ((degrees % 360) + 360) % 360;
    return normalized > 180 ? normalized - 360 : normalized;
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
    return ((bearing % 360) + 360) % 360;
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
    const midPoint = L.point((startPoint.x + endPoint.x) / 2, (startPoint.y + endPoint.y) / 2);
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;

    return {
      above: map.unproject(
        L.point(midPoint.x + normalX * distancePixels, midPoint.y + normalY * distancePixels)
      ),
      below: map.unproject(
        L.point(midPoint.x - normalX * distancePixels, midPoint.y - normalY * distancePixels)
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
      LABEL_OFFSET_PIXELS
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
    if (!overlayState.deviceMarker) {
      overlayState.deviceMarker = L.marker([deviceLat, deviceLng]).addTo(map);
      overlayState.deviceMarker.bindPopup('Current device position');
    } else {
      overlayState.deviceMarker.setLatLng([deviceLat, deviceLng]);
    }

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
    overlayState.line.setLatLngs([
      [deviceLat, deviceLng],
      [aircraftLat, aircraftLng]
    ]);

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
      map.on('zoom move rotate', () => {
        positionOverlayLabels(map, overlayState);
      });
      overlayState.isLabelPositionBound = true;
    }
  }

  function setupLayerDialog(layerState) {
    const buttonEl = document.getElementById('layers-button');
    const dialogEl = document.getElementById('layers-dialog');
    const optionEls = Array.from(document.querySelectorAll('.layer-option'));

    function updateSelectionUi() {
      optionEls.forEach((optionEl) => {
        const isActive = optionEl.dataset.layerKey === layerState.active;
        optionEl.classList.toggle('is-active', isActive);
        optionEl.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }

    function closeDialog() {
      dialogEl.hidden = true;
      buttonEl.setAttribute('aria-expanded', 'false');
    }

    function openDialog() {
      updateSelectionUi();
      dialogEl.hidden = false;
      buttonEl.setAttribute('aria-expanded', 'true');
    }

    buttonEl.addEventListener('click', () => {
      if (dialogEl.hidden) {
        openDialog();
      } else {
        closeDialog();
      }
    });

    optionEls.forEach((optionEl) => {
      optionEl.addEventListener('click', () => {
        const selectedKey = optionEl.dataset.layerKey;
        if (!selectedKey || !layerState.layers[selectedKey]) {
          return;
        }

        if (layerState.active !== selectedKey) {
          layerState.map.removeLayer(layerState.layers[layerState.active]);
          layerState.layers[selectedKey].addTo(layerState.map);
          layerState.active = selectedKey;
        }

        updateSelectionUi();
        closeDialog();
      });
    });

    document.addEventListener('click', (event) => {
      if (dialogEl.hidden) {
        return;
      }
      if (dialogEl.contains(event.target) || buttonEl.contains(event.target)) {
        return;
      }
      closeDialog();
    });

    updateSelectionUi();
  }

  function setupRotationSystem(map) {
    const mapPane = map.getPane('mapPane');
    const mapContainer = map.getContainer();
    const ROTATION_ENGAGE_THRESHOLD_DEGREES = 20;
    const rotationState = {
      angle: 0,
      gestureBaselineAngle: 0,
      gestureStartBearing: 0,
      isRotatingTouch: false,
      isRotateEngagedForGesture: false,
      headingFollowEnabled: false,
      headingOffset: null,
      lastKnownHeading: null
    };

    function setBearing(nextBearing, originPoint) {
      const normalizedBearing = normalizeBearing(nextBearing);
      rotationState.angle = normalizedBearing;
      if (originPoint) {
        mapPane.style.transformOrigin = `${originPoint.x}px ${originPoint.y}px`;
      } else {
        mapPane.style.transformOrigin = '50% 50%';
      }
      mapPane.style.transform = `rotate(${normalizedBearing}deg)`;
      map.fire('rotate');
    }

    function resetToNorth() {
      setBearing(0);
      rotationState.headingOffset = null;
      if (!rotationState.headingFollowEnabled) {
        rotationState.lastKnownHeading = null;
      }
    }

    function calculateTouchAngle(touchA, touchB) {
      return toDegrees(Math.atan2(touchB.clientY - touchA.clientY, touchB.clientX - touchA.clientX));
    }

    function calculateTouchMidpoint(touchA, touchB) {
      const rect = mapContainer.getBoundingClientRect();
      return {
        x: (touchA.clientX + touchB.clientX) / 2 - rect.left,
        y: (touchA.clientY + touchB.clientY) / 2 - rect.top
      };
    }

    function onTouchStart(event) {
      if (!event.touches || event.touches.length !== 2) {
        return;
      }

      const [touchA, touchB] = event.touches;
      rotationState.isRotatingTouch = true;
      rotationState.isRotateEngagedForGesture = false;
      rotationState.gestureBaselineAngle = calculateTouchAngle(touchA, touchB);
      rotationState.gestureStartBearing = rotationState.angle;
    }

    function onTouchMove(event) {
      if (!rotationState.isRotatingTouch || !event.touches || event.touches.length !== 2) {
        return;
      }

      const [touchA, touchB] = event.touches;
      const midpoint = calculateTouchMidpoint(touchA, touchB);
      const currentAngle = calculateTouchAngle(touchA, touchB);
      const baselineDelta = normalizeBearing(currentAngle - rotationState.gestureBaselineAngle);

      if (!rotationState.isRotateEngagedForGesture) {
        if (Math.abs(baselineDelta) < ROTATION_ENGAGE_THRESHOLD_DEGREES) {
          return;
        }

        rotationState.isRotateEngagedForGesture = true;
        rotationState.gestureStartBearing = rotationState.angle;
        rotationState.gestureBaselineAngle = currentAngle;
        if (rotationState.headingFollowEnabled) {
          rotationState.headingFollowEnabled = false;
        }
        return;
      }

      const incrementalDelta = normalizeBearing(currentAngle - rotationState.gestureBaselineAngle);
      setBearing(rotationState.gestureStartBearing + incrementalDelta, midpoint);
    }

    function onTouchEnd(event) {
      if (event.touches && event.touches.length >= 2) {
        return;
      }
      rotationState.isRotatingTouch = false;
      rotationState.isRotateEngagedForGesture = false;
    }

    map.getContainer().addEventListener('touchstart', onTouchStart, { passive: true });
    map.getContainer().addEventListener('touchmove', onTouchMove, { passive: true });
    map.getContainer().addEventListener('touchend', onTouchEnd, { passive: true });
    map.getContainer().addEventListener('touchcancel', onTouchEnd, { passive: true });

    function handleHeadingUpdate(heading) {
      if (heading == null || Number.isNaN(heading)) {
        return;
      }
      rotationState.lastKnownHeading = heading;
      if (!rotationState.headingFollowEnabled) {
        return;
      }
      if (rotationState.headingOffset == null) {
        rotationState.headingOffset = rotationState.angle + heading;
      }
      setBearing(rotationState.headingOffset - heading);
    }

    function onDeviceOrientation(event) {
      if (event.alpha == null) {
        return;
      }
      const heading = typeof event.webkitCompassHeading === 'number'
        ? event.webkitCompassHeading
        : 360 - event.alpha;
      handleHeadingUpdate(heading);
    }

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', onDeviceOrientation, true);
    }

    function updateCompassVisibility() {
      const compassControl = document.getElementById('compass-reset-control');
      compassControl.classList.toggle('is-visible', Math.abs(rotationState.angle) > 1);

      const northArrow = document.querySelector('.north-compass-arrow');
      if (northArrow) {
        northArrow.style.transform = `rotate(${-rotationState.angle}deg)`;
      }
    }

    map.on('rotate', updateCompassVisibility);
    updateCompassVisibility();

    function setHeadingFollowEnabled(enabled) {
      rotationState.headingFollowEnabled = enabled;
      if (enabled) {
        rotationState.headingOffset = null;
        if (rotationState.lastKnownHeading != null) {
          handleHeadingUpdate(rotationState.lastKnownHeading);
        }
      }
    }

    function getAngle() {
      return rotationState.angle;
    }

    return {
      getAngle,
      resetToNorth,
      setBearing,
      setHeadingFollowEnabled,
      isHeadingFollowEnabled: () => rotationState.headingFollowEnabled
    };
  }

  function setupCompassReset(rotationSystem) {
    const compassControl = document.getElementById('compass-reset-control');
    compassControl.addEventListener('click', () => {
      rotationSystem.setHeadingFollowEnabled(false);
      rotationSystem.resetToNorth();
      updateLocationModeUi('centered');
    });
  }

  let updateLocationModeUi = () => {};

  function setupLocationControl(map, rotationSystem, overlayState) {
    const locationButton = document.getElementById('location-mode-button');
    const locationIcon = locationButton.querySelector('.location-mode-icon');
    const modeLabel = locationButton.querySelector('.location-mode-label');

    const state = {
      mode: 'inactive',
      watchId: null
    };

    function applyModeUi() {
      locationButton.dataset.mode = state.mode;
      if (state.mode === 'heading-follow') {
        locationIcon.textContent = '🧭';
        modeLabel.textContent = 'Heading follow';
      } else if (state.mode === 'centered') {
        locationIcon.textContent = '◎';
        modeLabel.textContent = 'Centered';
      } else {
        locationIcon.textContent = '⌖';
        modeLabel.textContent = 'Locate';
      }
    }

    function ensureWatchPosition() {
      if (state.watchId != null || !navigator.geolocation) {
        return;
      }

      state.watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          updateDeviceToAircraftOverlay(map, latitude, longitude, overlayState);
          if (state.mode === 'centered' || state.mode === 'heading-follow') {
            map.setView([latitude, longitude], map.getZoom() < FOCUS_ZOOM ? FOCUS_ZOOM : map.getZoom(), {
              animate: true
            });
          }
        },
        () => {},
        {
          enableHighAccuracy: true,
          maximumAge: 1000,
          timeout: 10000
        }
      );
    }

    function setMode(nextMode) {
      state.mode = nextMode;
      ensureWatchPosition();
      rotationSystem.setHeadingFollowEnabled(nextMode === 'heading-follow');
      if (nextMode === 'centered') {
        rotationSystem.resetToNorth();
      }
      applyModeUi();
    }

    function focusCurrentPosition() {
      if (!navigator.geolocation) {
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          map.setView([latitude, longitude], map.getZoom() < FOCUS_ZOOM ? FOCUS_ZOOM : map.getZoom(), {
            animate: true
          });
          updateDeviceToAircraftOverlay(map, latitude, longitude, overlayState);
        },
        () => {}
      );
    }

    updateLocationModeUi = (nextMode) => {
      setMode(nextMode);
    };

    locationButton.addEventListener('click', () => {
      if (state.mode === 'inactive') {
        setMode('centered');
        focusCurrentPosition();
      } else if (state.mode === 'centered') {
        setMode('heading-follow');
      } else {
        setMode('centered');
        focusCurrentPosition();
      }
    });

    applyModeUi();
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
        updateDeviceToAircraftOverlay(map, latitude, longitude, overlayState);
        setStatusMessage('Showing your current device position.');
      },
      (error) => {
        const details = error && error.message ? ` (${error.message})` : '';
        setStatusMessage(`Location unavailable. Using default map view.${details}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
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

    const layers = {
      streets: streetLayer,
      satellite: satelliteLayer,
      terrain: terrainLayer
    };

    streetLayer.addTo(map);
    L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);

    return {
      map,
      layers,
      activeLayer: 'streets'
    };
  }

  const mapSetup = createMap();
  const map = mapSetup.map;
  const overlayState = {
    line: null,
    distanceLabel: null,
    bearingLabel: null,
    deviceMarker: null,
    devicePosition: null,
    isLabelPositionBound: false
  };

  placeMockDroneMarker(map);
  setupLayerDialog({
    map,
    layers: mapSetup.layers,
    active: mapSetup.activeLayer
  });

  const rotationSystem = setupRotationSystem(map);
  setupCompassReset(rotationSystem);
  setupLocationControl(map, rotationSystem, overlayState);

  requestCurrentLocation(map, overlayState);

  function placeMockDroneMarker(targetMap) {
    const marker = L.circleMarker([MOCK_DRONE_POSITION.latitude, MOCK_DRONE_POSITION.longitude], {
      radius: 8,
      color: '#c62828',
      fillColor: '#e53935',
      fillOpacity: 0.95,
      weight: 2
    }).addTo(targetMap);
    marker.bindPopup('Mock drone position');
    return marker;
  }
})();
