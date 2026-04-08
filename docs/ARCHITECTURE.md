# Architecture

## Current web app structure

The app currently uses a simple static client architecture:

- `index.html` provides a minimal app shell with a full-screen map, version badge, Google Maps-style control cluster, and a lightweight layer-selection dialog.
- `app.js` initializes the Leaflet map, location/heading interaction state, map rotation handling, and the distance/bearing overlay updates.
- `styles.css` defines a mobile-first full-screen map layout plus the custom control and label styling.

## Map foundation and overlays (PR1-PR6)

The current prototype includes:

- Full-screen interactive map with mobile-friendly controls.
- Browser geolocation handling with sensible fallback view when unavailable.
- Current device marker and mock drone marker (`51.4733071, -2.5859117`).
- Base map layer switching for Streets, Satellite, and Terrain.
- Dotted line overlay between device and mock drone positions.
- Distance and bearing labels anchored near the line midpoint with opposite-side normal offsets so they remain separated while panning/zooming.
- Metric scale at the bottom-left.

## PR6 control/interaction updates

PR6 replaces default Leaflet top-right controls with a Google Maps iOS-inspired control pattern:

- A single `Layers` floating button opens a compact layer dialog containing the same three map layer choices.
- A location button cycles practical modes:
  - inactive
  - centered on current location
  - heading-follow (compass-follow style)
- A north/compass reset button appears only when the map is rotated away from north-up and quickly resets north-up orientation.
- Two-finger touch rotation is handled explicitly to allow smoother, more predictable map rotation while preserving one-finger pan and pinch zoom.

No telemetry ingestion, websocket transport, export/history, or settings subsystems were added.
