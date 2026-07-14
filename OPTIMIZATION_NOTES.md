# AGIL Mesh Web UI Optimized Project

This project is a separate optimized copy of the existing AGIL Mesh Web UI.
The original project remains untouched at:

`/Users/wj/Documents/Codex/2026-06-22/und`

## Initial Optimizations Applied

- Added a shared API layer at `src/api/deviceApi.js`.
- Centralized JSON GET, JSON POST, form POST, text request, URL building, timeout, and error helpers.
- Updated major pages to use the shared API helper:
  - Login
  - Top status bar
  - Monitor topology
  - Configuration
  - Device information
  - Alarm and event log
  - Spectrum
  - Maptalks
  - IPERF tool text requests
- Renamed the package to `agil-mesh-web-ui-optimized`.

## Phase 2 Split Completed

- Split Configuration search support out of `src/components/ConfigurationPage.jsx`.
  - New module: `src/components/configuration/configurationSearch.js`
  - Contains search text normalization, setting slug generation, index construction, and scoring.
  - Keeps ConfigurationPage focused on state orchestration and rendering.
- Split Maptalks utility logic out of `src/components/OpenMapTool.jsx`.
  - New module: `src/components/map/mapUtils.js`
  - Contains GPS formatting, coordinate validation, map layer definitions, offline map keys, range calculations, marker styling, SNR color/label helpers, and configured node-name loading.
  - Keeps OpenMapTool focused on Maptalks lifecycle, state, and JSX.
- Verified with `npm run build`.

## Spectrum Real-Time Mode Added

- Added a `Real-Time Spectrum` display mode beside the existing line graph.
- Added live controls:
  - Start / Pause
  - Refresh interval selection: 1s, 2s, 5s
  - Peak Hold toggle
  - Clear live session
- Live samples are retained in a bounded in-memory history so peak-hold does not grow unbounded during long sessions.
- Peak-hold overlays show the strongest average noise and burst RSSI seen during the live session.
- Added a current-frequency marker using `/config?content=freqDefault` and `/config?content=freqList`, so the selected RF channel is visible on the spectrum graph.
- Added a compact best-channel ranking table with frequency, average noise, burst RSSI, burst percentage, verdict, and current-channel highlighting.
- Verified with `npm run build`.

## Remaining Large Files After Phase 2

- `src/components/ConfigurationPage.jsx` still contains data loading, draft management, review/apply behavior, search UX, and page shell logic.
- `src/components/OpenMapTool.jsx` is now smaller, but the production Maptalks chunk is still large because it includes the Maptalks library itself.
- `src/styles.css` remains the largest maintainability target and should be split by feature/theme next.

## Recommended Next Optimization Phases

1. Continue splitting `ConfigurationPage.jsx` into hooks and focused components:
   - `useConfigurationData`
   - `useConfigDraft`
   - `useConfigApply`
   - `ReviewChangesModal`
   - `ConfigSearch`
   - `FrequencyManager`

2. Split `OpenMapTool.jsx` into focused map components:
   - `MapToolbar`
   - `MapManagementMenu`
   - `MapNodeSidebar`
   - `MapNodeInformation`
   - `RangeAssistant`
   - `useMaptalksMap`

3. Split `styles.css` into page-specific styles:
   - `layout.css`
   - `configuration.css`
   - `monitor.css`
   - `tools.css`
   - `map.css`
   - `theme.css`
   - `responsive.css`

4. Split i18n dictionaries into locale files:
   - `src/i18n/locales/en.js`
   - `src/i18n/locales/zh.js`
   - `src/i18n/locales/ar.js`
   - `src/i18n/locales/es.js`
   - `src/i18n/locales/id.js`

5. Add small tests for pure functions:
   - Frequency parsing
   - Bandwidth mapping
   - Config import/export
   - Alarm event grouping
   - IPERF metrics parsing
   - Link margin calculation
