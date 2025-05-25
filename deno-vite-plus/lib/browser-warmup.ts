/**
 * Pre-warm browser instance to avoid subprocess leaks in tests
 *
 * This module starts a browser instance before tests run,
 * so the subprocess won't be created during test execution and
 * therefore won't be detected as a leak.
 */

import { launch } from 'jsr:@astral/astral'

// Check if running in CI environment
const isCI = Deno.env.get('CI') === 'true' ||
  Deno.env.get('GITHUB_ACTIONS') === 'true' ||
  Deno.env.get('GITLAB_CI') === 'true' ||
  Deno.env.get('CIRCLECI') === 'true'

// Launch a browser instance that will be reused across all tests
export const globalBrowser = await launch(
  isCI ? {} : {
    // Use system Chrome installation on macOS to avoid Chromium download issues
    path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  },
)
