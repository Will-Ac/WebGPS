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
3. Confirm the `Layers` control is visible but the map type picker panel is hidden by default.
4. Tap/click `Layers` and confirm the picker opens with Streets, Satellite, and Terrain options.
5. Select a different map type and confirm it applies immediately and the picker closes immediately.
6. Re-open the picker and tap outside of it; confirm the picker closes.
7. Confirm zoom controls remain visible and usable on the top-right.
8. On touch devices, perform normal two-finger pan/pinch gestures and confirm they continue to pan/zoom naturally with no accidental small-angle rotation.
9. Apply a deliberate two-finger twist beyond ~20° and confirm map rotation engages.
10. Continue the same gesture after rotation engages and confirm rotate behaviour stays stable for that gesture.
11. Confirm threshold crossing does not cause a sudden rotation snap.
12. Confirm the map visually rotates around the midpoint between the two active touches while rotating.
13. Confirm a small round compass indicator with a red north arrow is always visible and readable over map/satellite imagery.
14. Accept location permission and confirm the map centers on device location and shows the marker popup (`Current device position`).
15. Deny location permission and confirm default view remains usable with a clear status message.
16. Confirm browser console has no runtime errors during these flows.
