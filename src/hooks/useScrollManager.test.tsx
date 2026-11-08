import { render, act, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { useScrollManager } from "./useScrollManager"

// Mock @tanstack/react-router's useLocation
// Mirrors TanStack's real ParsedLocation: `search` is a parsed null-prototype
// object, `searchStr` its string form. The old mock used `search: ""`, which
// hid the "Cannot convert object to primitive value" freeze.
const parsedSearch = () => Object.create(null) as Record<string, unknown>
let mockLocation = {
  pathname: "/Wiki/Bibliography",
  search: parsedSearch(),
  searchStr: "",
  hash: "",
}

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => mockLocation,
}))

function TestComponent() {
  useScrollManager()
  return <div data-testid="probe">Mounted</div>
}

describe("useScrollManager", () => {
  let mainContent: HTMLElement

  beforeEach(() => {
    sessionStorage.clear()
    document.body.innerHTML = ""
    mainContent = document.createElement("main")
    mainContent.id = "main-content"
    document.body.appendChild(mainContent)

    mockLocation = {
      pathname: "/Wiki/Bibliography",
      search: parsedSearch(),
      searchStr: "",
      hash: "",
    }
  })

  afterEach(() => {
    document.body.innerHTML = ""
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it("survives a history entry with no router key (the OS boot freeze)", () => {
    // What the OS boot's seed write used to do: wipe TanStack's entry state.
    window.history.replaceState({}, "", "/?seed=ABC")
    mockLocation = { pathname: "/", search: parsedSearch(), searchStr: "?seed=ABC", hash: "" }
    expect(() => render(<TestComponent />)).not.toThrow()
  })

  it("scrolls immediately when target element is present in DOM", () => {
    const target = document.createElement("span")
    target.id = "Haack-Evidence-1993"
    const scrollIntoViewMock = vi.fn()
    target.scrollIntoView = scrollIntoViewMock
    mainContent.appendChild(target)

    mockLocation = {
      pathname: "/Wiki/Bibliography",
      search: parsedSearch(),
      searchStr: "",
      hash: "#Haack-Evidence-1993",
    }

    render(<TestComponent />)

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    })
  })

  it("observes DOM and scrolls when target element mounts asynchronously", async () => {
    mockLocation = {
      pathname: "/Wiki/Bibliography",
      search: parsedSearch(),
      searchStr: "",
      hash: "#Haack-Evidence-1993",
    }

    render(<TestComponent />)

    // Element doesn't exist yet (simulating async MDX note load)
    const target = document.createElement("span")
    target.id = "Haack-Evidence-1993"
    const scrollIntoViewMock = vi.fn()
    target.scrollIntoView = scrollIntoViewMock

    // Async note renders and inserts element
    act(() => {
      mainContent.appendChild(target)
    })

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      })
    })
  })

  it("saves scroll position on scroll and restores it on popstate (Back button)", async () => {
    window.history.replaceState({ __TSR_key: "page_a" }, "", "/Wiki/Concepts/Bad-Faith")
    mockLocation = {
      pathname: "/Wiki/Concepts/Bad-Faith",
      search: parsedSearch(),
      searchStr: "",
      hash: "",
    }

    let scrollPos = 0
    Object.defineProperty(mainContent, "scrollTop", {
      get: () => scrollPos,
      set: (v) => { scrollPos = v },
      configurable: true,
    })
    Object.defineProperty(mainContent, "scrollHeight", { value: 3000, configurable: true })
    Object.defineProperty(mainContent, "clientHeight", { value: 800, configurable: true })

    const { rerender } = render(<TestComponent />)

    // Simulate user scrolling down to 800px on page A
    scrollPos = 800
    act(() => {
      document.dispatchEvent(new Event("scroll"))
    })

    // Wait for throttled scroll saving
    await waitFor(() => {
      const stored = JSON.parse(sessionStorage.getItem("digital_garden_scroll_positions_v1") || "{}")
      expect(stored["page_a"]).toBe(800)
    })

    // Simulate navigating to Page B (PUSH)
    window.history.replaceState({ __TSR_key: "page_b" }, "", "/Wiki/Concepts/Other")
    mockLocation = {
      pathname: "/Wiki/Concepts/Other",
      search: parsedSearch(),
      searchStr: "",
      hash: "",
    }
    rerender(<TestComponent />)

    // On fresh navigation, scroll resets to 0
    expect(scrollPos).toBe(0)

    // Simulate clicking Back button (POP) back to page A
    window.history.replaceState({ __TSR_key: "page_a" }, "", "/Wiki/Concepts/Bad-Faith")
    mockLocation = {
      pathname: "/Wiki/Concepts/Bad-Faith",
      search: parsedSearch(),
      searchStr: "",
      hash: "",
    }
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { __TSR_key: "page_a" } }))
    })
    rerender(<TestComponent />)

    await waitFor(() => {
      expect(scrollPos).toBe(800)
    })
  })
})
