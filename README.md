# 🌍 GROW — Global Recovery and Observation of Wildfires

Global Recovery and Observation of Wildfires (GROW) is an AI-assisted wildfire intelligence console created by Team I.O – Florianópolis for the 2024 NASA Space Apps Challenge. The experience blends live satellite detections, historical context, and an OpenAI-powered voice co-pilot so emergency teams can explore evolving fire activity in seconds. 🛰️🔥

> 🏆 Top-10 worldwide finalist (Top 1%) in the 2024 NASA Space Apps Challenge.
> 🎞️ Presentation slide deck: [Open in Google Slides](https://docs.google.com/presentation/d/e/2PACX-1vTezgMfwMSMOTV1xAERxRqVY9TMX-bF-45w2v5gP4jbs8Wy1t_H3u5kTwkxNfQFcA/embed?start=false&loop=false&delayms=60000)
> 📰 NASA announcement: [Read the global winners recap](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-international-space-apps-challenge-announces-2024-global-winners/)

## ✨ Key Capabilities

- 🌐 Satellite basemap with live and historical wildfire detections delivered through Mapbox GL clusters.
- 🗺️ NASA FIRMS ingestion (MODIS Near Real-Time) with resilient caching so the dashboard stays responsive offline.
- 🗣️ Bi-directional voice co-pilot (OpenAI Realtime) that can search places, summarize risk, and trigger data drilling tools.
- 🌦️ Contextual weather overlays via Open-Meteo (temperature, wind, precipitation gaps) to enrich situational awareness.
- 📊 Inline analytics showing counts, brightness, FRP, and pixel metrics for any ad-hoc bounding box.
- 🧭 Slide deck lightbox and NASA Space Apps recognition baked into the experience for storytelling moments.

## 🧱 Architecture at a Glance

- 🖥️ **Front-end:** React 18 + TypeScript with modular SCSS, custom components, and lightweight utility hooks.
- 🗺️ **Mapping:** Mapbox GL JS handles clustering, markers, and smooth camera transitions.
- 🛰️ **Data pipeline:** `sql.js` persists NASA FIRMS observations in the browser (localStorage) for fast re-queries.
- 🧠 **AI assistant:** Custom `RealtimeClient` streams audio to OpenAI Realtime models, exposing bespoke tools (geocoding, weather, database queries).
- 🔁 **Relay server:** Optional Node.js WebSocket proxy (`relay-server/`) to shield API keys and multiplex realtime sessions.

## ⚙️ Prerequisites

- Node.js ≥ 18 and Yarn (recommended) or npm.
- Mapbox access token with Maps SDK enabled.
- NASA FIRMS “map key” for the Area API (request at [firms.modaps.eosdis.nasa.gov](https://firms.modaps.eosdis.nasa.gov/api/)).
- OpenAI API key with realtime model access (`gpt-realtime-*`).

## 🔐 Configure Environment

Create a `.env` file in the project root and populate:

```bash
REACT_APP_MAPBOX_KEY="pk.your_mapbox_token_here"
REACT_APP_NASA_MAP_KEY="your_firms_map_key"
REACT_APP_OPENAI_API_KEY="sk-your_openai_key"
```

## 🚀 Run It Locally

1. 📦 Install dependencies: `yarn install`
2. ▶️ Start the React dev server: `yarn start` (launches `http://localhost:3000`)
3. 🔄 (Optional) Start the realtime relay: `yarn relay`
   - The relay reads `REACT_APP_OPENAI_API_KEY` from `.env`
   - When running, keep `REACT_APP_OPENAI_REALTIME_URL=ws://localhost:8081`
4. 🗞️ Switch the “LIVE” toggle to trigger fresh NASA downloads (first fetch may take a few seconds while CSV data parses).

## 🧪 Testing & Quality

- Run interactive tests: `yarn test`
- Build production bundle: `yarn build`
- Package the app (excluding bulky folders): `yarn zip`

## 🗺️ Data & Integrations

- 🔥 **NASA FIRMS (MODIS NRT):** Primary wildfire detection feed; CSV area queries filtered to the Americas bounding box.
- 🌎 **Mapbox Satellite:** Base imagery and clustering logic for hotspots.
- 🌤️ **Open-Meteo:** Current weather snapshots to enrich assistant responses with temperature, wind, and days-since-rain.
- 🧠 **OpenAI Realtime:** Conversational agent with tool-calling for geocoding, map camera control, and statistics retrieval.

## 🗂️ Repository Tour

- `src/pages/Dashboard.tsx` — top-level layout, dataset toggles, overlays, and slide deck lightbox.
- `src/components/mbox/` — Mapbox integration, clustering layers, and observation highlights.
- `src/components/realtime-voice/` — Voice modal, audio pipeline, and custom tool handlers.
- `src/utils/` — NASA API client, sqlite helpers, geocoding utilities, and waveform rendering helpers.
- `relay-server/` — Lightweight WebSocket proxy built with `ws` + `openai` SDK.
- `public/` — Static assets, fallback GeoJSON, and `sql-wasm.wasm` required by `sql.js`.

## 🆘 Troubleshooting Tips

- 😶 Voice button greyed out? Ensure microphone permissions are granted and the realtime model name in code matches one enabled for your key.
- 🔑 Seeing `Missing REACT_APP_OPENAI_API_KEY`? Double-check `.env` is loaded (`yarn start` reads it at boot) and restart after changes.
- 🔄 No live data? Confirm your NASA FIRMS key is active; the API limits requests per key and region.
- 🧹 Stale map data? Clear localStorage (key `wildfire_sqlite_db_v2`) or toggle to “HISTORICAL” and back to “LIVE” to force a refresh.

## 📄 License & Credits

- 📜 Licensed under the MIT License — see `LICENSE`.
- 🙏 Huge thanks to NASA, Mapbox, OpenAI, Open-Meteo, and the global Space Apps community for data, tooling, and inspiration.

Happy exploring, and stay safe out there! 🚒🌲
