(function initTelemetryMapApp() {
  const FALLBACK_CENTER = [-98.5795, 39.8283];
  const FALLBACK_ZOOM = 4;
  const FOCUS_ZOOM = 15;
  const MAX_MAP_ZOOM = 18.4;
  const DEVICE_AIRCRAFT_LINE_SOURCE_ID = 'device-aircraft-line';
  const DEVICE_AIRCRAFT_LINE_LAYER_ID = 'device-aircraft-line-layer';
  const COMPASS_ANCHOR_HEIGHT_RATIO = 2 / 3;
  const EARTH_RADIUS_METERS = 6371000;
  const COMPASS_DEBUG_LOGGING = true;
  const CAMERA_EASE_STANDARD_MS = 650;
  const CAMERA_EASE_HEADING_MS = 140;
  const ROTATION_DAMPING_FACTOR = 0.16;
  const ROTATION_NOISE_THRESHOLD_DEGREES = 0.5;
  const TELEMETRY_DEFAULT_WS_URL = 'ws://192.168.4.1/telemetry';
  const TELEMETRY_URL_STORAGE_KEY = 'webgpsTelemetryWsUrl';
  const TELEMETRY_STALE_MS = 3000;
  const TELEMETRY_RECONNECT_MS = 3000;
  const TELEMETRY_SETUP_URL = 'http://192.168.4.1/setup';
  const CONTROL_ICON_PATHS = {
    NORTH: 'assets/icons/NORTH.svg',
    COMPASS: 'assets/icons/COMPASS.svg',
    LAYERS: 'assets/icons/LAYERS.svg',
    LOCATION: 'assets/icons/LOCATION.svg'
  };
  const MOCK_DRONE_POSITION = {
    latitude: 51.4733071,
    longitude: -2.5859117
  };

  const MAP_STYLES = {
    Streets: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
    },
    Satellite: {
      version: 8,
      sources: {
        esri: {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          attribution: 'Tiles © Esri'
        }
      },
      layers: [{ id: 'esri', type: 'raster', source: 'esri' }]
    },
    Terrain: {
      version: 8,
      sources: {
        opentopo: {
          type: 'raster',
          tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap'
        }
      },
      layers: [{ id: 'opentopo', type: 'raster', source: 'opentopo' }]
    }
  };

  function debugCompassLog(message, details) {
    if (!COMPASS_DEBUG_LOGGING) {
      return;
    }

    if (typeof details === 'undefined') {
      console.log('[compass-map]', message);
      return;
    }

    console.log('[compass-map]', message, details);
  }

  function setStatusMessage(message) {
    const statusEl = document.getElementById('status-message');
    if (!statusEl) {
      return;
    }
    statusEl.textContent = message || '';
  }

  function createMap() {
    const map = new maplibregl.Map({
      container: 'map',
      style: MAP_STYLES.Streets,
      center: FALLBACK_CENTER,
      zoom: FALLBACK_ZOOM,
      maxZoom: MAX_MAP_ZOOM,
      doubleClickZoom: false,
      attributionControl: false,
      dragPan: {
        inertia: true,
        inertiaDeceleration: 2000,
        inertiaMaxSpeed: 1400
      }
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    attachZoomReadoutToScale(map);

    return { map, styleNames: Object.keys(MAP_STYLES) };
  }

  function attachZoomReadoutToScale(map) {
    const ensureZoomReadoutElement = () => {
      const scaleElement = map.getContainer().querySelector('.maplibregl-ctrl-scale');
      if (!scaleElement) {
        return null;
      }

      let zoomReadout = scaleElement.querySelector('.gm-zoom-readout');
      if (!zoomReadout) {
        zoomReadout = document.createElement('span');
        zoomReadout.className = 'gm-zoom-readout';
        scaleElement.appendChild(zoomReadout);
      }
      return zoomReadout;
    };

    const updateZoomReadout = () => {
      const zoomReadout = ensureZoomReadoutElement();
      if (!zoomReadout) {
        return;
      }
      zoomReadout.textContent = ` | Z: ${map.getZoom().toFixed(1)}`;
    };

    map.on('load', updateZoomReadout);
    map.on('zoom', updateZoomReadout);
    map.on('move', updateZoomReadout);
    map.on('styledata', updateZoomReadout);
  }

  function createMarkerElement(className) {
    const el = document.createElement('div');
    el.className = className;
    return el;
  }

  function createDroneMarkerElement() {
    const el = createMarkerElement('gm-marker gm-marker-aircraft');
    el.innerHTML =
      '<span class="gm-drone-arm gm-drone-arm-a"></span>' +
      '<span class="gm-drone-arm gm-drone-arm-b"></span>' +
      '<span class="gm-drone-rotor gm-drone-rotor-nw"></span>' +
      '<span class="gm-drone-rotor gm-drone-rotor-ne"></span>' +
      '<span class="gm-drone-rotor gm-drone-rotor-sw"></span>' +
      '<span class="gm-drone-rotor gm-drone-rotor-se"></span>' +
      '<span class="gm-drone-body"></span>';
    return el;
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function upsertCurrentLocationMarker(compassState, lat, lng) {
    if (!compassState.currentLocationMarker) {
      compassState.currentLocationMarker = new maplibregl.Marker({
        element: createMarkerElement('gm-marker gm-marker-device')
      })
        .setLngLat([lng, lat])
        .addTo(compassState.map);
      return;
    }

    compassState.currentLocationMarker.setLngLat([lng, lat]);
  }

  function upsertAircraftMarker(map, aircraftState) {
    const position = aircraftState.position;
    if (!aircraftState.marker) {
      aircraftState.marker = new maplibregl.Marker({
        element: createDroneMarkerElement()
      })
        .setLngLat([position.longitude, position.latitude])
        .setPopup(new maplibregl.Popup({ offset: 12 }).setText('Aircraft position'))
        .addTo(map);
      return;
    }

    aircraftState.marker.setLngLat([position.longitude, position.latitude]);
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

  function ensureOverlayElements(overlayState) {
    if (overlayState.infoPill && overlayState.directionArrow) {
      return;
    }

    overlayState.infoPill = document.createElement('div');
    overlayState.infoPill.className = 'map-overlay-pill';
    overlayState.infoPill.innerHTML =
      '<div class="map-overlay-pill-distance"></div><div class="map-overlay-pill-bearing"></div>';

    overlayState.directionArrow = document.createElement('div');
    overlayState.directionArrow.className = 'map-overlay-direction-arrow';
    overlayState.directionArrow.textContent = '➤';

    overlayState.container.appendChild(overlayState.directionArrow);
    overlayState.container.appendChild(overlayState.infoPill);
  }

  function formatDistance(distanceMeters) {
    if (distanceMeters < 1000) {
      return `${Math.round(distanceMeters)} m`;
    }
    return `${(distanceMeters / 1000).toFixed(2)} km`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clipLineToViewport(startPoint, endPoint, width, height, padding) {
    const minX = padding;
    const minY = padding;
    const maxX = width - padding;
    const maxY = height - padding;
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    let t0 = 0;
    let t1 = 1;

    const p = [-dx, dx, -dy, dy];
    const q = [
      startPoint.x - minX,
      maxX - startPoint.x,
      startPoint.y - minY,
      maxY - startPoint.y
    ];

    for (let i = 0; i < 4; i += 1) {
      if (p[i] === 0) {
        if (q[i] < 0) {
          return null;
        }
      } else {
        const r = q[i] / p[i];
        if (p[i] < 0) {
          if (r > t1) {
            return null;
          }
          if (r > t0) {
            t0 = r;
          }
        } else {
          if (r < t0) {
            return null;
          }
          if (r < t1) {
            t1 = r;
          }
        }
      }
    }

    return {
      start: { x: startPoint.x + t0 * dx, y: startPoint.y + t0 * dy },
      end: { x: startPoint.x + t1 * dx, y: startPoint.y + t1 * dy }
    };
  }

  function setOverlayElementPosition(element, point) {
    element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%)`;
  }

  function positionOverlayElements(map, overlayState) {
    if (!overlayState.devicePosition || !overlayState.infoPill || !overlayState.directionArrow) {
      return;
    }

    const viewport = map.getContainer().getBoundingClientRect();
    const width = viewport.width;
    const height = viewport.height;
    const inset = 20;

    const devicePoint = map.project([
      overlayState.devicePosition.longitude,
      overlayState.devicePosition.latitude
    ]);
    const aircraftPosition = overlayState.aircraftState.position;
    const aircraftPoint = map.project([aircraftPosition.longitude, aircraftPosition.latitude]);
    const clipped = clipLineToViewport(devicePoint, aircraftPoint, width, height, inset);

    let pillPoint;
    let arrowPoint;
    let arrowAngle;
    const pillRect = overlayState.infoPill.getBoundingClientRect();
    const arrowRect = overlayState.directionArrow.getBoundingClientRect();
    const pillRadiusPixels = Math.hypot(pillRect.width / 2, pillRect.height / 2);
    const arrowRadiusPixels = Math.max(arrowRect.width, arrowRect.height) / 2;
    const arrowOffsetPixels = pillRadiusPixels + arrowRadiusPixels + 8;

    if (clipped) {
      const lineDirection = {
        x: clipped.end.x - clipped.start.x,
        y: clipped.end.y - clipped.start.y
      };
      const directionLength = Math.hypot(lineDirection.x, lineDirection.y) || 1;
      const normalizedDirection = {
        x: lineDirection.x / directionLength,
        y: lineDirection.y / directionLength
      };
      pillPoint = {
        x: clamp((clipped.start.x + clipped.end.x) / 2, inset, width - inset),
        y: clamp((clipped.start.y + clipped.end.y) / 2, inset, height - inset)
      };
      arrowPoint = {
        x: clamp(pillPoint.x + normalizedDirection.x * arrowOffsetPixels, inset, width - inset),
        y: clamp(pillPoint.y + normalizedDirection.y * arrowOffsetPixels, inset, height - inset)
      };
      arrowAngle = toDegrees(Math.atan2(normalizedDirection.y, normalizedDirection.x));
    } else {
      const center = { x: width / 2, y: height / 2 };
      const direction = {
        x: aircraftPoint.x - center.x,
        y: aircraftPoint.y - center.y
      };
      const useHorizontal = Math.abs(direction.x) > Math.abs(direction.y);
      if (useHorizontal) {
        pillPoint = {
          x: direction.x >= 0 ? width - inset : inset,
          y: clamp(center.y + direction.y * 0.15, inset, height - inset)
        };
      } else {
        pillPoint = {
          x: clamp(center.x + direction.x * 0.15, inset, width - inset),
          y: direction.y >= 0 ? height - inset : inset
        };
      }
      arrowPoint = {
        x: clamp(
          pillPoint.x + Math.cos(Math.atan2(direction.y, direction.x)) * arrowOffsetPixels,
          inset,
          width - inset
        ),
        y: clamp(
          pillPoint.y + Math.sin(Math.atan2(direction.y, direction.x)) * arrowOffsetPixels,
          inset,
          height - inset
        )
      };
      arrowAngle = toDegrees(Math.atan2(direction.y, direction.x));
    }

    const arrowSeparation = Math.hypot(arrowPoint.x - pillPoint.x, arrowPoint.y - pillPoint.y);
    if (arrowSeparation < arrowOffsetPixels) {
      const angleRadians = Math.atan2(aircraftPoint.y - pillPoint.y, aircraftPoint.x - pillPoint.x);
      arrowPoint = {
        x: clamp(pillPoint.x + Math.cos(angleRadians) * arrowOffsetPixels, inset, width - inset),
        y: clamp(pillPoint.y + Math.sin(angleRadians) * arrowOffsetPixels, inset, height - inset)
      };
      arrowAngle = toDegrees(angleRadians);
    }

    setOverlayElementPosition(overlayState.infoPill, pillPoint);
    setOverlayElementPosition(overlayState.directionArrow, arrowPoint);
    overlayState.directionArrow.style.transform = `translate3d(${arrowPoint.x}px, ${arrowPoint.y}px, 0) translate(-50%, -50%) rotate(${arrowAngle}deg)`;
    overlayState.directionArrow.hidden = false;
  }

  function setMapCameraToDevice(map, compassState, options) {
    if (!compassState.devicePosition) {
      return;
    }

    const offsetY = compassState.isCompassFollowEnabled
      ? Math.round(map.getContainer().clientHeight * (COMPASS_ANCHOR_HEIGHT_RATIO - 0.5))
      : 0;

    const camera = {
      center: [compassState.devicePosition.longitude, compassState.devicePosition.latitude],
      zoom: map.getZoom(),
      bearing: typeof options?.bearing === 'number' ? options.bearing : map.getBearing(),
      offset: [0, offsetY],
      animate: true,
      duration: CAMERA_EASE_STANDARD_MS,
      essential: true,
      ...options
    };

    if (!camera.animate) {
      camera.duration = 0;
    }

    compassState.programmaticMoveDepth += 1;
    const settleProgrammaticMove = () => {
      compassState.programmaticMoveDepth = Math.max(0, compassState.programmaticMoveDepth - 1);
    };
    map.once('moveend', settleProgrammaticMove);
    map.easeTo(camera);
  }

  function headingToMapBearing(headingDegrees) {
    // Heading module output is compass-style (0..360, clockwise from north).
    // MapLibre bearing is the clockwise direction at the top of the map.
    // So the correct convention mapping is direct (no sign inversion).
    return normalizeBearing(headingDegrees);
  }

  function toSigned180(degrees) {
    return ((degrees + 180) % 360 + 360) % 360 - 180;
  }

  function resolveNearestBearing(currentBearing, targetBearing) {
    const delta = toSigned180(targetBearing - currentBearing);
    return currentBearing + delta;
  }

  function applyCompassBearingFromHeading(map, compassState, headingDegrees) {
    if (!compassState.isCompassFollowEnabled) {
      return;
    }

    compassState.targetHeadingDegrees = headingDegrees;
    if (compassState.smoothedHeadingDegrees === null) {
      compassState.smoothedHeadingDegrees = headingDegrees;
    }
    startCompassRotationLoop(map, compassState);
  }

  function updateNorthIndicatorRotation(compassState, headingDegrees) {
    if (!compassState.northIndicator) {
      return;
    }

    // Indicator should rotate opposite to applied map bearing so it keeps pointing north on screen.
    compassState.northIndicator.style.transform = `rotate(${-headingDegrees}deg)`;
  }

  function shortestAngularDelta(fromDegrees, toDegrees) {
    return toSigned180(toDegrees - fromDegrees);
  }

  function stopCompassRotationLoop(compassState) {
    if (compassState.rotationAnimationFrameId !== null) {
      cancelAnimationFrame(compassState.rotationAnimationFrameId);
      compassState.rotationAnimationFrameId = null;
    }
  }

  function startCompassRotationLoop(map, compassState) {
    if (compassState.rotationAnimationFrameId !== null) {
      return;
    }

    const step = () => {
      if (!compassState.isCompassFollowEnabled) {
        stopCompassRotationLoop(compassState);
        return;
      }

      if (
        typeof compassState.targetHeadingDegrees === 'number' &&
        typeof compassState.smoothedHeadingDegrees === 'number'
      ) {
        const headingDelta = shortestAngularDelta(
          compassState.smoothedHeadingDegrees,
          compassState.targetHeadingDegrees
        );

        if (Math.abs(headingDelta) >= ROTATION_NOISE_THRESHOLD_DEGREES) {
          compassState.smoothedHeadingDegrees = normalizeBearing(
            compassState.smoothedHeadingDegrees + headingDelta * ROTATION_DAMPING_FACTOR
          );
          const targetBearing = headingToMapBearing(compassState.smoothedHeadingDegrees);
          const currentBearing = map.getBearing();
          const finalBearing = resolveNearestBearing(currentBearing, targetBearing);

          map.setBearing(finalBearing);
          compassState.lastAppliedMapBearing = finalBearing;
          updateNorthIndicatorRotation(compassState, finalBearing);
          debugCompassLog('apply heading -> bearing (damped)', {
            sourceHeading: compassState.targetHeadingDegrees,
            smoothedHeading: compassState.smoothedHeadingDegrees,
            targetBearing,
            finalMapBearing: finalBearing,
            activeHeadingSubscriptions: compassState.activeHeadingSubscriptions
          });
        }
      }

      compassState.rotationAnimationFrameId = requestAnimationFrame(step);
    };

    compassState.rotationAnimationFrameId = requestAnimationFrame(step);
  }

  async function attemptEnableCompassFollow(map, compassState) {
    const button = compassState.locationButton;
    if (!button || !compassState.headingController) {
      setStatusMessage('Compass unavailable: heading controller not ready.');
      return;
    }

    const preflightStatus = compassState.headingController.getStatus();
    if (!preflightStatus.supported) {
      setStatusMessage('Compass unavailable on this device/browser.');
      return;
    }

    const permissionStatus = await compassState.headingController.requestPermissionIfNeeded();
    if (permissionStatus.status === 'permission-denied') {
      setStatusMessage('Compass permission denied. Compass-follow is unavailable.');
      return;
    }
    if (permissionStatus.status === 'error') {
      setStatusMessage('Compass permission failed. Compass-follow is unavailable.');
      return;
    }

    const startStatus = compassState.headingController.start();
    if (startStatus.status === 'permission-required') {
      setStatusMessage('Compass permission required. Tap again to retry.');
      return;
    }
    if (startStatus.status === 'unsupported') {
      setStatusMessage('Compass unavailable on this device/browser.');
      return;
    }

    compassState.isCompassFollowEnabled = true;
    compassState.lastAppliedMapBearing = null;
    compassState.targetHeadingDegrees = compassState.headingDegrees;
    compassState.smoothedHeadingDegrees = compassState.headingDegrees;
    button.classList.add('is-compass-follow');
    updateLocationCompassIcon(compassState);
    updateNorthIndicatorVisibility(compassState);
    setMapCameraToDevice(map, compassState, {
      animate: true,
      duration: CAMERA_EASE_STANDARD_MS,
      bearing: map.getBearing()
    });
    debugCompassLog('compass-follow enabled', {
      activeHeadingSubscriptions: compassState.activeHeadingSubscriptions
    });
    startCompassRotationLoop(map, compassState);
    setStatusMessage('Compass-follow starting…');
  }

  function disableCompassFollow(map, compassState, options) {
    const shouldKeepCurrentBearing = !!options?.keepCurrentBearing;

    if (compassState.headingController) {
      compassState.headingController.stop();
    }

    compassState.isCompassFollowEnabled = false;
    compassState.isRecenteringPrimed = false;
    compassState.lastAppliedMapBearing = null;
    compassState.targetHeadingDegrees = null;
    compassState.smoothedHeadingDegrees = null;
    stopCompassRotationLoop(compassState);
    if (compassState.locationButton) {
      compassState.locationButton.classList.remove('is-compass-follow');
    }
    updateLocationCompassIcon(compassState);
    updateNorthIndicatorVisibility(compassState);

    if (!shouldKeepCurrentBearing) {
      map.setBearing(0);
      updateNorthIndicatorRotation(compassState, 0);
    } else {
      updateNorthIndicatorRotation(compassState, compassState.headingDegrees);
    }
    debugCompassLog('compass-follow disabled', {
      keepCurrentBearing: shouldKeepCurrentBearing
    });
  }

  function createControlsRoot() {
    const controlsRoot = document.createElement('div');
    controlsRoot.className = 'gm-map-controls';
    document.getElementById('app-shell').appendChild(controlsRoot);
    return controlsRoot;
  }

  function createControlIcon(path, altText) {
    const icon = document.createElement('img');
    icon.className = 'gm-control-icon-image';
    icon.src = path;
    icon.alt = altText;
    return icon;
  }

  function updateLocationCompassIcon(compassState) {
    if (!compassState.locationIconImage) {
      return;
    }
    const isCompassMode = compassState.isCompassFollowEnabled;
    compassState.locationIconImage.src = isCompassMode
      ? CONTROL_ICON_PATHS.COMPASS
      : CONTROL_ICON_PATHS.LOCATION;
    compassState.locationIconImage.alt = isCompassMode ? 'Compass mode active' : 'Location';
  }

  function updateNorthIndicatorVisibility(compassState) {
    if (!compassState.northIndicatorWrap) {
      return;
    }
    compassState.northIndicatorWrap.classList.remove('is-hidden');
  }

  function createTelemetryStatusControl(controlsRoot, telemetryState) {
    const container = document.createElement('div');
    container.className = 'telemetry-status';
    container.setAttribute('aria-live', 'polite');
    container.innerHTML =
      '<div class="telemetry-status-main"></div>' +
      '<div class="telemetry-status-detail"></div>';
    controlsRoot.appendChild(container);
    telemetryState.statusElement = container;
    updateTelemetryStatus(telemetryState);
  }

  function createTelemetrySettingsControl(map, overlayState, controlsRoot, telemetryState) {
    const container = document.createElement('div');
    container.className = 'telemetry-settings-wrap';
    const button = document.createElement('button');
    button.className = 'gm-ios-control-button telemetry-settings-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'Telemetry settings');
    button.textContent = 'TEL';

    const panel = document.createElement('form');
    panel.className = 'telemetry-settings-panel';
    panel.hidden = true;
    panel.innerHTML =
      '<label for="telemetry-url-input">Telemetry WebSocket URL</label>' +
      '<input id="telemetry-url-input" name="telemetryUrl" type="url" inputmode="url" autocomplete="url">' +
      '<div class="telemetry-settings-actions">' +
      '<button type="submit">Reconnect</button>' +
      '<button type="button" data-action="default">ESP AP</button>' +
      '<button type="button" data-action="clear">Clear</button>' +
      '</div>' +
      `<a class="telemetry-setup-link" href="${TELEMETRY_SETUP_URL}" target="_blank" rel="noreferrer">ESP setup</a>` +
      '<p class="telemetry-settings-note"></p>';

    const input = panel.querySelector('input');
    const note = panel.querySelector('.telemetry-settings-note');

    const syncPanel = () => {
      input.value = telemetryState.currentUrl || resolveTelemetryUrl();
      note.textContent = window.isSecureContext
        ? 'HTTPS pages may block local ws:// telemetry. Use an installed/offline app or ESP setup if needed.'
        : 'Local HTTP mode can use ESP ws:// telemetry directly.';
    };

    const openPanel = () => {
      syncPanel();
      panel.hidden = false;
    };
    const closePanel = () => {
      panel.hidden = true;
    };

    button.addEventListener('click', () => {
      panel.hidden ? openPanel() : closePanel();
    });

    panel.addEventListener('submit', (event) => {
      event.preventDefault();
      setTelemetryUrl(map, overlayState, telemetryState, input.value.trim() || TELEMETRY_DEFAULT_WS_URL);
      closePanel();
    });

    panel.addEventListener('click', (event) => {
      const action = event.target?.dataset?.action;
      if (action === 'default') {
        setTelemetryUrl(map, overlayState, telemetryState, TELEMETRY_DEFAULT_WS_URL);
        closePanel();
      } else if (action === 'clear') {
        window.localStorage.removeItem(TELEMETRY_URL_STORAGE_KEY);
        setTelemetryUrl(map, overlayState, telemetryState, TELEMETRY_DEFAULT_WS_URL);
        closePanel();
      }
    });

    container.appendChild(button);
    container.appendChild(panel);
    controlsRoot.appendChild(container);
  }

  function formatTelemetryValue(value, suffix, digits) {
    if (!isFiniteNumber(value)) {
      return '--';
    }
    return `${value.toFixed(digits)} ${suffix}`;
  }

  function updateTelemetryStatus(telemetryState) {
    if (!telemetryState.statusElement) {
      return;
    }

    const mainEl = telemetryState.statusElement.querySelector('.telemetry-status-main');
    const detailEl = telemetryState.statusElement.querySelector('.telemetry-status-detail');
    const telemetryAgeMs = telemetryState.lastMessageAt ? Date.now() - telemetryState.lastMessageAt : null;
    const isLive = telemetryState.connectionState === 'connected' && telemetryAgeMs !== null &&
      telemetryAgeMs <= TELEMETRY_STALE_MS;
    const hasGpsFix = telemetryState.latest.gpsFix === true;
    const isLiveGps = isLive && hasGpsFix;

    telemetryState.statusElement.classList.toggle('is-live', isLiveGps);
    telemetryState.statusElement.classList.toggle('is-waiting', isLive && !hasGpsFix);
    telemetryState.statusElement.classList.toggle(
      'is-stale',
      telemetryState.connectionState === 'connected' && !isLive
    );
    telemetryState.statusElement.classList.toggle('is-offline', telemetryState.connectionState !== 'connected');

    if (mainEl) {
      if (isLiveGps) {
        mainEl.textContent = 'Live GPS';
      } else if (isLive) {
        mainEl.textContent = 'Telemetry: no GPS fix';
      } else if (telemetryState.connectionState === 'connecting') {
        mainEl.textContent = 'Telemetry connecting';
      } else if (telemetryState.connectionState === 'connected') {
        mainEl.textContent = 'Telemetry stale';
      } else if (telemetryState.connectionState === 'blocked') {
        mainEl.textContent = 'Telemetry blocked';
      } else if (telemetryState.connectionState === 'unsupported') {
        mainEl.textContent = 'Telemetry unsupported';
      } else {
        mainEl.textContent = 'Telemetry offline';
      }
    }

    if (detailEl) {
      const speedText = formatTelemetryValue(telemetryState.latest.gpsSpeedKph, 'km/h', 1);
      const altitudeText = formatTelemetryValue(telemetryState.latest.gpsAltitudeM, 'm', 0);
      const voltageText = formatTelemetryValue(telemetryState.latest.batteryVoltageV, 'V', 1);
      const satsText = telemetryState.latest.gpsSatellites ?? '--';
      const modeText = telemetryState.latest.flightMode || '--';
      const armedText = telemetryState.latest.armed === true ? 'ARM' : 'SAFE';
      detailEl.textContent = `SPD ${speedText} · ALT ${altitudeText} · BAT ${voltageText} · SAT ${satsText} · ${modeText} ${armedText}`;
    }
  }

  function formatDebugValue(value, digits = 1) {
    if (value === null || typeof value === 'undefined') {
      return '--';
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (isFiniteNumber(value)) {
      return Number.isInteger(value) ? String(value) : value.toFixed(digits);
    }
    return String(value);
  }

  function escapeDebugHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getNestedTelemetryValue(source, path) {
    return path.split('.').reduce((value, key) => {
      if (value === null || typeof value === 'undefined') {
        return null;
      }
      return value[key];
    }, source);
  }

  function createTelemetryDebugGrid(telemetryState) {
    const grid = document.createElement('section');
    grid.className = 'telemetry-debug-grid';
    grid.setAttribute('aria-label', 'Telemetry debug values');
    document.getElementById('app-shell').appendChild(grid);
    telemetryState.debugGridElement = grid;
    updateTelemetryDebugGrid(telemetryState);
  }

  function updateTelemetryDebugGrid(telemetryState) {
    if (!telemetryState.debugGridElement) {
      return;
    }

    const fields = [
      ['Fix', 'gpsFix'], ['Sats', 'gpsSatellites'], ['Lat', 'latitude', 7], ['Lng', 'longitude', 7],
      ['Speed', 'gpsSpeedKph'], ['Alt', 'gpsAltitudeM', 0], ['Head', 'gpsHeadingDeg'],
      ['Batt V', 'batteryVoltageV'], ['Batt A', 'batteryCurrentA'], ['mAh', 'batteryCapacityMah', 0],
      ['Vario', 'verticalSpeed'], ['Baro', 'baroAltitudeM', 0], ['Air', 'airSpeedKph'],
      ['Pitch', 'pitchDeg'], ['Roll', 'rollDeg'], ['Yaw', 'yawDeg'],
      ['Mode', 'flightMode'], ['Armed', 'armed'], ['Stale', 'stale'], ['RC', 'rcChannelsUs'],
      ['UL RSSI', 'linkStats.uplinkRssiAnt1Dbm', 0], ['UL LQ', 'linkStats.uplinkLq', 0],
      ['UL SNR', 'linkStats.uplinkSnr', 0], ['DL RSSI', 'linkStats.downlinkRssiDbm', 0],
      ['DL LQ', 'linkStats.downlinkLq', 0], ['DL SNR', 'linkStats.downlinkSnr', 0],
      ['Ant', 'linkStats.activeAntenna', 0], ['RF', 'linkStats.rfMode', 0], ['TX Pwr', 'linkStats.txPower', 0],
      ['Frames', 'frameCounts.total', 0], ['GPS Frm', 'frameCounts.gps', 0], ['Batt Frm', 'frameCounts.battery', 0],
      ['Vario Frm', 'frameCounts.vario', 0], ['Att Frm', 'frameCounts.attitude', 0],
      ['Mode Frm', 'frameCounts.flightMode', 0],
      ['Link Frm', 'frameCounts.linkStats', 0], ['Unk Frm', 'frameCounts.unknown', 0],
      ['Bad Size', 'frameCounts.invalidSize', 0], ['CRC', 'frameCounts.crcErrors', 0], ['Resync', 'frameCounts.resyncs', 0],
      ['Valid', 'diagnostics.validFramesSinceBoot', 0], ['Decoded', 'diagnostics.decodedFramesSinceBoot', 0],
      ['Last Addr', 'diagnostics.lastFrameAddress'], ['Last', 'diagnostics.lastFrameType'],
      ['Unknown', 'diagnostics.lastUnknownFrameType'], ['Inv Type', 'diagnostics.lastInvalidSizeFrameType'],
      ['Inv Len', 'diagnostics.lastInvalidSizeLength', 0], ['Raw', 'diagnostics.lastRawBytesHex']
    ];

    telemetryState.debugGridElement.innerHTML = fields.map(([label, path, digits]) => {
      const value = getNestedTelemetryValue(telemetryState.latest, path);
      return `<div class="telemetry-debug-cell"><span>${escapeDebugHtml(label)}</span><strong>${escapeDebugHtml(formatDebugValue(value, digits))}</strong></div>`;
    }).join('');
  }

  function createLayersButtonControl(map, controlsRoot, mapState) {
    const container = document.createElement('div');
    container.className = 'gm-ios-control-stack gm-control-slot gm-slot-top';
    const button = document.createElement('button');
    button.className = 'gm-ios-control-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'Map layers');
    button.appendChild(createControlIcon(CONTROL_ICON_PATHS.LAYERS, 'Layers'));

    const chooser = document.createElement('div');
    chooser.className = 'gm-ios-layers-chooser';
    chooser.hidden = true;

    const closeChooser = () => {
      chooser.hidden = true;
    };

    const openChooser = () => {
      chooser.hidden = false;
    };

    mapState.styleNames.forEach((label) => {
      const optionButton = document.createElement('button');
      optionButton.className = 'gm-ios-layers-option';
      optionButton.type = 'button';
      optionButton.textContent = label;
      optionButton.setAttribute('aria-label', `Set map type to ${label}`);
      optionButton.addEventListener('click', () => {
        map.setStyle(MAP_STYLES[label]);
        closeChooser();
      });
      chooser.appendChild(optionButton);
    });

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      chooser.hidden ? openChooser() : closeChooser();
    });

    document.addEventListener('pointerdown', (event) => {
      if (!container.contains(event.target)) {
        closeChooser();
      }
    });

    container.appendChild(button);
    container.appendChild(chooser);
    controlsRoot.appendChild(container);
  }

  function createNorthIndicatorControl(controlsRoot, compassState) {
    const container = document.createElement('div');
    container.className = 'gm-ios-north-indicator-wrap gm-control-slot gm-slot-middle';
    const indicator = document.createElement('div');
    indicator.className = 'gm-ios-north-indicator gm-ios-control-button';
    indicator.appendChild(createControlIcon(CONTROL_ICON_PATHS.NORTH, 'North'));
    indicator.setAttribute('aria-label', 'North indicator');
    container.appendChild(indicator);
    controlsRoot.appendChild(container);
    compassState.northIndicator = indicator;
    compassState.northIndicatorWrap = container;
  }

  function createLocationControl(map, controlsRoot, compassState) {
    const container = document.createElement('div');
    container.className = 'gm-ios-location-wrap gm-control-slot gm-slot-bottom';
    const button = document.createElement('button');
    button.className = 'gm-ios-control-button gm-ios-location-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'Recenter map to your location');
    const iconImage = createControlIcon(CONTROL_ICON_PATHS.LOCATION, 'Location');
    button.appendChild(iconImage);
    compassState.locationIconImage = iconImage;
    compassState.locationButton = button;

    button.addEventListener('click', () => {
      if (!compassState.devicePosition) {
        requestCurrentLocation(map, compassState.overlayState, compassState);
        return;
      }

      if (compassState.isCompassFollowEnabled) {
        disableCompassFollow(map, compassState, { keepCurrentBearing: false });
        setMapCameraToDevice(map, compassState, {
          animate: true,
          duration: CAMERA_EASE_STANDARD_MS,
          bearing: 0
        });
        return;
      }

      if (compassState.isRecenteringPrimed) {
        attemptEnableCompassFollow(map, compassState);
      } else {
        setMapCameraToDevice(map, compassState, { animate: true, bearing: 0, offset: [0, 0] });
      }

      compassState.isRecenteringPrimed = !compassState.isRecenteringPrimed;
    });

    container.appendChild(button);
    controlsRoot.appendChild(container);
    updateLocationCompassIcon(compassState);
  }

  function bindHeadingTracking(map, compassState) {
    if (typeof window.createHeadingController !== 'function') {
      console.warn('[heading] createHeadingController unavailable');
      return;
    }

    compassState.headingController = window.createHeadingController();
    if (typeof compassState.unsubscribeHeading === 'function') {
      compassState.unsubscribeHeading();
      compassState.activeHeadingSubscriptions = Math.max(
        0,
        compassState.activeHeadingSubscriptions - 1
      );
      debugCompassLog('removed previous heading subscription', {
        activeHeadingSubscriptions: compassState.activeHeadingSubscriptions
      });
    }

    compassState.unsubscribeHeading = compassState.headingController.subscribe((headingStatus) => {
      if (typeof headingStatus.headingDegrees === 'number') {
        compassState.headingDegrees = headingStatus.headingDegrees;
        debugCompassLog('heading update', {
          status: headingStatus.status,
          normalizedHeading: headingStatus.headingDegrees
        });
        updateNorthIndicatorRotation(compassState, map.getBearing());
        applyCompassBearingFromHeading(map, compassState, compassState.headingDegrees);
      }

      if (!compassState.isCompassFollowEnabled) {
        return;
      }

      if (headingStatus.status === 'active' || headingStatus.status === 'active-degraded') {
        setStatusMessage(
          headingStatus.status === 'active'
            ? 'Compass-follow active.'
            : 'Compass-follow active (degraded heading).'
        );
        return;
      }

      if (
        headingStatus.status === 'permission-denied' ||
        headingStatus.status === 'unsupported' ||
        headingStatus.status === 'no-heading-data' ||
        headingStatus.status === 'error'
      ) {
        disableCompassFollow(map, compassState);
        setStatusMessage(`Compass-follow unavailable: ${headingStatus.status}.`);
      }
    });

    compassState.activeHeadingSubscriptions += 1;
    debugCompassLog('registered heading subscription', {
      activeHeadingSubscriptions: compassState.activeHeadingSubscriptions
    });

    map.on('dragstart zoomstart', () => {
      compassState.isRecenteringPrimed = false;
    });
    map.on('rotate', () => {
      updateNorthIndicatorRotation(compassState, map.getBearing());
    });

    const handleUserCameraGesture = (eventName) => {
      if (!compassState.isCompassFollowEnabled) {
        return;
      }
      if (compassState.programmaticMoveDepth > 0) {
        return;
      }
      debugCompassLog('user gesture detected, exiting compass-follow', { eventName });
      disableCompassFollow(map, compassState, { keepCurrentBearing: true });
      setStatusMessage('Compass-follow paused: manual map control.');
    };

    map.on('dragstart', () => {
      handleUserCameraGesture('dragstart');
    });
    map.on('zoomstart', () => {
      handleUserCameraGesture('zoomstart');
    });
    map.on('movestart', (event) => {
      if (event && event.originalEvent) {
        handleUserCameraGesture('movestart');
      }
    });
    map.getCanvas().addEventListener(
      'touchstart',
      () => {
        handleUserCameraGesture('touchstart');
      },
      { passive: true }
    );
  }

  function ensureLineLayerInCurrentStyle(map, overlayState) {
    if (!map.getSource(DEVICE_AIRCRAFT_LINE_SOURCE_ID)) {
      map.addSource(DEVICE_AIRCRAFT_LINE_SOURCE_ID, {
        type: 'geojson',
        data: overlayState.lineData || { type: 'FeatureCollection', features: [] }
      });
    }

    if (!map.getLayer(DEVICE_AIRCRAFT_LINE_LAYER_ID)) {
      map.addLayer({
        id: DEVICE_AIRCRAFT_LINE_LAYER_ID,
        type: 'line',
        source: DEVICE_AIRCRAFT_LINE_SOURCE_ID,
        paint: {
          'line-color': '#d32f2f',
          'line-width': 3.3,
          'line-dasharray': [2.5, 2],
          'line-opacity': 0.95
        }
      });
    }

    const source = map.getSource(DEVICE_AIRCRAFT_LINE_SOURCE_ID);
    if (source && overlayState.lineData) {
      source.setData(overlayState.lineData);
    }
  }

  function ensureLineLayer(map, overlayState) {
    const rebindLineForStyle = () => {
      ensureLineLayerInCurrentStyle(map, overlayState);
      overlayState.lineSourceId = DEVICE_AIRCRAFT_LINE_SOURCE_ID;
    };

    if (map.isStyleLoaded()) {
      rebindLineForStyle();
    }

    if (!overlayState.lineStyleListenerBound) {
      map.on('style.load', rebindLineForStyle);
      overlayState.lineStyleListenerBound = true;
    }
  }

  function updateDeviceToAircraftOverlay(map, deviceLat, deviceLng, overlayState) {
    ensureOverlayElements(overlayState);

    const aircraftLat = overlayState.aircraftState.position.latitude;
    const aircraftLng = overlayState.aircraftState.position.longitude;
    overlayState.devicePosition = {
      latitude: deviceLat,
      longitude: deviceLng
    };

    overlayState.lineData = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [deviceLng, deviceLat],
              [aircraftLng, aircraftLat]
            ]
          },
          properties: {}
        }
      ]
    };
    if (map.isStyleLoaded()) {
      ensureLineLayerInCurrentStyle(map, overlayState);
    }

    const distanceMeters = calculateDistanceMeters(deviceLat, deviceLng, aircraftLat, aircraftLng);
    const bearingDegrees = calculateBearingDegrees(deviceLat, deviceLng, aircraftLat, aircraftLng);

    overlayState.infoPill.querySelector('.map-overlay-pill-distance').textContent =
      formatDistance(distanceMeters);
    overlayState.infoPill.querySelector('.map-overlay-pill-bearing').textContent =
      `${Math.round(bearingDegrees)}°`;
    positionOverlayElements(map, overlayState);
  }

  function updateAircraftTelemetry(map, overlayState, telemetry) {
    const aircraftState = overlayState.aircraftState;

    if (telemetry.gpsFix === true && isFiniteNumber(telemetry.latitude) && isFiniteNumber(telemetry.longitude)) {
      aircraftState.position = {
        latitude: telemetry.latitude,
        longitude: telemetry.longitude
      };
      aircraftState.isLivePosition = true;
      upsertAircraftMarker(map, aircraftState);

      if (!overlayState.devicePosition && !aircraftState.hasAutoCenteredOnLiveGps) {
        aircraftState.hasAutoCenteredOnLiveGps = true;
        map.easeTo({
          center: [telemetry.longitude, telemetry.latitude],
          zoom: FOCUS_ZOOM,
          duration: CAMERA_EASE_STANDARD_MS,
          essential: true
        });
        setStatusMessage('Showing live drone GPS position.');
      }
    }

    if (overlayState.devicePosition) {
      updateDeviceToAircraftOverlay(
        map,
        overlayState.devicePosition.latitude,
        overlayState.devicePosition.longitude,
        overlayState
      );
    }
  }

  function normalizeTelemetryMessage(message) {
    if (!message || typeof message !== 'object') {
      return null;
    }

    return {
      latitude: isFiniteNumber(message.latitude) ? message.latitude : null,
      longitude: isFiniteNumber(message.longitude) ? message.longitude : null,
      gpsSpeedKph: isFiniteNumber(message.gpsSpeedKph) ? message.gpsSpeedKph : null,
      gpsAltitudeM: isFiniteNumber(message.gpsAltitudeM) ? message.gpsAltitudeM : null,
      gpsHeadingDeg: isFiniteNumber(message.gpsHeadingDeg) ? message.gpsHeadingDeg : null,
      gpsSatellites: isFiniteNumber(message.gpsSatellites) ? message.gpsSatellites : null,
      gpsFix: typeof message.gpsFix === 'boolean' ? message.gpsFix : null,
      batteryVoltageV: isFiniteNumber(message.batteryVoltageV) ? message.batteryVoltageV : null,
      batteryCurrentA: isFiniteNumber(message.batteryCurrentA) ? message.batteryCurrentA : null,
      batteryCapacityMah: isFiniteNumber(message.batteryCapacityMah) ? message.batteryCapacityMah : null,
      verticalSpeed: isFiniteNumber(message.verticalSpeed) ? message.verticalSpeed : null,
      baroAltitudeM: isFiniteNumber(message.baroAltitudeM) ? message.baroAltitudeM : null,
      airSpeedKph: isFiniteNumber(message.airSpeedKph) ? message.airSpeedKph : null,
      pitchDeg: isFiniteNumber(message.pitchDeg) ? message.pitchDeg : null,
      rollDeg: isFiniteNumber(message.rollDeg) ? message.rollDeg : null,
      yawDeg: isFiniteNumber(message.yawDeg) ? message.yawDeg : null,
      flightMode: typeof message.flightMode === 'string' ? message.flightMode : null,
      armed: typeof message.armed === 'boolean' ? message.armed : null,
      rcChannelsUs: Array.isArray(message.rcChannelsUs) ? message.rcChannelsUs : null,
      linkStats: message.linkStats && typeof message.linkStats === 'object'
        ? message.linkStats
        : null,
      stale: typeof message.stale === 'boolean' ? message.stale : null,
      frameCounts: message.frameCounts && typeof message.frameCounts === 'object'
        ? message.frameCounts
        : null,
      diagnostics: message.diagnostics && typeof message.diagnostics === 'object'
        ? message.diagnostics
        : null
    };
  }

  function resolveTelemetryUrl() {
    const params = new URLSearchParams(window.location.search);
    const urlFromQuery = params.get('telemetry') || params.get('telemetryUrl') || params.get('ws');
    if (urlFromQuery) {
      window.localStorage.setItem(TELEMETRY_URL_STORAGE_KEY, urlFromQuery);
      return urlFromQuery;
    }
    return window.localStorage.getItem(TELEMETRY_URL_STORAGE_KEY) || TELEMETRY_DEFAULT_WS_URL;
  }

  function closeTelemetrySocket(telemetryState) {
    if (telemetryState.reconnectTimerId !== null) {
      window.clearTimeout(telemetryState.reconnectTimerId);
      telemetryState.reconnectTimerId = null;
    }
    if (telemetryState.socket) {
      telemetryState.ignoredCloseSocket = telemetryState.socket;
      telemetryState.socket.close();
      telemetryState.socket = null;
    }
  }

  function setTelemetryUrl(map, overlayState, telemetryState, telemetryUrl) {
    window.localStorage.setItem(TELEMETRY_URL_STORAGE_KEY, telemetryUrl);
    setStatusMessage(`Telemetry URL set: ${telemetryUrl}`);
    closeTelemetrySocket(telemetryState);
    telemetryState.connectionState = 'offline';
    telemetryState.currentUrl = telemetryUrl;
    updateTelemetryStatus(telemetryState);
    connectTelemetryWebSocket(map, overlayState, telemetryState);
  }

  function connectTelemetryWebSocket(map, overlayState, telemetryState) {
    if (!('WebSocket' in window)) {
      telemetryState.connectionState = 'unsupported';
      updateTelemetryStatus(telemetryState);
      return;
    }

    const telemetryUrl = resolveTelemetryUrl();
    telemetryState.currentUrl = telemetryUrl;

    if (window.location.protocol === 'https:' && telemetryUrl.startsWith('ws://')) {
      telemetryState.connectionState = 'blocked';
      setStatusMessage(`Telemetry blocked by HTTPS browser rules. Try installed/offline WebGPS or configure hotspot mode at ${TELEMETRY_SETUP_URL}.`);
      updateTelemetryStatus(telemetryState);
      return;
    }

    const scheduleReconnect = () => {
      if (telemetryState.reconnectTimerId !== null) {
        return;
      }
      telemetryState.reconnectTimerId = window.setTimeout(() => {
        telemetryState.reconnectTimerId = null;
        connectTelemetryWebSocket(map, overlayState, telemetryState);
      }, TELEMETRY_RECONNECT_MS);
    };

    try {
      telemetryState.connectionState = 'connecting';
      updateTelemetryStatus(telemetryState);
      telemetryState.socket = new WebSocket(telemetryUrl);
    } catch (error) {
      telemetryState.connectionState = 'error';
      updateTelemetryStatus(telemetryState);
      scheduleReconnect();
      return;
    }

    telemetryState.socket.addEventListener('open', () => {
      telemetryState.connectionState = 'connected';
      setStatusMessage(`Telemetry connected: ${telemetryUrl}`);
      updateTelemetryStatus(telemetryState);
    });

    telemetryState.socket.addEventListener('message', (event) => {
      let parsed;
      try {
        parsed = JSON.parse(event.data);
      } catch (error) {
        return;
      }

      const telemetry = normalizeTelemetryMessage(parsed);
      if (!telemetry) {
        return;
      }

      Object.entries(telemetry).forEach(([key, value]) => {
        telemetryState.latest[key] = value;
      });
      telemetryState.lastMessageAt = Date.now();
      updateAircraftTelemetry(map, overlayState, telemetry);
      updateTelemetryStatus(telemetryState);
      updateTelemetryDebugGrid(telemetryState);
    });

    telemetryState.socket.addEventListener('close', (event) => {
      telemetryState.socket = null;
      if (event.target === telemetryState.ignoredCloseSocket) {
        telemetryState.ignoredCloseSocket = null;
        return;
      }
      telemetryState.connectionState = 'offline';
      updateTelemetryStatus(telemetryState);
      scheduleReconnect();
    });

    telemetryState.socket.addEventListener('error', () => {
      telemetryState.connectionState = 'error';
      updateTelemetryStatus(telemetryState);
    });
  }

  function requestCurrentLocation(map, overlayState, compassState) {
    if (!navigator.geolocation) {
      setStatusMessage('Location unavailable: this browser does not support geolocation.');
      return;
    }

    if (!window.isSecureContext) {
      setStatusMessage('Location may be blocked because this page is not HTTPS or localhost.');
    }

    setStatusMessage('Requesting your current location...');

    const handlePosition = (position) => {
      const { latitude, longitude } = position.coords;
      const hasPosition = !!compassState.devicePosition;
      compassState.devicePosition = { latitude, longitude };
      upsertCurrentLocationMarker(compassState, latitude, longitude);
      updateDeviceToAircraftOverlay(map, latitude, longitude, overlayState);

      if (!hasPosition) {
        compassState.programmaticMoveDepth += 1;
        map.once('moveend', () => {
          compassState.programmaticMoveDepth = Math.max(0, compassState.programmaticMoveDepth - 1);
        });
        map.easeTo({
          center: [longitude, latitude],
          zoom: FOCUS_ZOOM,
          bearing: map.getBearing(),
          duration: CAMERA_EASE_STANDARD_MS,
          essential: true
        });
        setStatusMessage('Showing your current device position.');
      } else if (compassState.isCompassFollowEnabled) {
        setMapCameraToDevice(map, compassState, {
          animate: true,
          duration: CAMERA_EASE_HEADING_MS,
          bearing: map.getBearing()
        });
      }
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        handlePosition(position);
      },
      (error) => {
        const details = error && error.message ? ` (${error.message})` : '';
        const code = error && error.code ? ` code ${error.code}` : '';
        setStatusMessage(`Location unavailable${code}. Tap the location button to retry.${details}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    if (compassState.watchPositionId === null) {
      compassState.watchPositionId = navigator.geolocation.watchPosition(
        (position) => {
          handlePosition(position);
        },
        () => {},
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 1000
        }
      );
    }
  }

  const mapSetup = createMap();
  const map = mapSetup.map;
  const controlsRoot = createControlsRoot();
  const aircraftState = {
    position: { ...MOCK_DRONE_POSITION },
    marker: null,
    isLivePosition: false,
    hasAutoCenteredOnLiveGps: false
  };
  const telemetryState = {
    socket: null,
    connectionState: 'offline',
    reconnectTimerId: null,
    ignoredCloseSocket: null,
    statusElement: null,
    debugGridElement: null,
    lastMessageAt: null,
    latest: {
      latitude: null,
      longitude: null,
      gpsSpeedKph: null,
      gpsAltitudeM: null,
      gpsHeadingDeg: null,
      gpsSatellites: null,
      gpsFix: null,
      batteryVoltageV: null,
      batteryCurrentA: null,
      batteryCapacityMah: null,
      verticalSpeed: null,
      baroAltitudeM: null,
      airSpeedKph: null,
      pitchDeg: null,
      rollDeg: null,
      yawDeg: null,
      flightMode: null,
      armed: null,
      rcChannelsUs: null,
      linkStats: null,
      stale: null,
      frameCounts: null,
      diagnostics: null
    }
  };
  const overlayContainer = document.createElement('div');
  overlayContainer.className = 'map-overlay-container';
  document.getElementById('app-shell').appendChild(overlayContainer);

  const overlayState = {
    lineSourceId: null,
    lineData: null,
    lineStyleListenerBound: false,
    infoPill: null,
    directionArrow: null,
    devicePosition: null,
    container: overlayContainer,
    aircraftState
  };

  const compassState = {
    map,
    headingDegrees: 0,
    devicePosition: null,
    isCompassFollowEnabled: false,
    isRecenteringPrimed: false,
    locationButton: null,
    overlayState: null,
    locationIconImage: null,
    northIndicator: null,
    northIndicatorWrap: null,
    headingController: null,
    unsubscribeHeading: null,
    currentLocationMarker: null,
    watchPositionId: null,
    activeHeadingSubscriptions: 0,
    lastAppliedMapBearing: null,
    programmaticMoveDepth: 0,
    targetHeadingDegrees: null,
    smoothedHeadingDegrees: null,
    rotationAnimationFrameId: null
  };
  compassState.overlayState = overlayState;

  ensureLineLayer(map, overlayState);
  map.on('render', () => {
    positionOverlayElements(map, overlayState);
  });

  createLayersButtonControl(map, controlsRoot, mapSetup);
  createLocationControl(map, controlsRoot, compassState);
  createNorthIndicatorControl(controlsRoot, compassState);
  createTelemetryStatusControl(controlsRoot, telemetryState);
  createTelemetrySettingsControl(map, overlayState, controlsRoot, telemetryState);
  createTelemetryDebugGrid(telemetryState);
  updateNorthIndicatorVisibility(compassState);
  updateNorthIndicatorRotation(compassState, map.getBearing());
  bindHeadingTracking(map, compassState);
  upsertAircraftMarker(map, aircraftState);
  requestCurrentLocation(map, overlayState, compassState);
  connectTelemetryWebSocket(map, overlayState, telemetryState);
  window.setInterval(() => {
    updateTelemetryStatus(telemetryState);
  }, 1000);
})();
