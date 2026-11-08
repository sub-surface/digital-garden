import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
}))

const client = vi.hoisted(() => ({
  auth: {
    setSession: vi.fn(),
    signInWithOtp: vi.fn(),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
  },
}))
const lazy = vi.hoisted(() => ({ hint: true, loads: 0 }))

vi.mock("@/lib/supabase", () => ({
  authConfigured: true,
  authHint: () => lazy.hint,
  loadSupabase: vi.fn(async () => {
    lazy.loads++
    return { auth: { ...client.auth, ...authMocks } }
  }),
  whenSupabase: () => () => {},
}))

import { AuthProvider, useAuth } from "./useAuth"

function AuthProbe() {
  const auth = useAuth()
  return <span>{auth.loading ? "loading" : "ready"}</span>
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_DEV_AUTH_EMAIL", "")
    vi.stubEnv("VITE_DEV_AUTH_PASSWORD", "")
  })

  afterEach(() => vi.unstubAllEnvs())

  it("shares one session subscription and bootstrap across all consumers", async () => {
    const view = render(
      <AuthProvider>
        <AuthProbe />
        <AuthProbe />
      </AuthProvider>,
    )

    expect(await screen.findAllByText("ready")).toHaveLength(2)
    expect(authMocks.onAuthStateChange).toHaveBeenCalledTimes(1)
    expect(authMocks.getSession).toHaveBeenCalledTimes(1)

    const subscription = authMocks.onAuthStateChange.mock.results[0].value.data.subscription
    view.unmount()
    await waitFor(() => expect(subscription.unsubscribe).toHaveBeenCalledTimes(1))
  })

  it("doesn't download auth for an anonymous garden reader", async () => {
    lazy.hint = false
    lazy.loads = 0
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )
    expect(await screen.findByText("ready")).toBeTruthy()
    expect(lazy.loads).toBe(0)
    lazy.hint = true
  })
})
