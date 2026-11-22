import { test } from "node:test";
import assert from "node:assert/strict";
import { ENGINE_VERSION } from "../src/index.ts";

test("ENGINE_VERSION is a string", () => {
  assert.equal(typeof ENGINE_VERSION, "string");
});
