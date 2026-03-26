// ─── Audiobook Timing Functions ──────────────────────────────────────────────
// Depends on TIMINGS global provided by timings.js (auto-generated).
// timings.js must be loaded before this script.

function hasTimingData(vol, edition) {
  return !!(TIMINGS[vol] && TIMINGS[vol][edition]);
}

// Returns the first edition code that has timing data for a given volume,
// or null if none exists.
function getTimedEdition(vol) {
  const volData = TIMINGS[vol];
  if (!volData) return null;
  const keys = Object.keys(volData);
  return keys.length > 0 ? keys[0] : null;
}

// Piecewise linear interpolation: edition page number → audiobook seconds.
// Returns NaN if no timing data exists for this vol/edition.
function pageToSeconds(vol, edition, page) {
  if (!hasTimingData(vol, edition)) return NaN;
  const anchors = TIMINGS[vol][edition].anchors;
  if (anchors.length === 0) return NaN;
  if (page <= anchors[0].page) return anchors[0].seconds;
  if (page >= anchors[anchors.length - 1].page)
    return anchors[anchors.length - 1].seconds;

  // Binary search for the interval containing page
  let lo = 0,
    hi = anchors.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].page <= page) lo = mid;
    else hi = mid;
  }
  const a0 = anchors[lo],
    a1 = anchors[hi];
  const ratio = (page - a0.page) / (a1.page - a0.page);
  return a0.seconds + ratio * (a1.seconds - a0.seconds);
}

// Reverse interpolation: audiobook seconds → approximate edition page number.
// Returns NaN if no timing data exists for this vol/edition.
function secondsToPage(vol, edition, seconds) {
  if (!hasTimingData(vol, edition)) return NaN;
  const anchors = TIMINGS[vol][edition].anchors;
  if (anchors.length === 0) return NaN;
  if (seconds <= anchors[0].seconds) return anchors[0].page;
  if (seconds >= anchors[anchors.length - 1].seconds)
    return anchors[anchors.length - 1].page;

  // Binary search for the interval containing seconds
  let lo = 0,
    hi = anchors.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].seconds <= seconds) lo = mid;
    else hi = mid;
  }
  const a0 = anchors[lo],
    a1 = anchors[hi];
  const ratio = (seconds - a0.seconds) / (a1.seconds - a0.seconds);
  return a0.page + ratio * (a1.page - a0.page);
}

// Format seconds as "H:MM:SS".
function formatAudioTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Parse a time string into seconds.
// Accepts: "H:MM:SS", "MM:SS", or a plain number string (raw seconds).
// Returns NaN for invalid input.
function parseAudioTime(str) {
  if (!str) return NaN;
  str = str.trim();
  if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return NaN;
}

// CommonJS export for Node.js test runner
if (typeof module !== "undefined") {
  module.exports = {
    hasTimingData,
    getTimedEdition,
    pageToSeconds,
    secondsToPage,
    formatAudioTime,
    parseAudioTime,
  };
}
