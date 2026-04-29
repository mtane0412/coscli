/**
 * spawner.ts — 外部コマンドを spawn する関数の型定義と既定実装。
 *
 * 各 *KeychainStore が Bun.spawn をテストで差し替えできるよう DI ポイントを提供する。
 * テストでは Spawner を差し替えることで実コマンドを呼ばずにモック実行できる。
 */

/** SubprocessLike は spawner の返り値が満たすべき最小インターフェース。 */
export interface SubprocessLike {
  readonly stdout: ReadableStream<Uint8Array>
  readonly stderr: ReadableStream<Uint8Array>
  readonly exited: Promise<number>
}

/** SpawnOptions は spawner に渡すオプション。 */
export interface SpawnOptions {
  stdin?: BodyInit
  stdout?: "pipe"
  stderr?: "pipe"
  env?: Record<string, string>
}

/**
 * Spawner は外部コマンドを spawn する関数の型。
 * テストでは偽実装を注入して実コマンドの呼び出しを回避できる。
 */
export type Spawner = (cmd: string[], options?: SpawnOptions) => SubprocessLike

/**
 * defaultSpawner は本番実装。Bun.spawn をそのまま呼び出す。
 * Bun.spawn は ENOENT 時に同期 throw するため、呼び出し側で try/catch が必要。
 */
export const defaultSpawner: Spawner = (cmd, options) => {
  // Bun.spawn の引数型と SpawnOptions の差 (stdin/stdout/stderr の具体的なジェネリクス) を吸収する
  return Bun.spawn(cmd, options as Parameters<typeof Bun.spawn>[1]) as unknown as SubprocessLike
}
