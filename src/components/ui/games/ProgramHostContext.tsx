import { createContext, useContext } from "react"

interface ProgramHostValue {
  embedded: boolean
  close?: () => void
  open?: (slug: string) => void
}

const ProgramHostContext = createContext<ProgramHostValue>({ embedded: false })

export const ProgramHostProvider = ProgramHostContext.Provider
export function useProgramHost() {
  return useContext(ProgramHostContext)
}
