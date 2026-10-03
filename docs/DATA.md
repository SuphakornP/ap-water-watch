# Data and importing

## Included demo

The six `demo-*` records in `data/projects.json` are synthetic locations around Bangkok. They are not AP project records. `data/release.json` sets `demo: true`, enabling the visible demo banner. Station values are fetched from real upstream services; no demo measurements are substituted if an API fails.

## Import an authorized CSV locally

Python 3.10+ is sufficient; the importer uses only the standard library.

Required CSV columns:

| Column | Meaning |
| --- | --- |
| `code` | Source project code |
| `slug` | Stable URL-safe identifier |
| `title` | Project display name |
| `location_formatted_address` | Address used for conservative province matching |
| `location_lat` | Latitude |
| `location_lng` | Longitude |
| `project_type_translation_id_status` | Source sales status, retained without reinterpretation |

```sh
mkdir -p data/local
# Place your authorized CSV at data/local/projects.csv.
python3 scripts/prepare-projects.py --source data/local/projects.csv --output-dir data
```

Review `data/project-import.json` for invalid coordinates, ambiguous provinces, duplicate identifiers and shared coordinates. The importer preserves rows and retains unknown geography as null; it does not geocode or invent a province. `zone` is address-derived geography, not an AP operational team assignment. It recognizes the original AP brand prefixes; other names use the display category `ไม่ระบุ` and an `unknown_brand` audit entry. Adapt the brand list for a different inventory.

For local operational use, set `demo` to `false` in `data/release.json` after validating the imported records. Rebuild the application because project JSON is compiled into the client. Keep real project data in a private repository; restoring the synthetic dataset and `demo: true` is required before contributing to this public repo.

## Normalized record

```json
{
  "id": "demo-example",
  "slug": "example",
  "name": "Example location",
  "code": "DEMO-01",
  "brand": "DEMO",
  "lat": 13.725,
  "lng": 100.521,
  "address": "Demonstration point",
  "province": "กรุงเทพมหานคร",
  "region": "กรุงเทพฯ และปริมณฑล",
  "zone": "พื้นที่สาธิต",
  "salesStatus": "demo"
}
```

## Upstream services

- Water: `https://api-v3.thaiwater.net/api/v1/thaiwater30/provinces/waterlevel`
- Rain: `https://api-v3.thaiwater.net/api/v1/thaiwater30/provinces/rain24?include_zero=1`
- TMD CAP index: `https://www5.tmd.go.th/api/xml/CAP`
- Map vector source: `https://tiles.openfreemap.org/planet`

Each measurement preserves its observation time. Only public Actual CAP Alert/Update messages within their validity window are shown. Expired or cancelled latest bulletins are not replaced by an older warning. The single bulletin is not an exhaustive official-warning inventory.

Provider availability and reuse terms may change. See THIRD_PARTY_NOTICES.md before redistribution or operational deployment.
