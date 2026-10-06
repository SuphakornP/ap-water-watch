# Third-party notices

The root MIT license applies to original project software and documentation. Dependencies, fonts, geographic databases, remote measurements and trademarks retain their own terms. This file does not relicense third-party material.

| Component | Terms and notice |
| --- | --- |
| AP Thailand logo | Trademark/brand asset; [official-source provenance and usage notice](docs/BRAND-NOTICE.md). Not covered by the project's MIT license. |
| MapLibre GL JS / generated worker modules | BSD-3-Clause; [included notice](public/vendor/maplibre/LICENSE.txt). Regenerated from the installed package by `scripts/prepare-map-worker.mjs`. |
| Three.js | MIT; license included in its npm distribution. |
| shadcn UI / vendored Tailwind stylesheet | MIT; [included stylesheet notice](vendor/shadcn-tailwind-4.13.0.LICENSE.md). Component source originates from shadcn. |
| Sites Vite plugin | MIT, copyright OpenAI; [included notice](build/sites-vite-plugin.LICENSE). |
| IBM Plex Sans Thai | SIL Open Font License 1.1, copyright IBM; [included notice](licenses/IBM-Plex-Sans-Thai-OFL.txt). Distributed through `@fontsource/ibm-plex-sans-thai`. Font software is not covered by this project's MIT license. |
| OpenStreetMap geographic data | ODbL; https://www.openstreetmap.org/copyright . Visible attribution is retained. |
| Thailand province boundaries | Royal Thai Survey Department / OCHA / HDX via prasertcbs/thailand_gis; CC BY-IGO 3.0. [Source, pinned revision and adaptation notice](docs/THAILAND-GIS-NOTICE.md). Administrative reference dated 22 January 2022; not flood extent. |
| OpenFreeMap / OpenMapTiles | Map hosting and vector schema; https://openfreemap.org/ and https://openmaptiles.org/ . Their own service/data terms apply. |
| Other npm packages | Consult each package's license and copyright notices in its distribution. Versions are locked in `package-lock.json`. |

## Measurements and project data

ThaiWater and TMD data are requested at runtime and remain subject to their source terms. This repository grants no additional rights over those datasets. The exact reuse licence of the aggregated ThaiWater endpoints has not been established; do not assume a licence for a separate HII archive covers these endpoints. No third-party station-data dump is committed here.

`data/projects.json` contains six synthetic demonstration points created for this release. They are not AP project locations or an authoritative inventory. The demonstration records and importer code are covered by the root MIT license. Original AP exports, real project inventory, import audit records and proprietary AP font binaries are excluded from this repository.

AP Thailand and other names/marks remain the property of their respective owners. Their use identifies the application's context and does not grant trademark rights or imply official emergency-authority approval. Supply your own authorized brand assets when adapting the application.

Flood Pop is a design reference, not a source of copied application code, 3D assets, or station-data snapshots in this release.
