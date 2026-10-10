import assert from "node:assert/strict";
import { test } from "node:test";
import { tooltipPosition } from "../src/shared/tooltips.js";

const phone = { width: 390, height: 844 };

test("details opened from the right edge stay inside a phone screen", () => {
  assert.deepEqual(tooltipPosition({ left: 350, top: 200, bottom: 232 }, 340, 160, phone), { left: 42, top: 240 });
});

test("details near the bottom open above their button", () => {
  assert.deepEqual(tooltipPosition({ left: 20, top: 760, bottom: 792 }, 340, 160, phone), { left: 20, top: 592 });
});

test("tall details and offscreen anchors keep a safe top and left margin", () => {
  assert.deepEqual(tooltipPosition({ left: -40, top: 300, bottom: 332 }, 340, 812, phone), { left: 8, top: 8 });
});
