import { assertEquals } from 'jsr:@std/assert'
import { npmSpecifierToNpmId } from './vite-deno-resolver.ts'

Deno.test('npmSpecifierToNpmId - basic package', () => {
  assertEquals(
    npmSpecifierToNpmId('npm:/react@18.2.0'),
    'react',
  )
})

Deno.test('npmSpecifierToNpmId - package with subpath', () => {
  assertEquals(
    npmSpecifierToNpmId('npm:/react-dom@19.1.0/client'),
    'react-dom/client',
  )
})

Deno.test('npmSpecifierToNpmId - scoped package with subpath', () => {
  assertEquals(
    npmSpecifierToNpmId(
      'npm:/@babel/core@7.22.0/lib/index.js',
    ),
    '@babel/core/lib/index.js',
  )
})

Deno.test('npmSpecifierToNpmId - package with complex version', () => {
  assertEquals(
    npmSpecifierToNpmId('npm:/lodash@^4.17.21'),
    'lodash',
  )
})

Deno.test('npmSpecifierToNpmId - scoped package with complex version', () => {
  assertEquals(
    npmSpecifierToNpmId('npm:/@types/node@~20.5.0'),
    '@types/node',
  )
})

Deno.test('npmSpecifierToNpmId - package with peer dependencies', () => {
  assertEquals(
    npmSpecifierToNpmId(
      'npm:/react-dom@19.1.0/client',
    ),
    'react-dom/client',
  )
})

Deno.test('npmSpecifierToNpmId - scoped package with peer dependencies', () => {
  assertEquals(
    npmSpecifierToNpmId(
      'npm:/@testing-library/react@14.0.0',
    ),
    '@testing-library/react',
  )
})
