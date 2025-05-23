import { assertEquals } from 'jsr:@std/assert'
import { shouldHandleId } from './ssr-dev-plugin.ts'

Deno.test('shouldHandleId - handles exact matches', () => {
  assertEquals(shouldHandleId('@test/module', ['@test/module']), true)
  assertEquals(shouldHandleId('some/path', ['some/path']), true)
})

Deno.test('shouldHandleId - handles nested paths', () => {
  assertEquals(shouldHandleId('@test/module/nested', ['@test/module']), true)
  assertEquals(shouldHandleId('some/path/nested', ['some/path']), true)
})

Deno.test('shouldHandleId - handles wildcards', () => {
  assertEquals(shouldHandleId('@test/module', ['@test/*']), true)
  assertEquals(shouldHandleId('@test/other', ['@test/*']), true)
  assertEquals(shouldHandleId('@other/module', ['@test/*']), false)
})

Deno.test('shouldHandleId - handles multiple patterns', () => {
  const deps = ['@test/*', 'lib', '@other/specific']

  assertEquals(shouldHandleId('@test/module', deps), true)
  assertEquals(shouldHandleId('lib/utils', deps), true)
  assertEquals(shouldHandleId('@other/specific', deps), true)
  assertEquals(shouldHandleId('@other/different', deps), false)
  assertEquals(shouldHandleId('react', deps), false)
})

Deno.test('shouldHandleId - returns false for non-matching paths', () => {
  const deps = ['@test/module']

  assertEquals(shouldHandleId('@other/module', deps), false)
  assertEquals(shouldHandleId('react', deps), false)
  assertEquals(shouldHandleId('./local/path', deps), false)
})
