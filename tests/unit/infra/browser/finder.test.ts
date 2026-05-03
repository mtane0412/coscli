/**
 * finder.test.ts — PlatformBrowserFinder のユニットテスト。
 *
 * ExistsChecker と platform 文字列を差し替えることで実 FS に触らず
 * OS 別 Chrome/Chromium パス探索ロジックを検証する。
 */

import { describe, expect, it } from "bun:test"
import { PlatformBrowserFinder } from "@/infra/browser/finder"

// macOS 標準パス候補
const MACOS_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const MACOS_CHROMIUM = "/Applications/Chromium.app/Contents/MacOS/Chromium"

// Linux 標準パス候補
const LINUX_CHROME = "/usr/bin/google-chrome"
const LINUX_CHROMIUM_BROWSER = "/usr/bin/chromium-browser"
const LINUX_CHROMIUM = "/usr/bin/chromium"

// Windows 標準パス候補
const WINDOWS_CHROME_64 = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const WINDOWS_CHROME_32 = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"

/** 特定パスが存在すると見なす ExistsChecker を作成するヘルパー。 */
function existsFor(...presentPaths: string[]) {
  return async (path: string) => presentPaths.includes(path)
}

/** 何も存在しない ExistsChecker。 */
const existsNone = async (_path: string) => false

describe("PlatformBrowserFinder", () => {
  describe("override オプション", () => {
    it("override パスのファイルが存在する場合はそのパスを返す", async () => {
      const customPath = "/usr/local/bin/chrome-カスタム"
      const finder = new PlatformBrowserFinder({
        platform: "darwin",
        existsChecker: existsFor(customPath),
      })
      expect(await finder.find({ override: customPath })).toBe(customPath)
    })

    it("override パスのファイルが存在しない場合は null を返す", async () => {
      const finder = new PlatformBrowserFinder({
        platform: "darwin",
        existsChecker: existsNone,
      })
      expect(await finder.find({ override: "/存在しないパス/chrome" })).toBeNull()
    })
  })

  describe("macOS (darwin)", () => {
    it("Google Chrome が存在する場合はそのパスを返す", async () => {
      const finder = new PlatformBrowserFinder({
        platform: "darwin",
        existsChecker: existsFor(MACOS_CHROME),
      })
      expect(await finder.find()).toBe(MACOS_CHROME)
    })

    it("Google Chrome がなく Chromium が存在する場合は Chromium のパスを返す", async () => {
      const finder = new PlatformBrowserFinder({
        platform: "darwin",
        existsChecker: existsFor(MACOS_CHROMIUM),
      })
      expect(await finder.find()).toBe(MACOS_CHROMIUM)
    })

    it("両方存在する場合は Google Chrome を優先して返す", async () => {
      const finder = new PlatformBrowserFinder({
        platform: "darwin",
        existsChecker: existsFor(MACOS_CHROME, MACOS_CHROMIUM),
      })
      expect(await finder.find()).toBe(MACOS_CHROME)
    })

    it("どちらも存在しない場合は null を返す", async () => {
      const finder = new PlatformBrowserFinder({ platform: "darwin", existsChecker: existsNone })
      expect(await finder.find()).toBeNull()
    })
  })

  describe("Linux", () => {
    it("google-chrome が存在する場合はそのパスを返す", async () => {
      const finder = new PlatformBrowserFinder({
        platform: "linux",
        existsChecker: existsFor(LINUX_CHROME),
      })
      expect(await finder.find()).toBe(LINUX_CHROME)
    })

    it("google-chrome がなく chromium-browser が存在する場合はそのパスを返す", async () => {
      const finder = new PlatformBrowserFinder({
        platform: "linux",
        existsChecker: existsFor(LINUX_CHROMIUM_BROWSER),
      })
      expect(await finder.find()).toBe(LINUX_CHROMIUM_BROWSER)
    })

    it("前 2 つがなく chromium が存在する場合はそのパスを返す", async () => {
      const finder = new PlatformBrowserFinder({
        platform: "linux",
        existsChecker: existsFor(LINUX_CHROMIUM),
      })
      expect(await finder.find()).toBe(LINUX_CHROMIUM)
    })

    it("候補順序は google-chrome > chromium-browser > chromium", async () => {
      // すべて存在する場合、最優先の google-chrome を返す
      const finder = new PlatformBrowserFinder({
        platform: "linux",
        existsChecker: existsFor(LINUX_CHROME, LINUX_CHROMIUM_BROWSER, LINUX_CHROMIUM),
      })
      expect(await finder.find()).toBe(LINUX_CHROME)
    })

    it("どれも存在しない場合は null を返す", async () => {
      const finder = new PlatformBrowserFinder({ platform: "linux", existsChecker: existsNone })
      expect(await finder.find()).toBeNull()
    })
  })

  describe("Windows (win32)", () => {
    it("64 ビット Program Files の chrome.exe が存在する場合はそのパスを返す", async () => {
      const finder = new PlatformBrowserFinder({
        platform: "win32",
        existsChecker: existsFor(WINDOWS_CHROME_64),
      })
      expect(await finder.find()).toBe(WINDOWS_CHROME_64)
    })

    it("64 ビットがなく 32 ビット Program Files の chrome.exe が存在する場合はそのパスを返す", async () => {
      const finder = new PlatformBrowserFinder({
        platform: "win32",
        existsChecker: existsFor(WINDOWS_CHROME_32),
      })
      expect(await finder.find()).toBe(WINDOWS_CHROME_32)
    })

    it("どちらも存在しない場合は null を返す", async () => {
      const finder = new PlatformBrowserFinder({ platform: "win32", existsChecker: existsNone })
      expect(await finder.find()).toBeNull()
    })
  })

  describe("未知の OS", () => {
    it("未知の platform では null を返す", async () => {
      const finder = new PlatformBrowserFinder({
        platform: "freebsd" as NodeJS.Platform,
        existsChecker: existsNone,
      })
      expect(await finder.find()).toBeNull()
    })
  })
})
