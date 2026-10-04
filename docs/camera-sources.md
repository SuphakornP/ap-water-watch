# Nearby public cameras

Verified 4 October 2026 (Asia/Bangkok). This catalogue locates published camera positions; it is not a count of working cameras. All current sources are **link-only** because image embedding/redistribution permission has not been verified. No camera pictures, streams, generated images, login credentials or camera-device addresses are shipped with this application.

## Sources actually inspected

| Source | Included records | Actual coverage and access | Display rights and availability |
| --- | ---: | --- | --- |
| [BMA Traffic official agency](https://traffic.bangkok.go.th/index.html), [public directory](http://www.bmatraffic.com/index.aspx) | 511 | Selected Bangkok traffic locations, latitude 13.6662–13.95072 / longitude 100.33515–100.7185. Exact per-camera public viewer links. | Website reserves rights; no embedding grant. Four sampled image requests returned empty responses. Viewer reachability does not establish online status. |
| [ThaiWater camera viewer](https://www.thaiwater.net/water/cctv), [official API](https://api-v3.thaiwater.net/api/v1/thaiwater30/analyst/cctv) | 100 of 106 in inspected payload | Water-monitoring locations in 47 named provinces; 85 active catalogue records, 15 marked inactive; 6 video-only rows excluded. Dynamic API, so counts can change. Viewer supports name search, not per-camera deep links. | Viewer reserves rights. `is_active` is catalogue activation, not proof the device works. No image capture time in payload. |
| [Royal Irrigation Department CCTV](https://swocpr.rid.go.th/cctv/), [CAM501](https://swocpr.rid.go.th/cctv/station_data.php?cam=501), [CAM508](https://swocpr.rid.go.th/cctv/station_data.php?cam=508) | 10 | Published canal/pumping station coordinates, CAM501–510. Open the Camera tab on each station page. Provinces omitted because the station pages do not state them. | Real pictures verified at CAM501 and CAM508 without login; no redistribution grant located. Other pages can have old data or no picture; CAM505 had no image path. |

The combined inspected catalogue has **621 records**, including inactive and availability-unknown records. This is neither nationwide visual coverage nor confirmation that pictures exist for every project. Proximity uses straight-line distance, including points across province borders. Public demo project coordinates remain synthetic and do not identify AP properties.

## Investigated but not added

- [BMA Open Data](https://data.bangkok.go.th/dataset/bma-cctv): 238 CSV rows; metadata says `License not specified`, `isopen=false`. Resource date 2023-10-05, metadata date 2024-06-07. Its alphanumeric DVR/camera IDs do not reliably join to current numeric viewer IDs. The live viewer's factual coordinates and exact source links are used instead.
- [Highway Traffic](https://highwaytraffic.go.th/DOHWeb/Home.aspx): 210 published traffic locations; sampled `GetCameraInfo` failed. A dashboard clock uses browser time and cannot establish capture time. No verified still-image reuse contract.
- [Bangkok Drainage CCTV](https://dds.bangkok.go.th/cctv.php): current response is the agency homepage with legacy CCTV links commented out; current feed/picture availability could not be established.
- DWR [image dataset](https://data.go.th/dataset/gdpublish-dwr_21_04) and [coordinate dataset](https://data.go.th/th/dataset/gdpublish-dwr_22_01): both say `License not specified`. Public listing does not grant permission to redistribute images.

## Payload and provenance

BMA directory publishes `locations` rows containing numeric ID, Thai/English name, viewing direction, latitude and longitude. Only these public factual fields plus attribution and exact `PlayVideo.aspx?ID=` links were retained. Internal addresses, client keys and raw HTML were discarded. Invalid camera 1712 has longitude equal to its latitude and is excluded without guessing a correction. `data/cameras-bma.json` records the check time. It is a checked static catalogue; the refresh button does not rescrape the legacy website.

ThaiWater response is `{result: "OK", data: [...]}`. Retained fields are `id`, `title`, `description`, numeric `lat`/`long`, province, agency and `is_active`. Legacy Flash/QuickTime embed HTML, raw device URLs, dynamic DNS endpoints and video-only rows are not forwarded. Every link points to the normal public viewer. Inactive records remain visible with a deactivation label; they are not described as confirmed device failures.

RID coordinates come from each public station page's map marker. Source pages and check timestamps are retained in `data/cameras-rid.json`. Camera 508 provided a useful timestamp cross-check: image overlay read **22:37:58**, while the page's data time and image filename read **22:40:03** on 4 October 2026. Page date, filename date, HTTP Date, Last-Modified and retrieval time therefore are not substituted for capture time.

## Runtime and caching

- The catalogue is requested only after selecting a project; the initial dashboard never requests camera pictures.
- Default camera radius is 5 km, independently selectable as 10/20 km. It never changes the water/rain screening radius, measurements or risk colours. Selection uses blue.
- `/api/cameras` coalesces requests and keeps metadata for 15 minutes per Worker instance; upstream timeout is 12 seconds. Response caching: browser 60 seconds, shared cache 900 seconds. This is an application metadata throttle, not an asserted image licence or source image TTL.
- A failed ThaiWater metadata refresh keeps the previous catalogue when available, preserves its previous retrieval time and marks that source failed. With no previous metadata, working static catalogues remain and incomplete coverage is explicit. Cache is not durable across Worker instances/restarts.
- BMA/RID checked catalogues do not auto-update. Their recorded check date is separate from a user's refresh and from image time. Update them only after revisiting the ordinary public source and revalidating fields and rights.
- `/api/cameras/[id]` accepts only catalogue IDs and returns link-only policy, `imageUrl=null`, `capturedAt=null`, `fetchedAt=null`. It cannot proxy arbitrary URLs or fetch a source device.
- The UI's snapshot contract includes lazy open, refresh throttling, expanded accessible view, old/offline/error states and retained previous-image timestamps. No provider currently enables this path in production. Approval of image rights alone is insufficient: add and verify a provider-specific image/timestamp/cache adapter before enabling it.
- RID viewer HTML declares `no-store, no-cache, must-revalidate`. Its JPEG metadata does not define a trustworthy capture timestamp or a published external refresh allowance. This app does not fetch/cache its pictures. BMA's own one-second polling behaviour does not authorize this app to poll that way.

## Verification and limits

Model tests cover distance ordering, radii, missing/invalid coordinates, old/missing/future timestamps, offline/error/reused states, retention of original image timestamps, identity changes, malformed upstream data and stripped raw device/embed fields. Responsive browser QA covers 390/768/1440px. Error/old/offline image states are tested using intercepted metadata **without substitute image bytes**; they do not establish an operational embedded-picture provider. Actual source-only flows use real catalogue entries.

Only a camera's visible direction is represented. Its distance does not establish conditions inside a project, connected drainage, water depth or safety. Verify station evidence, source time and the situation with the responsible local team.
