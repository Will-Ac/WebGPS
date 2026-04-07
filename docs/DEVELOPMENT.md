# Development

## Run locally

Because this is a static client prototype, use any local static server. Example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## PR3 validation checklist

1. Load the app in a desktop browser and confirm the map renders.
2. Load on iPhone/iPad Safari and confirm the map renders and remains usable in portrait mode.
3. Accept location permission and confirm the map centers on device location and shows the marker popup (`Current device position`).
4. Deny location permission and confirm default view remains usable with a clear status message.
5. Confirm panning/zooming works with mouse and touch.
6. Confirm layer chooser remains visible on the top-right and zoom controls appear directly beneath it on mobile and desktop.
7. Confirm layer switching works for Streets, Satellite, and Terrain via the visible Leaflet layer control.
8. Confirm a second marker (`Mock drone position`) is present at `51.4733071, -2.5859117` and is visually distinct from the current device marker.
9. With location available, confirm a dotted line appears between current device position and mock drone marker.
10. Confirm distance label (meters) appears above the line and updates from the current device position.
11. Confirm bearing label (degrees) appears below the line and updates from the current device position.
12. Confirm a metric map scale appears at the bottom-left.
13. Confirm Streets and Satellite both zoom in to level 19 without Satellite stopping earlier than Streets.
14. Confirm browser console has no runtime errors during these flows.
