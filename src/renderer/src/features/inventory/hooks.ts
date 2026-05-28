import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import type { SerialDTO, StockRowDTO } from '@shared/ipc/contracts/inventory'

export function useStock(input: {
  search?: string | undefined
  lowOnly?: boolean | undefined
  activeOnly?: boolean | undefined
}): ReturnType<typeof useQuery<StockRowDTO[]>> {
  return useQuery({
    queryKey: ['inventory', input],
    queryFn: async () => {
      const args: Parameters<typeof api.inventory.listStock>[0] = {
        lowOnly: input.lowOnly ?? false,
        activeOnly: input.activeOnly ?? true
      }
      if (input.search !== undefined) args.search = input.search
      const res = await api.inventory.listStock(args)
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    }
  })
}

export function useAdjustStock(): ReturnType<
  typeof useMutation<
    { newQuantity: number },
    Error,
    { sessionId: string; productId: string; delta: number; reason: string }
  >
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.inventory.adjustStock(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inventory'] })
      void qc.invalidateQueries({ queryKey: ['products'] })
    }
  })
}

export function useFindSerial(imei: string | null): ReturnType<typeof useQuery<SerialDTO | null>> {
  return useQuery({
    queryKey: ['serial', imei],
    queryFn: async () => {
      if (!imei) return null
      const res = await api.inventory.findSerial({ imei })
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    enabled: !!imei
  })
}

export function useSerials(input: {
  productId?: string | undefined
  status?: 'available' | 'reserved' | 'sold' | 'returned' | 'defective' | undefined
  search?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}): ReturnType<typeof useQuery<{ items: SerialDTO[]; total: number }>> {
  return useQuery({
    queryKey: ['serials', input],
    queryFn: async () => {
      const args: Parameters<typeof api.inventory.listSerials>[0] = {
        limit: input.limit ?? 100,
        offset: input.offset ?? 0
      }
      if (input.productId !== undefined) args.productId = input.productId
      if (input.status !== undefined) args.status = input.status
      if (input.search !== undefined) args.search = input.search
      const res = await api.inventory.listSerials(args)
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    }
  })
}
