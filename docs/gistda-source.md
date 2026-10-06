# GISTDA seven-day flood extent

The optional map overlay shows the retrospective GISTDA flood extent used by the official ThaiWater map. It is a separate raster layer beneath roads, labels and monitoring markers. It does not enter the project risk calculation, infer flood depth or perform a project-boundary intersection.

## Verified source

- [Official GISTDA flood dataset catalog](https://opendata.gistda.or.th/dataset/flood-disaster-data)
- [Official GISTDA services documentation](https://disaster.gistda.or.th/v2/services/open-api)
- [ThaiWater reference map](https://twa.thaiwater.net/th/map/floodplain/water-level-river)

On 6 October 2026, enabling **พื้นที่น้ำท่วมในรอบ 7 วัน (GISTDA)** in ThaiWater requested public image tiles from `https://twa.thaiwater.net/api/gistda/flood-7days`, with `bbox`, `width=256`, `height=256` and `srs=EPSG:3857`. An observed sample returned a valid transparent 256 by 256 PNG with cyan detections (45,805 bytes). Both Node/curl and the local Worker runtime successfully retrieved this source with HTTPS certificate verification enabled.

The application uses this public service without credentials. The separate GISTDA API gateway requires a registered API key; no third-party example or website key is copied into this application. Attribution remains **GISTDA · ผ่าน ThaiWater** with links to both sources. The catalog does not specify a license; no additional redistribution license is asserted and imagery is not packaged into source control.

## Meaning and time

The documented product is detection over the latest seven-day source window, not a seven-day forecast or proof of conditions at the time a visitor opens the map. The image response exposes no acquisition date range or latest analysis timestamp. Its HTTP `Date` is a delivery timestamp. Observed cache headers were `public, max-age=3600, s-maxage=86400`, so upstream edge imagery can be cached for up to 24 hours. The UI explicitly marks survey time as unavailable instead of substituting retrieval time.

Transparent pixels may reflect coverage, detection limitations, timing or an absence of detected flood. They do not establish that a location is flood-free. A cyan pixel does not establish current depth, road passability or inundation within a project's legal boundary. Compare the image with station readings, local reports and official guidance.

## Application transport

The map requests XYZ tiles from `/api/flood-tiles/{z}/{x}/{y}`. The server validates tile coordinates and converts them to Web Mercator bounds for the fixed official endpoint. Raster size is 256 pixels; the display uses source zooms 0 through 14 with overzoom for closer views, restricted to Thailand's bounding area. Overzoom does not add source resolution.

The proxy accepts only bounded PNG responses with the expected dimensions. Errors remain errors rather than synthetic transparent tiles. Successful tiles use a bounded short-lived cache, while failures are not cached. The overlay is fetched only when enabled; errors and retries are separate from base-map health. Public and deployed trees share this code, while the public tree retains synthetic project data.
