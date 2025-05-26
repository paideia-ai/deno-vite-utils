// vite_load_hook.ts --------------------------------------------------------
import { dirname as dir, join, resolve as resolvePath } from 'jsr:@std/path'
import { type Loader, transform } from 'esbuild'
import { parse as babelParse } from '@babel/parser'
import MagicString from 'npm:magic-string'

import type { DenoMediaType, ResolvedInfo } from '../lib/types.ts'

/**
 * Cache for remote assets to avoid re-downloading
 */
class RemoteAssetCache {
  private cache = new Map<string, string>() // URL -> local path
  private tempDir: string

  constructor() {
    this.tempDir = Deno.makeTempDirSync({ prefix: 'vite-deno-assets-' })
  }

  async getLocalPath(url: string): Promise<string> {
    if (this.cache.has(url)) {
      return this.cache.get(url)!
    }

    // Download the file
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
      )
    }
    const content = await response.text()

    // Create a filename that preserves the extension
    const urlPath = new URL(url).pathname
    const filename = urlPath.split('/').pop() || 'asset'
    // Add a hash to avoid conflicts
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(url),
    )
    const hashHex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 8)
    const localPath = join(this.tempDir, `${hashHex}-${filename}`)

    // Write to disk
    await Deno.writeTextFile(localPath, content)

    // Cache the mapping
    this.cache.set(url, localPath)

    return localPath
  }
}

// Global singleton instance
const remoteAssetCache = new RemoteAssetCache()

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

export async function loadAndRewrite(
  moduleInfo: ResolvedInfo,
): Promise<{ code: string; map: string | null }> {
  /* 1️⃣  read the original text */
  let source = await Deno.readTextFile(moduleInfo.local)

  /* 2️⃣  magic-string rewrite + inline map */
  if (moduleInfo.mediaType !== 'Json') {
    source = await rewriteAndInlineMap(
      source,
      moduleInfo.local,
      moduleInfo.specifier,
    )
  }

  /* 3️⃣  pass to esbuild.transform() */
  const result = await transform(source, {
    loader: mediaTypeToLoader(moduleInfo.mediaType),
    jsx: 'automatic',
    jsxImportSource: 'react',
    sourcefile: moduleInfo.local, // keeps original filename in final map
    sourcemap: 'external', // or "inline" if Vite prefers
    logLevel: 'silent',
  })

  return {
    code: result.code,
    map: result.map === '' ? null : result.map,
  }
}

/* ───────── pure text-rewriter ───────── */

async function rewriteAndInlineMap(
  source: string,
  file: string,
  specifier: string,
): Promise<string> {
  // Quick check to avoid costly parse if no deno-vite directives are present
  if (!source.includes('@deno-vite-import')) {
    return source
  }

  // parse with Babel to support TSX / JSX
  const ast = babelParse(source, {
    sourceType: 'module',
    plugins: [
      'typescript',
      'jsx',
      'classProperties',
    ],
    ranges: true,
    allowReturnOutsideFunction: true,
  })

  const ms = new MagicString(source)
  let counter = 0
  let mutated = false

  // Iterate through top-level comments in the AST
  for (const comment of ast.comments || []) {
    if (comment.type !== 'CommentLine') {
      continue
    }

    // Check if this comment is at the top level by seeing if it's between top-level nodes
    // or before the first node
    const programBody = ast.program.body
    let isTopLevel = true

    for (const node of programBody) {
      if (comment.start! >= node.start! && comment.end! <= node.end!) {
        isTopLevel = false
        break
      }
    }

    if (!isTopLevel) {
      continue
    }

    const text = comment.value.trim()

    /* basic: // @deno-vite-import ./foo.css */
    let m = text.match(/^@deno-vite-import\s+(.+)$/)
    if (m) {
      const relativePath = stripQuotes(m[1])
      const resolved = await resolveRelativeImport(
        file,
        specifier,
        relativePath,
      )
      ms.overwrite(comment.start!, comment.end!, `import '${resolved}';`)
      mutated = true
      continue
    }

    /* advanced: // @deno-vite-import(obj.prop) ./foo.css */
    m = text.match(/^@deno-vite-import\(([^)]+)\)\s+(.+)$/)
    if (m) {
      const target = m[1].trim()
      const relativePath = stripQuotes(m[2])
      const resolved = await resolveRelativeImport(
        file,
        specifier,
        relativePath,
      )
      // Always use a temporary binding, then assign — keeps the user's
      // pre‑declared variable intact in Deno.
      const tmp = `__dvi_${counter++}`
      ms.overwrite(
        comment.start!,
        comment.end!,
        `import ${tmp} from '${resolved}';\n${target} = ${tmp};`,
      )
      mutated = true
    }
  }

  if (!mutated) {
    return source
  }

  const map = ms.generateMap({ hires: true })
  const base64 = btoa(map.toString())
  return ms.toString() +
    `\n//# sourceMappingURL=data:application/json;base64,${base64}\n`
}

/**
 * Resolves a relative import path based on the module's location.
 *
 * @param localPath - The local file path (moduleInfo.local)
 * @param specifier - The module specifier (could be file://, http://, https://)
 * @param relativePath - The relative import path to resolve (e.g., './base.css')
 * @returns The resolved absolute path or URL
 */
async function resolveRelativeImport(
  localPath: string,
  specifier: string,
  relativePath: string,
): Promise<string> {
  // For remote modules, resolve relative to the URL
  if (specifier.startsWith('http://') || specifier.startsWith('https://')) {
    const resolvedUrl = new URL(relativePath, specifier).href
    // Download and cache the remote asset
    return await remoteAssetCache.getLocalPath(resolvedUrl)
  }

  // For local modules, resolve relative to the file path
  return resolvePath(dir(localPath), relativePath)
}

function stripQuotes(s: string): string {
  if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('"') && s.endsWith('"'))
  ) {
    return s.slice(1, -1)
  } else {
    return s
  }
}
