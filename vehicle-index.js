// Build-time: a slim name/nation/class/BR index of every aircraft and ground
// vehicle, so the Lists page loads ~0.3 MB instead of the 21 MB full datasets.
const pretty = value => String(value ?? '').replace(/^exp_/, '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()).replace('Spaa', 'SPAA');
const named = (id, name) => typeof id === 'string' && id && typeof name === 'string' && name.trim();

export function buildVehicleIndex(aircraft, ground, roles = {}){
  const rows = [];
  for (const row of aircraft.aircraft || [])
    if (named(row['Aircraft ID'], row.Aircraft))
      rows.push({k:`aircraft:${row['Aircraft ID']}`, n:row.Aircraft, c:row.Nation ?? null, t:row.Class ?? null, b:row['BR Realistic'] ?? null});
  for (const row of ground.vehicles || [])
    if (named(row['Vehicle ID'], row.Vehicle))
      rows.push({k:`ground:${row['Vehicle ID']}`, n:row.Vehicle, c:row.Nation ?? null, t:roles[row['Vehicle ID']]?.[0] ?? (pretty(row['Unit Class']) || null), b:row['BR Realistic'] ?? null});
  const seen = new Set();
  return rows.filter(row => !seen.has(row.k) && seen.add(row.k));
}
