export class CliExit extends Error {
  constructor(readonly exitCode: number) {
    super(`Exit ${exitCode}`);
  }
}
