// Saved vehicle lists, ownership and ranking. Pure, immutable, shared by the
// browser (lists.js) and the Vercel Function (api/_lists-handler.js).
(function(root){
  const LIMITS = {lists:100, items:300, name:60};
  const KEY_PATTERN = /^(aircraft|ground):[^\s:]{1,120}$/;

  const emptyDoc = () => ({v:1, lists:[], owned:[], savedAt:null});
  const isKey = key => typeof key === 'string' && KEY_PATTERN.test(key);
  const unique = values => [...new Set(values)];
  const cleanName = name => String(name ?? '').replace(/\s+/g,' ').trim().slice(0, LIMITS.name) || 'Untitled list';
  const nameKey = name => cleanName(name).toLocaleLowerCase();

  // Accepts anything. Returns a valid document. Never throws.
  function normalizeDoc(raw){
    let data = raw;
    if (typeof raw === 'string') { try { data = JSON.parse(raw); } catch { return emptyDoc(); } }
    if (!data || typeof data !== 'object') return emptyDoc();
    const seen = new Set(), byName = new Map(), lists = [];
    for (const list of Array.isArray(data.lists) ? data.lists : []) {
      if (!list || typeof list.id !== 'string' || !list.id || list.id.length > 64 || seen.has(list.id)) continue;
      seen.add(list.id);
      const normalized = {id:list.id, name:cleanName(list.name), items:unique((Array.isArray(list.items) ? list.items : []).filter(isKey)).slice(0, LIMITS.items)};
      const existing = byName.get(nameKey(normalized.name));
      if (existing) existing.items = unique([...existing.items, ...normalized.items]).slice(0, LIMITS.items);
      else { byName.set(nameKey(normalized.name), normalized); lists.push(normalized); }
      if (lists.length === LIMITS.lists) break;
    }
    const owned = unique((Array.isArray(data.owned) ? data.owned : []).filter(isKey));
    return {v:1, lists, owned, savedAt: typeof data.savedAt === 'string' ? data.savedAt : null};
  }

  const mapList = (doc, id, change) => ({...doc, lists: doc.lists.map(list => list.id === id ? change(list) : list)});
  const findListByName = (doc, name) => doc.lists.find(list => nameKey(list.name) === nameKey(name));

  function createList(doc, id, name){
    if (doc.lists.length >= LIMITS.lists || doc.lists.some(list => list.id === id) || findListByName(doc, name)) return doc;
    return {...doc, lists:[...doc.lists, {id, name:cleanName(name), items:[]}]};
  }
  const renameList = (doc, id, name) => findListByName(doc, name)?.id !== id && findListByName(doc, name)
    ? doc : mapList(doc, id, list => ({...list, name:cleanName(name)}));
  const deleteList = (doc, id) => ({...doc, lists: doc.lists.filter(list => list.id !== id)});
  const addItem = (doc, id, key) => !isKey(key) ? doc : mapList(doc, id, list =>
    list.items.includes(key) || list.items.length >= LIMITS.items ? list : {...list, items:[...list.items, key]});
  const removeItem = (doc, id, key) => mapList(doc, id, list => ({...list, items: list.items.filter(item => item !== key)}));
  const isOwned = (doc, key) => doc.owned.includes(key);
  const toggleOwned = (doc, key) => !isKey(key) ? doc :
    {...doc, owned: isOwned(doc, key) ? doc.owned.filter(item => item !== key) : [...doc.owned, key]};

  // Most lists first. Ties: vehicles you do not own yet first, then name A-Z.
  function rankVehicles(doc, nameOf = key => key){
    const owned = new Set(doc.owned), byKey = new Map();
    for (const list of doc.lists) for (const key of list.items) {
      const entry = byKey.get(key) || {key, count:0, listIds:[]};
      entry.count++; entry.listIds.push(list.id); byKey.set(key, entry);
    }
    return [...byKey.values()]
      .map(entry => ({...entry, owned: owned.has(entry.key)}))
      .sort((a, b) => b.count - a.count || Number(a.owned) - Number(b.owned) ||
        String(nameOf(a.key)).localeCompare(String(nameOf(b.key)), undefined, {numeric:true}) || a.key.localeCompare(b.key));
  }

  // Three-way set merge: keep what both sides kept, plus anything either side added.
  // Something in base that either side removed stays removed.
  function mergeSet(base, local, remote){
    const b = new Set(base), l = new Set(local), r = new Set(remote);
    const keep = key => (l.has(key) && r.has(key)) || (l.has(key) && !b.has(key)) || (r.has(key) && !b.has(key));
    return unique([...remote, ...local]).filter(keep);
  }
  const listChanged = (list, before) => !before || list.name !== before.name ||
    list.items.length !== before.items.length || list.items.some((key, index) => key !== before.items[index]);

  // Combine edits made on two devices since the last common save (base).
  // Rule: an edit is never silently dropped. A list deleted on one side but
  // edited on the other is kept.
  function mergeDocs(base, local, remote){
    [base, local, remote] = [base, local, remote].map(normalizeDoc);
    const byId = doc => new Map(doc.lists.map(list => [list.id, list]));
    const B = byId(base), L = byId(local), R = byId(remote);
    const ids = unique([...remote.lists.map(list => list.id), ...local.lists.map(list => list.id)]);
    const lists = [];
    for (const id of ids) {
      const b = B.get(id), l = L.get(id), r = R.get(id);
      if (l && r) lists.push({id, name: b && l.name === b.name ? r.name : l.name, items: mergeSet(b ? b.items : [], l.items, r.items)});
      else if (l && (!b || listChanged(l, b))) lists.push(l);
      else if (r && (!b || listChanged(r, b))) lists.push(r);
    }
    return normalizeDoc({lists, owned: mergeSet(base.owned, local.owned, remote.owned), savedAt: remote.savedAt});
  }

  // Content equality, ignoring savedAt.
  const sameDoc = (a, b) => JSON.stringify({l:a.lists, o:a.owned}) === JSON.stringify({l:b.lists, o:b.owned});

  root.OrdnanceLists = {LIMITS, emptyDoc, isKey, normalizeDoc, findListByName, createList, renameList, deleteList, addItem, removeItem, isOwned, toggleOwned, rankVehicles, mergeSet, mergeDocs, sameDoc};
})(globalThis);
