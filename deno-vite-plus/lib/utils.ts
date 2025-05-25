import type { Loader } from 'esbuild'
import type { DenoMediaType } from './types.ts'

export function mediaTypeToLoader(media: DenoMediaType): Loader {
  switch (media) {
    case 'JSX':
      return 'jsx'
    case 'JavaScript':
      return 'js'
    case 'Json':
      return 'json'
    case 'TSX':
      return 'tsx'
    case 'TypeScript':
      return 'ts'
  }
}
