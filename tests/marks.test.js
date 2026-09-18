import test from 'node:test';
import assert from 'node:assert/strict';
await import('../marks.js');
const M = globalThis.OrdnanceMarks;

test('parseMarks never throws and drops junk',()=>{
  for (const raw of [null, undefined, '', 'not json', '42', '[]', '{"favorite":"x"}'])
    assert.deepEqual([...M.parseMarks(raw).favorite], []);
  const m = M.parseMarks('{"favorite":["ground:a",7,null,"nocolon"],"special":["air:b.blkx"]}');
  assert.deepEqual([...m.favorite], ['ground:a']);
  assert.deepEqual([...m.special], ['air:b.blkx']);
});

test('toggleMark is immutable and reversible',()=>{
  const a = M.empty(), b = M.toggleMark(a,'favorite','ground:x');
  assert.equal(a.favorite.size, 0, 'input must not be mutated');
  assert.ok(M.hasMark(b,'favorite','ground:x'));
  assert.ok(!M.hasMark(M.toggleMark(b,'favorite','ground:x'),'favorite','ground:x'));
  assert.equal(M.toggleMark(a,'bogus','ground:x'), a, 'unknown kind is a no-op');
});

test('Round trip through storage format',()=>{
  let m = M.toggleMark(M.toggleMark(M.empty(),'special','aircraft:f_16'),'favorite','ground:t_80');
  const back = M.parseMarks(M.serializeMarks(m));
  assert.deepEqual([...back.special], ['aircraft:f_16']);
  assert.deepEqual([...back.favorite], ['ground:t_80']);
});

test('Filter truth table',()=>{
  let m = M.empty();
  m = M.toggleMark(m,'favorite','g:f'); m = M.toggleMark(m,'special','g:s');
  m = M.toggleMark(M.toggleMark(m,'favorite','g:b'),'special','g:b');
  const keys = ['g:f','g:s','g:b','g:n'];
  const pick = f => keys.filter(k => M.passMarkFilter(m,f,k));
  assert.deepEqual(pick(''), keys);
  assert.deepEqual(pick('favorite'), ['g:f','g:b']);
  assert.deepEqual(pick('special'), ['g:s','g:b']);
  assert.deepEqual(pick('either'), ['g:f','g:s','g:b']);
  assert.deepEqual(pick('both'), ['g:b']);
  assert.deepEqual(pick('none'), ['g:n']);
  assert.deepEqual(pick('garbage'), keys, 'unknown filter never hides data');
  assert.deepEqual(M.countMarks(m, keys), {favorite:2, special:2, either:3, both:1});
  assert.deepEqual(M.countMarks(m, ['g:n']), {favorite:0, special:0, either:0, both:0}, 'counts only keys present in the dataset');
});

test('markRank orders the chosen mark first, then the other mark',()=>{
  let m = M.empty();
  m = M.toggleMark(m,'favorite','g:f'); m = M.toggleMark(m,'special','g:s');
  m = M.toggleMark(M.toggleMark(m,'favorite','g:b'),'special','g:b');
  const order = kind => ['g:n','g:s','g:f','g:b'].sort((a,b)=>M.markRank(m,b,kind)-M.markRank(m,a,kind));
  assert.deepEqual(order('favorite'), ['g:b','g:f','g:s','g:n']);
  assert.deepEqual(order('special'), ['g:b','g:s','g:f','g:n']);
  assert.equal(M.markRank(m,'g:b','bogus'), 0, 'unknown kind ranks nothing');
});

test('Same ID in two directories stays separate',()=>{
  const m = M.toggleMark(M.empty(),'favorite',M.markKey('aircraft','x'));
  assert.ok(!M.hasMark(m,'favorite',M.markKey('ground','x')));
});
