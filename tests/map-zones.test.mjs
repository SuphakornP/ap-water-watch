import test from "node:test";
import assert from "node:assert/strict";
import { provinceSignals, UNASSIGNED_PROVINCE } from "../lib/map-zones.ts";

const item = (id, province, risk, coordinates = true) => ({
  project: { id, province, lat: coordinates ? 13.8 : null, lng: coordinates ? 100.5 : null },
  risk,
});

test("province signals preserve unknown and coordinate-free projects in the filtered scope", () => {
  const groups = provinceSignals([
    item("a", "Bangkok", "priority"),
    item("b", "Bangkok", "normal"),
    item("c", "Bangkok", "unknown", false),
    item("d", null, "unknown", false),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], { province: "Bangkok", total: 3, unmapped: 1, counts: { priority: 1, watch: 0, normal: 1, unknown: 1 } });
  assert.equal(groups[1].province, UNASSIGNED_PROVINCE);
  assert.equal(groups.reduce((total, group) => total + group.total, 0), 4);
});

test("urgent provinces rank before watched, missing-data, and calm provinces", () => {
  const groups = provinceSignals([
    item("a", "Calm", "normal"),
    item("b", "Missing", "unknown"),
    item("c", "Watched", "watch"),
    item("d", "Urgent", "priority"),
    item("e", "Watched", "watch"),
  ]);
  assert.deepEqual(groups.map(group => group.province), ["Urgent", "Watched", "Missing", "Calm"]);
  assert.deepEqual(provinceSignals([]), []);
});

test("every assessment remains represented when project coordinates overlap", () => {
  const groups = provinceSignals([item("a", "Bangkok", "watch"), item("b", "Bangkok", "watch")]);
  assert.equal(groups[0].total, 2);
  assert.equal(groups[0].counts.watch, 2);
});
