// Minimal stub so timings-core.js can load without a real timings.js
global.TIMINGS = {
  2: {
    bg_v: {
      narrator: "Neville Jason",
      duration: 94732.98,
      anchors: [
        { page: 1,   seconds: 10.0  },
        { page: 11,  seconds: 510.0 },
        { page: 21,  seconds: 1010.0 },
        { page: 51,  seconds: 2510.0 },
        { page: 101, seconds: 5010.0 },
      ],
    },
  },
};

const {
  hasTimingData,
  getTimedEdition,
  pageToSeconds,
  secondsToPage,
  formatAudioTime,
  parseAudioTime,
} = require("../timings-core");

// ─── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertClose(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
  } else {
    failed++;
    console.error(
      `  ✗ ${message}: expected ≈${expected}, got ${actual} (diff ${diff.toFixed(4)}, tol ${tolerance})`,
    );
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ─── 1. hasTimingData ────────────────────────────────────────────────────────

section("hasTimingData");

assert(hasTimingData(2, "bg_v") === true,  "vol 2 bg_v should have timing data");
assert(hasTimingData(1, "sw_v1") === false, "vol 1 sw_v1 should have no timing data");
assert(hasTimingData(2, "bg_ml") === false, "vol 2 bg_ml should have no timing data");
assert(hasTimingData(99, "x") === false,   "nonexistent vol should return false");

// ─── 2. getTimedEdition ──────────────────────────────────────────────────────

section("getTimedEdition");

assert(getTimedEdition(2) === "bg_v", "vol 2 timed edition should be bg_v");
assert(getTimedEdition(1) === null,   "vol 1 should have no timed edition");
assert(getTimedEdition(99) === null,  "nonexistent vol should return null");

// ─── 3. pageToSeconds ────────────────────────────────────────────────────────

section("pageToSeconds");

// At exact anchors
assertClose(pageToSeconds(2, "bg_v", 1),   10.0,   0.001, "page 1 = 10s");
assertClose(pageToSeconds(2, "bg_v", 11),  510.0,  0.001, "page 11 = 510s");
assertClose(pageToSeconds(2, "bg_v", 101), 5010.0, 0.001, "page 101 = 5010s");

// Midpoint interpolation: page 6 should be halfway between p.1 and p.11
// (1→10s, 11→510s, so p.6 = 10 + 5/10 * 500 = 260s)
assertClose(pageToSeconds(2, "bg_v", 6), 260.0, 0.1, "page 6 interpolates to 260s");

// Clamping at edges
assertClose(pageToSeconds(2, "bg_v", 0),   10.0,   0.001, "below first anchor clamps to first");
assertClose(pageToSeconds(2, "bg_v", 200), 5010.0, 0.001, "above last anchor clamps to last");

// Unknown edition/volume
assert(isNaN(pageToSeconds(1, "sw_v1", 50)),  "unknown edition returns NaN");
assert(isNaN(pageToSeconds(99, "bg_v", 50)),  "unknown volume returns NaN");

// ─── 4. secondsToPage ────────────────────────────────────────────────────────

section("secondsToPage");

// At exact anchors
assertClose(secondsToPage(2, "bg_v", 10.0),   1.0,   0.001, "10s = page 1");
assertClose(secondsToPage(2, "bg_v", 510.0),  11.0,  0.001, "510s = page 11");
assertClose(secondsToPage(2, "bg_v", 5010.0), 101.0, 0.001, "5010s = page 101");

// Midpoint: 260s should be page 6
assertClose(secondsToPage(2, "bg_v", 260.0), 6.0, 0.1, "260s interpolates to page 6");

// Clamping at edges
assertClose(secondsToPage(2, "bg_v", 0),     1.0,   0.001, "below first anchor clamps to first page");
assertClose(secondsToPage(2, "bg_v", 99999), 101.0, 0.001, "above last anchor clamps to last page");

// Unknown
assert(isNaN(secondsToPage(1, "sw_v1", 100)), "unknown edition returns NaN");

// ─── 5. Round-trip consistency ───────────────────────────────────────────────

section("Round-trip consistency (page → seconds → page)");

for (const page of [1, 6, 11, 16, 21, 51, 101]) {
  const secs = pageToSeconds(2, "bg_v", page);
  const back = secondsToPage(2, "bg_v", secs);
  assertClose(back, page, 0.01, `round-trip p.${page}`);
}

// ─── 6. formatAudioTime ──────────────────────────────────────────────────────

section("formatAudioTime");

assert(formatAudioTime(0)     === "0:00:00", "0s → 0:00:00");
assert(formatAudioTime(3661)  === "1:01:01", "3661s → 1:01:01");
assert(formatAudioTime(3600)  === "1:00:00", "3600s → 1:00:00");
assert(formatAudioTime(59)    === "0:00:59", "59s → 0:00:59");
assert(formatAudioTime(3599)  === "0:59:59", "3599s → 0:59:59");
assert(formatAudioTime(7384)  === "2:03:04", "7384s → 2:03:04");
assert(formatAudioTime(NaN)   === "—",       "NaN → —");
assert(formatAudioTime(-1)    === "—",       "negative → —");

// ─── 7. parseAudioTime ───────────────────────────────────────────────────────

section("parseAudioTime");

assertClose(parseAudioTime("0"),       0,    0.001, "raw 0");
assertClose(parseAudioTime("3661"),    3661, 0.001, "raw 3661");
assertClose(parseAudioTime("1:01:01"), 3661, 0.001, "1:01:01");
assertClose(parseAudioTime("1:00:00"), 3600, 0.001, "1:00:00");
assertClose(parseAudioTime("0:59:59"), 3599, 0.001, "0:59:59");
assertClose(parseAudioTime("2:03:04"), 7384, 0.001, "2:03:04");
assertClose(parseAudioTime("1:30"),    90,   0.001, "MM:SS 1:30");
assertClose(parseAudioTime("59"),      59,   0.001, "raw 59");
assert(isNaN(parseAudioTime("")),              "empty string → NaN");
assert(isNaN(parseAudioTime(null)),            "null → NaN");
assert(isNaN(parseAudioTime("abc")),           "letters → NaN");
assert(isNaN(parseAudioTime("1:xx:00")),       "non-numeric part → NaN");

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
