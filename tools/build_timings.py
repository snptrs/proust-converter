#!/usr/bin/env python3
"""
build_timings.py — Interactively build audiobook anchor data for the Proust page converter.

Usage:
    python build_timings.py              # Default: Volume 2, Within a Budding Grove (bg_v)
    python build_timings.py --edition gw_v   # Volume 3, The Guermantes Way (ABS chapter mode)
    python build_timings.py --list       # Show all anchors in the current data file
    python build_timings.py --delete N  # Remove anchor for page N
    python build_timings.py --check      # Sanity-check anchors and converter data
    python build_timings.py --total-pages 480  # Override total page count for position estimate

Two modes, picked by the edition preset:

- Transcript mode (bg_v): fuzzy-matches text you type from the book against an ASR
  transcript to find the timestamp.
- Chapter mode (gw_v): uses Audiobookshelf chapter start times as exact timestamps.
  You enter the page where each chapter's first line appears.

Anchors are saved to timings/<edition>.json, and timings.js is regenerated from all
timings/*.json files after each save.

Position estimation: The script uses the page number (relative to total pages) to estimate
where in the transcript to search, then restricts the search to a window around that estimate.
Existing anchors give increasingly precise estimates as you add more data.
"""

import argparse
import difflib
import json
import re
import sys
import urllib.request
from pathlib import Path

# ─── Configuration ────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
TRANSCRIPT_FILE = SCRIPT_DIR / "budding-grove.json"
TIMINGS_DIR = SCRIPT_DIR / "timings"
OUTPUT_JS = SCRIPT_DIR.parent / "timings.js"

CONVERTER_JS = SCRIPT_DIR.parent / "converter-core.js"

ABS_SERVER = "http://seans-imac:13378/audiobookshelf"
ABS_TOKEN_FILE = Path.home() / ".config" / "abs" / "token"

DEFAULT_EDITION = "bg_v"
NAXOS = "Naxos audiobook, narrated by Neville Jason"

# Per-edition defaults. `abs_item` switches on chapter mode.
# `landmarks` are (edition, page, label) points the converter maps into this
# edition, so --check can compare them against the physical book.
PRESETS = {
    "bg_v": {"volume": 2, "narrator": NAXOS, "total_pages": 500},
    "gw_v": {
        "volume": 3,
        "narrator": NAXOS,
        "total_pages": 691,
        "abs_item": "b6c26bd3-9ed1-4fa7-b89e-dd99873690b6",
        "landmarks": [
            # 609 is from a secondary source (unverified against a Pléiade copy)
            ("pleiade", 609, "Start of Part Two (Pléiade II p. 609, unverified)"),
            ("pleiade", 884, "End of text (Pléiade II p. 884)"),
        ],
    },
}

WINDOW_SIZE = 10      # Number of consecutive segments to concatenate for matching
SEARCH_PAGES = 25     # Half-width of search window, in pages

# Chapter mode: flag an entry if it's further than this from the predicted page
DEVIATION_MIN_PAGES = 1.5
DEVIATION_FRACTION = 0.25
RATE_LOOKBACK = 10    # Anchors used for the local seconds-per-page rate


# ─── Transcript loading ───────────────────────────────────────────────────────

def load_transcript(path: Path) -> list[dict]:
    print(f"Loading transcript from {path}...")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    segments = data["segments"]
    print(f"Loaded {len(segments):,} segments ({data['metadata']['duration']:.0f}s total)")
    return segments, data["metadata"]["duration"]


def build_windows(segments: list[dict], window_size: int = WINDOW_SIZE) -> list[dict]:
    """Build overlapping windows of concatenated text mapped to start timestamps."""
    windows = []
    for i in range(len(segments)):
        end = min(i + window_size, len(segments))
        text = " ".join(s["text"] for s in segments[i:end])
        windows.append({
            "start": segments[i]["start"],
            "segment_id": segments[i]["id"],
            "text": text,
        })
    return windows


# ─── Position estimation ─────────────────────────────────────────────────────

