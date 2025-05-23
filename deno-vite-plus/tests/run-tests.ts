// Test runner for integration tests
import { join } from 'jsr:@std/path'

// First, clean up previous test builds
async function cleanupTestBuilds() {
  console.log('🧹 Cleaning up previous test builds...')

  const fixtures = ['basic']

  for (const fixture of fixtures) {
    const distPath = join(Deno.cwd(), 'tests', 'fixtures', fixture, 'dist')

    try {
      await Deno.remove(distPath, { recursive: true })
      console.log(`Removed ${distPath}`)
    } catch (error) {
      // Ignore errors if directory doesn't exist
      if (!(error instanceof Deno.errors.NotFound)) {
        console.error(`Error cleaning up ${distPath}:`, error)
      }
    }
  }
}

// Run the integration tests
async function runTests() {
  await cleanupTestBuilds()

  console.log('\n🧪 Running integration tests...\n')

  const process = new Deno.Command('deno', {
    args: ['test', '-A', 'tests/integration.test.ts'],
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const { code } = await process.output()

  if (code === 0) {
    console.log('\n✅ All tests passed!')
  } else {
    console.error('\n❌ Tests failed!')
    Deno.exit(code)
  }
}

await runTests()
