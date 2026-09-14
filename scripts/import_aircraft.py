"""Build the dashboard aircraft dataset from war_thunder_aircraft.xlsx.

Mirrors the conventions used by import_all.py and import_additional.py: one
JSON document per dataset with meta, the sheets it needs, a field dictionary
and the READ ME rows.
"""
import json
import re
import pathlib
import sys

import openpyxl

ROOT = pathlib.Path(__file__).resolve().parents[1]

SHEETS = {
    "aircraft": "Aircraft",
    "aircraftGuns": "Aircraft x Gun",
    "gunTypes": "Gun Types",
    "gunBelts": "Gun Belts",
    "performance": "Performance by Altitude",
    "aircraftOrdnance": "Aircraft x Ordnance",
    "aircraftSensors": "Aircraft x Sensor",
}



# Gaijin embeds in-game nation-icon codepoints in the unit names it ships in
# units.csv (U+2417, U+2584, private-use U+F059 and friends). 145 ground
# vehicles and 305 aircraft carry one. Strip them once, at import, so search,
# sort and every display path see the same clean string.
ICON_CODEPOINTS = re.compile(r"[\u0000-\u001f\u2400-\u25ff\ue000-\uf8ff]")
NAME_FIELDS = ("Vehicle", "Aircraft", "Weapon", "Main Plate Part", "Weakest Spot Part")


def clean_names(rows):
    for row in rows:
        for field in NAME_FIELDS:
            value = row.get(field)
            if isinstance(value, str) and ICON_CODEPOINTS.search(value):
                row[field] = ICON_CODEPOINTS.sub("", value).strip() or value
    return rows


def sheet_rows(workbook, sheet_name):
    values = list(workbook[sheet_name].values)
    headers = values[0]
    return clean_names([
        dict(zip(headers, row))
        for row in values[1:]
        if any(value is not None for value in row)
    ])


def notes(workbook):
    return [
        list(row)
        for row in workbook["READ ME"].values
        if any(value is not None for value in row)
    ]


def dictionary(workbook):
    return dict(list(workbook["Field Dictionary"].values)[1:])


def main(source):
    workbook = openpyxl.load_workbook(source, data_only=True, read_only=True)
    payload = {
        "meta": {
            "title": "War Thunder Aircraft",
            "snapshot": "2026-09-13",
            "sourceWorkbook": source.name,
            "sourceRepository": "https://github.com/gszabi99/War-Thunder-Datamine",
        }
    }
    for key, sheet in SHEETS.items():
        payload[key] = sheet_rows(workbook, sheet)
        print(f"{key}: {len(payload[key]):,} rows")
    payload["dictionary"] = dictionary(workbook)
    payload["readme"] = notes(workbook)

    destination = ROOT / "data" / "aircraft.json"
    destination.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str),
        encoding="utf-8",
    )
    print(f"{destination.name}: {destination.stat().st_size:,} bytes")


if __name__ == "__main__":
    path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else \
        pathlib.Path("/mnt/user-data/outputs/war_thunder_aircraft.xlsx")
    main(path)
