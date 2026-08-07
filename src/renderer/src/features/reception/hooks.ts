import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import type { DispatchDTO, ScanReceptionDTO } from '@shared/ipc/contracts/reception'

/** Despachos que el Centro de Acopio envió a esta tienda. */
export function useDispatches(): ReturnType<typeof useQuery<DispatchDTO[]>> {
  return useQuery({
    queryKey: ['reception', 'dispatches'],
    queryFn: async () => {
      const res = await api.reception.listDispatches({})
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    // La mercancía llega mientras la pantalla está abierta; refresco moderado.
    refetchInterval: 60_000
  })
}

export function useDispatch(
  agroDispatchId: number | null
): ReturnType<typeof useQuery<DispatchDTO>> {
  return useQuery({
    queryKey: ['reception', 'dispatch', agroDispatchId],
    enabled: agroDispatchId !== null,
    queryFn: async () => {
      const res = await api.reception.getDispatch({ agroDispatchId: agroDispatchId as number })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    }
  })
}

export function useScanReception(): ReturnType<
  typeof useMutation<ScanReceptionDTO, Error, { agroDispatchId: number; codigo: string; cantidad?: number }>
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async ({ agroDispatchId, codigo, cantidad }) => {
      const res = await api.reception.scan({
        sessionId,
        agroDispatchId,
        codigo,
        cantidad: cantidad ?? 1
      })
      // El máster manda el mensaje ya redactado ("X no viene en este
      // despacho"); se prefiere sobre el código seco cuando existe.
      if (!res.ok) throw new Error(res.error.message || res.error.code)
      return res.data
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['reception', 'dispatch', vars.agroDispatchId] })
      void qc.invalidateQueries({ queryKey: ['reception', 'dispatches'] })
      void qc.invalidateQueries({ queryKey: ['inventory'] })
      void qc.invalidateQueries({ queryKey: ['products'] })
    }
  })
}
