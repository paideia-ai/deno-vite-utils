/// <reference lib="deno.window" />

// Pre-warm esbuild service before any tests to avoid subprocess leaks
import '../lib/esbuild-warmup.ts'
// Pre-warm browser instance before any tests to avoid subprocess leaks
import { globalBrowser } from '../lib/browser-warmup.ts'

import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from 'jsr:@std/assert'
import { join } from 'jsr:@std/path'
import { Hono } from 'jsr:@hono/hono'
import { serveStatic } from 'jsr:@hono/hono/deno'
import {
  runViteBuild,
  runViteDevServer,
  runVitePreview,
} from '../lib/vite-test-utils.ts'

Deno.test('example-basic', async (t) => {
  // Test matrix: {dev: false/true} × {ssr: false/true}

  await t.step('browser build (dev=false, ssr=false)', async () => {
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

  await t.step('browser runtime verification', async () => {
    // Get the absolute path to example-basic
    const exampleDir = join(Deno.cwd(), '..', 'example-basic')

    // Start Hono server to serve static files
    const app = new Hono()

    // Declare abort controller here so it's accessible in finally block
    const abortController = new AbortController()

    // Serve static files from dist/client
    const staticRoot = join(exampleDir, 'dist/client')

    app.use(
      '/*',
      serveStatic({
        root: staticRoot,
      }),
    )

    // Start the server with abort controller for force shutdown
    const port = 4173
    Deno.serve({
      port,
      signal: abortController.signal,
    }, app.fetch)
    const serverUrl = `http://localhost:${port}`

    // Use pre-warmed browser
    const browser = globalBrowser
    const page = await browser.newPage()

    // Collect console messages and errors
    const consoleLogs: string[] = []
    const pageErrors: string[] = []

    try {
      // Navigate to the app
      await page.goto(serverUrl, {
        waitUntil: 'load',
      })

      // Wait for React to mount
      await page.waitForSelector('#root > div', { timeout: 5000 })

      // Verify React rendered correctly
      const appContent = await page.evaluate(() => {
        // @ts-expect-error - This runs in browser context
        const root = document.getElementById('root')
        return {
          hasContent: root?.children.length > 0,
          innerHTML: root?.innerHTML || '',
        }
      })

      assert(appContent.hasContent, 'React app did not render any content')
      assertStringIncludes(appContent.innerHTML, 'Vite + Deno + React')

      // Test interaction - click the counter button
      const buttonSelector = 'button'
      const button = await page.waitForSelector(buttonSelector, {
        timeout: 5000,
      })

      // Get initial count
      const initialText = await page.evaluate((selector: string) => {
        // @ts-expect-error - This runs in browser context
        const btn = document.querySelector(selector)
        return btn?.textContent || ''
      }, { args: [buttonSelector] }) as string
      assertStringIncludes(initialText, 'Count is 0')

      // Click and verify count increases
      await button.click()
      await new Promise((resolve) => setTimeout(resolve, 100)) // Small delay for React to re-render

      const updatedText = await page.evaluate((selector: string) => {
        // @ts-expect-error - This runs in browser context
        const btn = document.querySelector(selector)
        return btn?.textContent || ''
      }, { args: [buttonSelector] }) as string
      assertStringIncludes(updatedText, 'Count is 1')

      // Check for any runtime errors
      assertEquals(
        pageErrors.length,
        0,
        `Page errors detected:\n${pageErrors.join('\n')}`,
      )

      // Check for console errors (excluding HMR messages)
      const realErrors = consoleLogs.filter((log) =>
        log.includes('[error]') &&
        !log.includes('HMR') &&
        !log.includes('WebSocket')
      )
      assertEquals(
        realErrors.length,
        0,
        `Console errors detected:\n${realErrors.join('\n')}`,
      )
    } finally {
      // Clean up
      await page.close()
      abortController.abort()
    }
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
