# Architecture

## Current web app structure

The app currently uses a simple static client architecture:

- `index.html` provides a minimal app shell with a map container, version badge, and status message area.
- `app.js` initializes a Leaflet map and contains a small initialization abstraction for map setup and first-load geolocation handling.
- `styles.css` defines a mobile-friendly full-screen map layout.

## Map foundation (PR1 + PR2)

This PR introduces only the base map foundation needed for future telemetry work:

- A full-screen map view suitable for mobile and desktop.
- Browser geolocation request on first load.
- A marker for the current device position when geolocation succeeds.
- A non-blocking fallback status message and default map view when geolocation is unavailable.
- User-selectable base map layers (street, satellite, terrain).
- A second marker representing a mock drone position at `51.4733071, -2.5859117` (displayed as a red circle marker) so it is visually distinct from the current device marker.
- Updated map/layer zoom configuration so Streets and Satellite both support deeper zoom (up to level 19 in this prototype).

## Map overlay and control refinements (PR3)

PR3 keeps the PR2 map foundation intact and adds only lightweight visual/control refinements:

- Version badge moved to top-center for consistent visibility.
- Layer chooser remains on the top-right, with zoom controls positioned directly beneath it.
- A dotted polyline overlay is drawn between current device position and the mock drone marker when device location is available.
- Two midpoint labels are rendered on that line:
  - distance in meters
  - bearing in degrees (normalized to 0-359)
- A Leaflet metric scale control is added at the bottom-left.

## Google Maps iOS style control pass (PR6)

PR6 keeps the existing map, layer sources, markers, and overlay calculations, but adjusts the right-side control system to match Google Maps iOS conventions more closely:

- The always-visible Leaflet layer selector is replaced with a single round layers button.
- Tapping the layers button opens a temporary chooser with only the existing three base layers (Streets, Satellite, Terrain), and the chooser dismisses after selection.
- A round location button is added below the layers button with a two-step tap flow:
  - first tap recenters on the device location
  - second tap enables compass-follow mode
- In compass-follow mode, device heading events rotate the map so the view aligns with heading; tapping location again exits compass-follow and returns to north-up.
- A small round north indicator is rendered under the location control and rotates to continue indicating north while heading changes.
- Distance and bearing labels use a larger, opposite-side line offset so both remain tied to the dotted line without overlapping.

## PR6.1 control fidelity and compass rotation fixes

PR6.1 keeps PR6 structure but corrects three issues:

- Right-side control icons were refined to better match the uploaded iOS reference photos for Layers, Location, and compass/north indicator.
- The layers picker is now guaranteed hidden by default and rendered only after tapping the Layers button.
- Compass-follow map rotation now re-applies heading rotation across map movement/zoom updates so heading-follow remains active instead of being lost when Leaflet updates pane transforms.

No websocket/telemetry ingestion, route history, auto-follow, animation, or heading-arrow systems were introduced or modified in PR3.

No telemetry ingestion, websocket, aircraft tracking, or export/settings architecture is included in this PR.

## PR7 cross-platform heading module for compass-follow

PR7 keeps the existing map, overlay, layer chooser, and location control UX, and adds a dedicated heading subsystem:

- New `js/heading.js` module owns all browser heading sensor handling.
- The heading module exposes a clean interface (`requestPermissionIfNeeded`, `start`, `stop`, `subscribe`, `getStatus`) so UI code does not use raw `deviceorientation` APIs directly.
- Heading sources are normalized to one app-facing value (`0 <= heading < 360`, clockwise from north) with explicit source priority:
  1. iOS Safari `webkitCompassHeading` on `deviceorientation`
  2. Android absolute heading from `deviceorientationabsolute`/absolute `alpha`
  3. Android relative `alpha` fallback (marked degraded)
- Runtime states are explicit (for example `active`, `active-degraded`, `permission-required`, `permission-denied`, `unsupported`, `no-heading-data`) so compass-follow is never shown as fully active when heading is unavailable.
- `app.js` now consumes heading status updates from the module and only rotates the map while compass-follow is enabled and heading is actually available.
- The location button flow stays the same (first tap recenter, second tap attempt compass-follow), but compass mode now starts/stops heading listeners cleanly and exits when heading becomes unavailable.

## PR7.1 compass pivot, lower-third focus, and tile prefetch

PR7.1 keeps the PR7 heading module intact and updates map behaviour for navigation-style compass-follow:

- Previous implementation rotated Leaflet `mapPane` around `50% 50%`; PR7.1 now sets rotation pivot from the live device location container pixel so rotation anchors around the user position.
- Previous compass mode centered the user in the middle of the screen; PR7.1 now anchors compass-follow to a lower-third focus point (horizontally centered, about one-third up from bottom) so more map area is visible ahead.
- Current location handling now maintains a single persistent marker and updates it from geolocation watch updates rather than adding duplicate markers.
- Tile layers now use increased surrounding tile retention (`keepBuffer`) consistently across Streets/Satellite/Terrain to reduce grey gaps during rotation and improve nearby panning responsiveness.