def estimate_seconds(page: int, data: dict, duration: float, total_pages: int) -> float:
    """Estimate the audiobook position for a given page.

    Uses existing anchors for interpolation/extrapolation when available;
    falls back to a linear fraction of total duration otherwise.
    """
    anchors = sorted(data["anchors"], key=lambda a: a["page"])

    if len(anchors) == 0:
        return (page / total_pages) * duration

    if len(anchors) == 1:
        a = anchors[0]
        rate = a["seconds"] / max(a["page"], 1)
        return rate * page

    # Interpolate between surrounding anchors
    if anchors[0]["page"] <= page <= anchors[-1]["page"]:
        for i in range(len(anchors) - 1):
            a0, a1 = anchors[i], anchors[i + 1]
            if a0["page"] <= page <= a1["page"]:
                ratio = (page - a0["page"]) / (a1["page"] - a0["page"])
                return a0["seconds"] + ratio * (a1["seconds"] - a0["seconds"])

    # Extrapolate before the first anchor
    if page < anchors[0]["page"]:
        a0, a1 = anchors[0], anchors[1]
        rate = (a1["seconds"] - a0["seconds"]) / (a1["page"] - a0["page"])
        return max(0.0, a0["seconds"] + (page - a0["page"]) * rate)

    # Extrapolate after the last anchor
    a0, a1 = anchors[-2], anchors[-1]
    rate = (a1["seconds"] - a0["seconds"]) / (a1["page"] - a0["page"])
    return min(duration, a1["seconds"] + (page - a1["page"]) * rate)


def search_radius_seconds(data: dict, duration: float, total_pages: int,
                          half_width_pages: int = SEARCH_PAGES) -> float:
    """Return a search radius in seconds corresponding to `half_width_pages` pages."""
    anchors = sorted(data["anchors"], key=lambda a: a["page"])
    if len(anchors) >= 2:
        span_pages = anchors[-1]["page"] - anchors[0]["page"]
        span_secs = anchors[-1]["seconds"] - anchors[0]["seconds"]
        rate = span_secs / max(span_pages, 1)
    else:
        rate = duration / total_pages
    return rate * half_width_pages


# ─── Fuzzy matching ───────────────────────────────────────────────────────────

def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", " ", text.lower())


def score_match(query: str, window_text: str) -> float:
    q = normalize(query)
    w = normalize(window_text)
    q_tokens = set(q.split())
    w_tokens = set(w.split())
    if not q_tokens:
        return 0.0
    jaccard = len(q_tokens & w_tokens) / len(q_tokens | w_tokens)
    # Compare against the start of the window (same length as query)
    sm = difflib.SequenceMatcher(None, q, w[: len(q) * 2]).ratio()
    return 0.6 * jaccard + 0.4 * sm


def find_matches(query: str, windows: list[dict], top_n: int = 3,
                 center: float | None = None, radius: float | None = None) -> list[tuple]:
    """Score windows against query, optionally restricted to a time range."""
    if center is not None and radius is not None:
        lo, hi = center - radius, center + radius
        pool = [w for w in windows if lo <= w["start"] <= hi]
        if not pool:
            # Fallback: search everything if the window is empty
            pool = windows
    else:
        pool = windows
    scored = [(score_match(query, w["text"]), w) for w in pool]
    scored.sort(key=lambda x: -x[0])
    return scored[:top_n]


# ─── Data file management ─────────────────────────────────────────────────────

def load_data(path: Path, volume: int, edition: str, narrator: str, duration: float) -> dict:
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {
        "volume": volume,
        "edition": edition,
        "narrator": narrator,
        "duration_seconds": duration,
        "anchors": [],
    }


