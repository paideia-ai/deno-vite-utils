import { assertEquals } from 'jsr:@std/assert'
import { parseNpmSpecifier } from './npm-unprefix.ts'

Deno.test('parseNpmSpecifier handles basic npm URLs', () => {
  assertEquals(
    parseNpmSpecifier('npm:react'),
    'react',
  )
})

Deno.test('parseNpmSpecifier handles scoped packages', () => {
  assertEquals(
    parseNpmSpecifier('npm:@types/react'),
    '@types/react',
  )
})

Deno.test('parseNpmSpecifier handles versions', () => {
  assertEquals(
    parseNpmSpecifier('npm:react@18.2.0'),
    'react',
  )
})

Deno.test('parseNpmSpecifier handles scoped packages with versions', () => {
  assertEquals(
    parseNpmSpecifier('npm:@types/react@18.2.0'),
    '@types/react',
  )
})

Deno.test('parseNpmSpecifier handles paths', () => {
  assertEquals(
    parseNpmSpecifier('npm:react/jsx-runtime'),
    'react/jsx-runtime',
  )
})

Deno.test('parseNpmSpecifier handles versions and paths', () => {
  assertEquals(
    parseNpmSpecifier('npm:react@18.2.0/jsx-runtime'),
    'react/jsx-runtime',
  )
})

Deno.test('parseNpmSpecifier handles scoped packages with versions and paths', () => {
  assertEquals(
    parseNpmSpecifier('npm:@types/react@18.2.0/jsx-runtime'),
    '@types/react/jsx-runtime',
  )
})

Deno.test('parseNpmSpecifier returns null for non-npm URLs', () => {
  assertEquals(
    parseNpmSpecifier('react'),
    null,
  )
})

Deno.test('parseNpmSpecifier returns null for invalid npm URLs', () => {
  assertEquals(
    parseNpmSpecifier('npm:'),
    null,
  )
})
