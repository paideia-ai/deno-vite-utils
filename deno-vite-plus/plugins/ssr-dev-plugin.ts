/// <reference lib="deno.window" />

import type { Plugin } from 'vite'

const idPrefix = '\0deno-ssr-dev::'

interface ModuleStorage {
  __denoSsrDevModules?: Record<string, Record<string, unknown>>
}

/**
 * Determines if the given ID should be handled by the SSR dev plugin
 * based on the list of configured dependencies.
 *
 * @param id - The import specifier to check
 * @param deps - List of dependencies to handle, can include wildcards
 * @returns true if this import should be handled
 */
export function shouldHandleId(id: string, deps: string[]): boolean {
  return deps.some((dep) => {
    if (dep.endsWith('*')) {
      // Handle wildcard matching (e.g., '@org/*')
      const prefix = dep.slice(0, -1)
      return id.startsWith(prefix)
    }
    return id === dep || id.startsWith(dep + '/')
  })
}

/**
 * SSR dev plugin for running Deno code natively using Deno during development
 *
 * This plugin intercepts imports to specified external dependencies during SSR in dev mode
 * and loads them directly via Deno's import system, making them available to the Vite dev server.
 */
export default function ssrDevPlugin(deps: string[] = []): Plugin {
  return {
    name: 'deno-ssr-dev',
    apply: 'serve', // Only apply this plugin during development

    resolveId(id, _importer, options) {
      // Only apply during SSR
      if (!options.ssr) {
        return null
      }

      // Check if this ID matches any of the specified dependencies
      if (shouldHandleId(id, deps)) {
        return idPrefix + id
      }

      return null
    },

    async load(id) {
      if (!id.startsWith(idPrefix)) {
        return null
      }

      const moduleStorage = globalThis as ModuleStorage

      if (!moduleStorage.__denoSsrDevModules) {
        moduleStorage.__denoSsrDevModules = {}
      }

      const originalId = id.slice(idPrefix.length)
      const module = await import(originalId)

      moduleStorage.__denoSsrDevModules[originalId] = module

      let sourceCode =
        `const module = globalThis.__denoSsrDevModules['${originalId}']\n\n`

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
    },
  }
}
