"""Build the dashboard armour and sensor datasets from the supplied workbooks."""
import json
import pathlib
import re
import shutil
import sys

import openpyxl


ROOT = pathlib.Path(__file__).resolve().parents[1]
UPLOAD = ROOT.parent / "upload"



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
    return clean_names([dict(zip(headers, row)) for row in values[1:] if any(value is not None for value in row)])


def notes(workbook):
    return [list(row) for row in workbook["READ ME"].values if any(value is not None for value in row)]


def dictionary(workbook):
    return dict(list(workbook["Field Dictionary"].values)[1:])


def best_vehicle_summaries(rows):
    """Resolve duplicate IDs by retaining the row with the most usable armour evidence."""
    selected = {}
    for row in rows:
        vehicle_id = row.get("Vehicle ID")
        if not vehicle_id:
            continue
        populated = sum(value is not None and value != "" for value in row.values())
        armour_parts = row.get("Armour Parts") or 0
        score = (populated, armour_parts)
        if vehicle_id not in selected or score > selected[vehicle_id][0]:
            selected[vehicle_id] = (score, row)
    return [item[1] for item in selected.values()]


def write_json(filename, payload):
    destination = ROOT / "data" / filename
    destination.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str),
        encoding="utf-8",
    )
    print(f"{destination.name}: {destination.stat().st_size:,} bytes")


def write_armour_plates(rows):
    destination = ROOT / "data" / "armour_plates"
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    grouped = {}
    for row in rows:
        vehicle_id = row.get("Vehicle ID")
        if not vehicle_id:
            continue
        if not re.fullmatch(r"[A-Za-z0-9_-]+", str(vehicle_id)):
            raise ValueError(f"Unsafe Vehicle ID for plate filename: {vehicle_id}")
        grouped.setdefault(vehicle_id, []).append(row)
    for vehicle_id, vehicle_rows in grouped.items():
        (destination / f"{vehicle_id}.json").write_text(
            json.dumps(vehicle_rows, ensure_ascii=False, separators=(",", ":"), default=str),
            encoding="utf-8",
        )
    print(f"armour_plates: {len(grouped):,} vehicle files")


def main():
    armour_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else UPLOAD / "war_thunder_ground_armour.xlsx"
    sensors_path = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else UPLOAD / "war_thunder_sensors.xlsx"

    armour_book = openpyxl.load_workbook(armour_path, data_only=True, read_only=True)
    sensors_book = openpyxl.load_workbook(sensors_path, data_only=True, read_only=True)

    raw_summaries = sheet_rows(armour_book, "Vehicle Summary")
    armour_plates = sheet_rows(armour_book, "Armour Plates")
    armour = {
        "meta": {
            "title": "Ground Vehicle Armour",
            "snapshot": "2026-09-13",
            "sourceWorkbook": armour_path.name,
            "duplicatePolicy": "For duplicate Vehicle IDs, retain the row with the most populated armour evidence, then the highest Armour Parts count.",
        },
        "vehicleSummary": best_vehicle_summaries(raw_summaries),
        "weakspotGuide": sheet_rows(armour_book, "Weakspot Guide"),
        "moduleExposure": sheet_rows(armour_book, "Module Exposure"),
        "dictionary": dictionary(armour_book),
        "readme": notes(armour_book),
    }
    sensors = {
        "meta": {
            "title": "Vehicle Sensors",
            "snapshot": "2026-09-13",
            "sourceWorkbook": sensors_path.name,
        },
        "sensorGuide": sheet_rows(sensors_book, "Sensor Guide"),
        "radarModes": sheet_rows(sensors_book, "Radar Modes"),
        "scanPatterns": sheet_rows(sensors_book, "Scan Patterns"),
        "signalProcessing": sheet_rows(sensors_book, "Signal Processing"),
        "platformSensors": sheet_rows(sensors_book, "Platform x Sensor"),
        "dictionary": dictionary(sensors_book),
        "readme": notes(sensors_book),
    }

    assert len(raw_summaries) == 1253
    assert len(armour["vehicleSummary"]) == 1248
    assert len(armour["weakspotGuide"]) == 5948
    assert len(armour_plates) == 38913
    assert len(armour["moduleExposure"]) == 4996
    assert len(sensors["sensorGuide"]) == 458
    assert len(sensors["radarModes"]) == 644
    assert len(sensors["scanPatterns"]) == 2017
    assert len(sensors["signalProcessing"]) == 1220
    assert len(sensors["platformSensors"]) == 2014

    write_json("armour.json", armour)
    write_json("sensors.json", sensors)
    write_armour_plates(armour_plates)


if __name__ == "__main__":
    main()
