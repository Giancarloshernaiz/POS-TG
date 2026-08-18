import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import type { AuthorizationDTO, ApproverDTO } from '@shared/ipc/contracts/approvals'
import type { SaleDTO } from '@shared/ipc/contracts/sales'

/** Mensajes de los errores que devuelve el flujo de aprobación. */
export const APPROVAL_ERRORS: Record<string, string> = {
  NOT_PROVISIONED: 'Esta caja no está vinculada a Galas Cloud. Configúrala en Ajustes.',
  NO_APPROVERS: 'Elegí a quién le pedís la autorización',
  SALE_NOT_SYNCED:
    'Esta venta todavía no llegó a Galas Cloud. Sincroniza desde Ajustes y volvé a intentar.',
  SALE_NOT_FOUND: 'La venta no existe',
  AGRO_UNREACHABLE: 'Galas Cloud no responde. Revisa la conexión.',
  FORBIDDEN: 'Sin permiso',
  RETURN_ALREADY_REQUESTED: 'Esta venta ya tiene una devolución pendiente de aprobación.',
  RETURN_ALREADY_COMPLETED: 'Esta venta ya fue devuelta.'
}

export function approvalMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return APPROVAL_ERRORS[raw] ?? raw
}

/** Usuarios del máster que pueden autorizar. Se consultan al momento de pedir. */
export function useApprovers(): ReturnType<typeof useQuery<ApproverDTO[]>> {
  return useQuery({
    queryKey: ['approvals', 'approvers'],
    queryFn: async () => {
      const res = await api.approvals.listApprovers({})
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    staleTime: 60_000
  })
}

export function useRequestReprint(): ReturnType<
  typeof useMutation<AuthorizationDTO, Error, { saleId: string; approverIds: number[] }>
> {
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async ({ saleId, approverIds }) => {
      const res = await api.approvals.requestReprint({ sessionId, saleId, approverIds })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    }
  })
}

export function useRequestReturn(): ReturnType<
  typeof useMutation<
    AuthorizationDTO,
    Error,
    { saleId: string; approverIds: number[]; items: Array<{ productId: string; qty: number }> }
  >
> {
  const sessionId = useAuth((s) => s.session?.id ?? '')
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ saleId, approverIds, items }) => {
      const res = await api.approvals.requestReturn({ sessionId, saleId, approverIds, items })
      // INVALID_ITEMS trae un mensaje concreto ("se vendieron 2"): se prefiere.
      if (!res.ok) throw new Error(res.error.message || res.error.code)
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sales'] })
    }
  })
}

/**
 * Sondea el estado de una solicitud mientras siga PENDING. El administrador
 * aprueba desde Galas Cloud, así que la caja no tiene forma de enterarse sola.
 */
export function useApprovalStatus(
  requestId: number | null
): ReturnType<typeof useQuery<AuthorizationDTO>> {
  return useQuery({
    queryKey: ['approvals', requestId],
    enabled: requestId !== null,
    queryFn: async () => {
      const res = await api.approvals.getStatus({ requestId: requestId as number })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? 3000 : false)
  })
}

export function useSale(saleId: string | null): ReturnType<typeof useQuery<SaleDTO>> {
  return useQuery({
    queryKey: ['sale', saleId],
    enabled: saleId !== null,
    queryFn: async () => {
      const res = await api.sales.get({ id: saleId as string })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    }
  })
}

