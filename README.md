# MyTidning 📰

A single-file bedside morning dashboard for a wall-mounted Android tablet.
No API keys, no backend, no build step — same recipe as Pitwall.

**Shows:** big clock · Swedish date + namnsdag/röda dagar · current weather + 5-hour strip + sunrise/sunset (Open-Meteo, night-aware icons) · seasonal cooking idea, AI-generated daily, tap to cycle · Barkarby store offers (estimated) · next F1 race, expands to full session schedule + Pitwall link on race weekends · Manchester United next fixture/result + headlines · Sverige/Stockholm + world news in two columns, tappable with article popup, breaking-story priority, 12h rotation, maximize view · pendeltåg + SL disruptions as a footer strip · feedback button.

**Signature:** the background follows the real sun — near-black at night, a warm amber glow rises around actual sunrise, cool tones during the day. Between 22:00–06:00 it drops to a dim clock-only night mode (tap the screen to wake it for 60 s).

## Deploy

1. Create a repo, e.g. `MyTidning`, drop `index.html` in the root.
2. Settings → Pages → deploy from `main` branch, root.
3. Open `https://<user>.github.io/MyTidning` on the tablet.

## Tablet setup (Redmi)

1. Install **Fully Kiosk Browser** (free tier is enough).
2. Set the start URL to your Pages URL.
3. Recommended Fully Kiosk settings:
   - Keep screen on, screen brightness schedule (dim at night)
   - Motion detection → turn screen on (wake when you sit up)
   - Auto-reload on network reconnect
4. Android Settings → Display → disable adaptive sleep if it fights the wake lock.

## Configure

Everything lives in the `CONFIG` object at the top of the `<script>`:

- `lat` / `lon` — weather location
- `slStationName` — station for departures (matched against SL's site list, cached in localStorage; clear site cache by running `localStorage.removeItem('mytidning.siteId')` in the browser console if you change it)
- `slDestinationFilter` — e.g. `'Stockholm'` to only show southbound trains
- `nightStart` / `nightEnd` — night-mode hours
- `feeds` — any RSS feeds you like

## Notes

- RSS is fetched through `api.allorigins.win` (public CORS proxy). If a feed stops loading, swap the proxy or the feed URL in `CONFIG`.
- The SL Transport API is open (no key). If a request is blocked by CORS on some network, the code automatically retries through the proxy.
- Battery care: don't leave the tablet at 100% forever — a smart plug + Fully Kiosk's battery events can automate charge-to-80%.
