// mata-pyodide: run Stata's Mata language in the browser or Node, on Pyodide.
// The Mata interpreter is OpenDTA's (https://github.com/yaskepalhares/opendta,
// MIT), bundled in opendta-mata.json; mata_bridge.py connects it to a host
// that owns the dataset, macros and scalars.

const ROOT = '/mata_pyodide';
const installed = new WeakMap();

async function text(source, fallback) {
  const u = new URL(source ?? fallback, import.meta.url);
  if (u.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return readFile(u, 'utf8');
  }
  const res = await fetch(u);
  if (!res.ok) throw new Error(`mata-pyodide: could not fetch ${u.href} (HTTP ${res.status})`);
  return res.text();
}

/**
 * Install Mata into a Pyodide instance: loads numpy and scipy, writes the
 * OpenDTA modules and the bridge into Pyodide's file system, and imports them.
 * `bundle` and `bridge` are URLs (relative to this module) of
 * opendta-mata.json and mata_bridge.py; they default to the copies next to this
 * module. `bundle` may also be the parsed bundle object.
 */
export async function installMata(pyodide, { bundle, bridge } = {}) {
  if (installed.has(pyodide)) return installed.get(pyodide);
  const job = (async () => {
    const b = bundle?.files ? bundle : JSON.parse(await text(bundle, './opendta-mata.json'));
    const py = await text(bridge, './mata_bridge.py');
    await pyodide.loadPackage(['numpy', 'scipy']);
    for (const [path, body] of Object.entries(b.files)) {
      pyodide.FS.mkdirTree(`${ROOT}/${path}`.replace(/\/[^/]+$/, ''));
      pyodide.FS.writeFile(`${ROOT}/${path}`, body);
    }
    pyodide.FS.mkdirTree(ROOT);
    pyodide.FS.writeFile(`${ROOT}/mata_bridge.py`, py);
    pyodide.runPython(
      `import sys\nif ${JSON.stringify(ROOT)} not in sys.path: sys.path.insert(0, ${JSON.stringify(ROOT)})\nimport mata_bridge`,
    );
    return { source: b.source, commit: b.commit };
  })();
  installed.set(pyodide, job);
  job.catch(() => installed.delete(pyodide));
  return job;
}

const DEFAULTS = {
  kind: 'block',
  colon: false,
  reset: false,
  linesize: 80,
  nobs: 0,
  vars: [],
  columns: [],
  locals: {},
  globals: {},
  scalars: {},
  r: {},
  e: {},
  rng: '',
  ematrix: null,
};

/**
 * Run one request: a Mata block, one `mata:` line, or a Stata `matrix`
 * command. Returns the log, any error, and what the code changed.
 */
export async function runMata(pyodide, request) {
  await installMata(pyodide);
  const { columns, stata, evaluate, ...meta } = { ...DEFAULTS, ...request };
  const g = pyodide.globals;
  g.set('__mp_meta', JSON.stringify(meta));
  g.set('__mp_cols', columns);
  g.set('__mp_host', stata ?? null);
  g.set('__mp_eval', evaluate ?? null);
  try {
    // runPythonAsync lets stata() and matrix expressions wait on the host through
    // Pyodide's run_sync, which needs WebAssembly stack switching (JSPI).
    const out = await pyodide.runPythonAsync(
      'mata_bridge.run_json(__mp_meta, __mp_cols, __mp_host, __mp_eval)',
    );
    return JSON.parse(out);
  } finally {
    for (const k of ['__mp_meta', '__mp_cols', '__mp_host', '__mp_eval']) g.delete(k);
  }
}

/**
 * A Mata session with no dataset: `run(code)` runs a block and returns its log.
 * Functions and variables persist between calls; `reset()` clears them.
 */
export async function createMata(pyodide, options) {
  await installMata(pyodide, options);
  let fresh = true;
  return {
    async run(code, request = {}) {
      const out = await runMata(pyodide, { ...request, code, reset: fresh || request.reset === true });
      fresh = false;
      return out;
    },
    reset() {
      fresh = true;
    },
  };
}
