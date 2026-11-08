import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { NoteHtml } from "./NoteHtml"

vi.mock("@/components/mdx/MDXProvider", () => ({
  mdxComponents: {
    Grid: ({ children }: { children?: React.ReactNode }) => <section data-testid="grid">{children}</section>,
    Card: ({ title, children }: { title: string; children?: React.ReactNode }) => (
      <article data-testid="card"><h3>{title}</h3>{children}</article>
    ),
    Leaf: ({ n }: { n: number }) => <i data-testid="leaf">{n * 2}</i>,
  },
}))

const props = (value: unknown) => JSON.stringify(value).replace(/"/g, "&quot;")

// Two levels of nesting with markdown children, like ConceptGrid > ConceptCard.
const HTML = `
  <p>Before</p>
  <div data-island="Grid" data-props="{}">
    <div data-island="Card" data-props="${props({ title: "One" })}"><p>first <strong>card</strong></p></div>
    <div data-island="Card" data-props="${props({ title: "Two" })}">
      <p>second</p><span data-island="Leaf" data-props="${props({ n: 21 })}"></span>
    </div>
  </div>
  <p>After</p>`

describe("NoteHtml", () => {
  it("hydrates nested islands once and settles (no React #185 loop)", async () => {
    const errors: unknown[] = []
    const spy = vi.spyOn(console, "error").mockImplementation((e) => { errors.push(e) })
    const { container } = render(<NoteHtml html={HTML} />)
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    spy.mockRestore()

    expect(errors.map(String).join("\n")).not.toMatch(/Maximum update depth|#185/)
    expect(screen.getAllByTestId("grid")).toHaveLength(1)
    expect(screen.getAllByTestId("card").map((c) => c.querySelector("h3")?.textContent)).toEqual(["One", "Two"])
    expect(screen.getByTestId("leaf").textContent).toBe("42") // numeric prop survived JSON
    expect(container.textContent).toContain("first card") // markdown children kept
    expect(container.textContent).toMatch(/Before[\s\S]*After/)
  })

  it("shows unregistered islands visibly instead of dropping them", async () => {
    render(<NoteHtml html={`<div data-island="Nope" data-props="{}"></div>`} />)
    await act(async () => {})
    expect(screen.getByRole("alert").textContent).toMatch(/Nope could not render: not registered/)
  })
})
