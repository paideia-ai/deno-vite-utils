#!/usr/bin/env -S deno run -A
/**
 * Out-of-process Vite dev server runner
 * Accepts config as JSON through argv
 */

import { createServer, type InlineConfig } from 'npm:vite@6.3.5'
import fasterDeno from '../index.ts'
import react from 'npm:@vitejs/plugin-react@4.4.1'

async function main() {
  const configJson = Deno.args[0]
  if (!configJson) {
    console.error('Error: Config JSON required as first argument')
    Deno.exit(1)
  }

  try {
    const rawConfig = JSON.parse(configJson)

    // Reconstruct plugins based on plugin names
    const plugins = []
    if (rawConfig._plugins?.includes('fasterDeno')) {
      plugins.push(...fasterDeno())
    }
    if (rawConfig._plugins?.includes('react')) {
      plugins.push(react())
    }

    // Build the actual config
    const config: InlineConfig = {
      ...rawConfig,
      plugins,
      _plugins: undefined, // Remove our custom field
    }

    // Create and start the server
    const server = await createServer(config)
    await server.listen()

    const address = server.httpServer?.address()
    if (typeof address === 'object' && address) {
      // Output the port so the parent process can read it
      console.log(`VITE_DEV_PORT:${address.port}`)
    }

    // Keep the process running
    await new Promise(() => {})
  } catch (error) {
    console.error('Error starting Vite dev server:', error)
    Deno.exit(1)
  }
}

if (import.meta.main) {
  main()
}
