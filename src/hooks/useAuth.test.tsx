import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
}))

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      ...authMocks,
      setSession: vi.fn(),
      signInWithOtp: vi.fn(),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  },
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
})
