const {
  VOLUMES,
  EDITIONS,
  C,
  findPath,
  convertPage,
} = require("./converter-core");

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

// ─── 1. Data integrity ──────────────────────────────────────────────────────

section("Data integrity");

assert(Object.keys(VOLUMES).length === 7, "Should have 7 volumes");

for (let vol = 1; vol <= 7; vol++) {
  assert(VOLUMES[vol], `Volume ${vol} should have a name`);
  assert(EDITIONS[vol], `Volume ${vol} should have editions`);
  assert(C[vol], `Volume ${vol} should have coefficients`);
  assert(
    Object.keys(EDITIONS[vol]).length >= 4,
    `Volume ${vol} should have at least 4 editions`,
  );
}

// Every coefficient key should have a matching reverse
for (let vol = 1; vol <= 7; vol++) {
  for (const key of Object.keys(C[vol])) {
    const [a, b] = key.split(",");
    const reverse = `${b},${a}`;
    assert(
      C[vol][reverse],
      `Vol ${vol}: missing reverse coefficient ${reverse} for ${key}`,
    );
  }
}

// ─── 2. findPath ─────────────────────────────────────────────────────────────

section("findPath");

// Identity
assert(
  findPath(1, "pleiade", "pleiade").length === 1,
  "Same edition returns single-element path",
);
assert(
  findPath(1, "pleiade", "pleiade")[0] === "pleiade",
  "Identity path contains the edition",
);

// Direct path
const directPath = findPath(1, "pleiade", "sw_v1");
assert(directPath.length === 2, "Direct path has 2 elements");
assert(
  directPath[0] === "pleiade" && directPath[1] === "sw_v1",
  "Direct path is [pleiade, sw_v1]",
);

// Indirect path (wbs_pen → sw_ml must go via sw_v1)
const indirectPath = findPath(1, "wbs_pen", "sw_ml");
assert(indirectPath.length >= 3, "Indirect path has at least 3 hops");
assert(
  indirectPath[0] === "wbs_pen" &&
    indirectPath[indirectPath.length - 1] === "sw_ml",
  "Indirect path starts at wbs_pen and ends at sw_ml",
);

// No path for invalid edition
const noPath = findPath(1, "pleiade", "nonexistent");
assert(noPath.length === 0, "No path for nonexistent edition");

// No path for invalid volume
const noPathVol = findPath(99, "pleiade", "sw_v1");
assert(noPathVol.length === 0, "No path for nonexistent volume");

// Every edition pair in a volume should be reachable
for (let vol = 1; vol <= 7; vol++) {
  const eds = Object.keys(EDITIONS[vol]);
  for (const src of eds) {
    for (const dst of eds) {
      const p = findPath(vol, src, dst);
      assert(
        p.length > 0,
        `Vol ${vol}: path should exist from ${src} to ${dst}`,
      );
    }
  }
}

// ─── 3. convertPage – identity ──────────────────────────────────────────────

section("convertPage – identity (src === dst)");

for (let vol = 1; vol <= 7; vol++) {
  const ed = Object.keys(EDITIONS[vol])[0];
  const result = convertPage(vol, 100, ed, ed);
  assert(
    result === 100,
    `Vol ${vol}: converting to same edition returns input`,
  );
}

// ─── 4. Round-trip consistency ───────────────────────────────────────────────

section("Round-trip consistency (A→B→A)");

const ROUND_TRIP_TOL = 2.0; // allow ±2 pages for round-trip through linear approx

for (let vol = 1; vol <= 7; vol++) {
  for (const key of Object.keys(C[vol])) {
    const [a, b] = key.split(",");
    const reverse = `${b},${a}`;
    if (!C[vol][reverse]) continue;

    const testPage = 100;
    const forward = convertPage(vol, testPage, a, b);
    const back = convertPage(vol, forward, b, a);
    assertClose(
      back,
      testPage,
      ROUND_TRIP_TOL,
      `Vol ${vol}: ${a}→${b}→${a} round-trip p.${testPage}`,
    );
  }
}

// ─── 5. Spreadsheet anchor-point spot checks ────────────────────────────────
// These are the known matching page numbers from the original spreadsheet.
// The linear model is approximate, so we allow a tolerance.

section("Spreadsheet anchor-point spot checks");

const ANCHOR_TOL = 35; // linear regression is approximate; anchor points may diverge at extremes

