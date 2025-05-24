# RFC-01: Testing Strategy for Deno Vite Plugin

**Status:** Draft\
**Author:** [To be filled]\
**Created:** 2025-01-23\
**Discussion:** [Link to discussion]

## Summary

This RFC proposes a comprehensive testing strategy for the Deno Vite plugin,
based on proven patterns used by Vite itself and major Vite plugins. The
approach emphasizes in-process testing for speed and reliability while covering
all critical code paths.

## Motivation

A robust testing strategy is essential for:

- Ensuring plugin reliability across different scenarios
- Catching regressions early
- Validating both development and production builds
- Testing SSR functionality
- Verifying error handling and edge cases

## Testing Architecture

### 1. Fixture-Based Testing

Create minimal fixture projects for each test scenario:

```
tests/fixtures/
├── basic-browser/          # Plain browser app with JSR imports
├── basic-ssr/             # SSR app with entry-server.ts
├── import-maps/           # Import map resolution testing
├── npm-imports/           # NPM specifier handling
├── css-imports/           # CSS-in-TS testing
├── workspace/             # Workspace configuration
└── edge-cases/            # Error scenarios
```

Each fixture contains only the minimum files needed to test specific plugin
functionality.

### 2. In-Process Dev Server Testing

#### Utility Functions

```typescript
// tests/utils/dev-server.ts
import { createServer, InlineConfig, ViteDevServer } from 'vite'
import { denoVite } from '../../deno-vite-plus/index.ts'

export async function startDevServer(
  config: InlineConfig & { fixture: string },
): Promise<ViteDevServer> {
  const server = await createServer({
    configFile: false,
    logLevel: 'error',
    root: `${import.meta.dirname}/fixtures/${config.fixture}`,
    plugins: [
      denoVite(config.denoVite || {}),
      ...(config.plugins || []),
    ],
    server: {
      middlewareMode: true, // No file watcher, no HMR WS
      port: 0, // Auto-select port
    },
    ...config,
  })

  await server.listen()
  return server
}

export async function transformRequest(
  server: ViteDevServer,
  path: string,
) {
  return server.environments.client.transformRequest(path)
}
```

### 3. Test Implementation

#### Development Server Tests

```typescript
// tests/dev-server.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startDevServer, transformRequest } from './utils/dev-server.ts'
import type { ViteDevServer } from 'vite'

describe('Deno Resolver Plugin - Dev', () => {
  let server: ViteDevServer

  beforeAll(async () => {
    server = await startDevServer({
      fixture: 'basic-browser',
      denoVite: {/* options */},
    })
  })

  afterAll(() => server.close())

  it('resolves JSR imports', async () => {
    const result = await transformRequest(server, '/src/main.ts')
    expect(result?.code).toContain('// Resolved from jsr:@std/path')
    expect(result?.code).not.toContain('jsr:')
  })

  it('transforms TypeScript correctly', async () => {
    const result = await transformRequest(server, '/src/component.tsx')
    expect(result?.code).not.toContain('interface')
    expect(result?.code).toContain('jsx(')
  })

  it('handles import maps', async () => {
    const result = await transformRequest(server, '/src/aliased.ts')
    expect(result?.code).toContain('resolved-path')
  })
})

describe('NPM Unprefix Plugin - Dev', () => {
  it('strips npm: prefixes', async () => {
    const server = await startDevServer({ fixture: 'npm-imports' })
    const result = await transformRequest(server, '/src/npm-user.ts')

    expect(result?.code).not.toContain('npm:')
    expect(result?.code).toContain('from "react"')

    await server.close()
  })
})
```

#### SSR Development Tests

```typescript
// tests/ssr-dev.test.ts
describe('SSR Dev Plugin', () => {
  let server: ViteDevServer

  beforeAll(async () => {
    server = await startDevServer({
      fixture: 'basic-ssr',
      denoVite: {
        ssr: { external: ['react', '@org/*'] },
      },
    })
  })

  afterAll(() => server.close())

  it('loads external modules natively', async () => {
    const mod = await server.ssrLoadModule('/src/entry-server.tsx')
    expect(mod.render).toBeDefined()
    expect(globalThis.__deno_ssr_dev_modules__).toHaveProperty('react')
  })

  it('transforms non-external modules', async () => {
    const mod = await server.ssrLoadModule('/src/internal.ts')
    expect(mod.__transformed).toBe(true)
  })
})
```

#### Error Handling Tests

```typescript
// tests/error-handling.test.ts
import { vi } from 'vitest'

describe('Error Handling', () => {
  it('provides helpful error for missing JSR package', async () => {
    const server = await startDevServer({ fixture: 'edge-cases' })
    const logger = vi.spyOn(server.config.logger, 'error')
      .mockImplementation(() => {})

    await expect(
      transformRequest(server, '/src/missing-jsr.ts'),
    ).rejects.toThrow('Failed to resolve JSR import')

    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining('jsr:@missing/package'),
    )

    await server.close()
  })
})
```

### 4. Build Tests

