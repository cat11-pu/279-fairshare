// shares.js：基本份额与余数顺序
export function baseShare(total, weight, totalWeight) {
  if (!Number.isFinite(total) || !Number.isFinite(weight) || !Number.isFinite(totalWeight) || totalWeight <= 0) {
    return 0;
  }
  return Math.floor((total * weight) / totalWeight);
}

export function orderForRemainder(names, tenants) {
  const weights = tenants || {};
  return (names || []).slice().sort(function (a, b) {
    const wa = weights[a] || 0;
    const wb = weights[b] || 0;
    if (wb !== wa) return wb - wa;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
}
