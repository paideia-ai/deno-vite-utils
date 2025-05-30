import { extname, globToRegExp, isGlob } from '@std/path'
import type { Plugin } from 'vite'
import { DenoEnv } from '@/lib/deno-env.ts'
import { DenoResolver } from '@/lib/deno-resolver.ts'
import { loadAndRewrite } from './vite-load-hook.ts'

export function toDenoSpecifier(specifier: string): string {
  const encoded = encodeURIComponent(specifier)
  return '\0deno::' + encoded
}

export function parseDenoSpecifier(specifier: string): string | null {
  if (!specifier.startsWith('\0deno::')) {
    return null
  }
  const encoded = specifier.slice(7)
  return decodeURIComponent(encoded)
}

export function npmSpecifierToNpmId(
  specifier: string,
): string {
  // Remove npm:/ prefix
  const withoutPrefix = specifier.slice(5)

  // Split by / to separate package name from path
  const parts = withoutPrefix.split('/')

  if (parts[0].startsWith('@')) {
    // Scoped package: @org/package@version/path -> @org/package/path
    const scopedPackage = parts[0] + '/' + parts[1].split('@')[0]
    const pathParts = parts.slice(2)
    return pathParts.length > 0
      ? scopedPackage + '/' + pathParts.join('/')
      : scopedPackage
  } else {
    // Regular package: package@version/path -> package/path
    const packageName = parts[0].split('@')[0]
    const pathParts = parts.slice(1)
    return pathParts.length > 0
      ? packageName + '/' + pathParts.join('/')
      : packageName
  }
}

interface ModuleStorage {
  __denoSsrDevModules?: Record<string, Record<string, unknown>>
}

export default function viteDenoResolver(
  skipDevSsrVirtualization: boolean,
): Plugin {
  let resolver: DenoResolver
  let root: string

  let isDev = false
  let isDefaultSSR = false
  let ssrExternals: string[] = []

  return {
    name: 'vite-deno-resolver',
    enforce: 'pre',

    async config(config, env) {
      isDev = env.command === 'serve'
      isDefaultSSR = env.isSsrBuild || false

      // Initialize resolver with the correct root directory
      root = config.root || Deno.cwd()
      resolver = new DenoResolver(new DenoEnv(root))

      // Store SSR externals if they're an array of strings
      if (config.ssr?.external && Array.isArray(config.ssr.external)) {
        ssrExternals = config.ssr.external.filter((ext) =>
          typeof ext === 'string'
        )
      }

      // Ensure correct resolve conditions for browser vs SSR
      if (!config.resolve) {
        config.resolve = {}
      }

      if (!config.resolve.conditions) {
        config.resolve.conditions = []
      }

      if (isDefaultSSR) {
        // For SSR in Deno, prioritize deno conditions before node
        const denoConditions = ['deno', 'import', 'module']
        for (const condition of denoConditions) {
          if (!config.resolve.conditions.includes(condition)) {
            config.resolve.conditions.unshift(condition)
          }
        }
        // Add node as fallback
        if (!config.resolve.conditions.includes('node')) {
          config.resolve.conditions.push('node')
        }
      } else {
        // For browser, ensure browser conditions are used
        if (!config.resolve.conditions.includes('browser')) {
          config.resolve.conditions.push('browser')
        }
      }
      return config
    },

    async resolveId(id, importer, options) {
      const importerSpecifier = await (async () => {
        if (!importer) {
          return null
        }

        const specifier = parseDenoSpecifier(importer)
        if (specifier) {
          return specifier
        }

        if (
          importer.startsWith(root + '/') &&
          !importer.includes('/node_modules/')
        ) {
          const exts = ['.js', '.ts', '.jsx', '.tsx']
          if (!exts.includes(extname(importer))) {
            return null
          }

          return await resolver.resolve(importer, null)
        }

        return null
      })()

      if (importer && !importerSpecifier) {
        // None of our business
        return null
      }

      if (!importerSpecifier) {
        // - We don't handle virtual modules
        // - We don't handle absolute paths, as they are URLs for vite
        const invalidPrefixes = ['\0', '/', '.', 'virtual:']
        if (invalidPrefixes.some((prefix) => id.startsWith(prefix))) {
          return null
        }
      }

      const target = await resolver.resolve(id, importerSpecifier || null)
      if (!target) {
        return null
      }

      const targetModule = resolver.retrieveModule(target)

      if ('error' in targetModule) {
        throw new Error(`Failed to resolve: ${id}`)
      }

      if (targetModule.kind === 'npm') {
        const npmId = npmSpecifierToNpmId(
          targetModule.specifier,
        )

        return this.resolve(npmId, importer, {
          ...options,
          skipSelf: true,
        })
      }

      if (targetModule.kind === 'node') {
        return {
          id,
          external: true,
        }
      }

      const isSSR = options?.ssr || isDefaultSSR
      const resolvedId = toDenoSpecifier(target)
      if (!isSSR || isDev) {
        return resolvedId
      }

      // Check if the id matches any of the SSR externals patterns
      const isExternal = ssrExternals.some((pattern) => {
        if (isGlob(pattern)) {
          const regex = globToRegExp(pattern)
          return regex.test(id)
        }
        // Exact match
        return id === pattern
      })

      return {
        id: resolvedId,
        external: isExternal,
      }
    },

    async load(id, options) {
      try {
        const specifier = parseDenoSpecifier(id)

        if (!specifier) {
          return null
        }

        const moduleInfo = resolver.retrieveModule(specifier)

        if (specifier.startsWith('file://')) {
          const path = specifier.slice(7)
          this.addWatchFile(path)
        }

        if ('error' in moduleInfo || moduleInfo.kind !== 'esm') {
          throw new Error(
            `Internal inconsistency: we should only resolve to an ESM module`,
          )
        }

        const isSSR = options?.ssr || isDefaultSSR

        if (isDev && isSSR && !skipDevSsrVirtualization) {
          // we need to construct virtual module

          const module = await import(specifier)
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

        return await loadAndRewrite(moduleInfo)
      } catch (error) {
        console.log(error)
        return null
      }
    },
  }
}
