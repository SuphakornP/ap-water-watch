# DWR Early Warning source and overlap

This integration provides a separate government-source context alongside ThaiWater observations. It does not add another vote to the project risk calculation or reinterpret DWR measurements as the existing water/rain fields.

## Verified source

- Official interface: <https://ews.dwr.go.th/ews/index.php>
- The interface loads its catalogue with a multipart POST to <https://ews.dwr.go.th/ews/web-service/stn>, with `action=LoadStation`.
- Existing ThaiWater rainfall: <https://api-v3.thaiwater.net/api/v1/thaiwater30/provinces/rain24?include_zero=1>
- Existing ThaiWater water levels: <https://api-v3.thaiwater.net/api/v1/thaiwater30/provinces/waterlevel>

The comparison was captured on **6 October 2026, approximately 14:35 Bangkok time**. Counts describe this snapshot, not a fixed inventory or a promise of current coverage.

| Snapshot measure | Count |
| --- | ---: |
| DWR Early Warning station identities | 2,275 |
| DWR Early Warning provinces | 63 |
| ThaiWater rainfall records | 4,575 |
| ThaiWater rainfall records labelled provider DWR | 2,245 |
| Exact EWS `STN` code overlaps | 1,977 |
| Matching codes with coordinates within 100 metres | 1,934 |
| Matching codes with coordinates more than 100 metres apart | 43 |
| EWS codes absent from this ThaiWater rainfall response | 298 |
| EWS-only records whose report time was within six hours | 31 |
| ThaiWater DWR codes outside the EWS catalogue (`G09006-*`) | 268 |
| ThaiWater water records / records labelled DWR | 806 / 0 |

ThaiWater's DWR rainfall records span 74 provinces and include another station-code family, so provider identity alone does not mean the feeds have identical coverage. The EWS catalogue contains no station records in Bangkok, Nonthaburi, Pathum Thani, Samut Prakan, Nakhon Pathom or Samut Sakhon in this snapshot. The 298 EWS-only records include 267 old or unknown report times. All 16 records carrying EWS warning statuses 1–3 have matching station codes in the ThaiWater response, but their warning information and measurement periods are distinct.

For example, EWS `STN2241` and ThaiWater station `1459106` identify the same named location, with coordinates about 0.05 metres apart. ThaiWater reports 197.5 mm over 24 hours at 13:00, while EWS reports 5.0 mm over 12 hours at 13:45. Those are different periods and timestamps; neither replaces the other. Other matched codes have large coordinate conflicts, including a record labelled as removed in ThaiWater, so automatic linking must include a coordinate guard.

## Identity and duplicate handling

The existing ThaiWater `Station.id` stays stable. Its normalizer additionally preserves uppercase `providerCode` from `agency_shortname.en` and `providerStationCode` from `tele_station_oldcode`. EWS identities use `dwr:STN####`.

A provenance link requires provider `DWR`, the exact same `STN` code, and coordinates within 0.1 km. The distance limit is an application guard against inconsistent metadata, not proof of hydrological connectivity. A matching code with incompatible coordinates is marked conflicting, and a code missing from the current ThaiWater response is marked direct-only. Names alone never merge stations. Counts use unique source identities and unique provinces.

Even linked records retain their own measurement period, timestamp, source URL and values. The application neither sums them nor treats them as independent corroboration. A future observation-level deduplication would also need matching metric, accumulation window, unit/datum and observation time; location identity alone is insufficient.

## Measurement and warning boundaries

- `rain` is a 15-minute observation, `rain12h` is a 12-hour accumulation, and `rain07h` is the source's daily 07:00-period value. They must not populate `rain1h` or rolling `rain_24h`, or use those periods' screening thresholds.
- `wl` is source-reported water level with an unverified vertical datum. It is not MSL, project flood depth, or a bank-relative margin. `alert_min` and `alert_max` are not established bank elevations.
- DWR statuses are independent: 0 means no issued warning status in the response, 9 means rainy, 1 surveillance, 2 preparedness and 3 critical. Status 9 does not mean offline. They must not be mapped to ThaiWater water statuses 1–5.
- The source's Buddhist short-year `date` is parsed in Bangkok time. Warning records can carry the warning-event time instead of latest telemetry; `reportTimeKind` and a separate alert-issued time preserve this difference. Receipt time never substitutes for report or observation time.
- Reports outside the existing six-hour freshness window, missing timestamps, or timestamps more than 15 minutes ahead retain an explicit old/unknown presentation. An old warning remains visible with its date; it does not become a new project warning or an all-clear.

DWR observations and source warnings are supplemental evidence. Project screening continues to use the existing validated ThaiWater rain 1/24-hour and MSL/status contracts. Nearby stations do not establish drainage connectivity or flooding inside a project. The public test fixtures are synthetic; no internal project registry or raw research payload is committed with this documentation.
