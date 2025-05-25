// vite_load_hook.ts --------------------------------------------------------
import { dirname as dir, resolve as resolvePath } from 'jsr:@std/path'
import { type Loader, transform } from 'esbuild'
import { parse as babelParse } from '@babel/parser'
import MagicString from 'npm:magic-string'

import type { DenoMediaType, ResolvedInfo } from '../lib/types.ts'

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
  if (
    moduleInfo.specifier.startsWith('file://') &&
    moduleInfo.mediaType !== 'Json'
  ) {
    source = rewriteAndInlineMap(
      source,
      moduleInfo.local,
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

function rewriteAndInlineMap(source: string, file: string): string {
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
      const resolved = resolvePath(dir(file), stripQuotes(m[1]))
      ms.overwrite(comment.start!, comment.end!, `import '${resolved}';`)
      mutated = true
      continue
    }

    /* advanced: // @deno-vite-import(obj.prop) ./foo.css */
    m = text.match(/^@deno-vite-import\(([^)]+)\)\s+(.+)$/)
    if (m) {
      const target = m[1].trim()
      const resolved = resolvePath(dir(file), stripQuotes(m[2]))
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
