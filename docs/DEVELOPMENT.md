# Development

## Run locally

Because this is a static client prototype, use any local static server. Example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## PR6.1 validation checklist

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
12. Confirm the round location button recenters on first tap and enters compass-follow mode on second tap.
13. Confirm in compass-follow mode the map rotates with device heading and continues rotating after map pan/zoom events.
14. Confirm the small north indicator remains visible and logically indicates north as heading changes.
15. Confirm a metric map scale appears at the bottom-left.
16. Confirm Streets and Satellite both zoom in to level 19 without Satellite stopping earlier than Streets.
17. Confirm browser console has no runtime errors during these flows.
