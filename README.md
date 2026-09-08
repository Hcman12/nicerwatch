# Nicer Watch

An interactive 3D smartwatch simulation. Rotate it from any angle, zoom in on the dial or
out to the full strap, and read the correct time for wherever you are.

## Run

```bash
node server.js          # or: npm start
```

| URL | What it is |
| --- | --- |
| http://localhost:3000/ | The 3D watch |
| http://localhost:3000/healthz | Health check (styled page in a browser, JSON to curl) |
| http://localhost:3000/healthz?format=json | Health check, always JSON |
| http://localhost:3000/api/time | Server clock, for comparison against the browser clock |

Change the port with `PORT=8080 node server.js`.

## Controls

| Input | Action |
| --- | --- |
| Drag / one-finger drag | Rotate around the watch |
| Scroll / pinch | Zoom in and out |
| Right-drag or Shift+drag | Pan |
| Double-click, or `R` | Reset the view |
| Arrow keys | Nudge the angle |
| `+` / `-` | Zoom |
| Buttons, bottom left | Auto-rotate, dark/light dial, zoom, reset |

## Linking to a specific view

The camera reads its opening position from the query string, so any angle is shareable:

| Parameter | Values |
| --- | --- |
| `view` | `front`, `angle` (default), `side`, `back`, `macro` |
| `r`, `theta`, `phi` | exact camera distance and spherical angles, overriding `view` |
| `face` | `light` for the light dial |
| `rotate` | `0` to open with auto-rotate off |

Example: <http://localhost:3000/?view=back&rotate=0> shows the engraved caseback and the
heart-rate sensor.

## Time

The dial and the heads-up readout both come from the browser clock, so the watch shows
**your** local time in **your** timezone (resolved with `Intl.DateTimeFormat`, shown under
the digital window on the dial and in the corner readout). No timezone configuration and no
network time lookup is involved — unplug the network and the watch still runs correctly.

## Health endpoint

`/healthz` reports `healthy`, `degraded`, or `unhealthy` and returns **503** when unhealthy,
so it works as a container/uptime probe as-is:

```json
{
  "status": "healthy",
  "service": "nicer-watch",
  "version": "1.0.0",
  "uptimeSeconds": 42.1,
  "serverTimezone": "Africa/Lagos",
  "checks": [
    { "name": "asset:index.html", "status": "pass", "detail": "1873 bytes" },
    { "name": "memory", "status": "pass", "detail": "5.2 MB heap used (limit 512 MB)" }
  ]
}
```

Checks cover the three assets the watch cannot render without (`index.html`, `watch.js`,
`styles.css`), heap usage, and event-loop responsiveness. Delete or empty one of those
assets and `/healthz` flips to `unhealthy` with a 503 — that's the easiest way to see a
failing probe. The page itself polls `/healthz` every 15 seconds and shows the result on
the status chip in the bottom-left corner; click it to open the endpoint.

## Layout

```
server.js          zero-dependency Node server: static files, /healthz, /api/time
public/index.html  page shell and HUD
public/styles.css  interface chrome
public/watch.js    Three.js scene, watch model, orbit controls, dial texture
```

The only external dependency is the Three.js runtime, loaded from cdnjs. If that is blocked,
the page shows a fallback notice and `/healthz` keeps working.
