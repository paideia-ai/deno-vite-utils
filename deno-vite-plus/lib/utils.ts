import type { Loader } from 'esbuild'

export type DenoSpecifierName = string & { __brand: 'deno' }
export type DenoMediaType = 'TypeScript' | 'TSX' | 'JavaScript' | 'JSX' | 'Json'

export function isDenoSpecifier(str: string): str is DenoSpecifierName {
  return str.startsWith('\0deno')
}

export function toDenoSpecifier(
  loader: DenoMediaType,
  id: string,
  resolved: string,
): DenoSpecifierName {
  return `\0deno::${loader}::${id}::${resolved}` as DenoSpecifierName
}

export function parseDenoSpecifier(spec: DenoSpecifierName) {
  const [_tag, loader, id, resolved] = spec.split('::')
  return { loader: loader as DenoMediaType, id, resolved }
}

/* ─── run arbitrary commands with Deno.Command (no child_process) ────── */

async function run(cmd: string[], cwd: string) {
  const { stdout, stderr, code } = await new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd,
    stdout: 'piped',
    stderr: 'piped',
  }).output()

  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  }
}

/* ─── Resolve a specifier with `deno info --json` ─────────────────────── */

export async function resolveDeno(
  id: string,
  cwd: string,
): Promise<{ specifier: string; tree: DenoInfoJsonV1 } | null> {
  const { code, stdout } = await run(['deno', 'info', '--json', id], cwd)
  if (code !== 0) {
    return null
  }

  const json = JSON.parse(stdout) as DenoInfoJsonV1
  const actualId = json.roots[0]
  const redirected = json.redirects[actualId] ?? actualId
  const mod = json.modules.find((m) => m.specifier === redirected)

  if (!mod || 'error' in mod) {
    return null
  }

  return { specifier: redirected, tree: json }
}

/* ─── Misc helpers  ------------------------------------------------------ */

export function mediaTypeToLoader(media: DenoMediaType): Loader {
  switch (media) {
    case 'JSX':
      return 'jsx'
    case 'JavaScript':
      return 'js'
    case 'Json':
      return 'json'
    case 'TSX':
      return 'tsx'
    case 'TypeScript':
      return 'ts'
  }
}

export interface ResolvedInfo {
  kind: 'esm'
  local: string
  size: number
  mediaType: DenoMediaType
  specifier: string
  dependencies: Array<{
    specifier: string
    code: {
      specifier: string
      span: { start: unknown; end: unknown }
    }
  }>
}

export interface NpmResolvedInfo {
  kind: 'npm'
  specifier: string
  npmPackage: string
}

interface ExternalResolvedInfo {
  kind: 'external'
  specifier: string
}

interface ResolveError {
  specifier: string
  error: string
}

interface DenoInfoJsonV1 {
  version: 1
  redirects: Record<string, string>
  roots: string[]
  modules: Array<
    NpmResolvedInfo | ResolvedInfo | ExternalResolvedInfo | ResolveError
  >
}

export interface DenoResolveResult {
  id: string
  kind: 'esm' | 'npm'
  loader: DenoMediaType | null
  dependencies: ResolvedInfo['dependencies']
}
