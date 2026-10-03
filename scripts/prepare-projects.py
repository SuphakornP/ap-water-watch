#!/usr/bin/env python3
"""Normalize the AP project CSV without geocoding or inventing missing facts."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "local" / "projects.csv"
REGION_PROVINCES = {
    "กรุงเทพฯ และปริมณฑล": "กรุงเทพมหานคร นนทบุรี ปทุมธานี สมุทรปราการ สมุทรสาคร นครปฐม",
    "ภาคเหนือ": "เชียงราย เชียงใหม่ น่าน พะเยา แพร่ แม่ฮ่องสอน ลำปาง ลำพูน อุตรดิตถ์",
    "ภาคตะวันออกเฉียงเหนือ": (
        "กาฬสินธุ์ ขอนแก่น ชัยภูมิ นครพนม นครราชสีมา บึงกาฬ บุรีรัมย์ มหาสารคาม "
        "มุกดาหาร ยโสธร ร้อยเอ็ด เลย ศรีสะเกษ สกลนคร สุรินทร์ หนองคาย หนองบัวลำภู "
        "อำนาจเจริญ อุดรธานี อุบลราชธานี"
    ),
    "ภาคกลาง": (
        "กำแพงเพชร ชัยนาท นครนายก นครสวรรค์ พระนครศรีอยุธยา พิจิตร พิษณุโลก "
        "เพชรบูรณ์ ลพบุรี สมุทรสงคราม สระบุรี สิงห์บุรี สุโขทัย สุพรรณบุรี อ่างทอง อุทัยธานี"
    ),
    "ภาคตะวันออก": "จันทบุรี ฉะเชิงเทรา ชลบุรี ตราด ปราจีนบุรี ระยอง สระแก้ว",
    "ภาคตะวันตก": "กาญจนบุรี ตาก ประจวบคีรีขันธ์ เพชรบุรี ราชบุรี",
    "ภาคใต้": (
        "กระบี่ ชุมพร ตรัง นครศรีธรรมราช นราธิวาส ปัตตานี พังงา พัทลุง ภูเก็ต "
        "ยะลา ระนอง สงขลา สตูล สุราษฎร์ธานี"
    ),
}
PROVINCE_REGIONS = {
    province: region
    for region, names in REGION_PROVINCES.items()
    for province in names.split()
}
PROVINCE_PATTERN = re.compile(
    "|".join(re.escape(p) for p in sorted(PROVINCE_REGIONS, key=len, reverse=True))
)
BRANDS = (
    "บ้านกลางเมือง THE EDITION", "บ้านกลางเมือง CLASSE", "GRANDE PLENO",
    "PLENO TOWN", "THE PALAZZO", "THE ADDRESS", "THE CITY", "GOOD DAY", "บ้านกลางเมือง",
    "บ้านกลางกรุง", "อภิทาวน์", "CENTRO", "ASPIRE", "RHYTHM", "DISTRICT",
    "MODEN", "PLENO", "LIFE", "BEON",
)


def clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def coordinate(value: str | None, axis: str) -> tuple[float | None, str | None]:
    value = clean(value)
    if not value:
        return None, "missing"
    normalized = value
    if value.count(",") == 1 and "." not in value:
        normalized = value.replace(",", ".")
    try:
        number = Decimal(normalized)
    except InvalidOperation:
        return None, "not_numeric"
    limit = 90 if axis == "lat" else 180
    if not number.is_finite() or not -limit <= number <= limit:
        return None, "out_of_range"
    return float(number), "decimal_comma_normalized" if normalized != value else None


def province_from_address(address: str) -> tuple[str | None, str]:
    # Explicit province markers take priority over province names inside street names.
    expanded = re.sub(r"กรุงเทพฯ|กทม\.?", "กรุงเทพมหานคร", address)
    explicit = re.findall(
        r"(?:จังหวัด|จ\.)\s*(" + PROVINCE_PATTERN.pattern + r")", expanded
    )
    if explicit:
        unique = set(explicit)
        return (explicit[-1], "explicit_province") if len(unique) == 1 else (None, "ambiguous_province")
    # A trailing province (optionally followed by a postcode) is address evidence.
    trailing = re.search(
        r"(" + PROVINCE_PATTERN.pattern + r"|กรุงเทพ)\s*(?:\d{5,7})?\s*$", expanded
    )
    if trailing:
        name = trailing.group(1)
        return ("กรุงเทพมหานคร" if name == "กรุงเทพ" else name), "trailing_province"
    matches = set(PROVINCE_PATTERN.findall(expanded))
    if len(matches) == 1:
        return next(iter(matches)), "province_name_in_address"
    return None, "ambiguous_province" if matches else "province_not_in_address"


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def prepare(source: Path, output_dir: Path) -> dict:
    with source.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    projects = []
    issues = []
    normalized_coordinates = []
    province_evidence = Counter()
    ids = Counter()
    duplicate_values = {"code": defaultdict(list), "slug": defaultdict(list)}
    coordinates = defaultdict(list)
    for row_number, row in enumerate(rows, start=2):
        code, slug, name = clean(row["code"]), clean(row["slug"]), clean(row["title"])
        base_id = "ap-" + (code or slug or f"row-{row_number}")
        ids[base_id] += 1
        project_id = base_id if ids[base_id] == 1 else f"{base_id}-{ids[base_id]}"
        address = clean(row["location_formatted_address"])
        province, evidence = province_from_address(address)
        province_evidence[evidence] += 1
        lat, lat_reason = coordinate(row["location_lat"], "lat")
        lng, lng_reason = coordinate(row["location_lng"], "lng")
        for axis, reason in (("lat", lat_reason), ("lng", lng_reason)):
            if reason == "decimal_comma_normalized":
                normalized_coordinates.append({"id": project_id, "csvRow": row_number, "axis": axis})
        if lat is None or lng is None:
            issues.append({
                "id": project_id, "csvRow": row_number, "type": "invalid_coordinates",
                "latReason": lat_reason, "lngReason": lng_reason,
                "rawLat": row["location_lat"], "rawLng": row["location_lng"],
            })
            lat = lng = None
        elif not (5.4 <= lat <= 20.5 and 97.3 <= lng <= 105.7):
            issues.append({"id": project_id, "csvRow": row_number, "type": "outside_thailand_envelope"})
        if province is None:
            issues.append({"id": project_id, "csvRow": row_number, "name": name, "type": evidence, "address": address})
        brand = next((brand for brand in BRANDS if name.upper().startswith(brand.upper())), None)
        if brand is None:
            issues.append({"id": project_id, "csvRow": row_number, "type": "unknown_brand", "name": name})
        projects.append({
            "id": project_id, "slug": slug, "name": name, "code": code,
            "brand": brand or "ไม่ระบุ", "lat": lat, "lng": lng, "address": address,
            "province": province, "region": PROVINCE_REGIONS.get(province),
            "zone": province, "salesStatus": clean(row["project_type_translation_id_status"]),
        })
        for key, value in (("code", code), ("slug", slug)):
            if value:
                duplicate_values[key][value].append(project_id)
        if lat is not None and lng is not None:
            coordinates[(lat, lng)].append(project_id)
    report = {
        "sourceFile": source.name,
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "sourceRows": len(rows), "outputRows": len(projects), "removedRows": 0,
        "validCoordinates": sum(p["lat"] is not None and p["lng"] is not None for p in projects),
        "invalidCoordinates": sum(p["lat"] is None or p["lng"] is None for p in projects),
        "knownProvinces": sum(p["province"] is not None for p in projects),
        "unknownProvinces": sum(p["province"] is None for p in projects),
        "distinctProvinces": len({p["province"] for p in projects if p["province"]}),
        "provinceCounts": dict(sorted(Counter(p["province"] or "ไม่ระบุ" for p in projects).items())),
        "regionCounts": dict(sorted(Counter(p["region"] or "ไม่ระบุ" for p in projects).items())),
        "salesStatusCounts": dict(sorted(Counter(p["salesStatus"] for p in projects).items())),
        "provinceEvidenceCounts": dict(sorted(province_evidence.items())),
        "duplicateCodes": {key: value for key, value in duplicate_values["code"].items() if len(value) > 1},
        "duplicateSlugs": {key: value for key, value in duplicate_values["slug"].items() if len(value) > 1},
        "sharedCoordinates": [
            {"lat": lat, "lng": lng, "projectIds": project_ids}
            for (lat, lng), project_ids in coordinates.items() if len(project_ids) > 1
        ],
        "coordinateNormalizations": normalized_coordinates,
        "issues": issues,
        "methodology": {
            "coordinates": "Source coordinates; no geocoding or relocation. Invalid coordinate pairs become null.",
            "province": "Province explicitly named in the source address; missing or ambiguous values remain null.",
            "region": "Six geographic regions, with Bangkok and five metropolitan provinces grouped separately.",
            "zone": "Province-based display grouping; these are not AP organizational zones.",
            "salesStatus": "Original project_type_translation_id_status; it is not a flood or operating status.",
            "deduplication": "No rows removed. Duplicate codes, slugs and coordinate pairs are reported.",
            "risk": "This asset contains project locations only and makes no flood-risk assessment.",
        },
    }
    write_json(output_dir / "projects.json", projects)
    write_json(output_dir / "project-import.json", report)
    return report


def self_test() -> None:
    assert len(PROVINCE_REGIONS) == 77
    assert coordinate("13,8123", "lat") == (13.8123, "decimal_comma_normalized")
    assert coordinate("100.3", "lng") == (100.3, None)
    assert coordinate("NaN", "lat")[0] is None
    assert coordinate("Infinity", "lng")[0] is None
    assert coordinate("91", "lat")[0] is None
    assert coordinate("", "lat")[0] is None
    assert province_from_address("ถนนตัวอย่างนนทบุรี จังหวัดกรุงเทพมหานคร 10000")[0] == "กรุงเทพมหานคร"
    assert province_from_address("สถานที่สาธิต กรุงเทพ 10000")[0] == "กรุงเทพมหานคร"
    assert province_from_address("ถนนสมมติ กทม. 10000")[0] == "กรุงเทพมหานคร"
    assert province_from_address("99 หมู่บ้านตัวอย่าง ถนนสายสมมติ")[0] is None
    assert province_from_address("เลขที่ 1 ถนนทดสอบ")[0] is None
    assert province_from_address("จ.นนทบุรี จ.ปทุมธานี")[0] is None
    with TemporaryDirectory() as directory:
        root = Path(directory)
        source = root / "synthetic.csv"
        source.write_text(
            "code,slug,title,location_formatted_address,location_lat,location_lng,project_type_translation_id_status\n"
            "DEMO-01,example,Example location,จังหวัดกรุงเทพมหานคร,13.725,100.521,demo\n"
            "DEMO-02,missing,Missing coordinates,Unknown address,,100.521,demo\n",
            encoding="utf-8",
        )
        report = prepare(source, root / "output")
        projects = json.loads((root / "output" / "projects.json").read_text(encoding="utf-8"))
        assert report["outputRows"] == 2
        assert report["invalidCoordinates"] == 1
        assert projects[0]["brand"] == "ไม่ระบุ"
        assert projects[1]["lat"] is None and projects[1]["lng"] is None
        assert projects[1]["province"] is None
        assert any(issue["type"] == "unknown_brand" for issue in report["issues"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print("Importer self-tests passed.")
        raise SystemExit(0)
    result = prepare(args.source, args.output_dir)
    print(json.dumps({key: result[key] for key in (
        "sourceRows", "outputRows", "validCoordinates", "invalidCoordinates",
        "knownProvinces", "unknownProvinces", "distinctProvinces",
    )}, ensure_ascii=False))
