import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import type { SupplierDTO } from '@shared/ipc/contracts/purchasing'

export function useSuppliers(activeOnly = false): ReturnType<typeof useQuery<SupplierDTO[]>> {
  return useQuery({
    queryKey: ['suppliers', activeOnly],
    queryFn: async () => {
      const res = await api.purchasing.listSuppliers({ activeOnly })
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    }
  })
}

export function useCreateSupplier(): ReturnType<
  typeof useMutation<SupplierDTO, Error, Parameters<typeof api.purchasing.createSupplier>[0]>
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.purchasing.createSupplier(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['suppliers'] })
    }
  })
}

export function useUpdateSupplier(): ReturnType<
  typeof useMutation<SupplierDTO, Error, Parameters<typeof api.purchasing.updateSupplier>[0]>
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.purchasing.updateSupplier(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['suppliers'] })
    }
  })
}
