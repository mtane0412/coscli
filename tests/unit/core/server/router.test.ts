/**
 * router のテスト。
 * path テンプレートマッチと params 抽出の正確性を検証する。
 */

import { describe, expect, it } from "bun:test"
import { route } from "@/core/server/router"

describe("route", () => {
  describe("GET /healthz", () => {
    it("マッチし params は空", () => {
      const result = route("GET", "/healthz")
      expect(result).not.toBeNull()
      expect(result?.params).toEqual({})
    })
  })

  describe("GET /api/pages", () => {
    it("マッチし params は空", () => {
      const result = route("GET", "/api/pages")
      expect(result).not.toBeNull()
      expect(result?.params).toEqual({})
    })
  })

  describe("GET /api/pages/:title", () => {
    it("ASCII タイトルをマッチし params.title を返す", () => {
      const result = route("GET", "/api/pages/hello-world")
      expect(result).not.toBeNull()
      expect(result?.params).toEqual({ title: "hello-world" })
    })

    it("パーセントエンコードされたタイトルをデコードして返す", () => {
      const result = route("GET", "/api/pages/%E6%97%A5%E6%9C%AC%E8%AA%9E")
      expect(result).not.toBeNull()
      expect(result?.params).toEqual({ title: "日本語" })
    })

    it("スペースを含むタイトル（%20）をデコードして返す", () => {
      const result = route("GET", "/api/pages/foo%20bar")
      expect(result).not.toBeNull()
      expect(result?.params).toEqual({ title: "foo bar" })
    })
  })

  describe("GET /api/pages/:title/text", () => {
    it("マッチし params.title を返す", () => {
      const result = route("GET", "/api/pages/my-page/text")
      expect(result).not.toBeNull()
      expect(result?.params).toEqual({ title: "my-page" })
    })
  })

  describe("POST /api/pages", () => {
    it("POST メソッドでマッチする", () => {
      const result = route("POST", "/api/pages")
      expect(result).not.toBeNull()
      expect(result?.params).toEqual({})
    })
  })

  describe("PUT /api/pages/:title", () => {
    it("PUT メソッドでマッチし params.title を返す", () => {
      const result = route("PUT", "/api/pages/my-page")
      expect(result).not.toBeNull()
      expect(result?.params).toEqual({ title: "my-page" })
    })
  })

  describe("DELETE /api/pages/:title", () => {
    it("DELETE メソッドでマッチし params.title を返す", () => {
      const result = route("DELETE", "/api/pages/my-page")
      expect(result).not.toBeNull()
      expect(result?.params).toEqual({ title: "my-page" })
    })
  })

  describe("マッチしないケース", () => {
    it("未知のパスは null を返す", () => {
      expect(route("GET", "/unknown")).toBeNull()
    })

    it("正しいパスでも間違った HTTP メソッドは null を返す", () => {
      expect(route("POST", "/api/pages/タイトル")).toBeNull()
    })

    it("PATCH メソッドは定義されていないため null を返す", () => {
      expect(route("PATCH", "/api/pages/タイトル")).toBeNull()
    })
  })
})
