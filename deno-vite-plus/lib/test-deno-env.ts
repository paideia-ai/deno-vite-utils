import { fromFileUrl, join } from 'jsr:@std/path'
import { copy, ensureDir } from 'jsr:@std/fs'

/**
 * TestDenoEnv provides isolated test environments with fresh Deno cache
 */
export class TestDenoEnv implements AsyncDisposable {
  private tempDir: string
  private cleanupPromises: Promise<void>[] = []

  constructor(tempDir: string) {
    this.tempDir = tempDir
  }

  /**
   * Create a test environment from an example directory
   */
  static async fromExample(exampleName: string): Promise<TestDenoEnv> {
    // Create a temporary directory for this test
    const tempBase = await Deno.makeTempDir({ prefix: 'deno-vite-test-' })
    const tempDir = join(tempBase, exampleName)
    await ensureDir(tempDir)

    // Get the root directory of the project (deno-vite-utils)
    const moduleDir = fromFileUrl(new URL('.', import.meta.url).href)
    const rootDir = join(moduleDir, '..', '..') // Go up from lib/ to deno-vite-plus/, then to deno-vite-utils/
    const exampleDir = join(rootDir, exampleName)

    // Copy the example to the temp directory
    await copy(exampleDir, tempDir, { overwrite: true })

    // Update vite configs to use absolute paths to the plugin
    const pluginPath = join(rootDir, 'deno-vite-plus', 'index.ts')
    const configFiles = [
      'vite.config.ts',
      'vite.config.browser.ts',
      'vite.config.ssr.ts',
      'vite.config.ssr.dev.ts',
    ]

    for (const configFile of configFiles) {
      const configPath = join(tempDir, configFile)
      try {
        let content = await Deno.readTextFile(configPath)
        // Replace relative import with absolute path
        content = content.replace(
          /from ['"]\.\.\/deno-vite-plus\/index\.ts['"]/g,
          `from '${pluginPath}'`,
        )
        await Deno.writeTextFile(configPath, content)
      } catch {
        // Ignore if config doesn't exist
      }
    }

    return new TestDenoEnv(tempDir)
  }

  /**
   * Get the working directory for this test environment
   */
  get cwd(): string {
    return this.tempDir
  }

  /**
   * Run a function in this test environment
   */
  async run<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
    return await fn(this.tempDir)
  }

  /**
   * Clean up the test environment
   */
  async cleanup(): Promise<void> {
    await Promise.all(this.cleanupPromises)
    try {
      await Deno.remove(this.tempDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Async disposal
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.cleanup()
  }
}

/**
 * Prepare a test environment from an example
 */
export async function prepareTestDenoEnv(
  exampleName: string,
): Promise<TestDenoEnv> {
  return await TestDenoEnv.fromExample(exampleName)
}
