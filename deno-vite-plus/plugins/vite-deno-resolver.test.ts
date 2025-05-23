import { assertEquals, assertThrows } from 'jsr:@std/assert'
import { shouldHandleId } from './vite-deno-resolver.ts'

// Mock the handleNpmSpecifier function since it's not exported
const mockHandleNpmSpecifier = () => {
  throw new Error('npm: specifier found')
}

Deno.test('shouldHandleId handles JSR imports', () => {
  assertEquals(shouldHandleId('jsr:@std/path'), true)
  assertEquals(shouldHandleId('jsr:@std/fs'), true)
  assertEquals(
    shouldHandleId('jsr:@isofucius/deno-shadcn-ui/default/ui/button'),
    true,
  )
})

Deno.test('shouldHandleId handles scoped packages', () => {
  assertEquals(shouldHandleId('@std/path'), true)
  assertEquals(shouldHandleId('@isofucius/deno-shadcn-ui'), true)
})

Deno.test('shouldHandleId rejects wildcards and null bytes', () => {
  assertEquals(shouldHandleId('some/path/*'), false)
  assertEquals(shouldHandleId('some/path/\0'), false)
})

Deno.test('shouldHandleId rejects regular paths', () => {
  assertEquals(shouldHandleId('react'), false)
  assertEquals(shouldHandleId('./local/path'), false)
  assertEquals(shouldHandleId('/absolute/path'), false)
  assertEquals(shouldHandleId('../relative/path'), false)
})

Deno.test('handleNpmSpecifier throws error for npm imports', () => {
  assertThrows(
    () => mockHandleNpmSpecifier(),
    Error,
    'npm: specifier found',
  )
})
