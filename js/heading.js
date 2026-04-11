(function initHeadingModule(globalScope) {
  const DEFAULT_OPTIONS = {
    startupTimeoutMs: 2500,
    debug: true
  };

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function normalizeHeading(degrees) {
    if (!isFiniteNumber(degrees)) {
      return null;
    }
    return ((degrees % 360) + 360) % 360;
  }

  function createHeadingController(options) {
    const config = Object.assign({}, DEFAULT_OPTIONS, options || {});
    const subscribers = new Set();

    let status = 'idle';
    let permissionState = 'unknown';
    let isRunning = false;
    let selectedSource = null;
    let listenerAttached = false;
    let startupTimeoutId = null;
    let lastHeadingDegrees = null;
    let lastHeadingTimestamp = null;

    const sourcePriority = {
      'ios-webkit': 3,
      'android-absolute': 2,
      'android-relative': 1
    };

    const hasDeviceOrientationSupport =
      typeof globalScope !== 'undefined' &&
      !!globalScope &&
      typeof globalScope.addEventListener === 'function' &&
      typeof globalScope.DeviceOrientationEvent !== 'undefined';

    const requiresExplicitPermission =
      hasDeviceOrientationSupport &&
      typeof globalScope.DeviceOrientationEvent.requestPermission === 'function';

    function debugLog(message, details) {
      if (!config.debug) {
        return;
      }
      if (typeof details === 'undefined') {
        console.log('[heading]', message);
      } else {
        console.log('[heading]', message, details);
      }
    }

    function setStatus(nextStatus) {
      if (status === nextStatus) {
        return;
      }
      status = nextStatus;
      debugLog('status', nextStatus);
      notifySubscribers();
    }

    function notifySubscribers() {
      const snapshot = getStatus();
      subscribers.forEach((callback) => {
        callback(snapshot);
      });
    }

    function getStatus() {
      return {
        status,
        permissionState,
        supported: hasDeviceOrientationSupport,
        requiresExplicitPermission,
        isRunning,
        selectedSource,
        headingDegrees: lastHeadingDegrees,
        headingTimestamp: lastHeadingTimestamp
      };
    }

    function clearStartupTimeout() {
      if (startupTimeoutId) {
        globalScope.clearTimeout(startupTimeoutId);
        startupTimeoutId = null;
      }
    }

    function removeListeners() {
      if (!listenerAttached) {
        return;
      }
      globalScope.removeEventListener('deviceorientationabsolute', handleOrientationEvent, true);
      globalScope.removeEventListener('deviceorientation', handleOrientationEvent, true);
      listenerAttached = false;
      debugLog('listeners detached');
    }

    function setHeadingUpdate(headingDegrees, sourceName, isDegraded) {
      const normalizedHeading = normalizeHeading(headingDegrees);
      if (normalizedHeading === null) {
        return;
      }

      const incomingPriority = sourcePriority[sourceName] || 0;
      const currentPriority = sourcePriority[selectedSource] || 0;
      const shouldUseIncomingSource =
        !selectedSource ||
        sourceName === selectedSource ||
        incomingPriority > currentPriority;

      if (!shouldUseIncomingSource) {
        debugLog('ignored heading update from lower/equal-priority alternate source', {
          source: sourceName,
          selectedSource,
          headingDegrees: normalizedHeading
        });
        return;
      }

      selectedSource = sourceName;
      lastHeadingDegrees = normalizedHeading;
      lastHeadingTimestamp = Date.now();

      clearStartupTimeout();
      setStatus(isDegraded ? 'active-degraded' : 'active');
      debugLog('heading update', {
        headingDegrees: normalizedHeading,
        source: sourceName,
        degraded: isDegraded
      });
      notifySubscribers();
    }

    function extractHeadingCandidate(event) {
      if (!event) {
        return null;
      }

      if (isFiniteNumber(event.webkitCompassHeading)) {
        return {
          headingDegrees: event.webkitCompassHeading,
          source: 'ios-webkit',
          degraded: false
        };
      }

      const hasAlpha = isFiniteNumber(event.alpha);
      if (!hasAlpha) {
        return null;
      }

      const alphaHeading = normalizeHeading(360 - event.alpha);
      if (alphaHeading === null) {
        return null;
      }

      if (event.type === 'deviceorientationabsolute' || event.absolute === true) {
        return {
          headingDegrees: alphaHeading,
          source: 'android-absolute',
          degraded: false
        };
      }

      return {
        headingDegrees: alphaHeading,
        source: 'android-relative',
        degraded: true
      };
    }

    function handleOrientationEvent(event) {
      const candidate = extractHeadingCandidate(event);
      if (!candidate) {
        return;
      }
      debugLog('raw orientation candidate', {
        eventType: event.type,
        source: candidate.source,
        rawWebkitHeading:
          typeof event.webkitCompassHeading === 'number' ? event.webkitCompassHeading : null,
        rawAlpha: typeof event.alpha === 'number' ? event.alpha : null,
        extractedHeading: candidate.headingDegrees
      });
      setHeadingUpdate(candidate.headingDegrees, candidate.source, candidate.degraded);
    }

    async function requestPermissionIfNeeded() {
      if (!hasDeviceOrientationSupport) {
        permissionState = 'unavailable';
        setStatus('unsupported');
        return getStatus();
      }

      if (!requiresExplicitPermission) {
        permissionState = 'not-required';
        debugLog('permission not required');
        notifySubscribers();
        return getStatus();
      }

      try {
        const response = await globalScope.DeviceOrientationEvent.requestPermission();
        permissionState = response === 'granted' ? 'granted' : 'denied';
        debugLog('permission result', permissionState);

        if (permissionState !== 'granted') {
          setStatus('permission-denied');
        }

        notifySubscribers();
        return getStatus();
      } catch (error) {
        permissionState = 'error';
        debugLog('permission request error', error && error.message ? error.message : error);
        setStatus('error');
        return getStatus();
      }
    }

    function start() {
      if (!hasDeviceOrientationSupport) {
        setStatus('unsupported');
        return getStatus();
      }

      if (requiresExplicitPermission && permissionState !== 'granted') {
        setStatus(permissionState === 'denied' ? 'permission-denied' : 'permission-required');
        return getStatus();
      }

      if (isRunning) {
        debugLog('start requested while already running');
        return getStatus();
      }

      isRunning = true;
      selectedSource = null;
      lastHeadingDegrees = null;
      lastHeadingTimestamp = null;

      globalScope.addEventListener('deviceorientationabsolute', handleOrientationEvent, true);
      globalScope.addEventListener('deviceorientation', handleOrientationEvent, true);
      listenerAttached = true;
      debugLog('listeners attached (deviceorientationabsolute + deviceorientation)');

      clearStartupTimeout();
      startupTimeoutId = globalScope.setTimeout(() => {
        if (isRunning && lastHeadingDegrees === null) {
          setStatus('no-heading-data');
          debugLog('startup timeout with no heading data');
        }
      }, config.startupTimeoutMs);

      setStatus('starting');
      return getStatus();
    }

    function stop() {
      clearStartupTimeout();
      removeListeners();
      isRunning = false;
      selectedSource = null;
      lastHeadingDegrees = null;
      lastHeadingTimestamp = null;
      setStatus('idle');
      debugLog('stopped');
      return getStatus();
    }

    function subscribe(callback) {
      subscribers.add(callback);
      callback(getStatus());
      return function unsubscribe() {
        subscribers.delete(callback);
      };
    }

    debugLog('module ready', {
      supported: hasDeviceOrientationSupport,
      requiresExplicitPermission
    });

    return {
      requestPermissionIfNeeded,
      start,
      stop,
      subscribe,
      getStatus
    };
  }

  globalScope.createHeadingController = createHeadingController;
})(window);
