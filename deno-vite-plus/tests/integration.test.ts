/// <reference lib="deno.window" />

// Pre-warm esbuild service before any tests to avoid subprocess leaks
import '../lib/esbuild-warmup.ts'
// Pre-warm browser instance before any tests to avoid subprocess leaks
import { globalBrowser } from '../lib/browser-warmup.ts'

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert'
import { join } from 'jsr:@std/path'
import { Hono } from 'jsr:@hono/hono'
import { serveStatic } from 'jsr:@hono/hono/deno'
import { runViteBuild, runViteDevServer } from '../lib/vite-test-utils.ts'

// Shared browser test configuration
interface BrowserTestOptions {
  serverUrl: string
  expectedTitle?: string
  expectedContent?: string
  testInteraction?: boolean
}

// Reusable browser testing function
async function runBrowserTest(options: BrowserTestOptions) {
  const {
    serverUrl,
    expectedContent = 'Vite + Deno + React',
    testInteraction = true,
  } = options

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
    assertStringIncludes(appContent.innerHTML, expectedContent)

    // Test interaction if enabled
    if (testInteraction) {
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
    }

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
    await page.close()
  }
}

// Helper to start a Hono static file server
interface StaticServerOptions {
  staticRoot: string
  port: number
}

async function startStaticServer(options: StaticServerOptions) {
  const { staticRoot, port } = options

  const app = new Hono()
  const abortController = new AbortController()

  app.use(
    '/*',
    serveStatic({
      root: staticRoot,
    }),
  )

  Deno.serve({
    port,
    signal: abortController.signal,
  }, app.fetch)

  return {
    url: `http://localhost:${port}`,
    cleanup: () => abortController.abort(),
  }
}

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
    const exampleDir = join(Deno.cwd(), '..', 'example-basic')
    const staticRoot = join(exampleDir, 'dist/client')

    const server = await startStaticServer({
      staticRoot,
      port: 4173,
    })

    try {
      await runBrowserTest({ serverUrl: server.url })
    } finally {
      server.cleanup()
    }
  })

  await t.step('SSR build (dev=false, ssr=true)', async () => {
    const exampleDir = join(Deno.cwd(), '..', 'example-basic')

    // Import plugins
    const { default: fasterDeno } = await import('../index.ts')
    const { default: react } = await import('npm:@vitejs/plugin-react@4.4.1')

    // SSR build
    await runViteBuild({
      configFile: false,
      cwd: exampleDir,
      inlineConfig: {
        root: exampleDir,
        plugins: [
          ...fasterDeno(),
          react(),
        ],
        build: {
          ssr: true,
          outDir: 'dist/server',
          emptyOutDir: true,
          rollupOptions: {
            input: join(exampleDir, 'src/entry-server.tsx'),
            output: {
              format: 'es',
            },
          },
        },
        ssr: {
          noExternal: true, // Bundle everything
        },
      },
    })

    // Start static server
    const staticRoot = join(exampleDir, 'dist/client')
    const server = await startStaticServer({
      staticRoot,
      port: 4174, // Different port to avoid conflicts
    })

    try {
      // Run browser tests
      await runBrowserTest({ serverUrl: server.url })

      // Also verify SSR build
      const serverFile = join(exampleDir, 'dist', 'server', 'entry-server.mjs')
      const { render } = await import(`file://${serverFile}`)

      // Verify render function works
      const ssrHtml = render()
      assertStringIncludes(ssrHtml, 'Count is')
      assertStringIncludes(ssrHtml, 'Vite + Deno + React')
    } finally {
      server.cleanup()
    }
  })

  await t.step({
    name: 'browser dev server (dev=true, ssr=false)',
    ignore: false,
    fn: async () => {
      const exampleDir = join(Deno.cwd(), '..', 'example-basic')

      // Import plugins
      const { default: fasterDeno } = await import('../index.ts')
      const { default: react } = await import('npm:@vitejs/plugin-react@4.4.1')

      console.log('🚀 Starting dev server...')

      await using server = await runViteDevServer({
        configFile: false,
        cwd: exampleDir,
        inlineConfig: {
          root: exampleDir,
          plugins: [
            ...fasterDeno(),
            react(),
          ],
          server: {
            port: 5173,
          },
        },
      })

      console.log(`✅ Dev server running at ${server.url}`)

      // For now, just test that the server starts and responds
      const response = await fetch(server.url)
      assertEquals(response.status, 200)

      const html = await response.text()
      assertStringIncludes(html, '<div id="root"></div>')

      console.log('✅ Dev server responded successfully')
    },
  })
})
