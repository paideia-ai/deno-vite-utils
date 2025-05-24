import { join } from 'jsr:@std/path'
import { assert } from 'jsr:@std/assert'
import { Mutex } from 'npm:async-mutex'

/**
 * Deno Info JSON Analysis
 * 
 * Based on testing, here's how `deno info --json` behaves:
 * 
 * ## roots[0] patterns:
 * - Relative paths (./main.ts) → Resolved to absolute file URLs (file:///full/path/main.ts)
 * - Import map bare specifiers (chalk) → Resolved to versioned npm specifier (npm:chalk@5.3.0)
 * - JSR bare specifiers (jsr:@luca/cases) → Stays as-is in roots
 * - Non-existent files (./non-existent.ts) → Still resolved to absolute file URL (doesn't fail!)
 * 
 * ## Redirects happen when:
 * - JSR packages: jsr:@luca/cases → https://jsr.io/@luca/cases/1.0.0/mod.ts
 * - NPM packages: npm:chalk@5.3.0 → npm:/chalk@5.3.0 (adds slash)
 * - Import maps: When bare specifier is resolved via import map
 * - NO redirects for: File URLs, they stay as-is
 * 
 * ## Module types in modules array:
 * - ESM modules (kind: "esm"): Local files, remote URLs (deno.land, jsr.io)
 * - NPM modules (kind: "npm"): npm packages
 * - Node modules (kind: "node"): Node built-ins like node:path
 * - Errors: Non-existent files/packages have error field instead of kind
 * 
 * ## Key insights:
 * - Non-existent files don't cause deno info to fail - they return an error module
 * - The specifier field in modules is the final resolved URL/path
 * - Import maps are resolved in roots[0], then redirects happen
 * - Dependencies show both the original specifier and the resolved code.specifier
 * - To find the module for a given input:
 *   1. Get actualId = json.roots[0]
 *   2. Get redirected = json.redirects[actualId] ?? actualId
 *   3. Find module where module.specifier === redirected
 */

interface DenoInfoJsonV1 {
  version: 1
  redirects: Record<string, string>
  roots: string[]
  modules: Array<
    | EsmResolvedInfo
    | NpmResolvedInfo
    | NodeResolvedInfo
    | ResolveError
  >
  packages?: Record<string, string>
  npmPackages?: Record<string, {
    name: string
    version: string
    dependencies: string[]
    registryUrl: string
  }>
}

interface EsmResolvedInfo {
  kind: 'esm'
  local: string
  size: number
  mediaType: DenoMediaType
  specifier: string
  dependencies?: Array<{
    specifier: string
    code: {
      specifier: string
    }
  }>
}

interface NpmResolvedInfo {
  kind: 'npm'
  specifier: string
  npmPackage: string
}

interface NodeResolvedInfo {
  kind: 'node'
  specifier: string
  moduleName: string
}

interface ResolveError {
  specifier: string
  error: string
}

type DenoMediaType = 'TypeScript' | 'TSX' | 'JavaScript' | 'JSX' | 'Json'

interface ResolvedInfo {
  kind: 'esm'
  local: string
  size: number
  mediaType: DenoMediaType
  specifier: string
  dependencies: Array<{
    relativePath: string
    specifier: string
  }>
}

type Module = ResolvedInfo | NpmResolvedInfo | NodeResolvedInfo | ResolveError

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

export class DenoEnv {
  protected cwd: string
  private lock = new Mutex()

  constructor(cwd: string) {
    this.cwd = cwd
  }

  async resolveDeno(
    id: string,
  ): Promise<DenoInfoJsonV1> {
    return await this.lock.runExclusive(async () => {
      const { code, stdout, stderr } = await run(
        ['deno', 'info', '--json', id],
        this.cwd,
      )
      
      assert(
        code === 0,
        `deno info failed for ${id}: ${stderr}`,
      )

      return JSON.parse(stdout) as DenoInfoJsonV1
    })
  }
}

class TestDenoEnv extends DenoEnv implements AsyncDisposable {
  private tempDir: string

  constructor(tempDir: string) {
    super(tempDir)
    this.tempDir = tempDir
  }

  async [Symbol.asyncDispose]() {
    try {
      await Deno.remove(this.tempDir, { recursive: true })
    } catch {
      // Ignore errors during cleanup
    }
  }
}


export async function prepareTestDenoEnv(
  files: Record<string, string>,
): Promise<TestDenoEnv> {
  const tempDir = await Deno.makeTempDir({
    prefix: 'deno_vite_playground_',
  })

  // Write all files to the temp directory
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(tempDir, path)
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'))
    
    // Ensure directory exists
    await Deno.mkdir(dir, { recursive: true })
    
    // Write file
    await Deno.writeTextFile(fullPath, content)
  }

  return new TestDenoEnv(tempDir)
}

