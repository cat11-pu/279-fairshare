// app.js：渲染结果
import { baseShare, orderForRemainder } from "./shares.js";
import { step, close } from "./settlerun.js";

export function render(spec) {
  const events = spec.events || [];
  const half = Math.ceil(events.length / 2);
  const first = step(spec);
  const closed = close(Object.assign({}, spec, { state: first.state }));
  const r1 = step(Object.assign({}, spec, { events: events.slice(0, half) }));
  const r2 = step(Object.assign({}, spec, { state: r1.state, events: events.slice(half) }));
  const closedTwo = close(Object.assign({}, spec, { state: r2.state }));
  const replay = step(Object.assign({}, spec, { state: closed.state }));
  const wide = step(Object.assign({}, spec, { budget: spec.budget + 2 }));
  const full = step(Object.assign({}, spec, { events: events, budget: events.length + 2 }));
  const fullClosed = close(Object.assign({}, spec, { state: full.state }));
  const fingerprint = function (state) {
    return JSON.stringify({
      demand: state.demand, given: state.given, ledger: state.ledger,
      applied: state.applied.length
    });
  };
  const names = Object.keys(closed.state.given).sort();
  return { given: names.map(function (name) { return [name, closed.state.given[name]]; }),
           demand: Object.keys(closed.state.demand).sort().map(function (name) {
             return [name, closed.state.demand[name]];
           }),
           settled_first: first.settled, settled_wide: wide.settled,
           pair_differs: first.settled !== wide.settled,
           ledger_before: first.ledger_before, ledger: first.ledger,
           catchup: closed.catchup, ledger_after: closed.state.ledger.length,
           mid_differs: fingerprint(r2.state) !== fingerprint(first.state),
           closed_equal: fingerprint(closedTwo.state) === fingerprint(closed.state),
           replay_new: replay.settled, judged: first.judged, judged_bound: first.judged_bound,
           full_diff: fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1,
           count: events.length,
           tail: baseShare(9, 1, 3) + orderForRemainder(["a"], {}).length };
}
