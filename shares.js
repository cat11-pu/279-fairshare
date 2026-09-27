// shares.js：基本份额与余数补齐顺序
export function baseShare(total, weight, totalWeight) {
  if (!Number.isFinite(total) || !Number.isFinite(weight) || !Number.isFinite(totalWeight) || totalWeight <= 0) {
    return 0;
  }
  return Math.floor((total * weight) / totalWeight);
}

export function orderForRemainder(names, tenants) {
  return names.slice().sort(function (a, b) {
    const wa = Number(tenants && tenants[a]) || 0;
    const wb = Number(tenants && tenants[b]) || 0;
    if (wb !== wa) return wb - wa;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
}
