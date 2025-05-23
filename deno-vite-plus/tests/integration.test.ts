/// <reference lib="deno.window" />

import {
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from 'jsr:@std/assert'
import { dirname, fromFileUrl, join } from 'jsr:@std/path'

// Get the directory of the current file
const currentDir = dirname(fromFileUrl(import.meta.url))
// Use relative path to fixtures directory
const FIXTURES_DIR = join(currentDir, 'fixtures')

// Helper function to run build process
async function runBuild(
  fixturePath: string,
  configFile: string,
): Promise<string> {
  console.log(`Running build in: ${fixturePath}`)
  console.log(`Using config file: ${configFile}`)
  const process = new Deno.Command('deno', {
    args: ['run', '-A', 'npm:vite', 'build', '--config', configFile],
    cwd: fixturePath,
    stdout: 'piped',
    stderr: 'piped',
  })

  const { stdout, stderr, code } = await process.output()

  const output = new TextDecoder().decode(stdout)
  const error = new TextDecoder().decode(stderr)

  if (code !== 0) {
    console.error('Build failed:', error)
    throw new Error(`Build failed with code ${code}: ${error}`)
  }

  return output
}

// Test fixture: basic
Deno.test('basic fixture - browser build', async () => {
  const fixturePath = join(FIXTURES_DIR, 'basic')
  const configFile = 'vite.config.browser.ts'

  try {
    const output = await runBuild(fixturePath, configFile)

    // Check if build was successful
    assertStringIncludes(output, 'built in')

    // Verify output files exist
    const outputDir = join(fixturePath, 'dist', 'client')
    const indexHtml = await Deno.readTextFile(join(outputDir, 'index.html'))

    // Check for expected content in index.html
    assertStringIncludes(indexHtml, '<div id="root"></div>')

    // Check if we have JS assets
    const files = [...Deno.readDirSync(join(outputDir, 'assets'))]
    const jsFiles = files.filter((file) => file.name.endsWith('.js'))
    assertEquals(jsFiles.length > 0, true, 'No JS files found in output')

    console.log('✅ Browser build successful')
  } catch (error) {
    console.error('Test failed:', error)
    throw error
  }
})

Deno.test('basic fixture - SSR build', async () => {
  const fixturePath = join(FIXTURES_DIR, 'basic')
  const configFile = 'vite.config.ssr.ts'

  try {
    const output = await runBuild(fixturePath, configFile)

    // Check if build was successful
    assertStringIncludes(output, 'built in')

    // Verify output file exists
    const outputFile = join(fixturePath, 'dist', 'server', 'entry-server.js')
    const fileContent = await Deno.readTextFile(outputFile)

    // Check for expected content using regex
    // Look for either named export syntax or function export
    assertMatch(fileContent, /export\s+(?:\{\s*render\s*\}|function\s+render)/)

    // Also check for React import (ensuring JSX transformation worked)
    assertMatch(fileContent, /['"']react['"']/i)

    console.log('✅ SSR build successful')
  } catch (error) {
    console.error('Test failed:', error)
    throw error
  }
})

// Test the integration of browser and SSR builds
Deno.test('basic fixture - full SSR integration', async () => {
  const fixturePath = join(FIXTURES_DIR, 'basic')

  try {
    // Build both client and server
    await runBuild(fixturePath, 'vite.config.browser.ts')
    await runBuild(fixturePath, 'vite.config.ssr.ts')

    // Check if server can import the SSR build
    const serverFile = join(fixturePath, 'dist', 'server', 'entry-server.js')
    const { render } = await import(`file://${serverFile}`)

    // Verify render function works
    const html = render()
    assertStringIncludes(html, 'Count is')

    console.log('✅ Full SSR integration successful')
  } catch (error) {
    console.error('Test failed:', error)
    throw error
  }
})
