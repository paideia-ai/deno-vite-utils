/// <reference lib="deno.window" />

import { extname } from 'jsr:@std/path'
import type { Plugin } from 'vite'
import { transform } from 'esbuild'
import { mediaTypeToLoader } from '@/lib/utils.ts'
import { DenoEnv, DenoResolver } from '../playground.ts'

export function toDenoSpecifier(specifier: string): string {
  return '\0deno::' + crypto.randomUUID() + '::' + specifier
}

export function parseDenoSpecifier(specifier: string): string | null {
  if (!specifier.startsWith('\0deno::')) {
    return null
  }
  return specifier.slice(7 + crypto.randomUUID().length + 2)
}

export function npmSpecifierToNpmId(
  specifier: string,
  npmPackage: string,
): string {
  let unversionedPackageName = ''

  if (npmPackage.startsWith('@')) {
    unversionedPackageName = '@' + npmPackage.split('@')[1]
  } else {
    unversionedPackageName = npmPackage.split('@')[0]
  }

  const path = specifier.slice(npmPackage.length + 5)
  return unversionedPackageName + path
}

interface ModuleStorage {
  __denoSsrDevModules?: Record<string, Record<string, unknown>>
}

export default function viteDenoResolver(): Plugin {
  const resolver = new DenoResolver(new DenoEnv(Deno.cwd()))

  let isDev = false
  let isSSR = false

  return {
    name: 'vite-deno-resolver',
    enforce: 'pre',

    async config(config, env) {
      isDev = env.command === 'serve'
      isSSR = env.isSsrBuild || false

      return config
    },

    async resolveId(id, importer, options) {
      try {
        const importerSpecifier = await (async () => {
          if (!importer) {
            return null
          }

          const specifier = parseDenoSpecifier(importer)
          if (specifier) {
            return specifier
          }

          if (
            importer.startsWith(Deno.cwd() + '/') &&
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
          const invalidPrefixes = ['\0', '/', '.']
          if (invalidPrefixes.some((prefix) => id.startsWith(prefix))) {
            return null
          }
        }

        if (id.includes('@radix-ui/react-compose-refs')) {
          console.log(id, importer, importerSpecifier)
        }

        const target = await resolver.resolve(id, importerSpecifier || null)
        const targetModule = resolver.retrieveModule(target)

        if ('error' in targetModule) {
          throw new Error(`Failed to resolve: ${id}`)
        }

        if (targetModule.kind === 'npm') {
          const npmId = npmSpecifierToNpmId(
            targetModule.specifier,
            targetModule.npmPackage,
          )
          console.log(
            'encounterd npm specifier',
            targetModule.specifier,
            'let vite to resolve',
            npmId,
          )

          return this.resolve(npmId, importer, {
            ...options,
            skipSelf: true,
          })
        }

        const resolvedId = toDenoSpecifier(target)
        if (!isSSR || isDev) {
          console.log('💧', resolvedId, target, parseDenoSpecifier(resolvedId))
          return resolvedId
        }

        // TODO: we need to decide if this should be external or not
        return {
          id: resolvedId,
          external: false,
        }
      } catch (error) {
        console.log(error)
        console.log(id, importer)
        return null
      }
    },

    async load(id) {
      try {
        const specifier = parseDenoSpecifier(id)

        if (!specifier) {
          return null
        }

        const moduleInfo = resolver.retrieveModule(specifier)

        if ('error' in moduleInfo || moduleInfo.kind !== 'esm') {
          throw new Error(
            `Internal inconsistency: we should only resolve to an ESM module`,
          )
        }

        if (isDev && isSSR) {
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
      } catch (error) {
        console.log(error)
        console.log('🔥', id)
        return null
      }
    },
  }
}
