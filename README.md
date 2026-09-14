# Ordnance — Iran Squadron database v2.2.0

A responsive air, ground and infantry dashboard built from the supplied War Thunder data workbooks. Version 2.2.0 adds ground armor, air and ground sensors, and configurable Directory columns.

## Run on Windows

Install Node.js 20 or newer. Extract this folder, open PowerShell in it, then run:

```powershell
npm run dev
```

Open http://localhost:3000. No npm dependencies or API keys are required. Serve the app over HTTP, rather than opening index.html directly.

## Deploy to Vercel

1. Upload the extracted project contents to a GitHub repository. Keep `package.json`, `vercel.json` and `index.html` at the repository root.
2. In Vercel, choose Add New → Project and import that repository.
3. Use Framework Preset: Other. Root Directory: the folder containing `package.json` (leave the default if it is at the repository root).
4. Build Command: `npm run build`. Output Directory: `dist`. No environment variables are needed.
5. Select Deploy.

The included `vercel.json` already declares the build command and output folder. The package has no external dependencies. You can also deploy this folder with the Vercel CLI using `vercel --prod` after signing in.

This deliverable is prepared for Vercel, but has not been deployed to your account.

## Use the dashboard

- Switch among Guided Weapons, Ground Forces and Infantry from the top navigation.
- Air filters cover origin, carrier country, category, guidance, game mode and BR.
- Ground filters cover nation, class, rank, game mode and BR. Vehicle details include recommended loadouts, guns and available ammunition.
- Ground Directory and detail views include armor ratings, weak spots, module exposure and on-demand plate details.
- Air carrier and Ground vehicle sensor views include radar reach, look-down capability, TWS, IFF, radar modes, scan patterns and signal processing when supplied.
- Infantry filters cover weapon category and chambering. Details include cartridges, magazines and all available weapon fields.
- Each section supports search, category shortcuts, sorting, pagination and an advanced specification filter.
- Search uses visible names and clean IDs. It ignores internal file extensions and hidden relationship IDs, then ranks exact and prefix matches first.
- Open Settings to select and reorder up to 10 Directory fields independently for Air, Ground and Infantry. The name field remains required. Preferences are stored in the browser.
- Use Settings or the sun and moon button to switch light and dark modes. The preference is stored in the browser.
- Ground search uses vehicle names and vehicle IDs. Internal gun identifiers do not create unrelated matches.

## Data semantics

- Air data includes 432 guided weapons, 2,281 carrier links and 3,044 launch-envelope records.
- Ground data includes 1,237 vehicles, 2,642 vehicle-gun links, 9,485 vehicle-ammunition links and 1,201 recommended loadouts.
- Armor data includes 1,248 unique vehicle summaries, 5,948 face and weak-spot records, 38,913 plate records and 4,996 module-exposure records. All 1,237 Directory vehicles match an armor summary.
- Sensor data includes 458 unique sensor definitions and 2,014 platform links. It matches 365 Air carrier aircraft and 188 Ground Directory vehicles.
- Light, medium, heavy, tank-destroyer, SPAA and ATGM roles come from the official War Thunder Wiki role collections. Vehicles missing from the collections remain marked as unclassified within their workbook class.
- Infantry data includes 81 weapons, 97 cartridges, 11 grenades, 147 weapon-cartridge links and 93 weapon-magazine links.
- `File` is the stable weapon identifier. Variants remain separate entries, even when display names match.
- Origin comes from the weapon filename prefix. Carrier country is the aircraft's nation. The interface displays the source labels `Usa` and `Ussr` as USA and USSR in the country selector.
- BR belongs to aircraft. Country, aircraft and BR conditions must match the same carrier link. Selecting only a game mode does not exclude weapons without a carrier or BR.
- Weapon rows show the median and minimum–maximum BR across all known carriers in the selected mode. Their “matching” count reflects current carrier filters. Summary cards use matching carrier links only.
- A BR range uses actual carrier ratings, not an assumed continuous interval between minimum and maximum. Unknown ratings do not pass an active BR range.
- Empty specification values remain null and display as an em dash. Zero is retained as zero.
- Armor color and letter codes are: Paper red/P, Weak orange/W, Contested yellow/C, May be strong green/S?, Layered blue/L and Variable thickness purple/V. The text label always remains visible.
- Armor thickness values are flat-plate values. They do not include impact angle. Layered and variable armor remains explicitly unrated.
- Hard maximum range is a game cut-off, not an effective firing distance. Launch envelopes preserve the source's altitude, speed and case labels without inventing a tactical interpretation.
- Envelope records join the exact file stem found in the source's bracketed identifier. Variants do not inherit another file's envelope without evidence.
- The dedicated Ground Forces dataset supplies the ground-vehicle relationships. Air weapon rows still do not infer a ground launcher from a missing aircraft reference.
- This is an offline game-data snapshot dated 2026-09-13. The app does not claim current live statistics or real-world performance. See Dataset & sources for the complete workbook caveats.

## Update the JSON

Re-import updated workbooks with the same schemas:

```powershell
python -m pip install openpyxl
python scripts/import_workbook.py "C:\path\war_thunder_guided_weapons.xlsx"
python scripts/import_all.py "C:\path\war_thunder_ground_vehicles.xlsx" "C:\path\war_thunder_infantry_weapons.xlsx"
python scripts/import_additional.py "C:\path\war_thunder_ground_armour.xlsx" "C:\path\war_thunder_sensors.xlsx"
python scripts/import_ground_roles.py
npm run build
```

Commit the updated JSON and redeploy. Python and openpyxl are needed only for spreadsheet re-import, not for running or deploying the app. Data is publicly downloadable when the website is public.

## Validation

```powershell
npm test
npm run build
```

The build validates and embeds the Directory datasets plus armor and sensor summaries. Armor plate files are copied separately and loaded only when a Ground detail page opens.

Tests cover source counts and joins, same-carrier filtering, missing BR, median calculation, numeric zero versus missing data, armor coverage, sensor integrity, expected platform matches and the primary UI flows.

## Files

- `index.html`, `styles.css`, `app.js`: interface and interactions.
- `data/weapons.json`, `data/ground.json`, `data/ground_roles.json`, `data/infantry.json`, `data/armour.json`, `data/sensors.json`: source datasets embedded into `dist/app.js`.
- `data/armour_plates/`: per-vehicle plate details loaded on demand.
- `server.js`: dependency-free local preview server.
- `build.js`: builds the static `dist` folder.
- `vercel.json`: deployment settings.
- `scripts/import_workbook.py`, `scripts/import_all.py`, `scripts/import_additional.py`, `scripts/import_ground_roles.py`: repeatable data imports.
- `tests/filters.test.js`: semantic checks.

© 2025 Kevin Shokrollahi – All Rights Reserved