// Anchor points: [vol, page, edition, expectedPage, expectedEdition]
// Derived from "Proust Conversion Chart.xlsx"
const anchorTests = [
  // ── Volume 1 ──
  // Pléiade p.3 ↔ SW Vintage p.1
  [1, 3, "pleiade", "sw_v1", 1],
  [1, 1, "sw_v1", "pleiade", 3],
  // Pléiade p.44 ↔ SW Vintage p.60 (from spreadsheet anchor)
  [1, 44, "pleiade", "sw_v1", 60],
  // SW Vintage p.1 ↔ SW ML p.1
  [1, 1, "sw_v1", "sw_ml", 1],
  // Pléiade p.3 ↔ Penguin p.7
  [1, 3, "pleiade", "wbs_pen", 7],
  // Pléiade p.187 ↔ SW Vintage p.257 (from spreadsheet anchor)
  [1, 187, "pleiade", "sw_v1", 257],

  // ── Volume 2 ──
  // Pléiade1 p.423 ↔ BG Vintage p.1
  [2, 423, "pleiade1", "bg_v", 1],
  // BG Vintage p.1 ↔ BG ML p.1
  [2, 1, "bg_v", "bg_ml", 1],
  // BG Vintage p.1 ↔ SYG Penguin p.3 (approx)
  [2, 1, "bg_v", "syg_pen", 3],

  // ── Volume 3 ──
  // Pléiade p.309 ↔ GW Vintage p.1
  [3, 309, "pleiade", "gw_v", 1],
  // GW Vintage p.1 ↔ GW ML p.1
  [3, 1, "gw_v", "gw_ml", 1],
  // GW Vintage p.1 ↔ GW Penguin p.3
  [3, 1, "gw_v", "gw_pen", 3],

  // ── Volume 4 ──
  // Pléiade p.3 ↔ SG Vintage p.1
  [4, 3, "pleiade", "sg_v", 1],
  // SG Vintage p.1 ↔ SG Penguin p.3
  [4, 1, "sg_v", "sg_pen", 3],

  // ── Volume 5 ──
  // Pléiade p.519 ↔ Captive Vintage p.1
  [5, 519, "pleiade", "c_v", 1],
  // Captive Vintage p.1 ↔ Prisoner Penguin p.3
  [5, 1, "c_v", "p_pen", 3],

  // ── Volume 6 ──
  // Fugitive Vintage p.559 ↔ Fugitive ML p.559 (near start)
  [6, 559, "f_v", "f_ml", 659],

  // ── Volume 7 ──
  // Pléiade p.275 ↔ TR Vintage p.1
  [7, 275, "pleiade", "tr_v", 1],
  // TR Vintage p.1 ↔ TR ML p.1
  [7, 1, "tr_v", "tr_ml", 1],
  // Pléiade p.275 ↔ FTA Penguin p.3
  [7, 275, "pleiade", "fta_pen", 3],
];

for (const [vol, page, src, dst, expected] of anchorTests) {
  const result = convertPage(vol, page, src, dst);
  assertClose(
    result,
    expected,
    ANCHOR_TOL,
    `Vol ${vol}: ${src} p.${page} → ${dst} (expect ≈${expected})`,
  );
}

// ─── 6. Conversion produces finite numbers ──────────────────────────────────

section("All conversions produce finite numbers");

for (let vol = 1; vol <= 7; vol++) {
  const eds = Object.keys(EDITIONS[vol]);
  for (const src of eds) {
    for (const dst of eds) {
      const result = convertPage(vol, 50, src, dst);
      assert(
        Number.isFinite(result),
        `Vol ${vol}: ${src}→${dst} p.50 should be finite, got ${result}`,
      );
    }
  }
}

// ─── 7. Invalid input returns NaN ────────────────────────────────────────────

section("Invalid input returns NaN");

assert(
  isNaN(convertPage(1, 100, "pleiade", "nonexistent")),
  "Nonexistent target edition returns NaN",
);
assert(
  isNaN(convertPage(1, 100, "nonexistent", "pleiade")),
  "Nonexistent source edition returns NaN",
);
assert(
  isNaN(convertPage(99, 100, "pleiade", "sw_v1")),
  "Nonexistent volume returns NaN",
);

// ─── 8. Monotonicity ────────────────────────────────────────────────────────
// Higher input pages should always produce higher output pages (positive slope)

section("Monotonicity (higher page in → higher page out)");

for (let vol = 1; vol <= 7; vol++) {
  const eds = Object.keys(EDITIONS[vol]);
  for (const src of eds) {
    for (const dst of eds) {
      if (src === dst) continue;
      const low = convertPage(vol, 10, src, dst);
      const high = convertPage(vol, 200, src, dst);
      assert(
        high > low,
        `Vol ${vol}: ${src}→${dst} should be monotonically increasing`,
      );
    }
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);