## PR8 map engine migration to MapLibre GL JS

PR8 replaces Leaflet in the main runtime path with MapLibre GL JS so compass-follow uses native map bearing instead of rotating Leaflet DOM panes:

- Previous Leaflet compass-follow rotated `mapPane` with CSS transforms; PR8 removes that active path and applies heading with MapLibre camera bearing.
- The PR7 heading module remains the source of normalized heading data and now drives `map.setBearing`/camera bearing updates.
- The two-step location button flow is preserved (first tap recenter, second tap compass-follow), including graceful failure when heading is unavailable.
- Lower-third navigation framing is preserved in compass-follow by using native camera offset rather than CSS transform-origin hacks.
- Layer switching keeps the existing three user-facing choices (Streets, Satellite, Terrain) and now swaps MapLibre styles via the existing custom layers picker UI.
- Device marker, mock aircraft marker, dotted connection line, and distance/bearing labels remain, with line rendering moved to a MapLibre GeoJSON line layer and labels kept as synchronized HTML overlays.
- Scale display remains available at bottom-left using MapLibre’s scale control.

## PR8.2 compass-follow double-rotation fix

PR8.2 keeps the PR8 MapLibre migration intact and fixes compass-follow over-rotation by enforcing a single heading-to-bearing pipeline:

- Root cause: heading-to-bearing camera updates were triggered from multiple camera update paths, so heading influence could be re-applied while recenter/position updates were also driving compass camera changes.
- Fix: heading conversion and bearing application now happen in exactly one dedicated path (`applyCompassBearingFromHeading`).
- Map bearing is now set as an absolute value derived once from normalized heading (`bearing = -heading` in map convention), not as repeated implicit reapplication.
- Camera recenter updates while in compass mode now preserve the current map bearing instead of recomputing/reapplying heading transforms.
- Added concise compass debug logs for heading input, final map bearing output, subscription count, and compass mode transitions.

## PR8.3 compass-follow 1:1 rotation fix

PR8.3 keeps PR8/PR8.2 structure but fixes the remaining over-rotation when heading wraps through north:

- Exact heading path is now documented as: browser orientation event -> `extractHeadingCandidate` in `js/heading.js` -> normalized heading subscriber payload -> `applyCompassBearingFromHeading` in `app.js` -> MapLibre camera bearing update.
- Root cause: heading values were normalized in `[0, 360)` and then converted to bearing directly, which caused a discontinuity near north crossing (for example `359 -> 0`) so camera bearing could take an extra near-full-turn jump.
- Fix: `app.js` now resolves each new target bearing to the nearest equivalent around the current bearing before applying it, preventing wraparound over-rotation while keeping absolute heading-follow.
- `js/heading.js` now ignores lower/equal-priority alternate sources once a source is selected, preventing parallel event streams from fighting each other.
- Additional concise debug logs now show raw event type/source values, extracted heading, normalized heading updates, final target bearing, and final bearing sent to MapLibre.

## PR8.5 MapLibre bearing sign convention fix

PR8.5 keeps PR8.x structure and fixes the compass-follow sign/convention bug:

- The heading module already emits compass-style heading (`0..360`, clockwise from north).
- Previous PR8.x code inverted heading sign before applying to MapLibre bearing.
- Root cause: that sign inversion made map rotation direction oppose heading convention and caused apparent doubled relative rotation with phone movement.
- Fix: heading now maps directly to MapLibre bearing (`bearing = heading`, normalized), applied once through the existing absolute heading pipeline.
- North indicator remains rotated opposite to map bearing so it still points to north on screen.

## PR8.6 smooth camera UX and manual-pan compass exit

PR8.6 keeps PR8.x map/heading structure and focuses on camera feel and mode behaviour:

- Replaced remaining user-visible `jumpTo` usage in compass/recenter flows with `easeTo` camera transitions.
- Entering compass-follow now animates into lower-third positioning instead of snapping.
- Heading updates in compass-follow now use short-duration eased bearing updates for smooth continuous rotation.
- Added programmatic-vs-user move guarding; manual drag/zoom/touch/move start now exits compass-follow immediately.
- On manual exit from compass-follow, current map rotation is preserved (no snap back to north-up).
- Added inertia tuning in map init (`dragPan` inertia options) to improve mobile deceleration feel.

## PR8.7 zoom readout and damped compass rotation

PR8.7 keeps PR8.x architecture and adds two UX-focused improvements:

- Bottom scale now includes a live zoom readout (`Z: n.n`) appended directly to the existing scale control.
- Compass-follow rotation now uses damped heading smoothing:
  - raw heading becomes `targetHeading`
  - `smoothedHeading` moves toward target each animation frame using exponential smoothing
  - shortest-angle interpolation handles 0/360 wrap correctly
  - tiny heading deltas are ignored to reduce sensor jitter
- Bearing is applied with lightweight `map.setBearing(...)` in a single animation loop while compass-follow is active.
- Loop lifecycle is explicit: starts when compass-follow starts, stops on exit, and avoids duplicate loops.

