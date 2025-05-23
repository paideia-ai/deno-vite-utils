/// <reference lib="deno.window" />

import { basename } from 'jsr:@std/path'
import type { Plugin } from 'vite'
import { isDenoSpecifier, parseDenoSpecifier } from '@/lib/utils.ts'

const FLAG = '?deno-css'

export default function fasterDenoCss(): Plugin {
  return {
    name: 'faster-deno-css',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!source.endsWith(FLAG)) {
        return null // not our file
      }

      const rawPath = source.slice(0, -FLAG.length) // strip ?deno-css
      let absPath: string | undefined

      // (1) the specifier is already one of your \0deno::… ids
      if (isDenoSpecifier(rawPath)) {
        absPath = parseDenoSpecifier(rawPath).resolved
      } else if (importer) {
        // (2) a normal relative/absolute path — resolve it like Vite would
        const r = await this.resolve(rawPath, importer, { skipSelf: true })
        if (r) {
          absPath = r.id
        }
      }

      // (3) fall back: treat it as already absolute
      absPath ??= rawPath

      return absPath + FLAG // keep the marker
    },
    load(id) {
      if (!id.endsWith(FLAG)) {
        return
      }

      const rawPath = id.slice(0, -FLAG.length)
      const realFsPath = isDenoSpecifier(rawPath)
        ? parseDenoSpecifier(rawPath).resolved
        : rawPath

      // foo.css.ts  →  foo.css   |   anything.ts[x] → .css
      const cssFile = realFsPath.endsWith('.css.ts')
        ? realFsPath.slice(0, -3) // drop only ".ts"
        : realFsPath.replace(/\.tsx?$/, '.css')

      // ensure HMR picks up edits to the real style sheet
      this.addWatchFile(cssFile)

      // relative import so Vite's CSS plugin can grab it
      const rel = './' + basename(cssFile)

      return {
        code: `import ${JSON.stringify(rel)};`,
        map: null,
      }
    },
  }
}
