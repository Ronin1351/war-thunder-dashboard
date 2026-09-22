# War Thunder Brief

One screen per vehicle: what ammunition to load, where they shoot you, and what
the data cannot tell you.

A companion to the full directory, not a replacement. Where the directory is
built for browsing and filtering, this answers three questions per vehicle and
gets out of the way.

## Run it

```
npm install     # no dependencies, this just creates the lockfile
npm test        # 27 tests
npm run dev     # build + serve on http://localhost:3000
```

`/` serves the Brief. `/index.html` serves the full directory.

## What is in here

| Route | What it does |
|---|---|
| `/` | Brief - pick a vehicle or aircraft, get three answers |
| `/index.html` | Full directory - filter, sort, compare, export |

Datasets are fetched per directory rather than bundled, so opening the air
view does not download ground data. Armour plates are fetched per vehicle.

## Data honesty

Every gap is stated rather than filled:

- **Armour has no impact angles.** They live in the 3D mesh, not the files.
  Sloped vehicles are systematically under-rated. 233 vehicles with composite,
  spaced or ERA armour are not rated at all rather than rated wrongly.
- **Penetration is partly estimated.** Figures above the highest exact value in
  the data are withheld, and a measurement always outranks a guess.
- **751 of 1,440 aircraft have no flight performance**, and none above BR 10.0.
  Those cells are blank, never estimated.

Tappable grey chips in the Brief explain each gap in plain English.

## Source

Built from the [gszabi99 War Thunder datamine](https://github.com/gszabi99/War-Thunder-Datamine),
snapshot 2026-09-13. Game values, not real-world values.

## Saved lists

`lists.html` holds named vehicle lists, an owned flag per vehicle, and a ranking by how many lists each vehicle is in.

Every change is saved to the browser first, then to the private `Ordnance Lists` table through an Appwrite Function about 2 seconds later. The cloud copy protects the lists; the browser copy also keeps the page usable while offline.

One-time setup in Appwrite:

1. Create the `Ordnance Lists` table in database `map_guide` with required `payload` (text) and `revision` (integer) columns.
2. Deploy `appwrite/functions/ordnance-lists` as a Node.js Function and grant only row read/write scopes.
3. Add the Function variable `LISTS_PASSPHRASE` (20+ characters). This build uses `https://ordnance-lists-sync.sgp.appwrite.run` in the `lists-api` meta tag in `lists.html`.
4. Open `/lists.html` and enter the passphrase once per device.

Protection:

- Two devices editing at once are merged; a stale save is rejected and merged, never overwritten.
- The first save of each day keeps the previous day's final state as chunked backup rows. **Backups** on the page adds a day's lists back in without removing anything current.
- **Export file** downloads a JSON copy; **Import file** adds one back in.

Large documents are split into rows below Appwrite's text-column limit. Saves are batched; if Appwrite is unavailable, lists remain on the current device and Export still works.
