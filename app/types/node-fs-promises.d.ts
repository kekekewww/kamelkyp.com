declare namespace NodeJS {
  interface ProcessEnv {
    [name: string]: string | undefined;
  }

  interface Process {
    env: ProcessEnv;
  }
}

declare const process: NodeJS.Process;

declare module "node:fs/promises" {
  export function readFile(
    path: string | URL,
    encoding: string,
  ): Promise<string>;
}
