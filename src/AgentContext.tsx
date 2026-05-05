import { createContext, useContext } from 'react'
import type { UseAgentStreamResult } from './hooks/useAgentStream'

export const AgentContext = createContext<UseAgentStreamResult | null>(null)

export function useAgent(): UseAgentStreamResult {
  const ctx = useContext(AgentContext)
  if (!ctx) throw new Error('useAgent must be used within AgentContext.Provider')
  return ctx
}
