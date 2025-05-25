import type { DenoEnv } from './deno-env.ts'
import type { EsmResolvedInfo, Module, ResolvedInfo } from './types.ts'

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
        continue
      }

      const resolvedInfo = this.transformEsmModule(module, info.redirects)
      this.modules.set(module.specifier, resolvedInfo)
    }

    const actualId = info.roots[0]
    const redirected = info.redirects[actualId] ?? actualId
    this.idToSpecifierCache.set(id, redirected)
  }

  private transformEsmModule(
    esm: EsmResolvedInfo,
    redirects: Record<string, string>,
  ): ResolvedInfo {
    return {
      kind: 'esm',
      local: esm.local,
      size: esm.size,
      mediaType: esm.mediaType,
      specifier: esm.specifier,
      dependencies: (esm.dependencies ?? []).map((dep) => ({
        relativePath: dep.specifier,
        specifier: redirects[dep.code.specifier] ?? dep.code.specifier,
      })),
    }
  }

  async resolve(
    id: string,
    importerSpecifier: string | null,
  ): Promise<string | null> {
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

      return null
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

  /**
   * Collect all dependencies transitively for a given entry module
   */
  async collectDeps(entry: string): Promise<string[]> {
    const seen = new Set<string>()

    const walk = async (spec: string) => {
      if (seen.has(spec)) {
        return
      }
      seen.add(spec)

      // Ensure the module is resolved
      if (!this.modules.has(spec)) {
        try {
          await this.resolve(spec, null)
        } catch {
          // Skip modules that can't be resolved
          return
        }
      }

      const module = this.modules.get(spec)
      if (!module) {
        return
      }

      // Only process ESM modules with dependencies
      if ('error' in module || module.kind !== 'esm') {
        return
      }

      // Recursively walk dependencies
      for (const dep of module.dependencies) {
        await walk(dep.specifier)
      }
    }

    await walk(entry)
    return Array.from(seen)
  }
}
