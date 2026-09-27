// settlerun.js：按结算预算分配并留账，跨轮携带状态
import { baseShare, orderForRemainder } from "./shares.js";

function tenantCode(spec) {
  return spec.tenant_error_code || "E_NO_TENANT";
}

function eventCode(spec) {
  return spec.event_error_code || "E_BAD_EVENT";
}

function failure(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function isNonNegInt(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function cloneState(state) {
  const next = {
    demand: Object.assign({}, state && state.demand),
    given: Object.assign({}, state && state.given),
    ledger: (state && state.ledger ? state.ledger.slice() : []),
    applied: state && Array.isArray(state.applied) ? state.applied.slice() : []
  };
  return next;
}

// 校验事件形状；未知租户按租户表推出 E_NO_TENANT
function validateEvent(event, tenants, spec) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw failure(eventCode(spec), "非法事件");
  }
  if (event.kind !== "need" && event.kind !== "settle") {
    throw failure(eventCode(spec), "非法事件类型");
  }
  if (event.kind === "need") {
    if (!Object.prototype.hasOwnProperty.call(tenants, event.tenant)) {
      throw failure(tenantCode(spec), "未知租户 " + event.tenant);
    }
    if (!isNonNegInt(event.amount)) {
      throw failure(eventCode(spec), "need 事件缺少合法 amount");
    }
  } else {
    if (!isNonNegInt(event.total)) {
      throw failure(eventCode(spec), "settle 事件缺少合法 total");
    }
  }
  if (!isNonNegInt(event.id)) {
    throw failure(eventCode(spec), "事件缺少合法 id");
  }
}

// 一次结算：给有需求的租户分 total（整数份额 + 余数按权重降序/名字升序补一），
// 每人至多拿自己的需求；分完需求清零、累计到 given。
function distribute(state, total, tenants) {
  Object.keys(tenants).forEach(function (name) {
    if (!Object.prototype.hasOwnProperty.call(state.given, name)) {
      state.given[name] = 0;
    }
  });
  const names = Object.keys(state.demand).filter(function (name) {
    return Object.prototype.hasOwnProperty.call(tenants, name) && state.demand[name] > 0;
  });
  if (names.length === 0 || total <= 0) {
    names.forEach(function (name) { delete state.demand[name]; });
    return;
  }
  const totalWeight = names.reduce(function (sum, name) {
    return sum + (Number(tenants[name]) || 0);
  }, 0);
  if (totalWeight <= 0) {
    names.forEach(function (name) { delete state.demand[name]; });
    return;
  }
  const share = {};
  let used = 0;
  names.forEach(function (name) {
    share[name] = baseShare(total, Number(tenants[name]) || 0, totalWeight);
    used += share[name];
  });
  let remainder = total - used;
  const ordered = orderForRemainder(names, tenants);
  for (let i = 0; i < ordered.length && remainder > 0; i += 1) {
    share[ordered[i]] += 1;
    remainder -= 1;
  }
  names.forEach(function (name) {
    const granted = Math.min(share[name], state.demand[name]);
    state.given[name] = (state.given[name] || 0) + granted;
    delete state.demand[name];
  });
}

// 处理一批事件；预算用尽后结算请求（连同额度）整笔压在 ledger 里带出下一轮
export function step(spec) {
  const tenants = spec.tenants || {};
  const events = spec.events || [];
  const state = cloneState(spec.state);
  let budget = Number.isFinite(spec.budget) && spec.budget >= 0 ? Math.floor(spec.budget) : 0;
  let settled = 0;
  let judged = 0;

  // 上一轮压在账上的结算请求先吃本轮预算
  while (state.ledger.length > 0 && budget > 0) {
    const total = state.ledger.shift();
    distribute(state, total, tenants);
    settled += 1;
    budget -= 1;
  }

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    validateEvent(event, tenants, spec);
    if (state.applied.indexOf(event.id) !== -1) {
      continue;
    }
    state.applied.push(event.id);
    judged += 1;
    if (event.kind === "need") {
      state.demand[event.tenant] = (state.demand[event.tenant] || 0) + event.amount;
      if (!Object.prototype.hasOwnProperty.call(state.given, event.tenant)) {
        state.given[event.tenant] = 0;
      }
      if (state.demand[event.tenant] <= 0) {
        delete state.demand[event.tenant];
      }
    } else {
      if (budget > 0) {
        distribute(state, event.total, tenants);
        settled += 1;
        budget -= 1;
      } else {
        state.ledger.push(event.total);
      }
    }
  }

  return {
    state: state,
    settled: settled,
    ledger_before: state.ledger.length,
    ledger: state.ledger.slice(),
    judged: judged,
    judged_bound: events.length
  };
}

// 收尾：不限预算，把账上的结算请求全部结清
export function close(spec) {
  const tenants = spec.tenants || {};
  const state = cloneState(spec.state);
  let catchup = 0;
  while (state.ledger.length > 0) {
    const total = state.ledger.shift();
    distribute(state, total, tenants);
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
