# Ordnance — War Thunder guided weapon dashboard

A responsive, static dashboard built from `war_thunder_guided_weapons.xlsx`.

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

- Search weapon names, aircraft names/IDs, guidance, categories, origin or weapon file IDs. All space-separated search terms must match somewhere in the searchable record.
- Combine weapon origin, carrier country, aircraft, game mode, BR range, guidance, Fox class, aircraft-reference status and variants.
- Use category buttons to narrow the weapon family.
- Use “Filter any specification” for one additional condition on any of the 132 source fields, including numeric limits and missing-value checks.
- Click a weapon name or its arrow to see all fields, field definitions, carrier aircraft and exact-file launch-envelope records.
- Sort results by name, carrier median BR, maximum overload, hard maximum range or mass. Missing values sort last.
- Remove active filter chips individually or reset all filters. On mobile, use Show filters above the dashboard.

## Data semantics

- The JSON includes all 432 master weapon entries, 2,281 carrier links, 3,044 launch-envelope records, field definitions and source notes. Category sheets duplicate master records and are not imported again.
- `File` is the stable weapon identifier. Variants remain separate entries, even when display names match.
- Origin comes from the weapon filename prefix. Carrier country is the aircraft's nation. The interface displays the source labels `Usa` and `Ussr` as USA and USSR in the country selector.
- BR belongs to aircraft. Country, aircraft and BR conditions must match the same carrier link. Selecting only a game mode does not exclude weapons without a carrier or BR.
- Weapon rows show the median and minimum–maximum BR across all known carriers in the selected mode. Their “matching” count reflects current carrier filters. Summary cards use matching carrier links only.
- A BR range uses actual carrier ratings, not an assumed continuous interval between minimum and maximum. Unknown ratings do not pass an active BR range.
- Empty specification values remain null and display as an em dash. Zero is retained as zero.
- Hard maximum range is a game cut-off, not an effective firing distance. Launch envelopes preserve the source's altitude, speed and case labels without inventing a tactical interpretation.
- Envelope records join the exact file stem found in the source's bracketed identifier. Variants do not inherit another file's envelope without evidence.
- No aircraft reference is not evidence of a ground launcher. No ground-vehicle cross-reference is included.
- This is an offline game-data snapshot dated 2026-09-13. The app does not claim current live statistics or real-world performance. See Dataset & sources for the complete workbook caveats.

## Update the JSON

Edit `data/weapons.json` directly, preserving field names and joins, or re-import an updated workbook with the same schema:

```powershell
python -m pip install openpyxl
python scripts/import_workbook.py "C:\path\war_thunder_guided_weapons.xlsx"
npm run build
```

Commit the updated JSON and redeploy. Python and openpyxl are needed only for spreadsheet re-import, not for running or deploying the app. Data is publicly downloadable when the website is public.

## Validation

```powershell
npm test
npm run build
```

The build and five filtering tests pass. Exported weapon, carrier and launch-envelope values were independently checked against the workbook. Browser visual verification could not run because the browser download timed out.

Tests cover source counts and joins, same-carrier filtering, missing BR, median calculation, numeric zero versus missing data, and a real dataset country/BR query.

## Files

- `index.html`, `styles.css`, `app.js`: interface and interactions.
- `logic.js`: filtering and BR summaries.
- `data/weapons.json`: complete source dataset. The build embeds it into `dist/app.js`, so the deployed app does not make a separate JSON request.
- `server.js`: dependency-free local preview server.
- `build.js`: builds the static `dist` folder.
- `vercel.json`: deployment settings.
- `scripts/import_workbook.py`: repeatable workbook conversion.
- `tests/filters.test.js`: semantic checks.

© 2025 Kevin Shokrollahi – All Rights Reserved
