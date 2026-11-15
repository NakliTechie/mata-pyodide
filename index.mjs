// opendta-pyodide: run Stata 14 commands and Mata in the browser or Node, on
// Pyodide. The engine is OpenDTA (https://github.com/yaskepalhares/opendta,
// MIT), bundled in opendta.json; opendta_bridge.py connects it to a host that
// owns the dataset, macros and scalars.

const ROOT = '/opendta_pyodide';
const installed = new WeakMap();
const withGraphs = new WeakSet();

// Commands that draw: their first word, as Stata accepts it (abbreviations included).
const GRAPH = /^\s*(?:(?:quietly|qui|noisily|noi|capture|cap)\s+)*(?:gr(?:a(?:ph?)?)?|tw(?:o(?:w(?:ay?)?)?)?|sc(?:a(?:t(?:t(?:er?)?)?)?)?|line|connected|area|bar|hist(?:o(?:g(?:r(?:am?)?)?)?)?|kdensity|kdens|qnorm|pnorm|qqplot|lowess|binscatter|marginsplot|coefplot|rvfplot|avplots?|lvr2plot|graph\s+\w+)\b/m;

async function text(source, fallback) {
  const u = new URL(source ?? fallback, import.meta.url);
  if (u.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return readFile(u, 'utf8');
  }
  const res = await fetch(u);
  if (!res.ok) throw new Error(`opendta-pyodide: could not fetch ${u.href} (HTTP ${res.status})`);
  return res.text();
}

/**
 * Install OpenDTA into a Pyodide instance: loads numpy and scipy, writes the
 * OpenDTA modules and the bridge into Pyodide's file system, and imports the
 * bridge. `bundle` and `bridge` are URLs (relative to this module) of
 * opendta.json and opendta_bridge.py, defaulting to the copies next to this
 * module; `bundle` may also be the parsed bundle object.
 */
export async function installOpenDTA(pyodide, { bundle, bridge } = {}) {
  if (installed.has(pyodide)) return installed.get(pyodide);
  const job = (async () => {
    const b = bundle?.files ? bundle : JSON.parse(await text(bundle, './opendta.json'));
    const py = await text(bridge, './opendta_bridge.py');
    await pyodide.loadPackage(['numpy', 'scipy']);
    for (const [path, body] of Object.entries(b.files)) {
      pyodide.FS.mkdirTree(`${ROOT}/${path}`.replace(/\/[^/]+$/, ''));
      pyodide.FS.writeFile(`${ROOT}/${path}`, body);
    }
    pyodide.FS.mkdirTree(ROOT);
    pyodide.FS.writeFile(`${ROOT}/opendta_bridge.py`, py);
    pyodide.runPython(
      `import sys\nif ${JSON.stringify(ROOT)} not in sys.path: sys.path.insert(0, ${JSON.stringify(ROOT)})\nimport opendta_bridge`,
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
  echo: false,
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

/** True when Stata command text draws a graph (so matplotlib must be loaded first). */
export function drawsGraph(code) {
  return GRAPH.test(code);
}

/**
 * Run one request: Stata command lines (`kind: 'command'`), a Mata block, one
 * `mata:` line, or a Stata `matrix` command. Returns the log, any error, what
 * the code changed, and (for commands) the graphs drawn, as SVG text.
 */
export async function runRequest(pyodide, request) {
  await installOpenDTA(pyodide);
  const { columns, stata, evaluate, ...meta } = { ...DEFAULTS, ...request };
  if (meta.kind === 'command' && !withGraphs.has(pyodide) && drawsGraph(meta.code)) {
    await pyodide.loadPackage(['matplotlib']);
    withGraphs.add(pyodide);
  }
  const g = pyodide.globals;
  g.set('__od_meta', JSON.stringify(meta));
  g.set('__od_cols', columns);
  g.set('__od_host', stata ?? null);
  g.set('__od_eval', evaluate ?? null);
  try {
    // runPythonAsync lets stata() and matrix expressions wait on the host through
    // Pyodide's run_sync, which needs WebAssembly stack switching (JSPI).
    const out = await pyodide.runPythonAsync(
      'opendta_bridge.run_json(__od_meta, __od_cols, __od_host, __od_eval)',
    );
    return JSON.parse(out);
  } finally {
    for (const k of ['__od_meta', '__od_cols', '__od_host', '__od_eval']) g.delete(k);
  }
}

/**
 * A session with no host dataset: `stata(lines)` runs Stata commands on
 * OpenDTA's own dataset, which persists between calls; `mata(code)` runs a
 * Mata block with its own functions and variables. `reset()` starts both over.
 */
export async function createSession(pyodide, options) {
  await installOpenDTA(pyodide, options);
  let fresh = { command: true, block: true };
  return {
    async stata(code, request = {}) {
      const out = await runRequest(pyodide, {
        echo: true,
        ...request,
        kind: 'command',
        code,
        reset: fresh.command,
        keepData: true,
      });
      fresh.command = false;
      return out;
    },
    async mata(code, request = {}) {
      const out = await runRequest(pyodide, { ...request, kind: 'block', code, reset: fresh.block });
      fresh.block = false;
      return out;
    },
    reset() {
      fresh = { command: true, block: true };
    },
  };
}
