# Development

## Run locally

Because this is a static client prototype, use any local static server. Example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## PR6 validation checklist

1. Load the app in desktop and iPhone/iPad browsers and confirm the map renders without layout breakage.
2. Confirm the version badge reads `[PR6]`.
3. Confirm the old always-visible Leaflet layer chooser is gone.
4. Confirm the new `Layers` button appears at top-right and opens a simple dialog with Streets, Satellite, and Terrain options.
5. Confirm the active layer is visually highlighted in the dialog.
6. Confirm tapping a layer applies immediately and dismisses the dialog.
7. Confirm the location button cycles modes in order: `Locate` -> `Centered` -> `Heading follow` -> `Centered`.
8. Confirm centered mode recenters on current location.
9. On heading-capable mobile hardware, confirm heading-follow rotates map with compass heading.
10. Rotate map with two-finger gesture and confirm motion feels smooth/stable without jumpy snaps.
11. Confirm pinch zoom and one-finger pan still work naturally while rotation support is enabled.
12. Confirm north/compass reset button appears only when map is rotated away from north-up.
13. Confirm tapping north reset returns map to north-up and hides the reset button when aligned.
14. With location available, confirm distance/bearing labels no longer overlap and are on opposite sides of the dotted line.
15. Confirm label text appears ~50% larger than PR5 and each label has a semi-transparent white pill background.
16. Confirm labels remain close to the line and maintain separated normal-offset placement during zoom/pan.
17. Confirm browser console has no runtime errors in these flows.
