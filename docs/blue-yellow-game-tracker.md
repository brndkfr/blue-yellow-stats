# Project: Blue-Yellow Floorball Tracker

## 1. Context & Objective

Create a mobile web application (Single-Page App) to serve as a statistics scouting tool for a junior floorball team. The tool will be hosted on GitHub Pages and write data to a Google Spreadsheet. The goal is to capture "Moneyball" metrics that measure player impact beyond simple goals and assists. See [moneyball_metrics.md](moneyball_metrics.md) for the full metrics definition.

## 2. Technical Architecture

- **Frontend:** HTML5, CSS3 (Flexbox/Grid), Alpine.js for reactive state, Tailwind CSS for styling.
- **Configuration:** Dynamically load the roster and game info from a `kader.json` file.
- **Database:** Send events via POST to a Google Apps Script Web App URL.
- **Design:** Mobile-first, optimized for thumb-operation on the sidelines. Color scheme: dark background with Blue (#005bbe) and Yellow (#ffcd00).

## 3. Core Technology Stack

- **Frontend Framework:** Alpine.js — lightweight, reactive state management for real-time button toggles and player selections without a build process.
- **Styling Engine:** Tailwind CSS — mobile-first, responsive UI and rapid layout of the player grid and thumb-friendly action buttons.
- **Visualization Engine:** Plotly.js — integrated for both the in-app dashboard and Python-based analysis scripts for visual consistency.
- **Database/Storage:** Google Sheets via Google Apps Script — no-cost serverless backend for event logging and persistent storage.
- **Data Analysis:** Python (Pandas) — offline Moneyball processing, weighted impact scores, and performance efficiency.

## 4. Design & UX Principles (The "Blue-Yellow" Aesthetic)

- **Theme:** Dark mode primary background for high contrast on court-side mobile screens.
- **Color Palette:** Professional Floorball Blue (#005bbe) and Swedish Yellow (#ffcd00) for primary interactions and highlights.
- **Ergonomics:**
  - *Thumb-Zone Optimization:* All critical action buttons must be fixed to the bottom third of the screen.
  - *Tap Targets:* Minimum button height of 60px to ensure accuracy during fast-paced gameplay.
  - *Visual Feedback:* Immediate haptic/visual confirmation (color flashes) upon data submission to confirm the entry was recorded.

## 5. Application Structure

- **Dynamic Configuration:** The app must be data-driven, building the entire UI (player names, numbers, and game format) dynamically from an external JSON configuration.
- **Game Modes:** Support for both 2-half and 3-period formats, plus an optional Overtime (OT) toggle.
- **Player Hierarchy:** A distinct visual layout separating Goalies, Active Field Players, and Reserves to minimize misclicks.

## 6. Data Structures

### A. Configuration (`kader.json`)

The app must handle the following structure:

- `game_info`: `game_id` (unique string), `opponent`, `format` (integer: 2 for halves, 3 for periods), `minutes_per_period`.
- `goalies`: Array of objects `{nr, name}` (usually 2).
- `players`: Array of 15 objects `{nr, name}`.
- `reserves`: Array of objects `{nr, name}` (usually 2).

### B. Event Data (JSON Payload for Google Sheets)

Every click must send the following object:

```json
{ "game_id", "opponent", "period", "timestamp", "player_nr", "player_name", "action" }
```

## 7. UI/UX Requirements

- **Header:** Display opponent name and `game_id`. Include a toggle for periods (dynamically show "1st–2nd" or "1st–3rd" based on the `format` value in JSON).
- **Player Grid:**
  - Top: 2 Goalies (highlighted/distinct style).
  - Middle: 15 Players in a compact grid (large number, small name).
  - Bottom: Reserve players (smaller or separate section).
- **Action Buttons (fixed at bottom):** 6 large, color-coded buttons:
  - 🔄 Recovery (Green) — Hustle/loose ball wins.
  - 🛡️ Stop (Blue) — Interceptions, blocks, or box-play defense.
  - 🔑 Key Pass (Yellow) — The pre-assist or high-value transition pass.
  - 🎯 Slot Shot (Orange) — High-danger shot from the slot area.
  - 🧤 Slot Save (Light Blue) — High-danger save by the goalie.
  - ⚠️ Turnover (Red) — Lost possession.
- **Feedback Loop:** Clicking a player highlights them as "Active." Clicking an action button sends data immediately and triggers a visual flash/confirmation message (e.g., "Saved: Stop for #12 Nils").

## 8. Logic Functions

- **Init:** Fetch `kader.json`, generate buttons dynamically, and set global game variables.
- **Selection:** Manage the `activePlayer` state. Ensure only one player is selected at a time.
- **Submission:** A `sendData(action)` function that bundles all fields (including `game_id` and the current period) and sends them via `fetch` (POST, `mode: 'no-cors'`) to the Google Script URL.
- **Undo:** A simple "Undo" button that marks the last entry as a "Correction" in the spreadsheet.

## 9. Desired Output

Generate:

1. A single-file `index.html` containing the HTML, CSS, and JS.
2. An example `kader.json` file.
3. A `code.gs` script for Google Apps Script to receive the POST data and append it as a new row (columns: `game_id`, `opponent`, `period`, `timestamp`, `nr`, `name`, `action`).
