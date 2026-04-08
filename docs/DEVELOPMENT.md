# Development

## Run locally

Because this is a static client prototype, use any local static server. Example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## PR6.1 validation checklist

1. Load the app in desktop and iPhone/iPad browsers and confirm the map renders without layout breakage.
2. Confirm the version badge reads `[PR6.1]`.
3. Confirm the map type picker is hidden by default and only appears after tapping `Layers`.
4. Confirm the new `Layers` dialog opens with Streets, Satellite, and Terrain options.
5. Confirm the active layer is visually highlighted in the dialog.
6. Confirm tapping a layer applies immediately and dismisses the dialog.
7. Confirm the location button cycles modes in order: `Locate` -> `Centered` -> `Heading follow` -> `Centered`.
8. Confirm centered mode recenters on current location.
9. On heading-capable mobile hardware, confirm heading-follow rotates map with compass heading.
10. Rotate map with two-finger gesture and confirm pivot feels anchored to the midpoint between the two active touches.
11. Confirm pinch zoom and one-finger pan still work naturally before and after rotate engage.
12. Confirm small accidental twist (<20°) does not rotate the map.
13. Confirm rotation engages only after deliberate twist exceeds ~20° and does not jump at engagement.
14. Confirm a small always-visible round compass indicator is present with a red arrow pointing north.
15. Confirm north/compass reset button appears only when map is rotated away from north-up.
16. Confirm tapping north reset returns map to north-up and hides the reset button when aligned.
17. With location available, confirm distance/bearing labels no longer overlap and are on opposite sides of the dotted line.
18. Confirm label text appears ~50% larger than PR5 and each label has a semi-transparent white pill background.
19. Confirm labels remain close to the line and maintain separated normal-offset placement during zoom/pan.
20. Confirm browser console has no runtime errors in these flows.
