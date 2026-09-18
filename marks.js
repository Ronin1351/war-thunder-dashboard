// Per-record user marks: favorite (heart) and special (star).
// Pure logic only. Storage lives in app.js so this module stays testable.
(function(root){
  const KINDS = ['favorite','special'];
  const FILTERS = ['', 'favorite', 'special', 'either', 'both', 'none'];
  const STORAGE_KEY = 'ordnance-marks-v1';

  const empty = () => ({favorite:new Set(), special:new Set()});

  // Domain-scoped key. IDs are only unique inside one dataset.
  function markKey(domain, id){ return `${domain}:${id}`; }

  // Accepts anything. Returns a clean marks object. Never throws.
  function parseMarks(raw){
    const marks = empty();
    let data = null;
    try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return marks; }
    if (!data || typeof data !== 'object') return marks;
    for (const kind of KINDS)
      if (Array.isArray(data[kind]))
        for (const key of data[kind]) if (typeof key === 'string' && key.includes(':')) marks[kind].add(key);
    return marks;
  }

  function serializeMarks(marks){
    return JSON.stringify({v:1, favorite:[...marks.favorite].sort(), special:[...marks.special].sort()});
  }

  function hasMark(marks, kind, key){ return Boolean(marks[kind]?.has(key)); }

  // Immutable toggle: returns a new marks object.
  function toggleMark(marks, kind, key){
    if (!KINDS.includes(kind)) return marks;
    const next = {favorite:new Set(marks.favorite), special:new Set(marks.special)};
    if (next[kind].has(key)) next[kind].delete(key); else next[kind].add(key);
    return next;
  }

  function passMarkFilter(marks, filter, key){
    if (!filter) return true;
    const fav = marks.favorite.has(key), star = marks.special.has(key);
    if (filter === 'favorite') return fav;
    if (filter === 'special') return star;
    if (filter === 'either') return fav || star;
    if (filter === 'both') return fav && star;
    if (filter === 'none') return !fav && !star;
    return true; // unknown filter value never hides data
  }

  // Counts restricted to one domain's keys that still exist in the dataset.
  function countMarks(marks, keys){
    const counts = {favorite:0, special:0, either:0, both:0};
    for (const key of keys){
      const fav = marks.favorite.has(key), star = marks.special.has(key);
      if (fav) counts.favorite++;
      if (star) counts.special++;
      if (fav || star) counts.either++;
      if (fav && star) counts.both++;
    }
    return counts;
  }

  // Sort rank for "marked first". The chosen mark outranks the other one:
  // favorite-first gives both=3, favorite=2, special=1, none=0.
  function markRank(marks, key, primary){
    if (!KINDS.includes(primary)) return 0;
    const other = primary === 'favorite' ? 'special' : 'favorite';
    return (marks[primary].has(key) ? 2 : 0) + (marks[other].has(key) ? 1 : 0);
  }

  root.OrdnanceMarks = {KINDS, FILTERS, STORAGE_KEY, empty, markKey, parseMarks, serializeMarks, hasMark, toggleMark, passMarkFilter, countMarks, markRank};
})(globalThis);
