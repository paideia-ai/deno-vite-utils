import { dirname } from 'jsr:@std/path/dirname'
import type { Logger } from 'vite'
import { resolveDeno, type ResolvedInfo, toDenoSpecifier } from '@/lib/utils.ts'

/* ─── Resolver ────────────────────────────────────────────────────────────── */

export class Resolver {
  #cwd: string
  #logger: Logger
  #cacheFile: string

  #esmModules = new Map<string, ResolvedInfo>()
  #codeSpecifierToPath = new Map<string, string>()
  #idToSpecifier = new Map<string, string>()

  #unknownModules = new Set<string>()

  #lock = new Lock()
  #denoInfoTotalMs = 0

  constructor(
    cwd: string,
    logger: Logger,
    cacheFile: string,
  ) {
    this.#cwd = cwd
    this.#logger = logger
    this.#cacheFile = cacheFile
  }

  async readCache(): Promise<void> {
    try {
      const text = await Deno.readTextFile(this.#cacheFile)
      const parsed = JSON.parse(text)
      this.#esmModules = new Map(parsed.esmModules)
      this.#codeSpecifierToPath = new Map(parsed.codeSpecifierToPath)
      this.#idToSpecifier = new Map(parsed.idToSpecifier)
      this.#logger.info(`Cache loaded from ${this.#cacheFile}`)
    } catch {
      // benign
    }
  }

  async saveCache(): Promise<void> {
    await Deno.mkdir(dirname(this.#cacheFile), { recursive: true })
    const json = JSON.stringify(
      {
        esmModules: [...this.#esmModules],
        codeSpecifierToPath: [...this.#codeSpecifierToPath],
        idToSpecifier: [...this.#idToSpecifier],
      },
      null,
      2,
    )
    await Deno.writeTextFile(this.#cacheFile, json) // Deno FS write 🌟
  }

  async #timedResolveDeno(id: string) {
    const t0 = performance.now()
    const result = await resolveDeno(id, this.#cwd) // uses utils.ts (Deno.Command) 🌟
    const dt = performance.now() - t0
    this.#denoInfoTotalMs = this.#denoInfoTotalMs + dt
    this.#logger.info(`"deno info" ${Math.round(dt)} ms → ${id}`)
    return result
  }

  async resolveId(id: string): Promise<ResolvedInfo | null> {
    if (this.#unknownModules.has(id)) {
      return null
    }

    if (this.#idToSpecifier.has(id)) {
      const spec = this.#idToSpecifier.get(id)!
      const p = this.#codeSpecifierToPath.get(spec)!
      return this.#esmModules.get(p)!
    }

    const result = await this.#timedResolveDeno(id)
    if (result === null) {
      this.#unknownModules.add(id)
      return null
    }

    const { specifier, tree } = result
    this.#idToSpecifier.set(id, specifier)

    for (const mod of tree.modules) {
      if ('kind' in mod && mod.kind === 'esm') {
        const localPath = mod.local
        if (!this.#esmModules.has(localPath)) {
          this.#esmModules.set(localPath, mod)
          this.#codeSpecifierToPath.set(mod.specifier, localPath)
        }
      }
    }

    await this.saveCache()
    const path = this.#codeSpecifierToPath.get(specifier)
    return path !== undefined ? this.#esmModules.get(path) ?? null : null
  }

  async fetchESMModule(path: string, id: string) {
    if (this.#esmModules.has(path)) {
      return this.#esmModules.get(path)
    }
    return await this.resolveId(id)
  }

  async _resolveNestedImport(
    id: string,
    importerId: string,
    importerPath: string,
  ) {
    const importer = await this.fetchESMModule(importerPath, importerId)
    if (!importer) {
      return null
    }

    const dep = importer.dependencies.find((
      d: ResolvedInfo['dependencies'][0],
    ) => d.specifier === id)
    if (!dep) {
      return null
    }

    const specifier = dep.code.specifier
    const targetPath = this.#codeSpecifierToPath.get(specifier)
    let targetModule: ResolvedInfo | null = null

    if (targetPath) {
      targetModule = this.#esmModules.get(targetPath) ?? null
    } else {
      targetModule = await this.resolveId(specifier)
    }
    if (!targetModule) {
      return null
    }

    return toDenoSpecifier(
      targetModule.mediaType,
      specifier,
      targetModule.local,
    )
  }

  async resolveNestedImport(
    id: string,
    importerId: string,
    importerPath: string,
  ) {
    await this.#lock.acquire()
    try {
      const result = await this._resolveNestedImport(
        id,
        importerId,
        importerPath,
      )
      return result
    } finally {
      this.#lock.release()
    }
  }

  async _resolveBase(id: string) {
    const mod = await this.resolveId(id)
    if (!mod) {
      return null
    }
    return toDenoSpecifier(mod.mediaType, mod.specifier, mod.local)
  }

  async resolveBase(id: string) {
    await this.#lock.acquire()
    try {
      return await this._resolveBase(id)
    } finally {
      this.#lock.release()
    }
  }

  async finalize() {
    await this.saveCache()
  }
}

/* ─── Simple async mutex ────────────────────────────────────────────────── */

class Lock {
  #locked = false
  #queue: Array<() => void> = []

  acquire(): Promise<void> {
    if (!this.#locked) {
      this.#locked = true
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.#queue.push(resolve)
    })
  }

  release(): void {
    if (this.#queue.length > 0) {
      const next = this.#queue.shift()
      if (next !== undefined) {
        next()
      }
    } else {
      this.#locked = false
    }
  }
}
