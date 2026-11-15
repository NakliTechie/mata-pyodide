// Types for mata-pyodide.

/** The slice of the Pyodide API this package uses (Pyodide 0.27). */
export interface PyodideLike {
  runPython(code: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  loadPackage(names: string[]): Promise<unknown>;
  globals: { set(name: string, value: unknown): void; delete(name: string): void };
  FS: { mkdirTree(path: string): void; writeFile(path: string, data: string): void };
}

type Value = number | string | null;


/** What the host holds, as Mata reads it. Every field is optional in a request. */
export interface MataState {
  nobs: number;
  /** [name, 'num' | 'str' | 'date', SQL type] per variable, in dataset order. The SQL type sets
   *  Stata's storage type: TINYINT byte, SMALLINT int, INTEGER long, FLOAT float, else double. */
  vars: Array<[string, 'num' | 'str' | 'date', string]>;
  /** Float64Array (NaN = missing; dates as days since 1960-01-01) or strings. */
  columns: Array<Float64Array | string[]>;
  locals: Record<string, string>;
  globals: Record<string, string>;
  scalars: Record<string, Value>;
  r: Record<string, Value>;
  e: Record<string, Value>;
  /** Stata 14's random-number state ("X" + hex), as returned in a response's `rng`. Empty for a fresh seed. */
  rng: string;
  /** e(b) and e(V) of the last estimation, for `matrix list e(b)` and st_matrix("e(b)"). */
  ematrix: { names: string[]; b: number[]; V: number[][] } | null;
}

/**
 * Reply to a `stata()` call from Mata: the host's full state after the command
 * (every MataState field except columns, plus `log: string[]` and
 * `error: {code, message} | null`) as JSON, and the columns separately.
 */
export interface MataStataReply {
  json: string;
  columns: Array<Float64Array | string[]>;
}

export interface MataRequest extends Partial<MataState> {
  /** A `mata` block, a `mata:` line, or a Stata `matrix` command (run by OpenDTA's matrix code). */
  kind?: 'block' | 'line' | 'matrix';
  /** Block body (the lines between `mata` and `end`), one statement, or a matrix command without the word `matrix`. */
  code: string;
  /** `mata:` stops at the first error; `mata` reports it and carries on. Default false. */
  colon?: boolean;
  /** Start a fresh Mata session (functions and globals cleared). Default false. */
  reset?: boolean;
  /** `set linesize`: Mata wraps matrices and rules at this width. Default 80. */
  linesize?: number;
  /** Runs `stata("cmd")`: receives Mata's changes as JSON (MataChanges plus `cmd`). Needs JSPI. */
  stata?: (stateJson: string) => Promise<MataStataReply>;
  /** Evaluates a Stata scalar expression for `matrix`; returns JSON `{"value": number | string | null}` or `{"error": {code, message}}`. Needs JSPI. */
  evaluate?: (expr: string) => Promise<string>;
}

export interface MataColumn {
  name: string;
  kind: 'num' | 'str' | 'date';
  integer?: boolean;
  values: Value[];
}

/** What Mata changed. `data` is null when the dataset is unchanged. */
export interface MataChanges {
  data: { full: boolean; nobs: number; order: string[]; columns: MataColumn[] } | null;
  locals: Record<string, string>;
  globals: Record<string, string>;
  scalars: Record<string, Value>;
  /** null when Mata left r() / e() unchanged. */
  r: Record<string, Value> | null;
  e: Record<string, Value> | null;
  rng: string;
}

export interface MataResponse extends MataChanges {
  log: string;
  error: { code: number; message: string } | null;
}

/** The parsed opendta-mata.json. */
export interface MataBundle {
  source: string;
  commit: string;
  licence: string;
  patched: string[];
  files: Record<string, string>;
}

export interface InstallOptions {
  /** URL of opendta-mata.json (relative to this module), or the parsed bundle. */
  bundle?: string | URL | MataBundle;
  /** URL of mata_bridge.py (relative to this module). */
  bridge?: string | URL;
}

export function installMata(pyodide: PyodideLike, options?: InstallOptions): Promise<{ source: string; commit: string }>;
export function runMata(pyodide: PyodideLike, request: MataRequest): Promise<MataResponse>;
export function createMata(
  pyodide: PyodideLike,
  options?: InstallOptions,
): Promise<{ run(code: string, request?: MataRequest): Promise<MataResponse>; reset(): void }>;
