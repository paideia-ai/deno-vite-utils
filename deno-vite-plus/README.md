# faster-deno-vite

A set of Vite plugins for improved Deno and Vite integration.

## Features

- Resolve Deno imports (jsr: and @ prefixed imports)
- Handle npm: prefixed imports
- Conditional nodeExternals for SSR builds
- SSR Dev plugin for loading Deno modules natively during development

## Installation

```bash
npm install faster-deno-vite
```

## Basic Usage

```ts
import { defineConfig } from 'vite'
import fasterDeno from 'faster-deno-vite'

export default defineConfig({
  plugins: [
    fasterDeno(),
    // other plugins...
  ],
})
```

## Options

### `dev` (boolean, default: true)

Controls whether the plugin is in development mode. In non-dev mode
(production), the nodeExternals plugin is included to externalize dependencies.

```ts
fasterDeno({ dev: false }) // Production build (includes nodeExternals)
```

### `ssrDevExternalDeps` (string[], optional)

List of dependencies to handle with the SSR dev plugin. These dependencies will
be loaded natively via Deno during SSR in dev mode. This option is only applied
in dev mode.

```ts
fasterDeno({
  dev: true,
  ssrDevExternalDeps: [
    '@my-org/*', // Wildcard - matches all imports starting with @my-org/
    'local-module', // Exact match and prefix - matches local-module and local-module/subpath
    '@external/specific', // Specific module
  ],
})
```

### `externalPrefixes` (string[], optional)

List of import prefixes to mark as external.

```ts
fasterDeno({
  externalPrefixes: ['@external/'],
})
```

## SSR Development Mode

During SSR in development mode, you can use the `ssrDevExternalDeps` option to
load specific dependencies directly via Deno's import system. This is useful for
Deno-specific modules that should bypass the Vite bundling process.

The plugin will intercept imports matching the patterns in `ssrDevExternalDeps`
and load them natively using Deno's import system. This makes it possible to use
Deno modules directly in your Vite SSR application during development.

You can specify dependencies in several ways:

- Exact matches: `'@my-org/module'` - matches only this exact import
- Path prefixes: `'@my-org/module'` - also matches `'@my-org/module/subpath'`
- Wildcards: `'@my-org/*'` - matches any import starting with `'@my-org/'`

Example configuration for SSR in development:

```ts
import { defineConfig } from 'vite'
import fasterDeno from 'faster-deno-vite'

export default defineConfig({
  plugins: [
    fasterDeno({
      dev: true,
      ssrDevExternalDeps: [
        '@my-org/*', // Wildcard - matches all imports starting with @my-org/
        'local-module', // Exact match and prefix - matches local-module and local-module/subpath
        '@external/specific', // Specific module
      ],
    }),
    // other plugins...
  ],
  ssr: {
    noExternal: false, // Allow external dependencies in dev mode
  },
})
```

## Plugin Order

The plugin returns an array of plugins in this order:

1. nodeExternals (in non-dev mode only)
2. ssrDevPlugin (in dev mode only, if ssrDevExternalDeps is specified)
3. npmUnprefixPlugin - handles npm: prefixed imports
4. viteDenoResolver - handles jsr: imports and imports from deno modules

Plugin order is important:

- nodeExternals must come first in non-dev mode
- ssrDevPlugin comes before npmUnprefixPlugin to handle specified dependencies
- npmUnprefixPlugin must come before viteDenoResolver to handle npm: imports
