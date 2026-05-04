# HANDOFF.md

## Project Goal
Build a mobile-friendly web application that displays the relative position of a drone on a map in real time. The app should:
- Show user location and drone location
- Draw a dashed line between them
- Display distance (meters) and bearing (degrees)
- Maintain responsive UI during pan/zoom/rotate
- Be optimized for mobile use (no accidental zooming, safe UI areas)

---

## Current Status
Progress has reached PR8-level iterations with multiple UI and logic refinements.

Working features:
- Map rendering with selectable layers (street/satellite/terrain)
- Drone + user location markers
- Dashed line between user and drone (with some instability issues)
- Distance and bearing calculation + display
- UI controls repositioned (zoom buttons, icons, etc.)

Partially working / unstable:
- Dashed line disappears when switching map layers
- Arrow indicator on line not always visible
- Distance/bearing label lag during map interactions

Recent UI changes:
- Buttons moved to bottom-right safe area
- North indicator always visible
- Removal of unnecessary UI elements (toast, labels)

---

## Architecture Decisions

### Frontend
- Web-based (likely HTML/CSS/JS)
- Google Maps API used for map rendering
- Custom overlays used for:
  - Dashed line
  - Arrow direction
  - Distance/bearing labels

### State Handling
- Real-time updates expected (drone telemetry source TBD)
- UI tied to map projection updates

### Rendering Strategy
- Map overlays instead of static drawing
- UI elements dynamically repositioned based on map transforms

### Mobile Optimization
- Disable browser zoom (double tap + pinch)
- Safe-area positioning for controls

---

## Files Changed (High-Level)

Likely key files:
- `index.html` → base structure
- `styles.css` → UI layout, safe areas, scaling
- `map.js` or similar → main map logic
- `overlay.js` (or equivalent) → dashed line, arrow, labels

Key areas modified:
- Overlay rendering logic
- UI positioning logic
- Event listeners for map interaction (zoom/pan/rotate)

---

## Known Bugs

1. **Dashed Line Issues**
   - Disappears when switching map layers
   - Not always redrawn correctly

2. **Arrow Visibility**
   - Sometimes off-screen
   - May not scale or position correctly with zoom

3. **Label Lag**
   - Distance/bearing pill lags behind during map movement
   - Not tightly coupled to render cycle

4. **UI Scaling Issues**
   - Text occasionally exceeds background bounds
   - Icons previously too small (partially addressed)

---

## Next Steps (Priority Ordered)

### 1. Fix Overlay Persistence
- Ensure overlays are reattached on map layer change
- Hook into map `idle` or `tilesloaded` events

### 2. Synchronize Label Rendering
- Move label positioning into same render loop as map updates
- Avoid delayed recalculations (debounce removal likely needed)

### 3. Arrow Rendering Fix
- Ensure arrow is:
  - Anchored to line midpoint
  - Rotated correctly based on bearing
  - Always within viewport

### 4. Improve Overlay Architecture
- Consider single unified overlay layer managing:
  - Line
  - Arrow
  - Labels
- Avoid fragmented rendering logic

### 5. UI Polish
- Ensure text scaling consistency
- Maintain alignment with line regardless of zoom
- Finalize icon design + sizing

---

## Commands to Run

Assuming standard static web setup:

### Local Dev Server
```bash
# Python
python3 -m http.server 8000

# OR Node
npx serve
```

Then open:
```
http://localhost:8000
```

---

## Important Context from Chat History

- User is iterating via PR-style prompts (PR2 → PR8+)
- Strong preference for:
  - Clean UI
  - Precise positioning
  - No lag in visual elements
- Frequent refinements around:
  - Map overlays
  - Visual clarity (line weight, color, arrow)
  - Mobile UX

Hardware context (future integration):
- ESP32-based telemetry system planned
- Radios include:
  - Radiomaster Pocket
  - Radiomaster Zorro
  - Jumper T20
- Potential integration with ELRS backpack / WiFi telemetry

Implication:
- App will likely consume real telemetry (not just mock data)
- Low latency and reliability are important

---

## Assumptions Moving Forward

- Drone position will be provided via:
  - WebSocket OR
  - HTTP polling OR
  - Local WiFi broadcast (ESP32)

- Map UI must remain smooth under continuous updates

---

## Suggested Refactor Direction

If instability persists:
- Replace current overlay approach with:
  - Canvas overlay OR
  - WebGL layer

This would:
- Eliminate redraw inconsistencies
- Improve performance under frequent updates

---

## Quick Resume Checklist

When reopening in Codex:
1. Run project locally
2. Reproduce:
   - Layer switch bug
   - Arrow visibility issue
   - Label lag
3. Refactor overlay update cycle
4. Validate mobile behavior
5. Prepare for telemetry input integration

---

End of handoff

