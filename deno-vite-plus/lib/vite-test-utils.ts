import type { InlineConfig } from 'npm:vite'
import { build } from 'npm:vite'
import { join } from 'jsr:@std/path'

/**
 * Options for Vite test operations
 */
export interface ViteTestOptions {
  /** Path to the Vite config file, or false to disable */
  configFile?: string | false
  /** Working directory for the test */
  cwd?: string
  /** Additional Vite config overrides */
  configOverrides?: InlineConfig
  /** Inline config to use instead of config file */
  inlineConfig?: InlineConfig
}

/**
 * Result of a Vite build operation
 */
export interface ViteBuildResult {
  /** Build output directory */
  outDir: string
  /** Build time in milliseconds */
  buildTime: number
  /** Any build warnings */
  warnings?: string[]
}

/**
 * Run a Vite build programmatically
 */
export async function runViteBuild(
  options: ViteTestOptions,
): Promise<ViteBuildResult> {
  const startTime = performance.now()

  const config: InlineConfig = {
    configFile: options.configFile ?? false,
    root: options.cwd,
    logLevel: 'error',
    ...options.configOverrides,
    ...options.inlineConfig,
  }

  const result = await build(config)
  const buildTime = performance.now() - startTime

  // Extract output directory from the build result
  let outDir = 'dist'
  if (Array.isArray(result)) {
    // Multiple outputs
    const firstOutput = result[0]
    if ('output' in firstOutput && firstOutput.output.length > 0) {
      // Get directory from first output file
      const firstFile = Object.values(firstOutput.output[0])[0]
      if (firstFile && 'fileName' in firstFile) {
        outDir = firstFile.fileName.split('/')[0]
      }
    }
  }

  return {
    outDir,
    buildTime,
  }
}

/**
 * Wrapper for out-of-process Vite dev server
 */
class ViteSubprocessDevServer {
  constructor(
    private process: Deno.ChildProcess,
    private _port: number,
    private stderrDrainer: Promise<void>,
  ) {}

  get port(): number {
    return this._port
  }

  get url(): string {
    return `http://localhost:${this.port}`
  }

  async [Symbol.asyncDispose](): Promise<void> {
    // Kill the process forcefully
    try {
      this.process.kill()
      // Wait for stderr drainer to finish
      await this.stderrDrainer
      // Close stdout and stderr to prevent leaks
      await this.process.stdout.cancel()
      await this.process.stderr.cancel()
      await this.process.status
    } catch {
      // Process might already be dead
    }
  }
}

/**
 * Start a Vite dev server programmatically
 */
export async function runViteDevServer(
  options: ViteTestOptions,
): Promise<ViteSubprocessDevServer> {
  const inlineConfig = options.inlineConfig || options.configOverrides || {}

  // Extract plugin names for serialization
  const pluginNames: string[] = []
  if (inlineConfig.plugins) {
    for (const plugin of inlineConfig.plugins) {
      if (plugin && typeof plugin === 'object' && 'name' in plugin) {
        if (plugin.name === 'vite-deno-resolver') {
          pluginNames.push('fasterDeno')
        } else if (plugin.name === 'vite:react-babel') {
          pluginNames.push('react')
        }
      }
    }
  }

  const config = {
    configFile: options.configFile ?? false,
    root: options.cwd,
    logLevel: 'warn',
    server: {
      port: 0, // Use random available port
      strictPort: false,
    },
    ...inlineConfig,
    plugins: undefined, // Remove plugins from config
    _plugins: pluginNames, // Add our custom field for plugin names
  }

  // Path to the runner script
  const runnerPath = join(import.meta.dirname!, 'vite-dev-runner.ts')

  // Start the subprocess
  const command = new Deno.Command('deno', {
    args: ['run', '-A', runnerPath, JSON.stringify(config)],
    cwd: options.cwd || Deno.cwd(),
    stdout: 'piped',
    stderr: 'piped',
  })

  const process = command.spawn()

  // Read stdout to get the port
  const decoder = new TextDecoder()
  const reader = process.stdout.getReader()

  let port = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      const text = decoder.decode(value)
      const lines = text.split('\n')

      for (const line of lines) {
        if (line.startsWith('VITE_DEV_PORT:')) {
          port = parseInt(line.split(':')[1])
          break
        }
      }

      if (port > 0) {
        break
      }
    }
  } finally {
    // Release the reader lock
    reader.releaseLock()
  }

  if (port === 0) {
    process.kill()
    await process.stdout.cancel()
    await process.stderr.cancel()
    throw new Error('Failed to get Vite dev server port')
  }

  // Give the server a moment to fully start
  await new Promise<void>((resolve) => setTimeout(resolve, 100))

  // Start draining stderr to prevent blocking
  const stderrDrainer = (async () => {
    try {
      for await (const _ of process.stderr) {
        // Just drain, don't log
      }
    } catch {
      // Ignore errors when process is killed
    }
  })()

  return new ViteSubprocessDevServer(process, port, stderrDrainer)
}
