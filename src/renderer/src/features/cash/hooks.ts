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
    enabled: !!cashSessionId && !!sessionId
  })
}

export function useOpenCash(): ReturnType<
  typeof useMutation<CashSessionRowDTO, Error, { openingAmount: number; notes?: string | null }>
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.cash.open({
        sessionId,
        openingAmount: input.openingAmount,
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
  typeof useMutation<CashReportDTO, Error, { cashSessionId: string; declaredClosing: number }>
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.cash.close({
        sessionId,
        cashSessionId: input.cashSessionId,
        declaredClosing: input.declaredClosing
      })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash'] })
  })
}
