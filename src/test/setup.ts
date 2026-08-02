import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// Node can expose an incomplete experimental Storage object when launched with
// --localstorage-file. Use a deterministic browser-compatible store in tests.
function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, String(value)) },
  }
}

for (const key of ["localStorage", "sessionStorage"] as const) {
  const value = memoryStorage()
  Object.defineProperty(globalThis, key, { configurable: true, value })
  Object.defineProperty(window, key, { configurable: true, value })
}

afterEach(() => cleanup())
