/// <reference lib="deno.window" />

// Pre-warm esbuild service before any tests to avoid subprocess leaks
import '../lib/esbuild-warmup.ts'

import {
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from 'jsr:@std/assert'
import { join } from 'jsr:@std/path'
import {
  runViteBuild,
  runViteDevServer,
  runVitePreview,
} from '../lib/vite-test-utils.ts'

Deno.test('example-basic', async (t) => {
  // Test matrix: {dev: false/true} × {ssr: false/true}

  await t.step('browser build (dev=false, ssr=false)', async () => {
    console.log('🔨 Running browser build...')

    // Import our plugin directly
    const { default: fasterDeno } = await import('../index.ts')
    const { default: react } = await import('npm:@vitejs/plugin-react@4.4.1')

    // Get the absolute path to example-basic
    const exampleDir = join(Deno.cwd(), '..', 'example-basic')

    const result = await runViteBuild({
      cwd: exampleDir,
      configOverrides: {
        root: exampleDir,
        plugins: [
          ...fasterDeno(),
          react(),
        ],
        build: {
          outDir: 'dist/client',
          emptyOutDir: true,
        },
        logLevel: 'info', // Enable more logging
      },
    })

    console.log(`✅ Build completed in ${result.buildTime.toFixed(0)}ms`)

    // Verify output files exist
    const outputDir = join(exampleDir, 'dist', 'client')
    const indexHtml = await Deno.readTextFile(join(outputDir, 'index.html'))

    // Check for expected content in index.html
    assertStringIncludes(indexHtml, '<div id="root"></div>')

    // Check if we have JS assets
    const files = [...Deno.readDirSync(join(outputDir, 'assets'))]
    const jsFiles = files.filter((file) => file.name.endsWith('.js'))
    assertEquals(jsFiles.length > 0, true, 'No JS files found in output')
  })

  await t.step({
    name: 'SSR build (dev=false, ssr=true)',
    ignore: true,
    fn: async () => {
      const exampleDir = join(Deno.cwd(), '..', 'example-basic')

      const configFile = join(exampleDir, 'vite.config.ssr.ts')
      console.log('🔨 Running SSR build...')

      const result = await runViteBuild({
        configFile,
        cwd: exampleDir,
      })

      console.log(`✅ Build completed in ${result.buildTime.toFixed(0)}ms`)

      // Verify output file exists
      const outputFile = join(exampleDir, 'dist', 'server', 'entry-server.js')
      const fileContent = await Deno.readTextFile(outputFile)

      // Check for expected content
      assertMatch(
        fileContent,
        /export\s+(?:\{\s*render\s*\}|function\s+render)/,
      )
      assertMatch(fileContent, /['"']react['"']/i)
    },
  })

  await t.step({
    name: 'browser dev server (dev=true, ssr=false)',
    ignore: true,
    fn: async () => {
      const exampleDir = join(Deno.cwd(), '..', 'example-basic')

      const configFile = join(exampleDir, 'vite.config.ts')
      console.log('🚀 Starting dev server...')

      await using server = await runViteDevServer({
        configFile,
        cwd: exampleDir,
      })

      console.log(`✅ Dev server running at ${server.url}`)

      // Make a request to the dev server
      const response = await fetch(server.url)
      assertEquals(response.status, 200)

      const html = await response.text()
      assertStringIncludes(html, '<div id="root"></div>')
      assertStringIncludes(html, '/src/main.tsx')
    },
  })

  await t.step({
    name: 'SSR dev server (dev=true, ssr=true)',
    ignore: true,
    fn: async () => {
      const exampleDir = join(Deno.cwd(), '..', 'example-basic')

      const configFile = join(exampleDir, 'vite.config.ssr.dev.ts')
      console.log('🚀 Starting SSR dev server...')

      await using server = await runViteDevServer({
        configFile,
        cwd: exampleDir,
      })

      console.log(`✅ SSR dev server ready`)

      // Load and transform the entry module
      const entryModule = await server.viteServer.ssrLoadModule(
        './src/entry-server.tsx',
      )

      // Verify the render function exists and works
      assertEquals(typeof entryModule.render, 'function')

      const html = entryModule.render()
      assertStringIncludes(html, 'Count is')
      assertStringIncludes(html, 'Vite + Deno + React')
    },
  })

  await t.step({
    name: 'full SSR integration with preview',
    ignore: true,
    fn: async () => {
      const exampleDir = join(Deno.cwd(), '..', 'example-basic')

      // Build both client and server
      console.log('🔨 Building client and server...')

      await runViteBuild({
        configFile: join(exampleDir, 'vite.config.browser.ts'),
        cwd: exampleDir,
      })

      await runViteBuild({
        configFile: join(exampleDir, 'vite.config.ssr.ts'),
        cwd: exampleDir,
      })

      // Start preview server
      console.log('🚀 Starting preview server...')
      await using server = await runVitePreview({
        configFile: join(exampleDir, 'vite.config.browser.ts'),
        cwd: exampleDir,
      })

      console.log(`✅ Preview server running at ${server.url}`)

      // Make a request to the preview server
      const response = await fetch(server.url)
      assertEquals(response.status, 200)

      const html = await response.text()
      assertStringIncludes(html, '<div id="root"></div>')
      assertMatch(html, /<script[^>]+src="\/assets\/[^"]+\.js"/i)

      // Load the SSR build
      const serverFile = join(exampleDir, 'dist', 'server', 'entry-server.js')
      const { render } = await import(`file://${serverFile}`)

      // Verify render function works
      const ssrHtml = render()
      assertStringIncludes(ssrHtml, 'Count is')
    },
  })
})
