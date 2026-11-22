import test from "node:test";
import assert from "node:assert/strict";
import { authEnabled } from "../lib/auth";

test("auth is never silently enabled — requires URL + a key", () => {
  assert.equal(authEnabled(), false);
});
