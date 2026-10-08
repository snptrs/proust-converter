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

Currently supported (Vintage editions, Naxos audiobooks narrated by Neville Jason):

- _Within a Budding Grove_
- _The Guermantes Way_

### How it works

Timing data is stored as a set of anchor points — manually recorded `(page, timestamp)` pairs. Pages can be fractional to mark a position partway down the page. Between anchors, positions are derived by piecewise linear interpolation. The anchors are stored in `tools/timings/` as JSON files and compiled into `timings.js` by `tools/build_timings.py`.

### Adding timing data for a new edition

`tools/build_timings.py` has a preset for each edition (`--edition bg_v`, `--edition gw_v`). Anchors are saved to `tools/timings/<edition>.json` and `timings.js` is regenerated after each one. There are two modes:

**Chapter mode** (preferred, used when the preset has an Audiobookshelf item ID). Chapter start times from Audiobookshelf are used as exact timestamps.

1. Put an Audiobookshelf API key in `~/.config/abs/token`.
2. Run `python tools/build_timings.py --edition gw_v`. Chapters are fetched once and cached to `tools/<edition>-chapters.json` (`--refresh-chapters` to re-fetch).
3. For each chapter, enter the page where its first line appears (e.g. `212.5` for halfway down p. 212), or press Enter to accept the prediction. Entries far from the prediction are flagged. `s` skips, `b` goes back, `q` quits; progress resumes where you left off.

**Transcript mode** (`bg_v`). Uses an ASR transcript (a JSON file with a `segments` array of `{id, start, text}` objects) in `tools/`. Enter a page number, then paste a short passage from that page; the script fuzzy-matches it against the transcript to find the timestamp.

Run `python tools/build_timings.py --edition <edition> --check` to flag anchors that are out of order or don't fit their neighbours, estimate the book's last page from the audio, and show where the converter places known landmarks (e.g. the start of Part Two) so you can check them against the book.

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
