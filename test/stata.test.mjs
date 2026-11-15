import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { loadPyodide } from 'pyodide';
import { createSession, drawsGraph, runRequest } from '../index.mjs';

let py;
before(async () => {
  py = await loadPyodide();
});

test('runs Stata commands on its own dataset across calls', async () => {
  const s = await createSession(py);
  await s.stata('clear\nset obs 12\ngen g = mod(_n, 3)\ngen x = _n');
  const out = await s.stata('tabstat x, by(g) stat(mean n)');
  assert.equal(out.error, null, out.log);
  assert.match(out.log, /\. tabstat x, by\(g\)/);
  assert.match(out.log, /Total \|\s+6\.5/);
});

test('changes the host dataset and reports only what changed', async () => {
  const out = await runRequest(py, {
    kind: 'command',
    reset: true,
    nobs: 4,
    vars: [['x', 'num', 'DOUBLE']],
    columns: [new Float64Array([4, 1, 3, 2])],
    code: 'xtile q = x, nq(2)',
  });
  assert.equal(out.error, null, out.log);
  assert.equal(out.data.full, false);
  assert.deepEqual(out.data.columns.map((c) => c.name), ['q']);
  assert.deepEqual(out.data.columns[0].values, [2, 1, 2, 1]);
});

test('returns e() results and e(b) after an estimation', async () => {
  const x = Float64Array.from({ length: 40 }, (_, i) => Math.sin(i + 1));
  const y = Float64Array.from(x, (v, i) => (i % 5) + (v > 0 ? 1 : 0));
  const out = await runRequest(py, {
    kind: 'command',
    reset: true,
    nobs: 40,
    vars: [['y', 'num', 'DOUBLE'], ['x', 'num', 'DOUBLE']],
    columns: [y, x],
    code: 'poisson y x',
  });
  assert.equal(out.error, null, out.log);
  assert.equal(out.e.cmd, 'poisson');
  assert.equal(out.e.N, 40);
  assert.deepEqual(out.ematrix.names, ['x', '_cons']);
  assert.equal(out.ematrix.V.length, 2);
  // The host sends e() back unchanged: postestimation still finds the model.
  const next = await runRequest(py, {
    kind: 'command',
    nobs: 40,
    vars: [['y', 'num', 'DOUBLE'], ['x', 'num', 'DOUBLE']],
    columns: [y, x],
    e: out.e,
    code: 'margins, dydx(x)',
  });
  assert.equal(next.error, null, next.log);
  assert.match(next.log, /Average marginal effects[\s\S]*Number of obs\s+=\s+40/);
});

test('reports a Stata error code for an unknown command', async () => {
  const out = await runRequest(py, { kind: 'command', reset: true, code: 'notacommand x' });
  assert.equal(out.error.code, 199);
  assert.match(out.log, /r\(199\)/);
});

test('draws a graph as SVG', async () => {
  assert.equal(drawsGraph('twoway scatter y x'), true);
  assert.equal(drawsGraph('summarize x'), false);
  const s = await createSession(py);
  await s.stata('clear\nset obs 20\ngen x = _n\ngen y = x^2');
  const out = await s.stata('scatter y x, title("Squares")');
  assert.equal(out.error, null, out.log);
  assert.equal(out.graphs.length, 1);
  assert.match(out.graphs[0], /^<\?xml[\s\S]*<svg[\s\S]*Squares/);
});
