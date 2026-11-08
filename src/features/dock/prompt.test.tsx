import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useStore } from "@/store"
import { Terminal } from "@/features/terminal/Terminal"

const music = {
  tracks: [], currentTrackIndex: 0, isPlaying: false, volume: 1, currentTrack: null,
  playTrack: vi.fn(), togglePlay: vi.fn(), nextTrack: vi.fn(), prevTrack: vi.fn(), setVolume: vi.fn(),
}
vi.mock("@/components/ui/music/MusicContext", () => ({ useMusic: () => music, useMusicClock: () => music }))
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ session: null, username: null, role: null }) }))
vi.mock("@/hooks/usePhoneViewport", () => ({ usePhoneViewport: () => false }))
vi.mock("@/hooks/useContentSearch", () => ({ useContentSearch: () => ({ results: [] }) }))

function setup(onClose = vi.fn()) {
  render(<Terminal surface="dock" onClose={onClose} active />)
  return { input: screen.getByRole("combobox") as HTMLInputElement, onClose }
}

describe("the dock prompt", () => {
  beforeEach(() => {
    act(() => useStore.setState({ promptHistory: [], theme: "dark", dockRequest: null, bgMode: "murmuration" }))
  })

  it("suggests commands and Tab completes the highlighted one, then its arguments", () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: "acc" } })
    expect(screen.getByRole("option", { name: /accent/ })).toBeTruthy()
    fireEvent.keyDown(input, { key: "Tab" })
    expect(input.value).toBe("accent ")
    // The list re-forms around the arguments.
    expect(screen.getByRole("option", { name: /violet/ })).toBeTruthy()
  })

  it("runs a typed command as typed, and remembers it", () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: "theme light" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(useStore.getState().theme).toBe("light")
    expect(useStore.getState().promptHistory).toEqual(["theme light"])
    expect(input.value).toBe("")
  })

  it("Enter on an argument row runs it", () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: "bg lor" } })
    fireEvent.keyDown(input, { key: "ArrowDown" })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(useStore.getState().bgMode).toBe("lorenz")
  })

  it("Esc clears the input first, then closes", () => {
    const { input, onClose } = setup()
    fireEvent.change(input, { target: { value: "hel" } })
    fireEvent.keyDown(input, { key: "Escape" })
    expect(input.value).toBe("")
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: "Escape" })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("takes a request posted before it mounted (the first ? opens the lazy dock)", () => {
    act(() => useStore.getState().openDock("prompt", { run: "keys" }))
    setup()
    expect(screen.getByText(/Prompt: search or run a command/)).toBeTruthy()
    expect(useStore.getState().dockRequest).toBeNull()
  })

  it("acts on requests from the rest of the site (? runs keys)", () => {
    setup()
    act(() => useStore.getState().openDock("prompt", { run: "keys" }))
    expect(screen.getByText(/Prompt: search or run a command/)).toBeTruthy()
  })
})
