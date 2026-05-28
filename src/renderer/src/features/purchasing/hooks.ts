import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import type { PurchaseOrderDTO } from '@shared/ipc/contracts/purchasing'

export function usePurchaseOrders(input?: {
  status?: 'draft' | 'submitted' | 'partial' | 'received' | 'closed' | 'cancelled'
  supplierId?: string
}): ReturnType<typeof useQuery<{ items: PurchaseOrderDTO[]; total: number }>> {
  return useQuery({
    queryKey: ['pos', input],
    queryFn: async () => {
      const res = await api.purchasing.listPOs({
        status: input?.status,
        supplierId: input?.supplierId,
        limit: 100,
        offset: 0
      })
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    }
  })
}

export function usePurchaseOrder(id: string | null): ReturnType<typeof useQuery<PurchaseOrderDTO>> {
  return useQuery({
    queryKey: ['po', id],
    queryFn: async () => {
      if (!id) throw new Error('no id')
      const res = await api.purchasing.getPO({ id })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    enabled: !!id
  })
}

export function useCreatePO(): ReturnType<
  typeof useMutation<PurchaseOrderDTO, Error, Parameters<typeof api.purchasing.createPO>[0]>
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.purchasing.createPO(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pos'] })
    }
  })
}

export function useSubmitPO(): ReturnType<
  typeof useMutation<PurchaseOrderDTO, Error, { sessionId: string; id: string }>
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.purchasing.submitPO(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['pos'] })
      void qc.invalidateQueries({ queryKey: ['po', vars.id] })
    }
  })
}

export function useCancelPO(): ReturnType<
  typeof useMutation<PurchaseOrderDTO, Error, { sessionId: string; id: string }>
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.purchasing.cancelPO(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['pos'] })
      void qc.invalidateQueries({ queryKey: ['po', vars.id] })
    }
  })
}

export function useReceivePO(): ReturnType<
  typeof useMutation<
    { receiptId: string; receiptNumber: string; po: PurchaseOrderDTO },
    Error,
    Parameters<typeof api.purchasing.receivePO>[0]
  >
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.purchasing.receivePO(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['pos'] })
      void qc.invalidateQueries({ queryKey: ['po', vars.poId] })
      void qc.invalidateQueries({ queryKey: ['inventory'] })
      void qc.invalidateQueries({ queryKey: ['products'] })
      void qc.invalidateQueries({ queryKey: ['serials'] })
    }
  })
}
