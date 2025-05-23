# Integration Tests for faster-deno-vite

This directory contains integration tests for the faster-deno-vite plugin.

## Test Structure

- `fixtures/`: Contains test applications that use the plugin
  - `basic/`: A simple counter app using React, Vite, and JSR components

## Running Tests

```bash
# Run all integration tests
deno task test

# Clean up test build artifacts
deno task clean
```

## Test Fixtures

### Basic Fixture

A simple counter application that demonstrates:

- Using JSR imports (`jsr:@isofucius/deno-shadcn-ui/components/button`)
- Browser builds with the plugin
- SSR builds with the plugin
- Server-side rendering integration

The basic fixture has two build configurations:

1. `vite.config.browser.ts` - For client-side browser builds
2. `vite.config.ssr.ts` - For server-side rendering builds

Both configs use the faster-deno-vite plugin to handle JSR and npm: imports.
