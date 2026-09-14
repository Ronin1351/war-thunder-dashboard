"""Strip Gaijin's in-game nation-icon codepoints from every generated dataset.

The importers now clean names on the way out, but the JSON already in data/
was written before that. This applies the same rule in place so you do not
need the source workbooks to fix an existing checkout. Safe to re-run.
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

ICON_CODEPOINTS = re.compile(r"[\u0000-\u001f\u2400-\u25ff\ue000-\uf8ff]")
NAME_FIELDS = ("Vehicle", "Aircraft", "Weapon", "Platform", "Main Plate Part",
               "Weakest Spot Part", "Lowest-BR Carrier", "Highest-BR Carrier",
               "Carrier Aircraft (sample)", "Example Platforms", "Vehicles (sample)")


def scrub(node, counter):
    if isinstance(node, dict):
        for key, value in node.items():
            if key in NAME_FIELDS and isinstance(value, str) and ICON_CODEPOINTS.search(value):
                cleaned = ICON_CODEPOINTS.sub("", value).strip()
                if cleaned:
                    node[key] = cleaned
                    counter[0] += 1
            else:
                scrub(value, counter)
    elif isinstance(node, list):
        for item in node:
            scrub(item, counter)


def main():
    files = sorted(DATA.glob("*.json")) + sorted((DATA / "armour_plates").glob("*.json"))
    total = 0
    for path in files:
        payload = json.loads(path.read_text(encoding="utf-8"))
        counter = [0]
        scrub(payload, counter)
        if counter[0]:
            path.write_text(
                json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str),
                encoding="utf-8")
            print(f"{path.relative_to(ROOT)}: {counter[0]} names cleaned")
        total += counter[0]
    print(f"\n{total} names cleaned across {len(files)} files")


if __name__ == "__main__":
    main()
