import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { loadPyodide } from 'pyodide';
import { createSession, runRequest } from '../index.mjs';

let py;
before(async () => {
  py = await loadPyodide();
});

test('runs a Mata block and prints matrices as Stata does', async () => {
  const s = await createSession(py);
  const m = { run: (c) => s.mata(c), reset: () => s.reset() };
  const out = await m.run('A = (4,2\\2,3)\ncholesky(A)');
  assert.equal(out.error, null);
  assert.match(out.log, /mata \(type end to exit\)/);
  assert.match(out.log, /1\.414213562/);
});

test('keeps functions between runs until reset', async () => {
  const s = await createSession(py);
  const m = { run: (c) => s.mata(c), reset: () => s.reset() };
  await m.run('real scalar sq(real scalar x)\n{\n  return(x*x)\n}');
  assert.match((await m.run('sq(7)')).log, /\b49\b/);
  m.reset();
  const out = await m.run('sq(7)');
  assert.match(out.log, /r\(3499\)|not found/);
});

test('a singular matrix gives a missing inverse, as in Stata', async () => {
  const s = await createSession(py);
  const m = { run: (c) => s.mata(c), reset: () => s.reset() };
  const out = await m.run('cholesky((1,2\\2,4))');
  assert.equal(out.error, null);
  assert.match(out.log, /\|\s+\.\s+\.\s+\|/);
});

test('reads and changes the host dataset, macros and scalars', async () => {
  const out = await runRequest(py, {
    reset: true,
    nobs: 3,
    vars: [['x', 'num', 'DOUBLE'], ['s', 'str', 'VARCHAR']],
    columns: [new Float64Array([1, 2, Number.NaN]), ['a', 'b', 'c']],
    locals: { k: '5' },
    code: [
      'X = st_data(., "x")',
      'st_numscalar("total", colsum(X))',
      'st_local("k", strofreal(strtoreal(st_local("k")) + 1))',
      'idx = st_addvar("double", "y")',
      'st_store(., "y", X :* 10)',
    ].join('\n'),
  });
  assert.equal(out.error, null, out.log);
  assert.equal(out.scalars.total, 3);
  assert.equal(out.locals.k, '6');
  const y = out.data.columns.find((c) => c.name === 'y');
  assert.deepEqual(y.values, [10, 20, null]);
});

test('continues the Stata 14 random stream from a saved state', async () => {
  const s = await createSession(py);
  const m = { run: (c) => s.mata(c), reset: () => s.reset() };
  const out = await m.run('rseed(123)\nprintf("%20.17f\\n", runiform(1,1))');
  assert.match(out.log, /0\.31320017867847072/);
  assert.match(out.rng, /^X[0-9a-f]+$/);
});

test('stata() calls back into the host', async () => {
  const calls = [];
  const out = await runRequest(py, {
    reset: true,
    code: 'stata("display 1+1")',
    stata: async (state) => {
      const s = JSON.parse(state);
      calls.push(s.cmd);
      const json = JSON.stringify({ ...s, nobs: 0, vars: [], r: {}, e: {}, log: ['2'], error: null });
      return { json, columns: [] };
    },
  });
  assert.equal(out.error, null, out.log);
  assert.deepEqual(calls, ['display 1+1']);
  assert.match(out.log, /^2$/m);
});

test('runs a Stata matrix command', async () => {
  const out = await runRequest(py, { reset: true, kind: 'matrix', code: 'A = (1,2\\3,4)' });
  assert.equal(out.error, null, out.log);
  const list = await runRequest(py, { kind: 'matrix', code: 'list A' });
  assert.match(list.log, /A\[2,2\]/);
});
