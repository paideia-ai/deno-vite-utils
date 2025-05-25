import { join } from 'jsr:@std/path'
import { DenoEnv } from './deno-env.ts'

class TestDenoEnv extends DenoEnv implements AsyncDisposable {
  private tempDir: string

  constructor(tempDir: string) {
    super(tempDir)
    this.tempDir = tempDir
  }

  async [Symbol.asyncDispose]() {
    try {
      await Deno.remove(this.tempDir, { recursive: true })
    } catch {
      // Ignore errors during cleanup
    }
  }
}

export async function prepareTestDenoEnv(
  files: Record<string, string>,
): Promise<TestDenoEnv> {
  const tempDir = await Deno.makeTempDir({
    prefix: 'deno_vite_playground_',
  })

  // Write all files to the temp directory
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(tempDir, path)
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'))

    // Ensure directory exists
    await Deno.mkdir(dir, { recursive: true })

    // Write file
    await Deno.writeTextFile(fullPath, content)
  }

  return new TestDenoEnv(tempDir)
}
