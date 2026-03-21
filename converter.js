// ─── UI ──────────────────────────────────────────────────────────────────────
// Data constants (VOLUMES, EDITIONS, C) and pure functions (findPath, convertPage)
// are provided by converter-core.js, loaded before this script.

const volSelect = document.getElementById("volume");
const srcSelect = document.getElementById("source");
const pageInput = document.getElementById("page");
const dstSelect = document.getElementById("target");
const resultsDiv = document.getElementById("results");
const resultsHead = document.getElementById("results-header");
const resultsBody = document.getElementById("results-body");

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "proust_converter";

function savePrefs() {
  const prefs = {
    volume: volSelect.value,
    source: srcSelect.value,
    target: dstSelect.value,
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

  doConvert();
}

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

  resultsDiv.style.display = "block";
}

volSelect.addEventListener("change", () => {
  populateEditions();
  savePrefs();
});
srcSelect.addEventListener("change", () => {
  doConvert();
  savePrefs();
});
dstSelect.addEventListener("change", () => {
  doConvert();
  savePrefs();
});
pageInput.addEventListener("input", doConvert);

populateEditions();

// Obfuscated mailto to deter spam bots
const cl = document.getElementById("contact-link");
if (cl) cl.href = "mai" + "lto:" + "sean" + "@" + "snptrs" + ".dev";
