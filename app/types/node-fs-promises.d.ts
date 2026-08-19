declare namespace NodeJS {
  interface ProcessEnv {
    [name: string]: string | undefined;
  }

  interface Process {
    cwd(): string;
    env: ProcessEnv;
    execPath: string;
    exitCode?: number;
  }
}

declare const process: NodeJS.Process;

declare module "node:buffer" {
  export class Buffer extends Uint8Array {
    static from(data: Uint8Array): Buffer;
  }
}

declare module "node:child_process" {
  interface SpawnSyncResult {
    status: number | null;
    stderr: string;
  }

  export function spawnSync(
    command: string,
    args: string[],
    options: {
      cwd: string;
      encoding: string;
      env?: NodeJS.ProcessEnv;
    },
  ): SpawnSyncResult;
}

declare module "node:fs/promises" {
  export function mkdir(
    path: string | URL,
    options: { recursive: true },
  ): Promise<void>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function readFile(
    path: string | URL,
    encoding: string,
  ): Promise<string>;
  export function rm(
    path: string | URL,
    options: { force: boolean; recursive: boolean },
  ): Promise<void>;
  export function writeFile(path: string | URL, data: string): Promise<void>;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
}
