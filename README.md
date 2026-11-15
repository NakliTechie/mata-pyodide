<h1 align="center">mata-pyodide</h1>

<p align="center"><b>Run Stata's Mata matrix language in the browser or Node.<br>
OpenDTA's open-source Mata interpreter, packaged for Pyodide, with a bridge to your own data.</b></p>

<p align="center">Pyodide 0.27, NumPy and SciPy. No server. MIT.</p>

<p align="center">
<img alt="npm" src="https://img.shields.io/npm/v/mata-pyodide?style=flat-square&color=555">
<img alt="licence MIT" src="https://img.shields.io/badge/licence-MIT-555?style=flat-square">
<img alt="runtime Pyodide 0.27" src="https://img.shields.io/badge/runtime-Pyodide%200.27-555?style=flat-square">
</p>

## Install

| Where | How |
|---|---|
| npm | `npm install mata-pyodide pyodide@0.27.7` |
| CDN | `import { createMata } from 'https://cdn.jsdelivr.net/npm/mata-pyodide@0.1.0/index.mjs'` |
| GitHub tag | `https://cdn.jsdelivr.net/gh/NakliTechie/mata-pyodide@v0.1.0/index.mjs` |

```js
import { loadPyodide } from 'pyodide';
import { createMata } from 'mata-pyodide';

const mata = await createMata(await loadPyodide());   // loads numpy and scipy once
const out = await mata.run('A = (4,2\\2,3)\ncholesky(A)\ninvsym(A)');
console.log(out.log);   // the Mata log, formatted as Stata 14 prints it
```

`createMata` fetches `opendta-mata.json` (400 KB) and `mata_bridge.py` from beside
`index.mjs`. Functions and variables you define stay until you call `reset()`.

## Why

You have Mata code from a Stata project and want it to run where your users are, in a web
page or a Node script, without a Stata licence. [OpenDTA](https://github.com/yaskepalhares/opendta)
is an MIT Python reimplementation of Stata 14 with a Mata interpreter. Its test files
exercise functions, classes, `optimize()`, `moptimize()` and the `st_*` data functions. This package ships only the 45 modules Mata uses, and a bridge so Mata reads
and writes a dataset that your code owns.

NakliData, a browser data workbench, runs OpenDTA's 9 Mata test files through this bridge
from its do-file interpreter: 7 print logs equal to Stata 14's, and the other 2 differ
where OpenDTA lists known differences.

## Give Mata your data

`runMata` takes the dataset as columns, plus macros and scalars, and returns what the code
changed:

```js
import { runMata } from 'mata-pyodide';

const out = await runMata(pyodide, {
  nobs: 3,
  vars: [['x', 'num', 'DOUBLE']],
  columns: [new Float64Array([1, 2, NaN])],    // NaN is Stata's missing value
  code: 'st_numscalar("total", colsum(st_data(., "x")))',
});
out.scalars.total;   // 3
```

The response holds `log`, `error` (`{ code, message }` with Stata's return code), and the
changed `data`, `locals`, `globals`, `scalars`, `r`, `e` and random-number state. Pass `rng`
back in the next request so `runiform()` continues Stata 14's stream.

## Call back into your host

Give `stata: async (stateJson) => reply` to run `stata("...")` from Mata, and
`evaluate` for expressions inside `kind: 'matrix'` commands. Both wait on your async code
through Pyodide's `run_sync`, which needs WebAssembly stack switching (JSPI): on by default
in Chrome 137 and later, and behind `--experimental-wasm-jspi` in Node 22. Without JSPI the
call stops with Stata error 3000 and says why. The reply format is in `index.d.ts`.

## Commands

```sh
npm test                                   # 7 tests in Node with JSPI: blocks, data, rng, stata(), matrix
uv run --no-project --python 3.12 --with numpy==2.0.2 --with scipy \
  python -I scripts/bundle-opendta.py <opendta checkout>   # rebuild opendta-mata.json at the pin
```

## Verify it yourself

```sh
npm ci && npm test
```

The tests run Mata in Pyodide 0.27.7 and check printed matrices, a missing result for a
singular matrix, dataset round trips, Stata 14's first `runiform()` draw for seed 123
(0.31320017867847072), a `stata()` callback, and a `matrix` command. The bundle pins
OpenDTA commit `29a3b28`. Pyodide's NumPy returns NaN from `cholesky`, `inv` and `solve`
instead of raising, because WebAssembly has no floating-point flags; `mata_bridge.py`
restores the `LinAlgError` that OpenDTA expects.

## Licence

MIT. OpenDTA is Copyright (c) 2026 OpenDTA contributors, MIT (`LICENSE-OpenDTA`).

[OpenDTA](https://github.com/yaskepalhares/opendta) · [bridge](mata_bridge.py) · [types](index.d.ts)
