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

## Tests

Run the test suite with Node.js:

```sh
node converter-core.test.js
```

The tests cover:

- **Data integrity** — all volumes have editions, coefficients, and matching reverse pairs
- **Path finding** — direct, indirect (multi-hop), identity, and invalid inputs
- **Identity conversion** — converting to the same edition returns the input unchanged
- **Round-trip consistency** — converting A→B→A returns approximately the original page
- **Spreadsheet anchor points** — known page equivalences from the source data
- **Finite output** — all valid edition pairs produce finite numbers
- **Invalid input** — nonexistent editions/volumes return `NaN`
- **Monotonicity** — higher input pages always produce higher output pages

## Data source

All conversion data comes from [Tom Stern's Proust Page Number Converter](http://sterntom.com/proust-page-number-converter/). This project is a front-end reimplementation of that resource — the regression coefficients and edition mappings are derived from his work. Thank you to Tom Stern for compiling and sharing this data.
