/**
 * build.ts — bun build --compile を複数ターゲットで実行するビルドスクリプト。
 *
 * 使用方法: bun run scripts/build.ts
 * 単一ターゲット: bun run scripts/build.ts --target=bun-darwin-arm64
 */

export {}

const VERSION = process.env["VERSION"] ?? "dev"

const targets = [
  { target: "bun-darwin-arm64", output: "cos-darwin-arm64" },
  { target: "bun-darwin-x64", output: "cos-darwin-x64" },
  { target: "bun-linux-x64", output: "cos-linux-x64" },
  { target: "bun-linux-arm64", output: "cos-linux-arm64" },
  { target: "bun-windows-x64", output: "cos-windows-x64.exe" },
]

const singleTarget = process.argv.find((a) => a.startsWith("--target="))?.split("=")[1]
const buildTargets = singleTarget ? targets.filter((t) => t.target === singleTarget) : targets

if (buildTargets.length === 0) {
  console.error(`不明なターゲット: ${singleTarget}`)
  process.exit(1)
}

for (const { target, output } of buildTargets) {
  console.log(`ビルド中: ${target} → dist/${output}`)
  const proc = Bun.spawn(
    [
      "bun",
      "build",
      "src/cli.ts",
      "--compile",
      `--target=${target}`,
      `--outfile=dist/${output}`,
      "--define",
      `VERSION="${VERSION}"`,
    ],
    { stdout: "inherit", stderr: "inherit" },
  )
  const exit = await proc.exited
  if (exit !== 0) {
    console.error(`ビルド失敗: ${target}`)
    process.exit(exit)
  }
}

console.log("ビルド完了")
