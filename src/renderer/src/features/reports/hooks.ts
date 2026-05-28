import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import type { SaleDTO } from '@shared/ipc/contracts/sales'

export function useSales(
  cashSessionId?: string
): ReturnType<typeof useQuery<{ items: SaleDTO[]; total: number }>> {
  return useQuery({
    queryKey: ['sales', cashSessionId ?? 'all'],
    queryFn: async () => {
      const args: Parameters<typeof api.sales.list>[0] = { limit: 100, offset: 0 }
      if (cashSessionId) args.cashSessionId = cashSessionId
      const res = await api.sales.list(args)
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    }
  })
}

export function useVoidSale(): ReturnType<
  typeof useMutation<SaleDTO, Error, { id: string; reason: string }>
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.sales.void({ sessionId, id: input.id, reason: input.reason })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sales'] })
      void qc.invalidateQueries({ queryKey: ['inventory'] })
      void qc.invalidateQueries({ queryKey: ['cash'] })
      void qc.invalidateQueries({ queryKey: ['customers'] })
    }
  })
}

export async function reprint(sessionId: string, saleId: string): Promise<void> {
  const res = await api.print.ticket({ sessionId, saleId })
  if (!res.ok) throw new Error(res.error.code)
}
