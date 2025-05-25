import type { InlineConfig, ViteDevServer } from 'npm:vite'
import { build, createServer, preview } from 'npm:vite'
import type { PreviewServer } from 'npm:vite'

/**
 * Options for Vite test operations
 */
export interface ViteTestOptions {
  /** Path to the Vite config file */
  configFile?: string
  /** Working directory for the test */
  cwd?: string
  /** Additional Vite config overrides */
  configOverrides?: InlineConfig
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
 * Async disposable dev server wrapper
 */
export class ViteTestDevServer implements AsyncDisposable {
  private server: ViteDevServer

  constructor(server: ViteDevServer) {
    this.server = server
  }

  get viteServer(): ViteDevServer {
    return this.server
  }

  get port(): number {
    const address = this.server.httpServer?.address()
    if (typeof address === 'object' && address) {
      return address.port
    }
    throw new Error('Server not listening')
  }

  get url(): string {
    return `http://localhost:${this.port}`
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.server.close()
  }
}

/**
 * Async disposable preview server wrapper
 */
export class ViteTestPreviewServer implements AsyncDisposable {
  private server: PreviewServer

  constructor(server: PreviewServer) {
    this.server = server
  }

  get previewServer(): PreviewServer {
    return this.server
  }

  get port(): number {
    const address = this.server.httpServer?.address()
    if (typeof address === 'object' && address) {
      return address.port
    }
    throw new Error('Server not listening')
  }

  get url(): string {
    return `http://localhost:${this.port}`
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.server.httpServer?.close()
  }
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
 * Start a Vite dev server programmatically
 */
export async function runViteDevServer(
  options: ViteTestOptions,
): Promise<ViteTestDevServer> {
  const config: InlineConfig = {
    configFile: options.configFile,
    root: options.cwd,
    logLevel: 'warn',
    server: {
      port: 0, // Use random available port
      strictPort: false,
    },
    ...options.configOverrides,
  }

  const server = await createServer(config)
  await server.listen()

  return new ViteTestDevServer(server)
}

/**
 * Start a Vite preview server programmatically
 */
export async function runVitePreview(
  options: ViteTestOptions,
): Promise<ViteTestPreviewServer> {
  const config: InlineConfig = {
    configFile: options.configFile,
    root: options.cwd,
    logLevel: 'warn',
    preview: {
      port: 0, // Use random available port
      strictPort: false,
    },
    ...options.configOverrides,
  }

  const server = await preview(config)

  return new ViteTestPreviewServer(server)
}
