import type { Plugin } from 'vite'
import viteDenoResolver from './plugins/vite-deno-resolver.ts'
import { viteDenoTailwindSource } from './plugins/vite-deno-tailwind-source.ts'
import nodeExternals from 'rollup-plugin-node-externals'

export interface FasterDenoOptions {
  /**
   * Skip the development SSR virtualization.
   *
   * This is required to work with CSS modules for now.
   */
  skipDevSsrVirtualization?: boolean
}

/**
 * Main plugin factory for deno-vite-plus
 *
 * This returns an array containing the unified Deno resolver plugin that handles:
 * - JSR imports (jsr:@package/name)
 * - NPM imports (npm:package@version)
 * - Local Deno module imports
 * - SSR support for both development and production
 * - TypeScript/JSX transformation
 * - Transform @deno-vite-import comments into actual imports
 */
export default function fasterDeno(options: FasterDenoOptions = {}): Plugin[] {
  return [
    viteDenoResolver(options.skipDevSsrVirtualization ?? false),
    nodeExternals({
      deps: false,
      peerDeps: false,
      optDeps: false,
    }),
  ]
}

/**
 * Export individual plugins for more granular control
 */
export { viteDenoResolver, viteDenoTailwindSource }
