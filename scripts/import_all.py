"""Build the three dashboard datasets from the supplied Excel workbooks."""
import json
import re
import pathlib
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


def write_json(filename, payload):
    destination = ROOT / "data" / filename
    destination.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str),
        encoding="utf-8",
    )
    print(f"{destination.name}: {destination.stat().st_size:,} bytes")


def main():
    ground_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else UPLOAD / "war_thunder_ground_vehicles.xlsx"
    infantry_path = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else UPLOAD / "war_thunder_infantry_weapons.xlsx"

    ground_book = openpyxl.load_workbook(ground_path, data_only=True, read_only=True)
    infantry_book = openpyxl.load_workbook(infantry_path, data_only=True, read_only=True)

    ground = {
        "meta": {"title": "Ground Forces", "snapshot": "2026-09-13", "sourceWorkbook": ground_path.name},
        "vehicles": sheet_rows(ground_book, "Vehicles"),
        "loadoutGuide": sheet_rows(ground_book, "Loadout Guide"),
        "loadoutDetail": sheet_rows(ground_book, "Loadout Detail"),
        "guns": sheet_rows(ground_book, "Guns"),
        "ammunition": sheet_rows(ground_book, "Ammunition"),
        "vehicleGuns": sheet_rows(ground_book, "Vehicle x Gun"),
        "vehicleAmmo": sheet_rows(ground_book, "Vehicle x Ammo"),
        "dictionary": dictionary(ground_book),
        "readme": notes(ground_book),
    }
    infantry = {
        "meta": {"title": "Infantry Weapons", "snapshot": "2026-09-13", "sourceWorkbook": infantry_path.name},
        "weapons": sheet_rows(infantry_book, "All Weapons"),
        "cartridges": sheet_rows(infantry_book, "Cartridges"),
        "grenades": sheet_rows(infantry_book, "Grenades"),
        "weaponCartridges": sheet_rows(infantry_book, "Weapon x Cartridge"),
        "weaponMagazines": sheet_rows(infantry_book, "Weapon x Magazine"),
        "dictionary": dictionary(infantry_book),
        "readme": notes(infantry_book),
    }

    assert len(ground["vehicles"]) == 1237
    assert len(ground["vehicleGuns"]) == 2642
    assert len(ground["vehicleAmmo"]) == 9485
    assert len(infantry["weapons"]) == 81
    assert len(infantry["weaponCartridges"]) == 147
    write_json("ground.json", ground)
    write_json("infantry.json", infantry)


if __name__ == "__main__":
    main()
