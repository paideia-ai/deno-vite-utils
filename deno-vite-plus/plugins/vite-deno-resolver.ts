/// <reference lib="deno.window" />

import { join } from 'jsr:@std/path/join'
import type { Plugin, ResolvedConfig } from 'vite'
import { transform } from 'esbuild'
import {
  isDenoSpecifier,
  mediaTypeToLoader,
  parseDenoSpecifier,
} from '@/lib/utils.ts'
import { Resolver } from '@/lib/resolver.ts'

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

export default function viteDenoResolver(
  opts: DenoResolverPluginOptions = {},
): Plugin {
  let resolver!: Resolver

  return {
    name: 'vite-deno-resolver',

    async configResolved(config: ResolvedConfig) {
      const cacheFile = join(config.cacheDir, 'faster-deno.json')
      resolver = new Resolver(
        config.root,
        config.logger,
        cacheFile,
      )
      await resolver.readCache()
    },

    async resolveId(id, importer) {
      // Check if this is an npm: specifier (should be handled by npm-unprefix)
      if (id.startsWith('npm:')) {
        handleNpmSpecifier(id)
      }

      // Check for externals first
      for (const prefix of opts.externalPrefixes ?? []) {
        if (id.startsWith(prefix)) {
          return {
            id,
            external: true,
          }
        }
      }

      // Whitelist approach - we only handle:
      // 1. If importer is a deno specifier
      // 2. If id starts with jsr: or @
      if (importer && isDenoSpecifier(importer)) {
        const { id: importerId, resolved: importerPath } = parseDenoSpecifier(
          importer,
        )
        return await resolver.resolveNestedImport(id, importerId, importerPath)
      }

      if (shouldHandleId(id)) {
        return await resolver.resolveBase(id)
      }

      // Let other plugins handle this import
      return null
    },

    async load(id) {
      if (!isDenoSpecifier(id)) {
        return
      }

      const { loader, resolved } = parseDenoSpecifier(id)

      const src = await Deno.readTextFile(resolved)

      if (loader === 'JavaScript') {
        return src
      }
      if (loader === 'Json') {
        return `export default ${src}`
      }

      const result = await transform(src, {
        format: 'esm',
        loader: mediaTypeToLoader(loader),
        logLevel: 'silent',
      })

      return { code: result.code, map: result.map === '' ? null : result.map }
    },

    async closeBundle() {
      await resolver.finalize()
    },
  }
}
