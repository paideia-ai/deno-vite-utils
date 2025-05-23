/// <reference lib="deno.window" />

import type { Plugin } from 'vite'

/**
 * Parse an npm: specifier into a standard package path
 *
 * @param id The npm: prefixed string to parse
 * @returns The normalized package path or null if not an npm: URL
 */
export function parseNpmSpecifier(id: string): string | null {
  if (!id.startsWith('npm:')) {
    return null
  }

  const match = id.match(/^npm:(@?[^@]+)(?:@[^/]+)?(\/.*)?$/)
  if (!match) {
    return null
  }

  const [, packageName, path = ''] = match
  return packageName + path
}

/**
 * Vite plugin to handle npm: prefixed imports.
 * This converts npm: imports to standard package imports.
 */
export default function npmUnprefixPlugin(): Plugin {
  return {
    name: 'vite-npm-unprefix',
    enforce: 'pre',

    async resolveId(id, importer, options) {
      const normalizedId = parseNpmSpecifier(id)
      if (normalizedId) {
        console.log('Resolving npm:', id, 'to', normalizedId)
        return this.resolve(normalizedId, importer, {
          ...options,
          skipSelf: true,
        })
      }
      return null
    },
  }
}
