// settlerun.js：按结算预算分配并留账（基线：一律给空表）
import { baseShare, orderForRemainder } from "./shares.js";

export function step(spec) {
  return { state: spec.state, settled: 0, ledger_before: 0, ledger: [], judged: 0, judged_bound: 0 };
}

export function close(spec) {
  return { state: spec.state, catchup: 0 };
}
