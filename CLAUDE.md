# Deno Vite Plugin Project

## Project Overview

This project is developing a comprehensive Vite plugin ecosystem for Deno 2,
enabling seamless integration between Vite and Deno's modern runtime features.
The main package `deno-vite-plus` provides multiple plugins to handle
Deno-specific imports, SSR support, and build optimizations.

## Project Goals

1. **Handle Deno-specific imports**: Support for `jsr:`, `npm:`, and `@`
   prefixed imports
2. **Full SSR support**: Both development and production SSR with flexible
   externalization strategies
3. **Import map support**: Leverage Deno's native import map resolution
4. **HMR support**: Long-term goal for hot module replacement (currently CSS HMR
   is supported)
5. **Workspace support**: Work in both workspace and direct usage scenarios

## Current Implementation Status

### Implemented Features

1. **Import Resolution**:
   - ✅ JSR imports (`jsr:@package/name`)
   - ✅ NPM imports (`npm:package@version`)
   - ✅ Scoped package resolution (`@org/package`)
   - ✅ TypeScript/JSX transformation via esbuild

2. **SSR Support**:
   - ✅ Development SSR with native Deno module loading
   - ✅ Production SSR with externalization support
   - ✅ Virtual module generation for SSR dev mode

3. **Performance**:
   - ✅ Resolution caching for repeated imports
   - ✅ Efficient module resolution using Deno's native tooling

### Pending Features

1. **Import Maps**:
   - ⏳ Explicit import map file support (currently relies on Deno's native
     resolution)
   - ⏳ Import map merging and transformation

2. **HMR**:
   - ⏳ Full JavaScript/TypeScript HMR support
   - ⏳ React Fast Refresh integration

3. **Build Optimization**:
   - ⏳ Selective externalization strategies
   - ⏳ Bundle splitting for Deno deployments

4. **Developer Experience**:
   - ⏳ Better error messages and debugging
   - ⏳ Performance profiling tools

## Architecture

### Plugin System

The project provides a unified Vite plugin that handles all Deno-specific
functionality:

**vite-deno-resolver**: A comprehensive plugin that:

- Resolves Deno-specific imports (JSR, NPM, local files)
- Handles TypeScript/JSX transformation via esbuild
- Manages SSR in both development and production modes
- Converts npm: specifiers to standard npm packages for Vite compatibility

### Key Design Decisions

1. **Whitelist approach**: Only handle known Deno-specific patterns, let Vite
   handle the rest
2. **Native Deno integration**: Use `deno info` for resolution to ensure
   compatibility
3. **Caching strategy**: Cache resolutions to minimize subprocess calls
4. **Internal ID format**: Use `\0` prefix for virtual modules to avoid
   conflicts

## Development Guidelines

### Testing

Run tests with:

```bash
deno task test
```

Tests include:

- Unit tests for individual plugins
- Integration tests for full build pipeline
- Example fixtures for manual testing

### Code Style

- Follow Deno formatting standards (2 spaces, no semicolons, single quotes)
- Use TypeScript for all plugin code
- Maintain plugin isolation - each plugin should have a single responsibility

### Adding New Features

1. Consider if it belongs in an existing plugin or needs a new one
2. Maintain backwards compatibility
3. Add tests for new functionality
4. Update integration tests if needed
5. Document configuration options

## Important Commands

### Linting and Type Checking

The project should support standard Deno commands:

- `deno fmt` - Format code
- `deno lint` - Lint code
- `deno check` - Type check

### Building and Testing

From `deno-vite-plus` directory:

- `deno task test` - Run all tests
- `deno task clean` - Clean build artifacts

## Technical Constraints

1. **Deno 2 Compatibility**: Must work with Deno 2's new features
2. **Vite Integration**: Must not break standard Vite functionality
3. **Performance**: Resolution caching is critical for large projects
4. **SSR Complexity**: Different strategies needed for dev vs prod

## Future Considerations

1. **Deno Deploy Integration**: Optimize builds for Deno Deploy
2. **Fresh Framework Support**: Ensure compatibility with Fresh
3. **Module Federation**: Support for federated Deno modules
4. **WASM Support**: Handle WASM imports in Deno context

## Current Issues and Limitations

1. **HMR**: Limited to CSS files currently
2. **Import Maps**: No explicit import map file support yet
3. **Error Messages**: Could be more descriptive
4. **Documentation**: Needs comprehensive user documentation

## File Structure

```
deno-vite-utils/
├── deno-vite-plus/         # Main plugin package
│   ├── index.ts            # Main entry point
│   ├── plugins/            # Individual plugins
│   │   ├── vite-deno-resolver.ts
│   │   ├── npm-unprefix.ts
│   │   ├── ssr-dev-plugin.ts
│   │   └── *.test.ts       # Plugin tests
│   ├── lib/                # Shared utilities
│   │   ├── deno-env.ts     # Deno environment handling
│   │   ├── deno-resolver.ts # Module resolution logic
│   │   ├── test-utils.ts   # Test utilities
│   │   ├── types.ts        # TypeScript interfaces
│   │   └── utils.ts        # Common utilities
│   └── tests/              # Integration tests
│       └── fixtures/       # Test applications
└── deno.json               # Workspace configuration
```

## Key Technical Details

### Resolution Flow

1. vite-deno-resolver intercepts Deno-specific imports
2. Uses `deno info --json` to resolve module dependencies
3. Converts npm: specifiers to standard npm packages
4. Handles SSR module loading in development
5. Vite handles remaining standard imports

### Virtual Module IDs

- Deno resolver: `\0deno::${encodedSpecifier}`
- The specifier is URL-encoded to handle special characters

### Caching Strategy

- Resolution results cached in memory
- Cache persists for entire Vite session
- No file-based caching currently

## Deno Info JSON Behavior

Based on testing, here's how `deno info --json` behaves:

### roots[0] patterns:

- Relative paths (./main.ts) → Resolved to absolute file URLs
  (file:///full/path/main.ts)
- Import map bare specifiers (chalk) → Resolved to versioned npm specifier
  (npm:chalk@5.3.0)
- JSR bare specifiers (jsr:@luca/cases) → Stays as-is in roots
- Non-existent files (./non-existent.ts) → Still resolved to absolute file URL
  (doesn't fail!)

### Redirects happen when:

- JSR packages: jsr:@luca/cases → https://jsr.io/@luca/cases/1.0.0/mod.ts
- NPM packages: npm:chalk@5.3.0 → npm:/chalk@5.3.0 (adds slash)
- Import maps: When bare specifier is resolved via import map
- NO redirects for: File URLs, they stay as-is

### Module types in modules array:

- ESM modules (kind: "esm"): Local files, remote URLs (deno.land, jsr.io)
- NPM modules (kind: "npm"): npm packages
- Node modules (kind: "node"): Node built-ins like node:path
- Errors: Non-existent files/packages have error field instead of kind

### Key insights:

- Non-existent files don't cause deno info to fail - they return an error module
- The specifier field in modules is the final resolved URL/path
- Import maps are resolved in roots[0], then redirects happen
- Dependencies show both the original specifier and the resolved code.specifier
- To find the module for a given input:
  1. Get actualId = json.roots[0]
  2. Get redirected = json.redirects[actualId] ?? actualId
  3. Find module where module.specifier === redirected

## References

- [Vite Plugin API](https://vitejs.dev/guide/api-plugin.html)
- [Deno Manual](https://deno.land/manual)
- [Deno JSR](https://jsr.io)
