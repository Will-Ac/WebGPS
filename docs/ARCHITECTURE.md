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

No telemetry ingestion, websocket, aircraft tracking, or export/settings architecture is included in this PR.
