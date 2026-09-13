"""Refresh ground vehicle roles from official War Thunder Wiki collections."""
import json
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
ROLE_PAGES = {
    "medium_tank": "Medium tank",
    "light_tank": "Light tank",
    "tank_destroyer": "Tank destroyer",
    "spaa": "SPAA",
    "heavy_tank": "Heavy tank",
    "missile_tank": "ATGM vehicle",
}

def main():
    roles = {}
    for slug, label in ROLE_PAGES.items():
        url = f"https://wiki.warthunder.com/collections/game_roles/{slug}"
        request = urllib.request.Request(url, headers={"User-Agent": "Iran-Squadran-Ordnance/2.1"})
        with urllib.request.urlopen(request, timeout=30) as response:
            page = response.read().decode("utf-8")
        vehicle_ids = set(re.findall(r'href="/unit/([a-zA-Z0-9_]+)"', page))
        for vehicle_id in vehicle_ids:
            roles.setdefault(vehicle_id, []).append(label)
        print(f"{label}: {len(vehicle_ids)}")
    payload = {"source": "Official War Thunder Wiki game-role collections", "sourceUrl": "https://wiki.warthunder.com/collections/game_roles", "roles": roles}
    destination = ROOT / "data" / "ground_roles.json"
    destination.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Saved {len(roles)} vehicle role mappings")

if __name__ == "__main__":
    main()
