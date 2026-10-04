import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nearbyCameras, normalizeThaiwaterCameras, snapshotFreshness, cameraImageState, failedSnapshot } from "../lib/cameras.ts";

const point = { lat: 13.75, lng: 100.5 };
const camera = { id: "test-only", name: "Test record", ...point, location: "", province: "", owner: "Test", sourceId: "test", sourceUrl: "https://www.thaiwater.net/water/cctv", sourceNote: "", availability: "unknown", display: "link" };
const now = Date.parse("2026-10-04T12:00:00Z");
const snapshot = { cameraId: camera.id, imageUrl: null, capturedAt: null, fetchedAt: "2026-10-04T12:00:00Z", checkedAt: "2026-10-04T12:00:00Z", state: "ok", reused: false, message: "" };

test("camera radius defaults to 5 km, orders all points and expands independently", () => {
  const points = [{ ...camera, id: "far", lat: 13.88 }, { ...camera, id: "middle", lat: 13.82 }, camera, { ...camera, id: "near", lat: 13.77 }];
  assert.deepEqual(nearbyCameras(point, points).map(c => c.id), ["test-only", "near"]);
  assert.equal(nearbyCameras(point, points, 10).length, 3);
  assert.equal(nearbyCameras(point, points, 20).length, 4);
});
test("missing coordinates, invalid cameras and no coverage stay empty", () => {
  assert.deepEqual(nearbyCameras({ lat: null, lng: 100 }, [camera]), []);
  assert.deepEqual(nearbyCameras({ lat: NaN, lng: 100 }, [camera]), []);
  assert.deepEqual(nearbyCameras(point, [{ ...camera, lat: 100 }, { ...camera, lng: NaN }]), []);
  assert.deepEqual(nearbyCameras({ lat: 18.8, lng: 98.9 }, [camera]), []);
});
test("retrieval time can never substitute for an unknown capture time", () => {
  assert.equal(snapshotFreshness(null, now), "unknown");
  assert.match(cameraImageState(snapshot, now), /ไม่ทราบเวลาของภาพ/);
  assert.equal(snapshotFreshness("invalid", now), "unknown");
  assert.equal(snapshotFreshness("2026-10-05T00:00:00Z", now), "unknown");
});
test("stale, offline, failed and reused image statuses remain explicit", () => {
  const stale = { ...snapshot, capturedAt: "2026-10-04T10:00:00Z" };
  assert.match(cameraImageState(stale, now), /ภาพเก่าเกิน 30 นาที/);
  const failed = { ...stale, state: "error", reused: true };
  assert.match(cameraImageState(failed, now), /โหลดภาพไม่สำเร็จ.*ภาพเดิมจากรอบก่อน.*ภาพเก่า/);
  assert.match(cameraImageState({ ...snapshot, state: "offline" }, now), /กล้องออฟไลน์/);
  assert.match(cameraImageState({ ...snapshot, state: "link" }, now), /ดูภาพที่ต้นทาง/);
  assert.equal(snapshotFreshness("2026-10-04T11:45:00Z", now), "recent");
});
test("refresh failure retains original timestamps and never leaks a different camera image", () => {
  const previous = { ...snapshot, imageUrl: "/test-only-image-never-served", capturedAt: "2026-10-04T11:00:00Z" };
  const result = failedSnapshot(camera.id, previous, "Failed", "2026-10-04T12:30:00Z");
  assert.equal(result.capturedAt, previous.capturedAt);
  assert.equal(result.fetchedAt, previous.fetchedAt);
  assert.equal(result.imageUrl, previous.imageUrl);
  assert.equal(result.reused, true);
  assert.match(cameraImageState(result, now), /ภาพเดิมจากรอบก่อน/);
  const switched = failedSnapshot("other-camera", previous, "Failed");
  assert.equal(switched.imageUrl, null);
  assert.equal(switched.capturedAt, null);
  assert.equal(switched.fetchedAt, null);
  assert.equal(switched.reused, false);
});
test("upstream catalogue is defensive and never forwards embeds or camera device URLs", () => {
  const row = { id: 22, title: "สุวรรณภูมิ", lat: "13.507677", long: "100.745154", media_type: "img", is_active: true, cctv_url: "http://192.168.1.2/", cctv_flash: "<script>bad()</script>", agency: { agency_name: { th: "กรมทรัพยากรน้ำ" } }, geocode: { province_name: { th: "สมุทรปราการ" } } };
  const result = normalizeThaiwaterCameras({ result: "OK", data: [row, row, { ...row, id: 2, lat: "" }, { ...row, id: 3, long: "bad" }, { ...row, id: 4, media_type: "vdo" }, { ...row, id: 5, is_active: false }] });
  assert.equal(result.length, 2);
  assert.equal(result[0].availability, "unknown");
  assert.equal(result[1].availability, "offline");
  assert.ok(result.every(c => c.display === "link"));
  assert.equal(result[0].sourceUrl, "https://www.thaiwater.net/water/cctv");
  assert.ok(!JSON.stringify(result).includes("192.168"));
  assert.ok(!JSON.stringify(result).includes("script"));
  assert.throws(() => normalizeThaiwaterCameras({ data: [] }), /Invalid/);
});
test("reviewed static catalogues retain real valid coordinates and link-only boundaries", () => {
  const bma = JSON.parse(readFileSync(new URL("../data/cameras-bma.json", import.meta.url)));
  const rid = JSON.parse(readFileSync(new URL("../data/cameras-rid.json", import.meta.url)));
  assert.equal(bma.cameras.length, 511);
  assert.equal(rid.length, 10);
  const all = [...bma.cameras, ...rid];
  assert.equal(new Set(all.map(c => c.id)).size, all.length);
  for (const c of all) {
    assert.ok(c.lat >= 5 && c.lat <= 21 && c.lng >= 97 && c.lng <= 106);
    const url = new URL(c.sourceUrl);
    assert.ok(["www.bmatraffic.com", "swocpr.rid.go.th"].includes(url.hostname));
    assert.ok(!c.imageUrl);
  }
  assert.ok(!bma.cameras.some(c => c.id === "bma-1712"));
});