def save_data(data: dict, path: Path) -> None:
    TIMINGS_DIR.mkdir(exist_ok=True)
    data["anchors"].sort(key=lambda a: a["page"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"  Saved {path}")
    regenerate_js()


def regenerate_js() -> None:
    """Rebuild timings.js from all JSON files in the timings/ directory."""
    all_timings: dict = {}
    for json_file in sorted(TIMINGS_DIR.glob("*.json")):
        with open(json_file, encoding="utf-8") as f:
            t = json.load(f)
        vol = t["volume"]
        ed = t["edition"]
        if vol not in all_timings:
            all_timings[vol] = {}
        all_timings[vol][ed] = {
            "narrator": t.get("narrator", ""),
            "duration": t["duration_seconds"],
            # Chapter mode stores extra fields (e.g. chapter index) for resuming
            "anchors": [{"page": a["page"], "seconds": a["seconds"]} for a in t["anchors"]],
        }

    js_content = "// Auto-generated by build_timings.py — do not edit by hand\n"
    js_content += f"const TIMINGS = {json.dumps(all_timings, indent=2)};\n"

    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write(js_content)
    print(f"  Regenerated {OUTPUT_JS}")


# ─── Formatting ───────────────────────────────────────────────────────────────

def fmt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h}:{m:02d}:{s:02d}"


def show_anchors(data: dict) -> None:
    anchors = data["anchors"]
    if not anchors:
        print("  (no anchors yet)")
        return
    for a in anchors:
        print(f"  p. {a['page']:>4}  →  {fmt_time(a['seconds'])}  ({a['seconds']:.1f}s)")


# ─── Interactive session ──────────────────────────────────────────────────────

