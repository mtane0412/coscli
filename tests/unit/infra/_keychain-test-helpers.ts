/**
 * _keychain-test-helpers.ts — keychain ストアテスト共通ユーティリティ。
 *
 * fakeProcess / captureSpawner / CapturedCall を各テストファイルで再利用するために提供する。
 */

import type { SpawnOptions, SubprocessLike } from "@/infra/keychain/spawner"

/** CapturedCall は captureSpawner が記録する 1 回分の spawn 呼び出し情報。 */
export type CapturedCall = { cmd: string[]; options: SpawnOptions | undefined }

/** fakeProcess は stdout / stderr / exited を返すプロセスの偽実装を生成する。 */
export function fakeProcess(stdout: string, stderr: string, exitCode: number): SubprocessLike {
  return {
    stdout: new Response(stdout).body as ReadableStream<Uint8Array>,
    stderr: new Response(stderr).body as ReadableStream<Uint8Array>,
    exited: Promise.resolve(exitCode),
  }
}

/**
 * captureSpawner は呼ばれた引数を記録しつつ指定の応答を返す偽 spawner を生成する。
 * getCall(n) で n 番目の呼び出し記録を取得できる。存在しない場合はエラーを throw する。
 */
export function captureSpawner(stdout: string, stderr: string, exitCode: number) {
  const calls: CapturedCall[] = []
  const spawner = (cmd: string[], options?: SpawnOptions): SubprocessLike => {
    calls.push({ cmd, options })
    return fakeProcess(stdout, stderr, exitCode)
  }
  function getCall(index: number): CapturedCall {
    const call = calls[index]
    if (call === undefined) throw new Error(`calls[${index}] が存在しません`)
    return call
  }
  return { spawner, calls, getCall }
}

/**
 * enoentSpawner は ENOENT エラーを throw する偽 spawner を返す。
 * コマンドが見つからない場合のエラーハンドリングをテストするために使用する。
 */
export function enoentSpawner() {
  return (_cmd: string[], _options?: SpawnOptions): SubprocessLike => {
    const err = new Error("spawn: ENOENT") as NodeJS.ErrnoException
    err.code = "ENOENT"
    throw err
  }
}
