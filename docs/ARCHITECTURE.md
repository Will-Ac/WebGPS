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
