# Development

## Run locally

Because this is a static client prototype, use any local static server. Example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## PR7.1 validation checklist

1. Load the app in a desktop browser and confirm the map renders.
2. Load on iPhone/iPad Safari and confirm the map renders and remains usable in portrait mode.
3. Accept location permission and confirm the map centers on device location and shows the marker popup (`Current device position`).
4. Deny location permission and confirm default view remains usable with a clear status message.
5. Confirm panning/zooming works with mouse and touch.
6. Confirm the top-right layers button opens a temporary chooser and that selecting Streets/Satellite/Terrain applies the chosen layer and dismisses the chooser.
7. Confirm the layers chooser is hidden on initial load and only appears after tapping the Layers button.
8. Confirm tapping outside the open layer chooser dismisses it.
9. Confirm a second marker (`Mock drone position`) is present at `51.4733071, -2.5859117` and is visually distinct from the current device marker.
10. With location available, confirm a dotted line appears between current device position and mock drone marker.
11. Confirm distance and bearing labels stay on opposite sides of the dotted line and do not overlap while panning/zooming.
12. Confirm the round location button recenters on first tap and attempts compass-follow on second tap.
13. On iOS Safari, confirm heading permission is requested only from the location-button tap flow and that `webkitCompassHeading` updates rotate the map when granted.
14. On Android Chrome (or similar), confirm heading uses absolute orientation when available and falls back to relative alpha only when needed.
15. Confirm degraded heading fallback reports clearly (status/debug text indicates degraded mode) rather than silently acting as fully trusted heading.
16. Confirm if heading is denied/unsupported/no data, compass-follow does not stay visually active and a clear status message is shown.
17. Confirm repeatedly toggling compass-follow on/off does not create duplicate heading listeners or unstable rotation.
18. Confirm compass-follow rotation pivots around the on-screen current-location marker (not around map center/top-left tile origin).
19. Confirm entering compass-follow places current location lower-center (about one-third up from bottom) and keeps that placement while heading/location updates continue.
20. Confirm grey empty areas during rotation are materially reduced due to larger surrounding tile retention.
21. Confirm nearby panning benefits from tile buffering without obvious performance regressions.
22. Confirm the small north indicator remains visible and logically indicates north as heading changes.
23. Confirm a metric map scale appears at the bottom-left.
24. Confirm Streets and Satellite both zoom in to level 19 without Satellite stopping earlier than Streets.
25. Confirm browser console has no runtime errors during these flows.

## PR8 validation checklist

1. Load the app and confirm MapLibre renders in the existing `#map` container.
2. Confirm there is no active DOM pane rotation path (`transform: rotate(...)` on Leaflet map panes is no longer used).
3. Accept location permission and confirm current location marker appears and map focuses the device.
4. Confirm mock aircraft marker appears at `51.4733071, -2.5859117`.
5. Confirm dotted line between device and aircraft renders and updates while moving/panning/zooming/rotating.
6. Confirm distance and bearing labels stay on opposite sides of the line with semi-transparent white pill backgrounds.
7. Confirm layers button opens temporary chooser with Streets/Satellite/Terrain and chooser dismisses after selection.
8. Confirm first location-button tap recenters device without entering compass-follow.
9. Confirm second location-button tap attempts compass-follow using PR7 heading module and rotates map via native bearing updates.
10. If heading permission is denied/unavailable/no data, confirm compass-follow exits gracefully and does not stay visually active.
11. In compass-follow mode, confirm device stays lower-center (about one-third up from bottom) while heading/location updates continue.
12. Confirm touch pan/zoom/rotate interaction remains smooth on iPhone/iPad Safari.
13. Confirm scale remains visible at bottom-left.
14. Confirm browser console has no runtime errors during these flows.

## PR8.2 validation checklist

1. Enter compass-follow and rotate device about 90°; verify map rotates about 90° (not ~180°).
2. Rotate device through a full 360°; verify map completes one 360° rotation cycle (not ~720°).
3. Repeat compass-follow enter/exit several times; verify rotation stays 1:1 and does not worsen.
4. Confirm only one active heading subscription is reported in compass debug logs.
5. Confirm debug logs show one heading-to-bearing conversion path (`apply heading -> bearing`) with absolute bearing values.
6. Confirm first-tap recenter, second-tap compass-follow behaviour remains intact.
7. Confirm lower-third compass placement remains intact during heading and location updates.
8. Confirm layers picker, markers, dotted line, and distance/bearing labels continue working.
9. Confirm no console runtime errors.

## PR8.3 validation checklist

1. In compass-follow, rotate heading across north (for example 350° -> 10°) and confirm no extra near-360° jump occurs.
2. Rotate device about 90° and confirm map rotates about 90°.
3. Rotate device through a full 360° and confirm map completes one 360° cycle.
4. Toggle compass-follow on/off repeatedly and confirm no duplicated heading behaviour appears.
5. Confirm heading logs show browser event source -> extracted heading -> normalized heading -> final target/final applied bearing.
6. Confirm no secondary heading source takes over once a higher-priority source is selected unless required.
7. Confirm lower-third placement, layers picker, markers, overlays, and north indicator still behave as before.

## PR8.5 validation checklist

1. Enter compass-follow and rotate device clockwise about 90°; confirm map rotates clockwise about 90°.
2. Rotate device one full clockwise 360°; confirm map performs one full cycle (no apparent 2x motion).
3. Confirm debug logs show heading input and target/final MapLibre bearing with matching sign convention.
4. Confirm compass mode enter/exit logs and active heading subscription count remain stable across repeated toggles.
5. Confirm north indicator still points north while map rotates.
6. Confirm recenter flow, lower-third positioning, layers picker, markers, and overlays still work as before.

