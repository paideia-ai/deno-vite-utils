# RFC-02: HMR Implementation for Deno Vite Plugin

**Status:** Placeholder\
**Author:** [To be filled]\
**Created:** 2025-01-23\
**Discussion:** [Link to discussion]

## Summary

This RFC will outline the implementation strategy for Hot Module Replacement
(HMR) support in the Deno Vite plugin, addressing the unique challenges of
bridging Deno's module system with Vite's HMR infrastructure.

## Motivation

HMR is a critical developer experience feature that enables instant feedback
during development. Supporting HMR for Deno-specific imports (JSR, NPM
specifiers) requires careful integration with Vite's existing HMR system while
maintaining Deno's security and module resolution semantics.

## Areas to Address

### 1. Module Boundary Handling

- How to handle HMR updates across Deno/Node boundaries
- Maintaining module identity through transformations
- Preserving state during hot updates

### 2. JSR Module Updates

- Detecting changes in JSR modules
- Handling version updates
- Cache invalidation strategies

### 3. Import Map Changes

- Reloading when import maps change
- Partial vs full reload strategies
- Development-time import map switching

### 4. TypeScript/JSX Fast Refresh

- Integration with React Fast Refresh
- Preserving component state
- Type-safe HMR boundaries

### 5. SSR HMR

- Coordinating client and server updates
- Handling external module changes
- State synchronization

### 6. Performance Considerations

- Minimizing transformation overhead
- Efficient dependency tracking
- Optimistic updates

### 7. Error Recovery

- Graceful fallback to full reload
- Clear error boundaries
- Development-time diagnostics

## Implementation Phases

### Phase 1: Basic HMR Support

- [ ] File change detection
- [ ] Module invalidation
- [ ] Basic hot reload

### Phase 2: Framework Integration

- [ ] React Fast Refresh
- [ ] Vue HMR
- [ ] Svelte HMR

### Phase 3: Advanced Features

- [ ] Partial reloads
- [ ] State preservation
- [ ] HMR for CSS modules

### Phase 4: SSR HMR

- [ ] Server-side updates
- [ ] Client-server coordination
- [ ] External module handling

## Technical Challenges

1. **Module Graph Tracking**: Maintaining accurate dependency graphs across
   resolution transformations
2. **Source Maps**: Preserving source map accuracy through multiple
   transformations
3. **Circular Dependencies**: Handling circular imports through JSR
4. **Performance**: Minimizing HMR update latency
5. **Compatibility**: Ensuring HMR works with all supported import types

## Success Criteria

- [ ] HMR updates complete in <100ms for typical changes
- [ ] State preservation works for common frameworks
- [ ] Clear error messages for HMR failures
- [ ] No performance regression in production builds
- [ ] Compatible with Vite's HMR API

## References

- [Vite HMR API](https://vitejs.dev/guide/api-hmr.html)
- [ESM HMR Specification](https://github.com/FredKSchott/esm-hmr)
- [React Fast Refresh](https://github.com/facebook/react/tree/main/packages/react-refresh)

---

_Note: This is a placeholder RFC. The detailed design will be developed based on
initial implementation experience and community feedback._
