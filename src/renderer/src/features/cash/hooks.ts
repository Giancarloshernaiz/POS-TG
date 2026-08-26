import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import type { CashReportDTO, CashSessionRowDTO } from '@shared/ipc/contracts/cash'

export function useActiveSession(): ReturnType<typeof useQuery<CashSessionRowDTO | null>> {
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useQuery({
    queryKey: ['cash', 'active', sessionId],
    queryFn: async () => {
      const res = await api.cash.getActiveSession({ sessionId })
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    enabled: !!sessionId
  })
}

export function useCashReport(
  cashSessionId: string | null
): ReturnType<typeof useQuery<CashReportDTO>> {
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useQuery({
    queryKey: ['cash', 'report', cashSessionId],
    queryFn: async () => {
      if (!cashSessionId) throw new Error('no session')
      const res = await api.cash.report({ sessionId, cashSessionId })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    enabled: !!cashSessionId && !!sessionId,
    refetchInterval: 15_000
  })
}

export function useCashHistory(filters: {
  search?: string | undefined
  from?: number | undefined
  to?: number | undefined
}): ReturnType<typeof useQuery<{ items: CashReportDTO[]; total: number }>> {
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useQuery({
    queryKey: ['cash', 'history', filters.search ?? '', filters.from ?? 0, filters.to ?? 0],
    queryFn: async () => {
      const input: Parameters<typeof api.cash.history>[0] = {
        sessionId,
        limit: 200,
        offset: 0
      }
      if (filters.search) input.search = filters.search
      if (filters.from !== undefined) input.from = filters.from
      if (filters.to !== undefined) input.to = filters.to
      const res = await api.cash.history(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    enabled: !!sessionId
  })
}

export async function printCashReport(sessionId: string, cashSessionId: string): Promise<void> {
  const res = await api.print.cashReport({ sessionId, cashSessionId })
  if (!res.ok) {
    const error = new Error(res.error.message || res.error.code) as Error & { code?: string }
    error.code = res.error.code
    throw error
  }
}

export function useOpenCash(): ReturnType<
  typeof useMutation<
    CashSessionRowDTO,
    Error,
    { openingAmount: number; openingVes: number; notes?: string | null }
  >
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.cash.open({
        sessionId,
        openingAmount: input.openingAmount,
        openingVes: input.openingVes,
        notes: input.notes ?? null
      })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash'] })
  })
}

export function useAddMovement(): ReturnType<
  typeof useMutation<
    { ok: true },
    Error,
    {
      cashSessionId: string
      type: 'withdrawal' | 'deposit' | 'adjustment' | 'drop'
      amount: number
      amountOriginal: number
      currency: 'USD' | 'VES'
      reference?: string | null
      notes?: string | null
    }
  >
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.cash.addMovement({
        sessionId,
        cashSessionId: input.cashSessionId,
        type: input.type,
        amount: input.amount,
        amountOriginal: input.amountOriginal,
        currency: input.currency,
        reference: input.reference ?? null,
        notes: input.notes ?? null
      })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash'] })
  })
}

export function useCloseCash(): ReturnType<
  typeof useMutation<
    CashReportDTO,
    Error,
    {
      cashSessionId: string
      declaredClosing: number
      declaredClosingVes: number
      authorization?: { username: string; password: string } | null
    }
  >
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.cash.close({
        sessionId,
        cashSessionId: input.cashSessionId,
        declaredClosing: input.declaredClosing,
        declaredClosingVes: input.declaredClosingVes,
        authorization: input.authorization ?? null
      })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash'] })
  })
}
