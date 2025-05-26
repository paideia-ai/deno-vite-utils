export type DenoMediaType = 'TypeScript' | 'TSX' | 'JavaScript' | 'JSX' | 'Json'

export interface DenoInfoJsonV1 {
  version: 1
  redirects: Record<string, string>
  roots: string[]
  modules: Array<
    | EsmResolvedInfo
    | NpmResolvedInfo
    | NodeResolvedInfo
    | ResolveError
  >
  packages?: Record<string, string>
  npmPackages?: Record<string, {
    name: string
    version: string
    dependencies: string[]
    registryUrl: string
  }>
}

export interface EsmResolvedInfo {
  kind: 'esm'
  local: string
  size: number
  mediaType: DenoMediaType
  specifier: string
  dependencies?: Array<{
    specifier: string
    code?: {
      specifier: string
    }
    type?: {
      specifier: string
    }
  }>
}

export interface NpmResolvedInfo {
  kind: 'npm'
  specifier: string
  npmPackage: string
}

export interface NodeResolvedInfo {
  kind: 'node'
  specifier: string
  moduleName: string
}

export interface ResolveError {
  specifier: string
  error: string
}

export interface ResolvedInfo {
  kind: 'esm'
  local: string
  size: number
  mediaType: DenoMediaType
  specifier: string
  dependencies: Array<{
    relativePath: string
    specifier: string
  }>
}

export type Module =
  | ResolvedInfo
  | NpmResolvedInfo
  | NodeResolvedInfo
  | ResolveError
