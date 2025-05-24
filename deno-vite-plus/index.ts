import type { Plugin } from 'vite'
import viteDenoResolver from './plugins/vite-deno-resolver.ts'
import fasterDenoCss from './faster-deno-css.ts'

/**
 * Main plugin factory for faster-deno-vite
 *
 * This returns an array of plugins in the correct order:
 * 1. nodeExternals (in non-dev mode only)
 * 2. ssrDevPlugin (in dev mode only, if ssrDevExternalDeps is specified)
 * 3. npmUnprefixPlugin - handles npm: prefixed imports
 * 4. viteDenoResolver - handles jsr: imports and imports from deno modules
 *
 * Plugin order is important:
 * - nodeExternals must come first in non-dev mode
 * - ssrDevPlugin should come before npmUnprefixPlugin to handle specified dependencies
 * - npmUnprefixPlugin must come before viteDenoResolver to handle npm: imports
 */
export default function fasterDeno(): Plugin[] {
  return [viteDenoResolver()]
}

export { fasterDenoCss }
