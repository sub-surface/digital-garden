/**
 * Explicit finite state machines, without a library.
 *
 * The codebase kept growing *implicit* machines: a `stage` string plus mirror
 * refs plus window events, each transition a bare setState in some handler or
 * timer, and the legal moves written down nowhere. Two problems follow:
 * transitions that fire twice (a skip key racing a timer) and transitions from
 * a state they make no sense in (a stray "logon" event during the POST).
 *
 * A machine here is a plain table, state → event → next state. Anything not
 * in the table is ignored, so double-fires are harmless and impossible
 * transitions are visible (dev warning) instead of silently corrupting state.
 *
 *   const shell = defineMachine<Stage, ShellEvent>({
 *     post:   { BOOTED: "splash" },
 *     splash: { SPLASH_DONE: (e) => (e.logon ? "logon" : "desktop") },
 *     ...
 *   })
 *   const [stage, send] = useMachine(shell, "post")
 */

import { useCallback, useReducer } from "react"

type EventOf<E extends { type: string }, T extends E["type"]> = Extract<E, { type: T }>

export type MachineTable<S extends string, E extends { type: string }> = {
  [K in S]: { [T in E["type"]]?: S | ((event: EventOf<E, T>) => S) }
}

export interface Machine<S extends string, E extends { type: string }> {
  table: MachineTable<S, E>
  /** Next state, or the current one when `event` is not accepted here. */
  transition: (state: S, event: E) => S
  /** Whether `state` accepts `event` at all. */
  can: (state: S, event: E["type"]) => boolean
}

export function defineMachine<S extends string, E extends { type: string }>(
  table: MachineTable<S, E>,
  name = "machine",
): Machine<S, E> {
  const transition = (state: S, event: E): S => {
    const target = (table[state] as Record<string, S | ((e: E) => S) | undefined>)[event.type]
    if (target === undefined) {
      if (import.meta.env.DEV) console.debug(`[${name}] ignored ${event.type} in ${state}`)
      return state
    }
    return typeof target === "function" ? target(event) : target
  }
  const can = (state: S, type: E["type"]) =>
    (table[state] as Record<string, unknown>)[type] !== undefined
  return { table, transition, can }
}

/** useReducer over a machine. `send` is stable. */
export function useMachine<S extends string, E extends { type: string }>(
  machine: Machine<S, E>,
  initial: S | (() => S),
): [S, (event: E) => void] {
  const [state, dispatch] = useReducer(
    machine.transition,
    undefined,
    () => (typeof initial === "function" ? (initial as () => S)() : initial),
  )
  const send = useCallback((event: E) => dispatch(event), [])
  return [state, send]
}
