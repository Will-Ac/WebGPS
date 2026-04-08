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

## Touch and map-control refinements (PR6.1)

PR6.1 keeps the existing map and overlays, then tightens control behaviour on touch devices:

- Replaces always-open layer options with a `Layers` button that opens a temporary picker panel.
- Keeps the same 3 map type options (Streets, Satellite, Terrain).
- Automatically closes the picker after selection and supports outside-tap dismissal.
- Adds two-finger map rotation around the live midpoint between active touches.
- Uses gesture disambiguation where pan/zoom is the default and rotation only engages after a `20°` twist threshold.
- Locks rotate mode for the rest of that gesture once the threshold is crossed, while avoiding a jump at lock-on.
- Adds an always-visible round compass indicator with a red north arrow in the top-right control stack.

No telemetry ingestion, websocket, aircraft tracking, or export/settings architecture is included in this PR.
