(function initTelemetryMapApp() {
  const FALLBACK_CENTER = [39.8283, -98.5795];
  const FALLBACK_ZOOM = 4;
  const FOCUS_ZOOM = 15;
  const MAX_MAP_ZOOM = 19;
  const LABEL_OFFSET_PIXELS = 16;
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

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);

    return {
      map,
      baseLayers: {
        Streets: streetLayer,
        Satellite: satelliteLayer,
        Terrain: terrainLayer
      }
    };
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

  function createLayersButtonControl(map, baseLayers) {
    const LayersControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const container = L.DomUtil.create('div', 'leaflet-bar gm-ios-control-stack');
        const button = L.DomUtil.create('button', 'gm-ios-control-button', container);
        button.type = 'button';
        button.setAttribute('aria-label', 'Map layers');
        button.innerHTML = '<span class="gm-ios-icon gm-ios-icon-layers" aria-hidden="true"></span>';

        const chooser = L.DomUtil.create('div', 'gm-ios-layers-chooser', container);
        chooser.hidden = true;

        const closeChooser = () => {
          chooser.hidden = true;
        };

        const openChooser = () => {
          chooser.hidden = false;
        };

        Object.entries(baseLayers).forEach(([label, layer]) => {
          const optionButton = L.DomUtil.create('button', 'gm-ios-layers-option', chooser);
          optionButton.type = 'button';
          optionButton.textContent = label;
          optionButton.setAttribute('aria-label', `Set map type to ${label}`);
          L.DomEvent.on(optionButton, 'click', (event) => {
            L.DomEvent.stop(event);
            Object.values(baseLayers).forEach((candidateLayer) => {
              if (map.hasLayer(candidateLayer)) {
                map.removeLayer(candidateLayer);
              }
            });
            layer.addTo(map);
            closeChooser();
          });
        });

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(button, 'click', (event) => {
          L.DomEvent.stop(event);
          if (chooser.hidden) {
            openChooser();
          } else {
            closeChooser();
          }
        });

        map.on('click', closeChooser);
        return container;
      }
    });

    return new LayersControl().addTo(map);
  }

  function createNorthIndicatorControl(map, compassState) {
    const NorthIndicatorControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const container = L.DomUtil.create('div', 'leaflet-bar gm-ios-north-indicator-wrap');
        const indicator = L.DomUtil.create('div', 'gm-ios-north-indicator', container);
        indicator.innerHTML = '<span class="gm-ios-icon gm-ios-icon-north" aria-hidden="true"></span>';
        indicator.setAttribute('aria-label', 'North indicator');
        compassState.northIndicator = indicator;
        return container;
      }
    });

    return new NorthIndicatorControl().addTo(map);
  }

  function applyMapRotation(map, rotationDegrees) {
    const pane = map.getPane('mapPane');
    if (!pane) {
      return;
    }

    pane.style.transformOrigin = '50% 50%';
    pane.style.transform = `rotate(${rotationDegrees}deg)`;
  }

  function updateNorthIndicatorRotation(compassState, headingDegrees) {
    if (!compassState.northIndicator) {
      return;
    }

    compassState.northIndicator.style.transform = `rotate(${-headingDegrees}deg)`;
  }

  function createLocationControl(map, compassState) {
    const LocationControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const container = L.DomUtil.create('div', 'leaflet-bar gm-ios-location-wrap');
        const button = L.DomUtil.create('button', 'gm-ios-control-button gm-ios-location-button', container);
        button.type = 'button';
        button.setAttribute('aria-label', 'Recenter map to your location');
        button.innerHTML = '<span class="gm-ios-icon gm-ios-icon-location" aria-hidden="true"></span>';
        compassState.locationButton = button;
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(button, 'click', (event) => {
          L.DomEvent.stop(event);
          if (!compassState.devicePosition) {
            return;
          }

          if (compassState.isCompassFollowEnabled) {
            compassState.isCompassFollowEnabled = false;
            compassState.isRecenteringPrimed = false;
            button.classList.remove('is-compass-follow');
            applyMapRotation(map, 0);
            updateNorthIndicatorRotation(compassState, 0);
            map.setView(
              [compassState.devicePosition.latitude, compassState.devicePosition.longitude],
              map.getZoom()
            );
            return;
          }

          map.setView(
            [compassState.devicePosition.latitude, compassState.devicePosition.longitude],
            map.getZoom()
          );

          if (compassState.isRecenteringPrimed) {
            compassState.isCompassFollowEnabled = true;
            button.classList.add('is-compass-follow');
            if (typeof compassState.headingDegrees === 'number') {
              applyMapRotation(map, -compassState.headingDegrees);
              updateNorthIndicatorRotation(compassState, compassState.headingDegrees);
            }
          }

          compassState.isRecenteringPrimed = !compassState.isRecenteringPrimed;
        });
        return container;
      }
    });

    return new LocationControl().addTo(map);
  }

  function bindHeadingTracking(map, compassState) {
    const handleDeviceOrientation = (event) => {
      if (event && typeof event.webkitCompassHeading === 'number') {
        compassState.headingDegrees = normalizeBearing(event.webkitCompassHeading);
      } else if (event && typeof event.alpha === 'number') {
        compassState.headingDegrees = normalizeBearing(360 - event.alpha);
      } else {
        return;
      }

      if (compassState.isCompassFollowEnabled) {
        applyMapRotation(map, -compassState.headingDegrees);
      }
      updateNorthIndicatorRotation(compassState, compassState.headingDegrees);
    };

    window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    map.on('dragstart zoomstart', () => {
      compassState.isRecenteringPrimed = false;
    });
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

  function requestCurrentLocation(map, overlayState, compassState) {
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
        compassState.devicePosition = { latitude, longitude };
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

  const mapSetup = createMap();
  const map = mapSetup.map;
  const overlayState = {
    line: null,
    distanceLabel: null,
    bearingLabel: null,
    devicePosition: null,
    isLabelPositionBound: false
  };
  const compassState = {
    headingDegrees: 0,
    devicePosition: null,
    isCompassFollowEnabled: false,
    isRecenteringPrimed: false,
    locationButton: null,
    northIndicator: null
  };
  createLayersButtonControl(map, mapSetup.baseLayers);
  createLocationControl(map, compassState);
  createNorthIndicatorControl(map, compassState);
  bindHeadingTracking(map, compassState);
  placeMockDroneMarker(map);
  requestCurrentLocation(map, overlayState, compassState);
})();