```typescript
// tests/build.test.ts
import { build } from 'vite'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('Production Builds', () => {
  it('browser build includes resolved JSR imports', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'vite-build-'))

    await build({
      root: __dirname + '/fixtures/basic-browser',
      plugins: [denoVite()],
      build: { outDir },
      logLevel: 'error',
    })

    const js = readFileSync(
      join(outDir, 'assets/index-[hash].js'),
      'utf8',
    )
    expect(js).toContain('// Bundled from jsr:@std/path')
    expect(js).not.toContain('jsr:')
  })

  it('SSR build handles externals correctly', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'vite-ssr-'))

    await build({
      root: __dirname + '/fixtures/basic-ssr',
      plugins: [denoVite({ ssr: { external: ['react'] } })],
      build: {
        ssr: 'src/entry-server.tsx',
        outDir,
      },
    })

    const serverJs = readFileSync(
      join(outDir, 'entry-server.js'),
      'utf8',
    )
    expect(serverJs).toContain('require("react")')
    expect(serverJs).not.toContain('npm:react')
  })
})
```

### 5. Integration Tests

```typescript
// tests/integration.test.ts
import { chromium } from 'playwright'
import { execa } from 'execa'
import waitOn from 'wait-on'

describe('Full Integration', () => {
  it('HMR works with JSR imports', async () => {
    const proc = execa('vite', [], {
      cwd: __dirname + '/fixtures/basic-browser',
      env: { ...process.env, FORCE_COLOR: '0' },
    })

    await waitOn({ resources: ['tcp:5173'] })

    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.goto('http://localhost:5173')

    // Initial content check
    expect(await page.textContent('h1')).toBe('Hello from JSR')

    // Modify file and check HMR
    // ... file modification logic ...

    await browser.close()
    proc.kill('SIGTERM')
  })
})
```

### 6. Performance Tests

```typescript
// tests/performance.test.ts
describe('Performance', () => {
  it('caches resolution results', async () => {
    const server = await startDevServer({ fixture: 'basic-browser' })

    const start1 = performance.now()
    await transformRequest(server, '/src/heavy-jsr-imports.ts')
    const time1 = performance.now() - start1

    const start2 = performance.now()
    await transformRequest(server, '/src/heavy-jsr-imports.ts')
    const time2 = performance.now() - start2

    // Second request should be significantly faster
    expect(time2).toBeLessThan(time1 * 0.1)

    await server.close()
  })
})
```

## Test Matrix

| Feature         | Dev Test           | Build Test                  | Integration Test |
| --------------- | ------------------ | --------------------------- | ---------------- |
| JSR Resolution  | `transformRequest` | `build()` + file assertions | Browser test     |
| NPM Unprefixing | `transformRequest` | `build()` + file assertions | -                |
| Import Maps     | `transformRequest` | `build()` + file assertions | -                |
| SSR External    | `ssrLoadModule`    | `build({ ssr })`            | -                |
| CSS Imports     | `transformRequest` | `build()` + CSS assertions  | Browser test     |
| Error Messages  | Logger spy         | Build rejection             | -                |
| HMR             | -                  | -                           | Playwright test  |

## Implementation Guidelines

### 1. Test Organization

```
tests/
├── unit/              # Plugin unit tests
│   ├── npm-unprefix.test.ts
│   ├── resolver.test.ts
│   └── utils.test.ts
├── integration/       # Full pipeline tests
│   ├── dev-server.test.ts
│   ├── build.test.ts
│   └── ssr.test.ts
├── e2e/              # Browser tests
│   └── hmr.test.ts
├── fixtures/         # Test projects
└── utils/           # Test utilities
```

### 2. Test Helpers

```typescript
// tests/utils/assertions.ts
export function assertNoDenoImports(code: string) {
  expect(code).not.toMatch(/jsr:|npm:/)
}

export function assertTransformed(code: string) {
  expect(code).not.toContain('interface')
  expect(code).not.toContain('satisfies')
}

export function assertBundled(code: string, module: string) {
  expect(code).toContain(`// Bundled: ${module}`)
}
```

### 3. Fixture Guidelines

- Keep fixtures minimal
- Use realistic import patterns
- Include error cases
- Document purpose in README

### 4. CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
      - run: deno task test
      - run: deno task test:e2e
```

## Benefits of This Approach

1. **Fast Execution**: In-process testing avoids subprocess overhead
2. **Accurate Testing**: Uses Vite's actual APIs
3. **Comprehensive Coverage**: Tests all plugin hooks
4. **Easy Debugging**: Can set breakpoints in tests
5. **Maintainable**: Follows established patterns

## Migration from Current Tests

1. Move existing tests to new structure
2. Add fixture projects for each test case
3. Replace file-based tests with in-process tests
4. Add missing test scenarios
5. Set up CI pipeline

## Open Questions

1. Should we test against multiple Vite versions?
2. How to test Deno Deploy compatibility?
3. Should performance tests have hard limits?
4. How to test workspace scenarios effectively?

## References

- [Vite's Test Suite](https://github.com/vitejs/vite/tree/main/packages/vite/src/node/__tests__)
- [vite-plugin-react Tests](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react/tests)
- [Vitest Documentation](https://vitest.dev/)
