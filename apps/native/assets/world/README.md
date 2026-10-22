# World map for Trip Reveal

The globe in Trip Reveal (`src/lib/trip-globe.ts`) draws from these two files.
Both come from [world-atlas](https://github.com/topojson/world-atlas) 2.0.2,
which is built from [Natural Earth](https://www.naturalearthdata.com/) (public
domain).

- `land-110m.json`: `land-110m.json` as published, drawn while the globe spins.
- `countries-50m.json`: `countries-50m.json` with country names removed,
  simplified with `topojson-simplify` (`presimplify`, then `simplify` and
  `filterWeight` at `quantile(0.3)`) and quantized to 1e4. Drawn once the globe
  zooms into a city, and used to find the country to light up.

Prettier skips both files (`.prettierignore`), since formatting would put
every coordinate on its own line.
