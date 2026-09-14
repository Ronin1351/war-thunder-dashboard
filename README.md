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
