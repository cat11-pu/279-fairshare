// settlerun.js：按结算预算分配并留账，收尾不限预算
import { baseShare, orderForRemainder } from "./shares.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function tenantCode(spec) {
  return (spec && spec.tenant_error_code) || "E_NO_TENANT";
}

function eventCode(spec) {
  return (spec && spec.event_error_code) || "E_BAD_EVENT";
}

function cloneState(spec) {
  const src = (spec && spec.state) || {};
  const tenants = (spec && spec.tenants) || {};
  const given = Object.assign({}, src.given);
  Object.keys(tenants).forEach(function (name) {
    if (!(name in given)) given[name] = 0;
  });
  return {
    demand: Object.assign({}, src.demand),
    given: given,
    ledger: Array.isArray(src.ledger) ? src.ledger.slice() : [],
    applied: Array.isArray(src.applied) ? src.applied.slice() : []
  };
}

function validAmount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// 一次结算：有需求的租户按权重分 total，余数按权重降序、并列按名字升序各加一，
// 每个租户实得不超过自己的需求，分完清空需求并累计到 given。
function settle(state, tenants, total) {
  const demands = state.demand;
  const names = Object.keys(demands).filter(function (name) {
    return demands[name] > 0 && name in tenants;
  });
  state.demand = {};
  if (names.length === 0) return;
  const totalWeight = names.reduce(function (sum, name) {
    return sum + (tenants[name] || 0);
  }, 0);
  if (totalWeight <= 0) return;
  const shares = {};
  let assigned = 0;
  names.forEach(function (name) {
    shares[name] = baseShare(total, tenants[name], totalWeight);
    assigned += shares[name];
  });
  let remainder = total - assigned;
  const order = orderForRemainder(names, tenants);
  for (let i = 0; remainder > 0 && i < order.length; i += 1, remainder -= 1) {
    shares[order[i]] += 1;
  }
  names.forEach(function (name) {
    const grant = Math.min(shares[name], demands[name]);
    state.given[name] = (state.given[name] || 0) + grant;
  });
}

export function step(spec) {
  const input = spec || {};
  const tenants = input.tenants || {};
  const events = input.events || [];
  if (!Array.isArray(events)) throw fail(eventCode(input), "events must be a list");
  const rawBudget = input.budget;
  let budget = Number.isFinite(rawBudget) ? Math.max(0, Math.floor(rawBudget)) : 0;
  const state = cloneState(input);
  const applied = new Set(state.applied);
  const ledger = state.ledger.slice();
  let settled = 0;
  let judged = 0;
  events.forEach(function (event, index) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw fail(eventCode(input), "event must be an object");
    }
    const id = event.id !== undefined ? event.id : index;
    if (applied.has(id)) return;
    if (event.kind === "need") {
      if (typeof event.tenant !== "string" || !(event.tenant in tenants)) {
        throw fail(tenantCode(input), "unknown tenant: " + String(event.tenant));
      }
      if (!validAmount(event.amount)) {
        throw fail(eventCode(input), "need amount must be a non-negative number");
      }
      state.demand[event.tenant] = (state.demand[event.tenant] || 0) + event.amount;
    } else if (event.kind === "settle") {
      if (!validAmount(event.total)) {
        throw fail(eventCode(input), "settle total must be a non-negative number");
      }
      if (budget > 0) {
        budget -= 1;
        settle(state, tenants, event.total);
        settled += 1;
      } else {
        ledger.push(event.total);
      }
    } else {
      throw fail(eventCode(input), "unknown event kind: " + String(event.kind));
    }
    applied.add(id);
    judged += 1;
  });
  state.applied = Array.from(applied);
  state.ledger = ledger;
  return {
    state: state,
    settled: settled,
    ledger_before: ledger.length,
    ledger: ledger.slice(),
    judged: judged,
    judged_bound: events.length
  };
}

export function close(spec) {
  const input = spec || {};
  const tenants = input.tenants || {};
  const state = cloneState(input);
  const pending = state.ledger.slice();
  state.ledger = [];
  let catchup = 0;
  pending.forEach(function (total) {
    settle(state, tenants, total);
    catchup += 1;
  });
  return { state: state, catchup: catchup };
}
