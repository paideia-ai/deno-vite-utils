import type { Plugin } from 'vite'
import viteDenoResolver, {
  type DenoResolverPluginOptions,
} from './plugins/vite-deno-resolver.ts'
import npmUnprefixPlugin from './plugins/npm-unprefix.ts'
import ssrDevPlugin from './plugins/ssr-dev-plugin.ts'
import fasterDenoCss from './faster-deno-css.ts'
import nodeExternals from 'rollup-plugin-node-externals'

export interface FasterDenoPluginOptions extends DenoResolverPluginOptions {
  /**
   * Whether the plugin is in development mode.
   * In dev mode, nodeExternals plugin is not included.
   * @default true
   */
  dev?: boolean

  /**
   * List of dependencies to handle with the SSR dev plugin.
   * These dependencies will be loaded natively via Deno during SSR in dev mode.
   * Can include wildcards, e.g. ['@pea2/*', '@isofucius/deno-shadcn-ui']
   * @default undefined
   */
  ssrDevExternalDeps?: string[]
}

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
export default function fasterDeno(
  opts: FasterDenoPluginOptions = {},
): Plugin[] {
  const { dev = true, ssrDevExternalDeps, ...restOpts } = opts

  // Basic plugins that are always included
  const plugins: Plugin[] = [npmUnprefixPlugin(), viteDenoResolver(restOpts)]

  // Add SSR dev plugin if ssrDevExternalDeps is provided and in dev mode
  if (dev && ssrDevExternalDeps && ssrDevExternalDeps.length > 0) {
    plugins.unshift(ssrDevPlugin(ssrDevExternalDeps))
  }

  // In non-dev mode, include nodeExternals plugin
  if (!dev) {
    // Add nodeExternals at the beginning of the plugins array
    plugins.unshift(
      nodeExternals({
        deps: false,
        peerDeps: false,
        optDeps: false,
      }),
    )
  }

  return plugins
}

export { fasterDenoCss }
