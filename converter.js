// ─── UI ──────────────────────────────────────────────────────────────────────
// Data constants (VOLUMES, EDITIONS, C) and pure functions (findPath, convertPage)
// are provided by converter-core.js, loaded before this script.
// Timing data (TIMINGS) and functions (pageToSeconds, secondsToPage, etc.)
// are provided by timings.js and timings-core.js, loaded before this script.

const volSelect = document.getElementById("volume");
const srcSelect = document.getElementById("source");
const pageInput = document.getElementById("page");
const dstSelect = document.getElementById("target");
const resultsDiv = document.getElementById("results");
const resultsHead = document.getElementById("results-header");
const resultsBody = document.getElementById("results-body");

const modeToggle = document.getElementById("mode-toggle");
const modeBtnPage = document.getElementById("mode-page");
const modeBtnTime = document.getElementById("mode-time");
const pageRow = document.getElementById("page-row");
const timeRow = document.getElementById("time-row");
const timeInput = document.getElementById("time-input");

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "proust_converter";

function savePrefs() {
  const prefs = {
    volume: volSelect.value,
    source: srcSelect.value,
    target: dstSelect.value,
    mode: inputMode,
    timeValue: timeInput.value,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {}
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// ─── Mode toggle ─────────────────────────────────────────────────────────────

let inputMode = "page";

function setMode(mode) {
  inputMode = mode;
  modeBtnPage.classList.toggle("active", mode === "page");
  modeBtnTime.classList.toggle("active", mode === "time");
  pageRow.style.display = mode === "page" ? "" : "none";
  timeRow.style.display = mode === "time" ? "" : "none";
  if (mode === "time") {
    doConvertFromTime();
  } else {
    doConvert();
  }
  savePrefs();
}

modeBtnPage.addEventListener("click", () => setMode("page"));
modeBtnTime.addEventListener("click", () => setMode("time"));

// ─── Initialization ──────────────────────────────────────────────────────────

const saved = loadPrefs();

// Populate volumes
for (const [v, name] of Object.entries(VOLUMES)) {
  const opt = document.createElement("option");
  opt.value = v;
  opt.textContent = `${v}. ${name}`;
  volSelect.appendChild(opt);
}

if (saved?.volume) volSelect.value = saved.volume;

function populateEditions() {
  const vol = Number(volSelect.value);
  const editions = EDITIONS[vol];

  srcSelect.innerHTML = "";
  dstSelect.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "__all__";
  allOpt.textContent = "All editions";
  dstSelect.appendChild(allOpt);

  for (const [code, name] of Object.entries(editions)) {
    const o1 = document.createElement("option");
    o1.value = code;
    o1.textContent = name;
    srcSelect.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = code;
    o2.textContent = name;
    dstSelect.appendChild(o2);
  }

  if (saved && volSelect.value === saved.volume) {
    if (saved.source) srcSelect.value = saved.source;
    if (saved.target) dstSelect.value = saved.target;
  }

  // Show mode toggle only when this volume has timing data
  const timedEd = getTimedEdition(vol);
  modeToggle.style.display = timedEd ? "flex" : "none";
  if (!timedEd && inputMode === "time") {
    // Silently revert to page mode when switching to a volume without timing data
    inputMode = "page";
    modeBtnPage.classList.add("active");
    modeBtnTime.classList.remove("active");
    pageRow.style.display = "";
    timeRow.style.display = "none";
  }

  if (inputMode === "time") {
    doConvertFromTime();
  } else {
    doConvert();
  }
}

// ─── Page mode conversion ─────────────────────────────────────────────────────

function doConvert() {
  const vol = Number(volSelect.value);
  const src = srcSelect.value;
  const page = parseFloat(pageInput.value);

  if (!page || isNaN(page)) {
    resultsDiv.style.display = "none";
    return;
  }

  const dst = dstSelect.value;
  const editions = EDITIONS[vol];

  resultsHead.textContent = `${editions[src]} p. ${page}`;
  resultsBody.innerHTML = "";

  const targets = dst === "__all__" ? Object.keys(editions) : [dst];

  for (const ed of targets) {
    const val = ed === src ? page : convertPage(vol, page, src, ed);
    const row = document.createElement("div");
    row.className = "result-row" + (ed === src ? " is-source" : "");

    const nameSpan = document.createElement("span");
    nameSpan.className = "result-name";
    nameSpan.textContent = editions[ed];

    const pageSpan = document.createElement("span");
    pageSpan.className = "result-page";
    pageSpan.textContent = isNaN(val) ? "—" : `p. ${val.toFixed(1)}`;

    row.appendChild(nameSpan);
    row.appendChild(pageSpan);

    if (ed === src) {
      const marker = document.createElement("span");
      marker.className = "source-marker";
      marker.textContent = " ◀";
      row.appendChild(marker);
    }

    resultsBody.appendChild(row);
  }

  // Audiobook row — shown only when this volume has timing data
  const timedEd = getTimedEdition(vol);
  if (timedEd) {
    const timedPage = timedEd === src ? page : convertPage(vol, page, src, timedEd);
    const seconds = pageToSeconds(vol, timedEd, timedPage);

    const divider = document.createElement("div");
    divider.className = "audiobook-divider";
    resultsBody.appendChild(divider);

    const audioRow = document.createElement("div");
    audioRow.className = "audiobook-row";

    const nameSpan = document.createElement("span");
    nameSpan.className = "result-name";
    nameSpan.textContent = TIMINGS[vol][timedEd].narrator;

    const timeSpan = document.createElement("span");
    timeSpan.className = "audiobook-time";
    timeSpan.textContent = formatAudioTime(seconds);

    audioRow.appendChild(nameSpan);
    audioRow.appendChild(timeSpan);
    resultsBody.appendChild(audioRow);
  }

  resultsDiv.style.display = "block";
}

// ─── Time mode conversion ─────────────────────────────────────────────────────

function doConvertFromTime() {
  const vol = Number(volSelect.value);
  const timedEd = getTimedEdition(vol);

  if (!timedEd) {
    resultsDiv.style.display = "none";
    return;
  }

  const seconds = parseAudioTime(timeInput.value);
  if (isNaN(seconds)) {
    resultsDiv.style.display = "none";
    return;
  }

  const page = secondsToPage(vol, timedEd, seconds);
  const editions = EDITIONS[vol];
  const dst = dstSelect.value;

  resultsHead.textContent = `Audiobook ${formatAudioTime(seconds)}`;
  resultsBody.innerHTML = "";

  const targets = dst === "__all__" ? Object.keys(editions) : [dst];

  for (const ed of targets) {
    const val = ed === timedEd ? page : convertPage(vol, page, timedEd, ed);
    const row = document.createElement("div");
    row.className = "result-row" + (ed === timedEd ? " is-source" : "");

    const nameSpan = document.createElement("span");
    nameSpan.className = "result-name";
    nameSpan.textContent = editions[ed];

    const pageSpan = document.createElement("span");
    pageSpan.className = "result-page";
    pageSpan.textContent = isNaN(val) ? "—" : `p. ${val.toFixed(1)}`;

    row.appendChild(nameSpan);
    row.appendChild(pageSpan);

    if (ed === timedEd) {
      const marker = document.createElement("span");
      marker.className = "source-marker";
      marker.textContent = " ◀";
      row.appendChild(marker);
    }

    resultsBody.appendChild(row);
  }

  resultsDiv.style.display = "block";
}

// ─── Event listeners ──────────────────────────────────────────────────────────

volSelect.addEventListener("change", () => {
  populateEditions();
  savePrefs();
});
srcSelect.addEventListener("change", () => {
  doConvert();
  savePrefs();
});
dstSelect.addEventListener("change", () => {
  if (inputMode === "time") {
    doConvertFromTime();
  } else {
    doConvert();
  }
  savePrefs();
});
pageInput.addEventListener("input", doConvert);
timeInput.addEventListener("input", () => {
  doConvertFromTime();
  savePrefs();
});

populateEditions();

// Restore saved mode after populateEditions (which may have reset it)
if (saved?.mode === "time" && getTimedEdition(Number(volSelect.value))) {
  if (saved.timeValue) timeInput.value = saved.timeValue;
  setMode("time");
}

// Obfuscated mailto to deter spam bots
const cl = document.getElementById("contact-link");
if (cl) cl.href = "mai" + "lto:" + "sean" + "@" + "snptrs" + ".dev";
