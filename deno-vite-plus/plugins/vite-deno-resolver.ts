/// <reference lib="deno.window" />

import { join } from 'jsr:@std/path/join'
import type { Plugin, ResolvedConfig } from 'vite'
import { transform } from 'esbuild'
import {
  isDenoSpecifier,
  mediaTypeToLoader,
  type NpmResolvedInfo,
  parseDenoSpecifier,
  type ResolvedInfo,
  toDenoSpecifier,
} from '@/lib/utils.ts'
import { Resolver } from '@/lib/resolver.ts'
import { parseNpmSpecifier } from 'npm-unprefix.ts'

/* ─── Options & defaults ──────────────────────────────────────────────── */

export interface DenoResolverPluginOptions {
  externalPrefixes?: string[]
}

/* ─── Helper to determine if we should handle this ID ─────────────────── */

/**
 * Determine if this is an ID that the Deno resolver should handle
 * Based on whitelist approach:
 * 1. JSR imports (jsr: prefix)
 * 2. Scoped packages (@prefix)
 *
 * @param id - The import specifier to check
 * @returns true if this resolver should handle the specifier
 */
export function shouldHandleId(id: string): boolean {
  // Handle JSR imports (jsr: prefix)
  if (id.startsWith('jsr:')) {
    return true
  }

  // Handle scoped packages (@prefix)
  if (id.startsWith('@')) {
    return true
  }

  return false
}

function handleNpmSpecifier(id: string): never {
  throw new Error(
    `Found npm: specifier (${id}) in vite-deno-resolver. ` +
      'npm: imports should be handled by the npm-unprefix plugin. ' +
      'Make sure that plugin is included before vite-deno-resolver.',
  )
}

/* ─── Core plugin factory ─────────────────────────────────────────────── */

async function resolve(
  specifier: string,
  importerSpecifier: string | null,
): Promise<ResolvedInfo | NpmResolvedInfo | null> {
  return Promise.resolve(null)
}

function retrieveEsmModule(specifier: string): Promise<ResolvedInfo> {
  throw new Error('Not implemented')
}

function parseDenoID(id: string): string | null {
  throw new Error('Not implemented')
}

function npmSpecifierToNpmId(specifier: string, npmPackage: string): string {
  /*
   {
      "kind": "npm",
      "specifier": "npm:/@prisma/client@6.8.2/runtime/client",
      "npmPackage": "@prisma/client@6.8.2"
    }

    => @prisma/client/runtime/client
  */
  throw new Error('Not implemented')
}

interface ModuleStorage {
  __denoSsrDevModules?: Record<string, Record<string, unknown>>
}

export default function viteDenoResolver(
  opts: DenoResolverPluginOptions = {},
): Plugin {
  let resolver!: Resolver

  let isDev = false
  let isSSR = false

  return {
    name: 'vite-deno-resolver',

    async config(config, env) {
      isDev = env.command === 'serve'
      isSSR = env.isSsrBuild || false

      return config
    },

    async configResolved(config: ResolvedConfig) {
      const cacheFile = join(config.cacheDir, 'faster-deno.json')
      resolver = new Resolver(
        config.root,
        config.logger,
        cacheFile,
      )
      await resolver.readCache()
    },

    async resolveId(id, importer, options) {
      const importerSpecifier = importer && parseDenoID(importer)
      const target = await resolve(id, importerSpecifier || null)

      if (!target) {
        return null
      }

      if (target.kind === 'npm') {
        const npmId = npmSpecifierToNpmId(target.specifier, target.npmPackage)
        return this.resolve(npmId, importer, {
          ...options,
          skipSelf: true,
        })
      }

      const resolvedId = '\0deno::${target.specifier}'
      if (!isSSR || isDev) {
        return resolvedId
      }

      // TODO: we need to decide if this should be external or not
      return {
        id: resolvedId,
        external: false,
      }
    },

    async load(id) {
      if (!id.startsWith('\0deno::')) {
        return null
      }

      const moduleInfo = await retrieveEsmModule(id)

      if (isDev && isSSR) {
        // we need to construct virtual module

        const module = await import(moduleInfo.specifier)
        const moduleStorage = globalThis as ModuleStorage

        if (!moduleStorage.__denoSsrDevModules) {
          moduleStorage.__denoSsrDevModules = {}
        }

        moduleStorage.__denoSsrDevModules[moduleInfo.specifier] = module

        let sourceCode =
          `const module = globalThis.__denoSsrDevModules['${moduleInfo.specifier}']\n\n`

        let hasDefault = false
        for (const key in module) {
          if (key !== 'default') {
            sourceCode += `export const ${key} = module.${key};\n`
          } else {
            hasDefault = true
          }
        }

        if (hasDefault) {
          sourceCode += `export default module.default;\n`
        }

        return sourceCode
      }

      const src = await Deno.readTextFile(moduleInfo.local)

      if (moduleInfo.mediaType === 'JavaScript') {
        return src
      }
      if (moduleInfo.mediaType === 'Json') {
        return `export default ${src}`
      }

      const result = await transform(src, {
        format: 'esm',
        loader: mediaTypeToLoader(moduleInfo.mediaType),
        logLevel: 'silent',
      })

      return { code: result.code, map: result.map === '' ? null : result.map }
    },

    async closeBundle() {
      await resolver.finalize()
    },
  }
}
