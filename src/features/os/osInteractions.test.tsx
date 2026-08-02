import { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ProgramBoundary } from "./Desktop"
import { MediaPlayerApp, TaskManagerApp } from "./apps"
import { useOS, useOSMedia, useOSSettings } from "./osStore"
import { MenuRow } from "./Taskbar"
import { useOSLinks } from "./useOSLinks"

const useMusicMock = vi.hoisted(() => vi.fn())
vi.mock("@/components/ui/music/MusicContext", () => ({ useMusic: useMusicMock }))

function LinkHarness({ openSlug }: { openSlug: (slug: string) => void }) {
  useOSLinks(openSlug)
  return (
    <nav>
      <a href="/">Home</a>
      <a href="/notes/hello">Hello</a>
    </nav>
  )
}

function BrokenProgram(): never {
  throw new Error("test program failure")
}

function SubmenuHarness() {
  const [open, setOpen] = useState(false)
  return (
    <MenuRow
      label="Programs"
      icon="app"
      submenu
      onEnter={() => setOpen(true)}
      flyout={open ? <span>Program list</span> : null}
    />
  )
}

describe("OS interactions", () => {
  beforeEach(() => {
    useOS.setState(useOS.getInitialState(), true)
    useOSMedia.setState(useOSMedia.getInitialState(), true)
    useOSSettings.setState({ soundEnabled: false })
    useMusicMock.mockReturnValue({
      tracks: [
        { slug: "alpha", title: "Alpha", artist: "One", audio: "", cover: "", duration: 65 },
        { slug: "beta", title: "Beta", artist: "Two", audio: "", cover: "", duration: 130 },
      ],
      currentTrackIndex: 0,
      currentTrack: { slug: "alpha", title: "Alpha", artist: "One", audio: "", cover: "", duration: 65 },
      isPlaying: true,
      currentTime: 12,
      duration: 65,
      volume: .5,
      playTrack: vi.fn(),
      togglePlay: vi.fn(),
      stop: vi.fn(),
      nextTrack: vi.fn(),
      prevTrack: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      analyser: null,
      repeatMode: "all",
      setRepeatMode: vi.fn(),
      queue: ["alpha", "alpha"],
      setQueue: vi.fn(),
      queueIndex: 0,
      setQueueIndex: vi.fn(),
    })
  })

  it("keeps an application crash inside its window and lets the window close", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    useOS.getState().openWindow({ appId: "broken", title: "Broken Program", silent: true })
    const windowId = useOS.getState().windows[0].id

    render(
      <div>
        <span>Desktop still alive</span>
        <ProgramBoundary appId="broken" title="Broken Program" windowId={windowId}>
          <BrokenProgram />
        </ProgramBoundary>
      </div>,
    )

    expect(screen.getByText("Desktop still alive")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("test program failure")
    await userEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(useOS.getState().windows).toHaveLength(0)
  })

  it("intercepts both the machine root and nested same-origin links", async () => {
    const openSlug = vi.fn()
    render(<LinkHarness openSlug={openSlug} />)

    await userEvent.click(screen.getByRole("link", { name: "Home" }))
    await userEvent.click(screen.getByRole("link", { name: "Hello" }))

    expect(openSlug).toHaveBeenNthCalledWith(1, "index")
    expect(openSlug).toHaveBeenNthCalledWith(2, "notes/hello")
  })

  it("restores a minimized task when Task Manager switches to it", () => {
    useOS.getState().openWindow({ appId: "taskmgr", title: "Task Manager", silent: true })
    useOS.getState().openWindow({ appId: "browser", args: { slug: "hello" }, title: "Hello", silent: true })
    const target = useOS.getState().windows.find((win) => win.title === "Hello")!
    useOS.getState().toggleMinimize(target.id)

    render(<TaskManagerApp args={{}} windowId={useOS.getState().windows[0].id} />)
    fireEvent.doubleClick(screen.getByText("Hello").closest("tr")!)

    const restored = useOS.getState().windows.find((win) => win.id === target.id)!
    expect(restored.state).toBe("normal")
    expect(restored.z).toBe(useOS.getState().nextZ - 1)
  })

  it("deduplicates an existing local file while blank Notepads remain multi-instance", () => {
    const file = { appId: "notepad", args: { fileId: "file-1" }, title: "Notes — Notepad", silent: true }
    useOS.getState().openWindow(file)
    useOS.getState().openWindow(file)
    expect(useOS.getState().windows).toHaveLength(1)

    useOS.getState().openWindow({ appId: "notepad", title: "Untitled — Notepad", multiInstance: true, silent: true })
    useOS.getState().openWindow({ appId: "notepad", title: "Untitled — Notepad", multiInstance: true, silent: true })
    expect(useOS.getState().windows).toHaveLength(3)
  })

  it("opens Start submenus for keyboard focus as well as pointer hover", () => {
    render(<SubmenuHarness />)
    const programs = screen.getByRole("button", { name: "Programs" })

    fireEvent.focus(programs)

    expect(programs).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Program list")).toBeInTheDocument()
  })

  it("reorders duplicate queue entries and saves them intact as a mix", async () => {
    const music = useMusicMock()
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    render(<MediaPlayerApp />)

    await userEvent.click(screen.getByRole("tab", { name: "QUEUE 2" }))
    await userEvent.click(screen.getAllByRole("button", { name: "Move down" })[0])

    expect(music.setQueue).toHaveBeenCalledWith(["alpha", "alpha"])
    expect(music.setQueueIndex).toHaveBeenCalledWith(1)

    await userEvent.click(screen.getByRole("tab", { name: "MIXES 0" }))
    await userEvent.click(screen.getByRole("button", { name: "SAVE QUEUE" }))
    expect(useOSMedia.getState().savedPlaylists.Mixtape).toEqual(["alpha", "alpha"])
  })
})