export class DenoResolver {
  private env: DenoEnv
  private modules = new Map<string, Module>()
  private idToSpecifierCache = new Map<string, string>()

  constructor(env: DenoEnv) {
    this.env = env
  }

  private async callDenoInfo(id: string): Promise<void> {
    const info = await this.env.resolveDeno(id)

    for (const module of info.modules) {
      if ('error' in module || module.kind !== 'esm') {
        this.modules.set(module.specifier, module)
        console.log('Added module', module.specifier)
        continue
      }

      const resolvedInfo = this.transformEsmModule(module, info.redirects)
      this.modules.set(module.specifier, resolvedInfo)
      console.log('Added module', module.specifier)
    }

    const actualId = info.roots[0]
    const redirected = info.redirects[actualId] ?? actualId
    this.idToSpecifierCache.set(id, redirected)
  }

  private transformEsmModule(esm: EsmResolvedInfo, redirects: Record<string, string>): ResolvedInfo {
    return {
      kind: 'esm',
      local: esm.local,
      size: esm.size,
      mediaType: esm.mediaType,
      specifier: esm.specifier,
      dependencies: (esm.dependencies ?? []).map(dep => ({
        relativePath: dep.specifier,
        specifier: redirects[dep.code.specifier] ?? dep.code.specifier,
      })),
    }
  }

  async resolve(id: string, importerSpecifier: string | null): Promise<string> {
    if (importerSpecifier !== null) {
      // With importer, id must be in the importer's dependencies
      const importerModule = this.modules.get(importerSpecifier)

      if (!importerModule) {
        throw new Error(`Importer module not found: ${importerSpecifier}`)
      }
      
      if ('error' in importerModule || importerModule.kind !== 'esm') {
        // This is an internal consistency.
        // We should never have an importer handled by us, that is not an ESM module.
        throw new Error(`Importer is not an ESM module: ${importerSpecifier}`)
      }

      for (const dep of importerModule.dependencies) {
        if (dep.relativePath === id) {
          return dep.specifier
        }
      }
      
      throw new Error(`Import "${id}" not found in dependencies of ${importerSpecifier}`)
    } else {
      // Without importer, check cache first
      const cached = this.idToSpecifierCache.get(id)
      if (cached) {
        return cached
      }

      await this.callDenoInfo(id)
      
      const specifier = this.idToSpecifierCache.get(id)
      if (!specifier) {
        throw new Error(`Failed to resolve: ${id}`)
      }
      
      return specifier
    }
  }

  retrieveModule(specifier: string): Module {
    const module = this.modules.get(specifier)
    if (!module) {
      throw new Error(`Module not found: ${specifier}`)
    }
    return module
  }
}

// Example usage:
if (import.meta.main) {
  await using env = await prepareTestDenoEnv({
    'main.ts': `
import { camelCase } from "jsr:@luca/cases@1.0.0"
import { basename } from "node:path"
import { format } from "https://deno.land/std@0.224.0/fmt/bytes.ts"
import { greet } from "./helper.ts"
import { formatDate } from "./utils.ts"
import chalk from "chalk"
import dayjs from "dayjs-alias"

console.log(camelCase("hello world"))
console.log(basename("/foo/bar.ts"))
console.log(format(1024))
console.log(greet("Deno"))
console.log(formatDate(new Date()))
console.log(chalk.blue("Hello"))
console.log(dayjs().format())
`,
    'helper.ts': `
import { someNonExistentFunction } from "jsr:@fictional/package"

export function greet(name: string) {
  return \`Hello, \${name}!\`
}
`,
    'utils.ts': `
export function formatDate(date: Date) {
  return date.toISOString()
}
`,
    'deno.json': JSON.stringify({
      imports: {
        "chalk": "npm:chalk@5.3.0",
        "dayjs-alias": "npm:dayjs@1.11.13",
        "./utils.ts": "./utils.ts#utils-alias",
      },
    }, null, 2),
  })

  console.log('=== Test 1: Resolving main.ts ===')
  console.log('Input:', './main.ts')
  const result1 = await env.resolveDeno('./main.ts')
  console.log(JSON.stringify(result1, null, 2))
  
  console.log('\n=== Test 2: Resolving non-existent file ===')
  console.log('Input:', './non-existent.ts')
  const result2 = await env.resolveDeno('./non-existent.ts')
  console.log(JSON.stringify(result2, null, 2))
  
  console.log('\n=== Test 3: Resolving bare specifier (import map) ===')
  console.log('Input:', 'chalk')
  const result3 = await env.resolveDeno('chalk')
  console.log(JSON.stringify(result3, null, 2))
  
  console.log('\n=== Test 4: Resolving JSR without version ===')
  console.log('Input:', 'jsr:@luca/cases')
  const result4 = await env.resolveDeno('jsr:@luca/cases')
  console.log(JSON.stringify(result4, null, 2))
}