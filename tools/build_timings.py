#!/usr/bin/env python3
"""
build_timings.py — Interactively build audiobook anchor data for the Proust page converter.

Usage:
    python build_timings.py              # Default: Volume 2, Within a Budding Grove (bg_v)
    python build_timings.py --list       # Show all anchors in the current data file
    python build_timings.py --delete N  # Remove anchor for page N
    python build_timings.py --total-pages 480  # Override total page count for position estimate

The script fuzzy-matches text you type from the book against the ASR transcript,
finds the corresponding timestamp, and saves it to timings/bg_v.json.
It regenerates timings.js from all timings/*.json files after each save.

Position estimation: The script uses the page number (relative to total pages) to estimate
where in the transcript to search, then restricts the search to a window around that estimate.
Existing anchors give increasingly precise estimates as you add more data.
"""

import argparse
import difflib
import json
import re
import sys
from pathlib import Path

# ─── Configuration ────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
TRANSCRIPT_FILE = SCRIPT_DIR / "budding-grove.json"
TIMINGS_DIR = SCRIPT_DIR / "timings"
OUTPUT_JS = SCRIPT_DIR.parent / "timings.js"

# Default target (Volume 2, Vintage edition)
DEFAULT_VOLUME = 2
DEFAULT_EDITION = "bg_v"
DEFAULT_NARRATOR = "Neville Jason"

WINDOW_SIZE = 10      # Number of consecutive segments to concatenate for matching
DEFAULT_TOTAL_PAGES = 500  # Rough page count for bg_v; overridable with --total-pages
SEARCH_PAGES = 25     # Half-width of search window, in pages


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
            "anchors": t["anchors"],
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


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Build audiobook anchor data for the Proust page converter.")
    parser.add_argument("--list", action="store_true", help="List all anchors and exit")
    parser.add_argument("--delete", type=int, metavar="PAGE", help="Delete anchor for PAGE and exit")
    parser.add_argument("--volume", type=int, default=DEFAULT_VOLUME, help="Volume number (default: 2)")
    parser.add_argument("--edition", default=DEFAULT_EDITION, help="Edition code (default: bg_v)")
    parser.add_argument("--narrator", default=DEFAULT_NARRATOR, help="Narrator name")
    parser.add_argument("--total-pages", type=int, default=DEFAULT_TOTAL_PAGES,
                        dest="total_pages",
                        help=f"Approximate total pages in this edition (default: {DEFAULT_TOTAL_PAGES})")
    args = parser.parse_args()

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

    interactive(args.volume, args.edition, args.narrator, args.total_pages)


if __name__ == "__main__":
    main()
