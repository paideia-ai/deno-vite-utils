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
   - ✅ JSR imports (`jsr:@package/name`) via vite-deno-resolver plugin
   - ✅ NPM imports (`npm:package@version`) via npm-unprefix plugin
   - ✅ Scoped package resolution (`@org/package`)
   - ✅ TypeScript/JSX transformation via esbuild

2. **SSR Support**:
   - ✅ Development SSR with native Deno module loading (ssr-dev-plugin)
   - ✅ Production SSR with node externals
   - ✅ Configurable external dependencies

3. **CSS Support**:
   - ✅ CSS imports in TypeScript files via faster-deno-css plugin
   - ✅ Basic CSS HMR support

4. **Performance**:
   - ✅ Resolution caching for repeated imports
   - ✅ Efficient plugin ordering

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

The project uses a modular plugin architecture with four main plugins:

1. **vite-deno-resolver**: Core resolver for Deno-specific imports
2. **npm-unprefix**: Strips npm: prefixes for Vite compatibility
3. **ssr-dev-plugin**: Handles SSR in development mode
4. **faster-deno-css**: CSS import handling for TypeScript files

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
│   │   ├── resolver.ts     # Resolution helpers
│   │   └── utils.ts        # Common utilities
│   ├── tests/              # Integration tests
│   │   └── fixtures/       # Test applications
│   └── faster-deno-css.ts  # CSS plugin
└── deno.json               # Workspace configuration
```

## Key Technical Details

### Resolution Flow

1. npm-unprefix strips `npm:` prefixes
2. vite-deno-resolver handles `jsr:` and `@` imports
3. ssr-dev-plugin intercepts SSR imports in dev
4. Vite handles remaining standard imports

### Virtual Module IDs

- Deno resolver: `\0deno::${mediaType}::${id}::${resolvedPath}`
- SSR dev: `\0deno-ssr-dev::${originalId}`

### Caching Strategy

- Resolution results cached in memory
- Cache persists for entire Vite session
- No file-based caching currently

## References

- [Vite Plugin API](https://vitejs.dev/guide/api-plugin.html)
- [Deno Manual](https://deno.land/manual)
- [Deno JSR](https://jsr.io)
