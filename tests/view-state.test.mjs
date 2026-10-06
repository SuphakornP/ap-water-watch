import test from "node:test";
import assert from "node:assert/strict";
import { readViewState, writeViewState } from "../lib/view-state.ts";
test("shared view round trips Thai filters, project, radius and risk", () => {
  const state = { q: "บ้าน & น้ำ", province: "กรุงเทพมหานคร", region: "all", brand: "all", risk: "watch", radius: "10", view: "map", project: "p/2" };
  assert.deepEqual(readViewState(writeViewState(state)), state);
});
test("untrusted radius and view values cannot expand assessment scope", () => {
  const state = readViewState("?radius=999999&risk=safe&view=bad");
  assert.equal(state.radius, "5"); assert.equal(state.risk, "all"); assert.equal(state.view, "executive");
  assert.equal(writeViewState(state), "");
});
test("free-text all and project all are not confused with filter sentinels", () => {
  const state = { ...readViewState(""), q: "all", project: "all" };
  assert.deepEqual(readViewState(writeViewState(state)), state);
});
