import { describe, expect, it } from "vitest"
import { defineMachine } from "./machine"
import { parseMessageBody } from "./parseMessageBody"

type Stage = "post" | "splash" | "logon" | "desktop"
type Ev = { type: "BOOTED" } | { type: "SPLASH_DONE"; logon: boolean } | { type: "LOGGED_ON" }

const m = defineMachine<Stage, Ev>({
  post: { BOOTED: "splash" },
  splash: { SPLASH_DONE: (e) => (e.logon ? "logon" : "desktop") },
  logon: { LOGGED_ON: "desktop" },
  desktop: {},
})

describe("defineMachine", () => {
  it("follows the table, including computed targets", () => {
    expect(m.transition("post", { type: "BOOTED" })).toBe("splash")
    expect(m.transition("splash", { type: "SPLASH_DONE", logon: true })).toBe("logon")
    expect(m.transition("splash", { type: "SPLASH_DONE", logon: false })).toBe("desktop")
  })

  it("ignores events a state does not accept (double-fires are harmless)", () => {
    expect(m.transition("desktop", { type: "BOOTED" })).toBe("desktop")
    expect(m.transition("post", { type: "LOGGED_ON" })).toBe("post")
    expect(m.can("logon", "LOGGED_ON")).toBe(true)
    expect(m.can("post", "LOGGED_ON")).toBe(false)
  })
})

describe("parseMessageBody URL gate", () => {
  it("never turns a non-http(s) markdown image into a link or image", () => {
    for (const body of ["![x](javascript:alert(1)", "![x](data:text/html,hi)", "https://a.example ![x](javascript:void0)"]) {
      for (const token of parseMessageBody(body)) {
        if (token.type === "url" || token.type === "image") expect(token.url).toMatch(/^https?:\/\//)
      }
    }
  })
})
