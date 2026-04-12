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
    const aircraftPoint = map.project([MOCK_DRONE_POSITION.longitude, MOCK_DRONE_POSITION.latitude]);
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

    const aircraftLat = MOCK_DRONE_POSITION.latitude;
    const aircraftLng = MOCK_DRONE_POSITION.longitude;
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
    lineData: null,
    lineStyleListenerBound: false,
    infoPill: null,
    directionArrow: null,
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

  ensureLineLayer(map, overlayState);
  map.on('render', () => {
    positionOverlayElements(map, overlayState);
  });

  createLayersButtonControl(map, controlsRoot, mapSetup);
  createLocationControl(map, controlsRoot, compassState);
  createNorthIndicatorControl(controlsRoot, compassState);
  updateNorthIndicatorVisibility(compassState);
  updateNorthIndicatorRotation(compassState, map.getBearing());
  bindHeadingTracking(map, compassState);
  placeMockDroneMarker(map);
  requestCurrentLocation(map, overlayState, compassState);
})();
