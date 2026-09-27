import fs from "node:fs";
import { baseShare, orderForRemainder } from "./shares.js";
import { step, close } from "./settlerun.js";

// 验收断言：上面每条值收进 emit，最后与期望值逐项比对，不符就非零退出。
const __lines = [];
function emit(label, value) { __lines.push([String(label).replace(/ =$/, ""), value]); }


const spec = JSON.parse(fs.readFileSync(process.argv[2] || "sample/share.json", "utf8"));
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

emit("收尾后各租户累计分配 =", JSON.stringify(names.map(function (name) {
  return [name, closed.state.given[name]];
})));
emit("收尾后需求条数 =", Object.keys(closed.state.demand).length);
emit("首轮结算次数 =", first.settled);
emit("二档结算次数 =", wide.settled);
emit("两个预算档结算不同 =", first.settled !== wide.settled);
emit("收尾前待结算账 =", first.ledger_before);
emit("压在账上的结算请求 =", JSON.stringify(first.ledger));
emit("收尾补齐次数 =", closed.catchup);
emit("收尾后待结算账 =", closed.state.ledger.length);
emit("拆两轮中间态不同 =", fingerprint(r2.state) !== fingerprint(first.state));
emit("拆两轮收尾态一致 =", fingerprint(closedTwo.state) === fingerprint(closed.state));
emit("重放新结算 =", replay.settled);
emit("工作计数未超上界 =", first.judged <= first.judged_bound);
emit("与全量对照差异 =", fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1);


// ---- 异常路径探针：真调用实现，看它报什么码（不是从样例里抄）----
// 记录探针是否真的执行、错误对象是否带 code，供第 7 条机检断言取证。
const probeTenant = { ran: false, code: null, hasCode: false };
try {
  step(Object.assign({}, { budget: 1, tenants: { t1: 1 },
    state: { demand: {}, given: { t1: 0 }, ledger: [], applied: [] },
    events: [{ id: 1, kind: "need", tenant: "t9", amount: 1 }] }));
  emit("未知租户报码", "没有报错");
} catch (error) {
  probeTenant.ran = true;
  probeTenant.code = error && error.code ? error.code : null;
  probeTenant.hasCode = Boolean(error) && Object.prototype.hasOwnProperty.call(error, "code");
  emit("未知租户报码", error && error.code ? error.code : String(error.message));
}
const probeEvent = { ran: false, code: null, hasCode: false };
try {
  step(Object.assign({}, { budget: 1, tenants: { t1: 1 },
    state: { demand: {}, given: { t1: 0 }, ledger: [], applied: [] },
    events: [{ id: 1, kind: "peek", tenant: "t1" }] }));
  emit("事件不合法报码", "没有报错");
} catch (error) {
  probeEvent.ran = true;
  probeEvent.code = error && error.code ? error.code : null;
  probeEvent.hasCode = Boolean(error) && Object.prototype.hasOwnProperty.call(error, "code");
  emit("事件不合法报码", error && error.code ? error.code : String(error.message));
}

// ---- 七条机检断言：全部取自上面真实调用的结果，硬失败计入退出码 ----
const machineAssertions = [
  ["两档结算次数不同", first.settled !== wide.settled],
  ["收尾前账大于零而收尾后归零", first.ledger_before > 0 && closed.state.ledger.length === 0],
  ["拆两轮中间态不同而收尾态一致",
    fingerprint(r2.state) !== fingerprint(first.state)
    && fingerprint(closedTwo.state) === fingerprint(closed.state)],
  ["重放不再结算", replay.settled === 0],
  ["工作计数不超事件条数", first.judged <= events.length && first.judged_bound === events.length],
  ["与全量对照差异为零", fingerprint(closed.state) === fingerprint(fullClosed.state)],
  ["异常探针真调且错误带 code",
    probeTenant.ran && probeTenant.hasCode && probeTenant.code === "E_NO_TENANT"
    && probeEvent.ran && probeEvent.hasCode && probeEvent.code === "E_BAD_EVENT"]
];
console.log("---- 七条机检断言 ----");
machineAssertions.forEach(function (pair, index) {
  if (pair[1]) { console.log("机检 " + (index + 1) + "/7 通过：" + pair[0]); }
  else { __bad += 1; console.log("机检 " + (index + 1) + "/7 失败：" + pair[0]); }
});
// ---- 期望值（参考模型算出，与题面给的验收数值一致）----
const EXPECTED = {
  "收尾后各租户累计分配": [
    [
      "t1",
      5
    ],
    [
      "t2",
      1
    ],
    [
      "t3",
      0
    ]
  ],
  "收尾后需求条数": 0,
  "首轮结算次数": 1,
  "二档结算次数": 2,
  "两个预算档结算不同": true,
  "收尾前待结算账": 1,
  "压在账上的结算请求": [
    2
  ],
  "收尾补齐次数": 1,
  "收尾后待结算账": 0,
  "拆两轮中间态不同": true,
  "拆两轮收尾态一致": true,
  "重放新结算": 0,
  "工作计数未超上界": true,
  "与全量对照差异": 0,
  "未知租户报码": "E_NO_TENANT",
  "事件不合法报码": "E_BAD_EVENT"
};
// 有的值在收进来之前已经 stringify 过，比较前先试着解析回来，避免类型错配把正确实现判成不过。
function __same(got, want) {
  if (typeof got === "string") {
    try { const parsed = JSON.parse(got); if (JSON.stringify(parsed) === JSON.stringify(want)) return true; } catch (error) { /* 不是 JSON 就按原文比 */ }
  }
  return JSON.stringify(got) === JSON.stringify(want);
}
let __bad = 0;
for (const [label, want] of Object.entries(EXPECTED)) {
  const found = __lines.find((pair) => pair[0] === label);
  if (!found) { __bad += 1; console.log("缺失验收项 " + label); continue; }
  const got = found[1];
  if (__same(got, want)) { console.log("一致 " + label + " = " + JSON.stringify(got)); }
  else { __bad += 1; console.log("不一致 " + label + " 期望 " + JSON.stringify(want) + " 实际 " + JSON.stringify(got)); }
}
console.log("验收项 " + (Object.keys(EXPECTED).length - __bad) + "/" + Object.keys(EXPECTED).length + " 通过");
process.exit(__bad === 0 ? 0 : 1);
