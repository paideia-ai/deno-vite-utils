import type { Plugin } from 'vite'
import { DenoEnv } from '@/lib/deno-env.ts'
import { DenoResolver } from '@/lib/deno-resolver.ts'
import { dirname, resolve, toFileUrl } from 'jsr:@std/path'

/**
 * Vite plugin that transforms @deno-source directives to @source directives
 * for Tailwind CSS by analyzing the Deno dependency graph.
 */
export function viteDenoTailwindSource(): Plugin {
  let resolver: DenoResolver
  let root: string

  return {
    name: 'vite-deno-tailwind-source',
    enforce: 'pre', // Must run before @tailwindcss/vite

    async config(config, _env) {
      // Initialize resolver with the correct root directory
      root = config.root || Deno.cwd()
      resolver = new DenoResolver(new DenoEnv(root))
      return config
    },

    async transform(css, id) {
      // Only process CSS files
      if (!id.endsWith('.css')) {
        return null
      }

      // Find all @deno-source directives
      const matches = [...css.matchAll(/@deno-source\s+["']([^"']+)["'];?/g)]
      if (matches.length === 0) {
        return null
      }

      const extraSources = new Set<string>()

      for (const [, rawSpecifier] of matches) {
        // Resolve relative paths to absolute URLs
        const baseDir = dirname(id)
        const absolutePath = resolve(baseDir, rawSpecifier)

        // Scan for JSX/TSX files in the specified directory
        const jsxTsxFiles = await scanForJsxTsxFiles(absolutePath)

        // Collect dependencies for each JSX/TSX file
        for (const file of jsxTsxFiles) {
          const fileUrl = toFileUrl(file).href

          try {
            const deps = await resolver.collectDeps(fileUrl)

            // Filter and add valid source files
            for (const dep of deps) {
              // Get module info to check media type
              try {
                const module = resolver.retrieveModule(dep)
                if ('error' in module || module.kind !== 'esm') {
                  continue
                }

                // Check if this is a scannable file based on media type
                if (module.mediaType === 'JSX' || module.mediaType === 'TSX') {
                  extraSources.add(module.local)
                }
              } catch (_error) {
                // Skip modules that can't be retrieved
              }
            }
          } catch (error) {
            console.error(`Failed to collect deps for ${file}:`, error)
          }
        }
      }

      // Build the replacement CSS
      const tailwindSources = Array.from(extraSources)
        .map((p) => `@source "${normalizePathForTailwind(p)}";`)
        .join('\n')

      // Remove @deno-source directives and append @source directives
      const withoutDenoSource = css.replace(
        /@deno-source\s+["'][^"']+["'];?/g,
        '',
      ).trim()
      const nextCss = withoutDenoSource + '\n' + tailwindSources + '\n'

      return {
        code: nextCss,
        map: null,
      }
    },
  }
}

/**
 * Scan directory for JSX/TSX files
 */
async function scanForJsxTsxFiles(dir: string): Promise<string[]> {
  const files: string[] = []

  try {
    for await (const entry of Deno.readDir(dir)) {
      const fullPath = resolve(dir, entry.name)

      if (entry.isDirectory) {
        // Recursively scan subdirectories
        const subFiles = await scanForJsxTsxFiles(fullPath)
        files.push(...subFiles)
      } else if (entry.isFile && /\.(jsx|tsx)$/.test(entry.name)) {
        files.push(fullPath)
      }
    }
  } catch (error) {
    console.warn(`Failed to scan directory ${dir}:`, error)
  }

  return files
}

/**
 * Normalize paths for Tailwind (convert to forward slashes on Windows)
 */
function normalizePathForTailwind(path: string): string {
  return path.replace(/\\/g, '/')
}
