import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import type { SaleDTO } from '@shared/ipc/contracts/sales'

export type SalesFilters = {
  cashSessionId?: string | undefined
  search?: string | undefined
  from?: number | undefined
  to?: number | undefined
}

export function useSales(
  filters: SalesFilters = {}
): ReturnType<typeof useQuery<{ items: SaleDTO[]; total: number }>> {
  const { cashSessionId, search, from, to } = filters
  return useQuery({
    queryKey: ['sales', cashSessionId ?? 'all', search ?? '', from ?? 0, to ?? 0],
    queryFn: async () => {
      const args: Parameters<typeof api.sales.list>[0] = { limit: 200, offset: 0 }
      if (cashSessionId) args.cashSessionId = cashSessionId
      if (search) args.search = search
      if (from !== undefined) args.from = from
      if (to !== undefined) args.to = to
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
  // Toda reimpresión sale marcada como COPIA: el original ya se entregó.
  const res = await api.print.ticket({ sessionId, saleId, esCopia: true })
  if (!res.ok) throw new Error(res.error.code)
}
