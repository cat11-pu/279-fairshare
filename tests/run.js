import assert from "node:assert";
import { baseShare, orderForRemainder } from "../shares.js";
import { step, close } from "../settlerun.js";
import { render } from "../app.js";

const base = {
  budget: 1, tenants: { t1: 1 },
  state: { demand: {}, given: { t1: 0 }, ledger: [], applied: [] },
  events: [],
  tenant_error_code: "E_NO_TENANT", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("baseShare returns a number", () => {
  assert.strictEqual(typeof baseShare(9, 1, 3), "number");
});

check("orderForRemainder returns a list", () => {
  assert.ok(Array.isArray(orderForRemainder(["t1"], base.tenants)));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
