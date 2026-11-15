<h1 align="center">opendta-pyodide</h1>

<p align="center"><b>Run Stata 14 commands, graphs and Mata in the browser or Node.<br>
OpenDTA's open-source engine, packaged for Pyodide, with a bridge to your own data.</b></p>

<p align="center">Pyodide 0.27, NumPy and SciPy (matplotlib for graphs). No server. MIT.</p>

<p align="center">
<img alt="npm" src="https://img.shields.io/npm/v/opendta-pyodide?style=flat-square&color=555">
<img alt="licence MIT" src="https://img.shields.io/badge/licence-MIT-555?style=flat-square">
<img alt="runtime Pyodide 0.27" src="https://img.shields.io/badge/runtime-Pyodide%200.27-555?style=flat-square">
</p>

## Install

| Where | How |
|---|---|
| npm | `npm install opendta-pyodide pyodide@0.27.7` |
| CDN | `import { createSession } from 'https://cdn.jsdelivr.net/npm/opendta-pyodide@0.2.1/index.mjs'` |
| GitHub tag | `https://cdn.jsdelivr.net/gh/NakliTechie/opendta-pyodide@v0.2.1/index.mjs` |

```js
import { loadPyodide } from 'pyodide';
import { createSession } from 'opendta-pyodide';

const stata = await createSession(await loadPyodide());       // loads numpy and scipy once
await stata.stata('set obs 100\ngen x = runiform()\ngen y = 2*x + rnormal()');
const out = await stata.stata('regress y x\nmargins, dydx(x)');
console.log(out.log);          // the log as Stata 14 prints it
const g = await stata.stata('scatter y x');
document.body.innerHTML = g.graphs[0];                         // each graph as SVG text
const m = await stata.mata('A = (4,2\\2,3)\ncholesky(A)');    // Mata, in the same package
```

`createSession` fetches `opendta.json` (4.9 MB, 0.9 MB with brotli) and
`opendta_bridge.py` from beside `index.mjs`. A command that draws loads matplotlib first.

## Why

You have Stata do-files and want them to run where your users are, in a web page or a
Node script, without a Stata licence. [OpenDTA](https://github.com/yaskepalhares/opendta)
is an MIT Python reimplementation of Stata 14: data management, estimation and
post-estimation, programs and `syntax`, graphs drawn with matplotlib, and a Mata
interpreter. This package ships its engine (287 modules, without the desktop interface),
and a bridge so the engine reads and writes a dataset that your own code owns.

How close OpenDTA is to Stata is OpenDTA's claim, checked by its 108 Stata 14 reference
logs. NakliData, a browser data workbench, runs 9 of them (the Mata files) through this
bridge: 7 print logs equal to Stata 14's, and the other 2 differ where OpenDTA lists known
differences.

## Give the engine your data

`runRequest` takes the dataset as columns, plus macros and scalars, runs Stata command
lines, and returns what changed:

```js
import { runRequest } from 'opendta-pyodide';

const out = await runRequest(pyodide, {
  kind: 'command',
  nobs: 4,
  vars: [['x', 'num', 'DOUBLE']],
  columns: [new Float64Array([4, 1, 3, NaN])],   // NaN is Stata's missing value
  code: 'xtile q = x, nq(2)',
});
out.data.columns;   // only the new or changed variables: [{ name: 'q', values: [2, 1, 2, null] }]
```

The response holds `log`, `error` (`{ code, message }` with Stata's return code), the
changed `data`, `locals`, `globals`, `scalars`, `r`, `e`, `ematrix` (e(b) and e(V)),
`graphs` and the random-number state. Pass `rng` back so `runiform()` continues Stata 14's
stream. Use `kind: 'block'` for Mata and `kind: 'matrix'` for a `matrix` command (without
the word `matrix`).

## Call back into your host

From Mata, `stata("...")` calls your `stata: async (stateJson) => reply`, and expressions
in `matrix` commands call `evaluate`. Both wait on your async code through Pyodide's
`run_sync`, which needs WebAssembly stack switching (JSPI): on by default in current
Chrome, and behind `--experimental-wasm-jspi` in Node 22. Without JSPI the call stops with
Stata error 3000 and says why. The formats are in `index.d.ts`.

## Commands

```sh
npm test                                     # 12 tests in Node: commands, data, e(b), graphs, Mata
python3 -I scripts/bundle-opendta.py <opendta checkout>   # rebuild opendta.json at the pin
```

## Verify it yourself

```sh
npm ci && npm test
```

The tests run in Pyodide 0.27.7. They check `tabstat` output, a host dataset round trip
through `xtile` that returns only the new variable, `poisson` results in `e()` and e(b),
error 199 for an unknown command, a `scatter` drawn as SVG, and the Mata path: printed
matrices, a singular matrix, Stata 14's first `runiform()` draw for seed 123, a `stata()`
callback and a `matrix` command. The bundle pins OpenDTA commit `29a3b28`. Pyodide's
NumPy returns NaN from `cholesky`, `inv` and `solve` instead of raising, because
WebAssembly has no floating-point flags; the bridge restores the `LinAlgError` that
OpenDTA expects.

## Licence

MIT. OpenDTA is Copyright (c) 2026 OpenDTA contributors, MIT (`LICENSE-OpenDTA`).

[OpenDTA](https://github.com/yaskepalhares/opendta) · [bridge](opendta_bridge.py) · [types](index.d.ts)
