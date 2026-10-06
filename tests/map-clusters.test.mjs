import test from "node:test";
import assert from "node:assert/strict";
import { clusterMembers, projectMapFeatures } from "../lib/map-clusters.ts";

const item = (id, risk, lat = 13.8, lng = 100.5) => ({
  project: { id, name: id, lat, lng }, risk,
});

test("cluster inputs preserve co-located projects and every risk category", () => {
  const features = projectMapFeatures([
    item("urgent", "priority"), item("watch", "watch"),
    item("missing", "unknown"), item("calm", "normal"),
  ]).features;
  assert.equal(features.length, 4);
  assert.deepEqual(features.map(feature => feature.properties.id), ["urgent", "watch", "missing", "calm"]);
  for (const risk of ["priority", "watch", "unknown", "normal"])
    assert.equal(features.reduce((sum, feature) => sum + feature.properties[risk], 0), 1);
  assert.equal(features.find(feature => feature.properties.risk === "unknown").properties.normal, 0);
});

test("unmappable rows are kept out of map counts without fabricating coordinates", () => {
  const features = projectMapFeatures([
    item("valid", "watch"), item("missing", "unknown", null),
    item("invalid", "unknown", NaN), item("beyond-map", "normal", 90),
  ]).features;
  assert.deepEqual(features.map(feature => feature.properties.id), ["valid"]);
});

test("member lists use current filtered assessments and retain unknown ahead of normal", () => {
  const { members, counts } = clusterMembers([
    item("calm", "normal"), item("missing", "unknown"), item("urgent", "priority"),
    item("outside", "watch"),
  ], ["calm", "missing", "urgent", "removed-by-filter"]);
  assert.deepEqual(members.map(member => member.project.id), ["urgent", "missing", "calm"]);
  assert.deepEqual(counts, { priority: 1, watch: 0, unknown: 1, normal: 1 });
  assert.deepEqual(clusterMembers([], ["urgent"]).members, []);
});
