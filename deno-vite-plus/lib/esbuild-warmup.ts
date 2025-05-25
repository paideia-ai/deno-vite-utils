/**
 * Pre-warm esbuild service to avoid subprocess leaks in tests
 *
 * This module starts the esbuild service process before tests run,
 * so the subprocess won't be created during test execution and
 * therefore won't be detected as a leak.
 */

try {
  // Dynamically import esbuild to start its service
  const esbuild = await import('esbuild')

  // Run a dummy transform to initialize the service
  await esbuild.transform('', {
    loader: 'js',
    format: 'esm',
  })

  console.log('[esbuild-warmup] ✅ esbuild service pre-warmed')
} catch (error) {
  // Silently ignore errors - this is just an optimization
  console.debug('[esbuild-warmup] Failed to pre-warm esbuild:', error)
}