def interactive(volume: int, edition: str, narrator: str, total_pages: int) -> None:
    if not TRANSCRIPT_FILE.exists():
        print(f"Error: transcript file '{TRANSCRIPT_FILE}' not found.", file=sys.stderr)
        sys.exit(1)

    segments, duration = load_transcript(TRANSCRIPT_FILE)
    print("Building search index...")
    windows = build_windows(segments)
    print(f"Index ready ({len(windows):,} windows)\n")

    json_path = TIMINGS_DIR / f"{edition}.json"
    data = load_data(json_path, volume, edition, narrator, duration)
    existing_pages = {a["page"] for a in data["anchors"]}

    print(f"Volume {volume} · Edition: {edition} · {narrator}")
    print(f"Anchors so far: {len(existing_pages)}")
    if existing_pages:
        print(f"Pages anchored: {sorted(existing_pages)}")
    print()
    print("Commands: enter a page number to add/update an anchor, 'l' to list all, 'q' to quit.")
    print()

    while True:
        try:
            raw = input("Page: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if raw.lower() == "q":
            break
        if raw.lower() == "l":
            show_anchors(data)
            continue
        if not raw:
            continue

        try:
            page = int(raw)
        except ValueError:
            print("  Please enter a page number.")
            continue

        if page in existing_pages:
            confirm = input(f"  Page {page} already anchored at {fmt_time(next(a['seconds'] for a in data['anchors'] if a['page'] == page))}. Overwrite? [y/N] ").strip().lower()
            if confirm != "y":
                continue

        try:
            query = input(f"  Text from p. {page}: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not query:
            continue

        est = estimate_seconds(page, data, duration, total_pages)
        radius = search_radius_seconds(data, duration, total_pages)
        print(f"  Searching around {fmt_time(est)} ± {int(radius / 60)}min...")
        matches = find_matches(query, windows, center=est, radius=radius)

        print()
        for i, (sc, w) in enumerate(matches, 1):
            snippet = w["text"][:220].replace("\n", " ")
            print(f"  [{i}] Score: {sc:.3f}   Time: {fmt_time(w['start'])}  ({w['start']:.1f}s)")
            print(f"      {snippet}")
            print()

        try:
            choice = input("  Select [1/2/3], 'r' to retry, or 's' to skip: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if choice in ("1", "2", "3"):
            chosen = matches[int(choice) - 1][1]
            anchor = {"page": page, "seconds": chosen["start"]}
            data["anchors"] = [a for a in data["anchors"] if a["page"] != page]
            data["anchors"].append(anchor)
            save_data(data, json_path)
            existing_pages.add(page)
            print(f"  Saved: p. {page} = {fmt_time(chosen['start'])}\n")
        elif choice == "r":
            print("  (re-enter text for the same page on the next prompt)\n")
            existing_pages.discard(page)  # allow immediate retry
        else:
            print("  Skipped.\n")


# ─── Chapter mode (Audiobookshelf) ────────────────────────────────────────────

def fetch_abs_chapters(item_id: str) -> dict:
    token = ABS_TOKEN_FILE.read_text().strip()
    req = urllib.request.Request(
        f"{ABS_SERVER}/api/items/{item_id}?expanded=1",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req) as resp:
        media = json.load(resp)["media"]
    return {
        "item_id": item_id,
        "duration": media["duration"],
        "chapters": [
            {"index": i, "start": c["start"], "title": c["title"]}
            for i, c in enumerate(media["chapters"])
        ],
    }


def load_chapters(edition: str, item_id: str, refresh: bool) -> dict:
    """Load chapters from the local cache, fetching from ABS if missing."""
    cache = SCRIPT_DIR / f"{edition}-chapters.json"
    if cache.exists() and not refresh:
        with open(cache, encoding="utf-8") as f:
            return json.load(f)
    print(f"Fetching chapters from Audiobookshelf ({item_id})...")
    data = fetch_abs_chapters(item_id)
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Cached {len(data['chapters'])} chapters to {cache.name}")
    return data


def local_rate(anchors: list[dict], seconds: float, duration: float, total_pages: int) -> float:
    """Seconds per page over the anchors leading up to `seconds`."""
    before = [a for a in anchors if a["seconds"] < seconds][-RATE_LOOKBACK:]
    if len(before) >= 2 and before[-1]["page"] > before[0]["page"]:
        return (before[-1]["seconds"] - before[0]["seconds"]) / (before[-1]["page"] - before[0]["page"])
    return duration / total_pages


def predict_page(seconds: float, anchors: list[dict], duration: float, total_pages: int) -> float:
    """Predict the page for a timestamp. `anchors` must be sorted by seconds."""
    before = [a for a in anchors if a["seconds"] < seconds]
    after = [a for a in anchors if a["seconds"] > seconds]
    if before and after:
        a0, a1 = before[-1], after[0]
        ratio = (seconds - a0["seconds"]) / (a1["seconds"] - a0["seconds"])
        return a0["page"] + ratio * (a1["page"] - a0["page"])
    rate = local_rate(anchors, seconds, duration, total_pages)
    if before:
        a0 = before[-1]
        return a0["page"] + (seconds - a0["seconds"]) / rate
    return 1 + seconds / rate


def tolerance(expected_delta: float) -> float:
    return max(DEVIATION_MIN_PAGES, DEVIATION_FRACTION * expected_delta)


def chapter_session(data: dict, json_path: Path, chapters: list[dict],
                    duration: float, total_pages: int) -> None:
    skipped = set(data.setdefault("skipped_chapters", []))

    def done() -> set:
        return {a["chapter"] for a in data["anchors"] if "chapter" in a} | skipped

    def by_seconds() -> list[dict]:
        return sorted(data["anchors"], key=lambda a: a["seconds"])

    def save() -> None:
        data["skipped_chapters"] = sorted(skipped)
        save_data(data, json_path)

    def next_undone(after: int) -> int:
        return next((c["index"] for c in chapters[after + 1:] if c["index"] not in done()), len(chapters))

    i = next_undone(-1)
    print(f"{len(done())}/{len(chapters)} chapters done. Starting at chapter {i + 1}.")
    print("Enter the page where the chapter's first line appears. Use a decimal for the")
    print("position on the page (212.5 = halfway down p. 212). Enter accepts the prediction.")
    print("Commands: 's' skip, 'b' back, 'l' list, 'q' quit.\n")

    while i < len(chapters):
        ch = chapters[i]
        anchors = [a for a in by_seconds() if a.get("chapter") != i]
        predicted = predict_page(ch["start"], anchors, duration, total_pages)
        prev = next((a for a in reversed(anchors) if a["seconds"] < ch["start"]), None)
        nxt = next((a for a in anchors if a["seconds"] > ch["start"]), None)

        print(f"[{i + 1}/{len(chapters)}] {fmt_time(ch['start'])}  {ch['title']}")
        try:
            raw = input(f"  Page [{predicted:.1f}]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if raw == "q":
            break
        if raw == "l":
            show_anchors(data)
            continue
        if raw == "s":
            skipped.add(i)
            data["anchors"] = [a for a in data["anchors"] if a.get("chapter") != i]
            save()
            i = next_undone(i)
            continue
        if raw == "b":
            i = max(0, i - 1)
            continue

        try:
            page = round(float(raw), 2) if raw else round(predicted, 1)
            if page == int(page):
                page = int(page)
        except ValueError:
            print("  Please enter a page number or command.")
            continue

        if prev and page <= prev["page"]:
            print(f"  Must be after p. {prev['page']} (previous anchor). Use a decimal if it's the same page.")
            continue
        if nxt and page >= nxt["page"]:
            print(f"  Must be before p. {nxt['page']} (next anchor).")
            continue
        if page < 1 or page > total_pages + 1:
            print(f"  Outside 1–{total_pages}.")
            continue

        # Compare with the prediction from surrounding anchors
        if prev:
            expected_delta = predicted - prev["page"]
            if abs(page - predicted) > tolerance(expected_delta):
                rate = (ch["start"] - prev["seconds"]) / (page - prev["page"])
                print(f"  ⚠ Expected about p. {predicted:.1f}; p. {page} implies {rate:.0f}s/page "
                      f"(local rate {local_rate(anchors, ch['start'], duration, total_pages):.0f}s/page).")
                if input("  Keep it? [y/N] ").strip().lower() != "y":
                    continue

        skipped.discard(i)
        data["anchors"] = [a for a in data["anchors"] if a.get("chapter") != i]
        data["anchors"].append({"page": page, "seconds": ch["start"], "chapter": i})
        save()
        if prev:
            rate = (ch["start"] - prev["seconds"]) / (page - prev["page"])
            print(f"  p. {page} = {fmt_time(ch['start'])}  ({page - prev['page']:.1f} pages, {rate:.0f}s/page)\n")
        else:
            print(f"  p. {page} = {fmt_time(ch['start'])}\n")

        i = next_undone(i)

    if i >= len(chapters):
        print("All chapters done. Run with --check to review.")


# ─── Checks ───────────────────────────────────────────────────────────────────

def converter_coefficients(volume: int, src: str, dst: str) -> tuple[float, float] | None:
    """Read a direct slope/intercept pair from converter-core.js."""
    text = CONVERTER_JS.read_text(encoding="utf-8")
    block = re.search(rf"C\[{volume}\] = \{{(.*?)\}};", text, re.S)
    if not block:
        return None
    m = re.search(rf'"{src},{dst}":\s*\[([-\d.e]+),\s*([-\d.e]+)\]', block.group(1))
    return (float(m.group(1)), float(m.group(2))) if m else None


def check(data: dict, edition: str, preset: dict, total_pages: int, chapters: list[dict] | None) -> None:
    anchors = sorted(data["anchors"], key=lambda a: a["seconds"])
    duration = data["duration_seconds"]
    print(f"{edition}: {len(anchors)} anchors")
    if chapters:
        skipped = data.get("skipped_chapters", [])
        print(f"  Chapters: {len(chapters)} total, {len(skipped)} skipped, "
              f"{len(chapters) - len(anchors) - len(skipped)} remaining")

    problems = 0
    for a0, a1 in zip(anchors, anchors[1:]):
        if a1["page"] <= a0["page"]:
            print(f"  ✗ Not increasing: p. {a0['page']} at {fmt_time(a0['seconds'])} → "
                  f"p. {a1['page']} at {fmt_time(a1['seconds'])}")
            problems += 1

    # Leave-one-out: interpolate each anchor from its neighbours
    for a0, a, a1 in zip(anchors, anchors[1:], anchors[2:]):
        ratio = (a["seconds"] - a0["seconds"]) / (a1["seconds"] - a0["seconds"])
        expected = a0["page"] + ratio * (a1["page"] - a0["page"])
        if abs(a["page"] - expected) > tolerance(a1["page"] - a0["page"]):
            label = f" (chapter {a['chapter'] + 1})" if "chapter" in a else ""
            print(f"  ⚠ p. {a['page']} at {fmt_time(a['seconds'])}{label}: "
                  f"neighbours suggest p. {expected:.1f}")
            problems += 1

    if len(anchors) >= 2:
        rate = local_rate(anchors, duration, duration, total_pages)
        last = anchors[-1]
        end = last["page"] + (duration - last["seconds"]) / rate
        overall = (last["seconds"] - anchors[0]["seconds"]) / (last["page"] - anchors[0]["page"])
        print(f"  Overall rate: {overall:.0f}s/page")
        print(f"  Audio ends at about p. {end:.0f} (book has {total_pages} pages)")

    for src, src_page, label in preset.get("landmarks", []):
        coef = converter_coefficients(data["volume"], src, edition)
        if not coef:
            print(f"  No direct {src} → {edition} conversion for landmark '{label}'")
            continue
        page = coef[0] * src_page + coef[1]
        print(f"  Converter: {label} ≈ {edition} p. {page:.1f}. Check this against the book.")

    print("  No problems found." if problems == 0 else f"  {problems} potential problem(s).")


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Build audiobook anchor data for the Proust page converter.")
    parser.add_argument("--list", action="store_true", help="List all anchors and exit")
    parser.add_argument("--delete", type=int, metavar="PAGE", help="Delete anchor for PAGE and exit")
    parser.add_argument("--check", action="store_true", help="Sanity-check anchors and converter data, then exit")
    parser.add_argument("--edition", default=DEFAULT_EDITION, choices=PRESETS,
                        help=f"Edition code (default: {DEFAULT_EDITION})")
    parser.add_argument("--volume", type=int, help="Volume number (default: from preset)")
    parser.add_argument("--narrator", help="Narrator name (default: from preset)")
    parser.add_argument("--total-pages", type=int, dest="total_pages",
                        help="Total pages in this edition (default: from preset)")
    parser.add_argument("--refresh-chapters", action="store_true", dest="refresh",
                        help="Re-fetch chapters from Audiobookshelf (chapter mode)")
    args = parser.parse_args()

    preset = PRESETS[args.edition]
    volume = args.volume or preset["volume"]
    narrator = args.narrator or preset["narrator"]
    total_pages = args.total_pages or preset["total_pages"]
    json_path = TIMINGS_DIR / f"{args.edition}.json"

    if args.list:
        if not json_path.exists():
            print("No data file found.")
            return
        with open(json_path) as f:
            data = json.load(f)
        show_anchors(data)
        return

    if args.delete is not None:
        if not json_path.exists():
            print("No data file found.")
            return
        with open(json_path) as f:
            data = json.load(f)
        before = len(data["anchors"])
        data["anchors"] = [a for a in data["anchors"] if a["page"] != args.delete]
        if len(data["anchors"]) < before:
            save_data(data, json_path)
            print(f"Deleted anchor for page {args.delete}.")
        else:
            print(f"No anchor found for page {args.delete}.")
        return

    if "abs_item" not in preset:
        if args.check:
            with open(json_path) as f:
                check(json.load(f), args.edition, preset, total_pages, None)
            return
        interactive(volume, args.edition, narrator, total_pages)
        return

    abs_data = load_chapters(args.edition, preset["abs_item"], args.refresh)
    data = load_data(json_path, volume, args.edition, narrator, abs_data["duration"])
    if args.check:
        check(data, args.edition, preset, total_pages, abs_data["chapters"])
        return
    print(f"Volume {volume} · Edition: {args.edition} · {narrator}")
    chapter_session(data, json_path, abs_data["chapters"], abs_data["duration"], total_pages)


if __name__ == "__main__":
    main()
