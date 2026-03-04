# War Robots: Frontiers — Game Data Catalog

A web-based catalog for browsing, filtering, sorting, and comparing game data from [War Robots: Frontiers](https://warrobotsfrontiers.com). Players can explore seven equipment sections — Pilots, Torsos, Chassis, Shoulders, Weapons, Gear, and Titans — with level-scaled stats, multi-criteria filtering, and column visibility controls.

[See it live here](https://wrf.shinymetal.com/)

Built with vanilla HTML, CSS, and JavaScript. No frameworks, no build step, zero runtime dependencies.

## Features

- **7 data sections** with section-specific column layouts and row rendering
- **Filtering** — AND across filter categories, OR within each (multi-select)
- **Sorting** — click any column header; click again to reverse direction
- **Column visibility** — hide/show individual columns per section
- **Level slider** — scale stat values across equipment levels
- **Description panel** — hover or click items for detailed descriptions; desktop inline panel, mobile bottom-sheet drawer
- **State persistence** — sort order, hidden columns, filter selections, and level saved per section in localStorage
- **Responsive layout** — desktop, mobile portrait, and mobile landscape with adaptive filter sidebar

## Project Structure

```
client/                  Frontend (served as static files)
  index.html             Single-page app shell
  app.js                 All UI logic (~2600 lines)
  styles.css             CSS Grid layout with custom properties
  catalog-tests.js       Automated test suite (127 tests)
  Ultimate_WRF_Data_Sheet.json   Game data (generated)
  assets/                Logos and images

database/                Data pipeline (Google Apps Script)
  data_collection/
    config.js            Column definitions and section configs
    scan.js              Sheet parsing and row extraction
    normalize.js         Data transformations
    export.js            Orchestration and catalog assembly
    colour_processing.js Rarity/Dominion inference from cell colors
```

## Running Locally

The frontend is plain static files — any HTTP server works. For example, using Python:

```bash
cd client
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

No install step, no `npm install`, no build required.

## Test Suite

`client/catalog-tests.js` is a self-contained test suite (zero dependencies) that runs inside the browser. It covers page load, section navigation, filters, sorting, column visibility, description panel behavior, the level slider, layout validation, state persistence, console health, and performance.

The suite auto-detects the current viewport and runs the appropriate subset of tests:

| Viewport | Size | Tests |
|----------|------|-------|
| Desktop | > 768px wide | 92 |
| Mobile Portrait | ≤ 768px, portrait | 22 |
| Mobile Landscape | ≤ 768px, landscape | 13 |

Full coverage (127 tests) requires running at all three viewports.

### Running Tests

The test file is designed to be evaluated in the browser console or via a Playwright-based tool. From the browser console while on the app page:

```js
fetch( "catalog-tests.js" ).then( r => r.text() ).then( eval ).then( r => console.log( r.formattedReport ) );
```

This returns a structured JSON report with pass/fail counts per category, plus a `formattedReport` string for human-readable output.

For full viewport coverage, resize the browser window and reload between each run:
1. **Desktop** — run at 1280x800 or wider
2. **Portrait** — resize to 375x667, reload, run
3. **Landscape** — resize to 667x375, reload, run

## Data Pipeline

Game data originates in a Google Sheet and is processed through a Google Apps Script pipeline:

1. Sheet ranges are parsed using section-specific column configs
2. Rarity and Dominion metadata are inferred from cell background colors
3. Weapon fields are expanded (abbreviations to full names)
4. Gear roles are normalized to dual-role arrays
5. Titans are nested by name and module type
6. The final JSON payload is uploaded to S3 for production hosting

The pipeline scripts live in `database/data_collection/` and run inside the Google Apps Script editor.

## License

This project is not affiliated with or endorsed by Pixonic or MY.GAMES.
