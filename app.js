(function initTelemetryMapApp() {
  const FALLBACK_CENTER = [-98.5795, 39.8283];
  const FALLBACK_ZOOM = 4;
  const FOCUS_ZOOM = 15;
  const MAX_MAP_ZOOM = 19;
  const COMPASS_ANCHOR_HEIGHT_RATIO = 2 / 3;
  const LABEL_OFFSET_PIXELS = 16;
  const EARTH_RADIUS_METERS = 6371000;
  const COMPASS_DEBUG_LOGGING = true;
  const CAMERA_EASE_STANDARD_MS = 650;
  const CAMERA_EASE_HEADING_MS = 140;
  const ROTATION_DAMPING_FACTOR = 0.16;
  const ROTATION_NOISE_THRESHOLD_DEGREES = 0.5;
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

  function upsertCurrentLocationMarker(compassState, lat, lng) {
    if (!compassState.currentLocationMarker) {
      compassState.currentLocationMarker = new maplibregl.Marker({
        element: createMarkerElement('gm-marker gm-marker-device')
      })
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup({ offset: 12 }).setText('Current device position'))
        .addTo(compassState.map);
      compassState.currentLocationMarker.togglePopup();
      return;
    }

    compassState.currentLocationMarker.setLngLat([lng, lat]);
  }

  function placeMockDroneMarker(map) {
    return new maplibregl.Marker({
      element: createMarkerElement('gm-marker gm-marker-aircraft')
    })
      .setLngLat([MOCK_DRONE_POSITION.longitude, MOCK_DRONE_POSITION.latitude])
      .setPopup(new maplibregl.Popup({ offset: 12 }).setText('Mock drone position'))
      .addTo(map);
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
    if (overlayState.distanceLabel && overlayState.bearingLabel) {
      return;
    }

    overlayState.distanceLabel = document.createElement('div');
    overlayState.distanceLabel.className = 'map-overlay-label leaflet-control-distance-label';

    overlayState.bearingLabel = document.createElement('div');
    overlayState.bearingLabel.className = 'map-overlay-label leaflet-control-bearing-label';

    overlayState.container.appendChild(overlayState.distanceLabel);
    overlayState.container.appendChild(overlayState.bearingLabel);
  }

  function calculateLabelPosition(map, startLat, startLng, endLat, endLng, distancePixels) {
    const startPoint = map.project([startLng, startLat]);
    const endPoint = map.project([endLng, endLat]);
    const midX = (startPoint.x + endPoint.x) / 2;
    const midY = (startPoint.y + endPoint.y) / 2;
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const aboveX = normalY < 0 ? normalX : -normalX;
    const aboveY = normalY < 0 ? normalY : -normalY;

    return {
      above: {
        x: midX + aboveX * distancePixels,
        y: midY + aboveY * distancePixels
      },
      below: {
        x: midX - aboveX * distancePixels,
        y: midY - aboveY * distancePixels
      }
    };
  }

  function calculateLineAngleDegrees(map, startLat, startLng, endLat, endLng) {
    const startPoint = map.project([startLng, startLat]);
    const endPoint = map.project([endLng, endLat]);
    return toDegrees(Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x));
  }

  function setLabelPosition(labelEl, point, angleDegrees) {
    if (!labelEl) {
      return;
    }

    labelEl.style.left = `${point.x}px`;
    labelEl.style.top = `${point.y}px`;
    labelEl.style.transform = `translate(-50%, -50%) rotate(${angleDegrees}deg)`;
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

    setLabelPosition(overlayState.distanceLabel, labelPositions.above, lineAngleDegrees);
    setLabelPosition(overlayState.bearingLabel, labelPositions.below, lineAngleDegrees);
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

  function createLayersButtonControl(map, controlsRoot, mapState) {
    const container = document.createElement('div');
    container.className = 'gm-ios-control-stack';
    const button = document.createElement('button');
    button.className = 'gm-ios-control-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'Map layers');
    button.innerHTML = '<span class="gm-ios-icon gm-ios-icon-layers" aria-hidden="true"></span>';

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
    container.className = 'gm-ios-north-indicator-wrap';
    const indicator = document.createElement('div');
    indicator.className = 'gm-ios-north-indicator';
    indicator.innerHTML = '<span class="gm-ios-icon gm-ios-icon-north" aria-hidden="true"></span>';
    indicator.setAttribute('aria-label', 'North indicator');
    container.appendChild(indicator);
    controlsRoot.appendChild(container);
    compassState.northIndicator = indicator;
  }

  function createLocationControl(map, controlsRoot, compassState) {
    const container = document.createElement('div');
    container.className = 'gm-ios-location-wrap';
    const button = document.createElement('button');
    button.className = 'gm-ios-control-button gm-ios-location-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'Recenter map to your location');
    button.innerHTML = '<span class="gm-ios-icon gm-ios-icon-location" aria-hidden="true"></span>';
    compassState.locationButton = button;

    button.addEventListener('click', () => {
      if (!compassState.devicePosition) {
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
        if (compassState.isCompassFollowEnabled) {
          updateNorthIndicatorRotation(compassState, map.getBearing());
        } else {
          updateNorthIndicatorRotation(compassState, compassState.headingDegrees);
        }
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

  function ensureLineLayer(map, overlayState) {
    const sourceId = 'device-aircraft-line';
    const layerId = 'device-aircraft-line-layer';

    const createIfMissing = () => {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });
      }

      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#1d4ed8',
            'line-width': 2,
            'line-dasharray': [3, 3],
            'line-opacity': 0.9
          }
        });
      }

      overlayState.lineSourceId = sourceId;
    };

    if (map.isStyleLoaded()) {
      createIfMissing();
    }

    map.on('style.load', createIfMissing);
  }

  function updateDeviceToAircraftOverlay(map, deviceLat, deviceLng, overlayState) {
    ensureOverlayElements(overlayState);

    const aircraftLat = MOCK_DRONE_POSITION.latitude;
    const aircraftLng = MOCK_DRONE_POSITION.longitude;
    overlayState.devicePosition = {
      latitude: deviceLat,
      longitude: deviceLng
    };

    if (overlayState.lineSourceId) {
      const source = map.getSource(overlayState.lineSourceId);
      if (source) {
        source.setData({
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
        });
      }
    }

    const distanceMeters = calculateDistanceMeters(deviceLat, deviceLng, aircraftLat, aircraftLng);
    const bearingDegrees = calculateBearingDegrees(deviceLat, deviceLng, aircraftLat, aircraftLng);

    overlayState.distanceLabel.textContent = `${Math.round(distanceMeters)} m`;
    overlayState.bearingLabel.textContent = `${Math.round(bearingDegrees)}°`;
    positionOverlayLabels(map, overlayState);
  }

  function requestCurrentLocation(map, overlayState, compassState) {
    if (!navigator.geolocation) {
      setStatusMessage('Location unavailable: this browser does not support geolocation.');
      return;
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
        setStatusMessage(`Location unavailable. Using default map view.${details}`);
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
  const overlayContainer = document.createElement('div');
  overlayContainer.className = 'map-overlay-container';
  document.getElementById('app-shell').appendChild(overlayContainer);

  const overlayState = {
    lineSourceId: null,
    distanceLabel: null,
    bearingLabel: null,
    devicePosition: null,
    container: overlayContainer
  };

  const compassState = {
    map,
    headingDegrees: 0,
    devicePosition: null,
    isCompassFollowEnabled: false,
    isRecenteringPrimed: false,
    locationButton: null,
    northIndicator: null,
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

  ensureLineLayer(map, overlayState);
  map.on('move zoom rotate pitch', () => {
    positionOverlayLabels(map, overlayState);
  });

  createLayersButtonControl(map, controlsRoot, mapSetup);
  createLocationControl(map, controlsRoot, compassState);
  createNorthIndicatorControl(controlsRoot, compassState);
  bindHeadingTracking(map, compassState);
  placeMockDroneMarker(map);
  requestCurrentLocation(map, overlayState, compassState);
})();
