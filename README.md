# Proust Page Converter

A simple web app for converting page numbers between different editions of Marcel Proust's _À la recherche du temps perdu_ (_In Search of Lost Time_).

## Usage

**[Open the app](https://snptrs.github.io/proust-converter/)**

1. Select a **volume**.
2. Choose the **source edition** and enter a **page number**.
3. Choose a **target edition** (or "All editions" to see every conversion at once).

Results update live as you type. Your volume and edition selections are saved in localStorage.

## Editions supported

- **Pléiade** (Gallimard, 4 volumes)
- **Vintage** (English)
- **Modern Library** (English)
- **Penguin** (English)
- **Centaur Edition**

All seven volumes are covered, with each volume offering the editions for which conversion data is available.

## How it works

Each pair of editions has a set of linear regression coefficients (slope and intercept) derived from sampled page correspondences. Given a page number in one edition, the converter applies `y = slope × x + intercept` to produce the equivalent page in another edition. When no direct conversion exists between two editions, the app finds a path through intermediate editions using BFS and chains the conversions.

## Audiobook timings

For editions that have timing data, the app can convert between page numbers and audiobook timestamps. Enter a page number to see the corresponding position in the audiobook, or enter a timestamp to find the approximate page.

Currently supported: _Within a Budding Grove_ — Vintage edition (Naxos audiobook, narrated by Neville Jason).

### How it works

Timing data is stored as a set of anchor points — manually recorded `(page, timestamp)` pairs sampled every five pages. Between anchors, positions are derived by piecewise linear interpolation. The anchors are stored in `tools/timings/` as JSON files and compiled into `timings.js` by `tools/build_timings.py`.

### Adding timing data for a new edition

1. Obtain an ASR transcript of the audiobook (as a JSON file with a `segments` array of `{id, start, text}` objects) and place it in `tools/`.
2. Run `python tools/build_timings.py` and follow the interactive prompts: enter a page number, then paste a short passage of text from that page. The script fuzzy-matches it against the transcript to find the timestamp.
3. Repeat for as many pages as desired (every 5 pages gives good accuracy). The script saves progress to `tools/timings/<edition>.json` and regenerates `timings.js` after each anchor.

## Tests

Run the test suite with Node.js:

```sh
node tests/converter-core.test.js
node tests/timings-core.test.js
```

The converter tests cover:

- **Data integrity** — all volumes have editions, coefficients, and matching reverse pairs
- **Path finding** — direct, indirect (multi-hop), identity, and invalid inputs
- **Identity conversion** — converting to the same edition returns the input unchanged
- **Round-trip consistency** — converting A→B→A returns approximately the original page
- **Spreadsheet anchor points** — known page equivalences from the source data
- **Finite output** — all valid edition pairs produce finite numbers
- **Invalid input** — nonexistent editions/volumes return `NaN`
- **Monotonicity** — higher input pages always produce higher output pages

The timings tests cover interpolation, reverse lookup, edge cases, and time string parsing/formatting.

## Data source

All conversion data comes from [Tom Stern's Proust Page Number Converter](http://sterntom.com/proust-page-number-converter/). This project is a front-end reimplementation of that resource — the regression coefficients and edition mappings are derived from his work. Thank you to Tom Stern for compiling and sharing this data.
