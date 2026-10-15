import { render, screen, fireEvent, act } from "@testing-library/react"
import { describe, expect, it, beforeEach } from "vitest"
import { useStore, stepReader, READER_MEASURE_STEPS, READER_SCALE_STEPS } from "@/store"
import { ReaderToggle } from "./ReaderToggle"

describe("stepReader", () => {
  it("moves one step and clamps at both ends", () => {
    expect(stepReader(READER_MEASURE_STEPS, 80, 1)).toBe(90)
    expect(stepReader(READER_MEASURE_STEPS, 80, -1)).toBe(70)
    expect(stepReader(READER_MEASURE_STEPS, 120, 1)).toBe(120)
    expect(stepReader(READER_MEASURE_STEPS, 50, -1)).toBe(50)
  })

  it("never moves backwards from a value persisted off the list", () => {
    // 75ch isn't a step: + goes to 80, − goes to 70.
    expect(stepReader(READER_MEASURE_STEPS, 75, 1)).toBe(80)
    expect(stepReader(READER_MEASURE_STEPS, 75, -1)).toBe(70)
    expect(stepReader(READER_SCALE_STEPS, 1.15, 1)).toBe(1.2)
    expect(stepReader(READER_SCALE_STEPS, 1.15, -1)).toBe(1.1)
  })
})

describe("ReaderToggle", () => {
  beforeEach(() => {
    act(() => useStore.setState({ isReaderMode: false, readerScale: 1, readerMeasureCh: 80 }))
  })

  it("shows steppers and exit only while reading", () => {
    render(<ReaderToggle />)
    expect(screen.queryByLabelText("Larger text")).toBeNull()

    act(() => useStore.setState({ isReaderMode: true }))
    fireEvent.click(screen.getByLabelText("Larger text"))
    expect(useStore.getState().readerScale).toBe(1.05)
    fireEvent.click(screen.getByLabelText("Wider column"))
    expect(useStore.getState().readerMeasureCh).toBe(90)

    fireEvent.click(screen.getByLabelText("Exit reader mode"))
    expect(useStore.getState().isReaderMode).toBe(false)
  })

  it("disables a stepper at the end of its range", () => {
    act(() => useStore.setState({ isReaderMode: true, readerScale: READER_SCALE_STEPS[READER_SCALE_STEPS.length - 1] }))
    render(<ReaderToggle />)
    expect((screen.getByLabelText("Larger text") as HTMLButtonElement).disabled).toBe(true)
  })
})
