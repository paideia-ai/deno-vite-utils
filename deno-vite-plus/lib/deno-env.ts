import { assert } from 'jsr:@std/assert'
import { Mutex } from 'npm:async-mutex'
import type { DenoInfoJsonV1 } from './types.ts'

async function run(cmd: string[], cwd: string) {
  const { stdout, stderr, code } = await new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd,
    stdout: 'piped',
    stderr: 'piped',
  }).output()

  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  }
}

export class DenoEnv {
  protected cwd: string
  private lock = new Mutex()

  constructor(cwd: string) {
    this.cwd = cwd
  }

  async resolveDeno(
    id: string,
  ): Promise<DenoInfoJsonV1> {
    return await this.lock.runExclusive(async () => {
      const { code, stdout, stderr } = await run(
        ['deno', 'info', '--json', id],
        this.cwd,
      )

      assert(
        code === 0,
        `deno info failed for ${id}: ${stderr}`,
      )

      return JSON.parse(stdout) as DenoInfoJsonV1
    })
  }
}
