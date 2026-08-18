import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import type { SaleDTO, SaleDraftDTO, SellerDTO } from '@shared/ipc/contracts/sales'
import type { ProductDTO } from '@shared/ipc/contracts/catalog'
import type { SerialDTO } from '@shared/ipc/contracts/inventory'

function requireDraftApi<K extends 'listDrafts' | 'saveDraft' | 'deleteDraft'>(
  method: K
): NonNullable<(typeof api.sales)[K]> {
  const fn = api.sales[method]
  if (typeof fn !== 'function') {
    throw new Error(
      'El POS fue actualizado mientras estaba abierto. Ciérralo completamente y vuelve a iniciarlo.'
    )
  }
  return fn
}

export async function findByCode(code: string): Promise<ProductDTO | null> {
  const res = await api.catalog.findByCode({ code })
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda manual de respaldo para operar cuando el lector no esté disponible.
// Comparte el mismo catálogo local que el escáner y no requiere autorización.
// ─────────────────────────────────────────────────────────────────────────────
export async function searchProducts(term: string): Promise<ProductDTO[]> {
  const res = await api.catalog.listProducts({
    search: term || undefined,
    activeOnly: true,
    limit: 30,
    offset: 0
  })
  if (!res.ok) throw new Error(res.error.message)
  return res.data.items
}

export async function printTicket(sessionId: string, saleId: string): Promise<void> {
  const res = await api.print.ticket({ sessionId, saleId, esCopia: false })
  if (!res.ok) {
    const err = new Error(res.error.message || res.error.code) as Error & { code?: string }
    err.code = res.error.code
    throw err
  }
}

export async function listAvailableSerials(productId: string): Promise<SerialDTO[]> {
  const res = await api.inventory.listSerials({
    productId,
    status: 'available',
    limit: 200,
    offset: 0
  })
  if (!res.ok) throw new Error(res.error.message)
  return res.data.items
}

type CreateSaleInput = Omit<Parameters<typeof api.sales.create>[0], 'sessionId'>

export function useCreateSale(): ReturnType<
  typeof useMutation<{ sale: SaleDTO; changeUsd: number }, Error, CreateSaleInput>
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.sales.create({ sessionId, ...input })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inventory'] })
      void qc.invalidateQueries({ queryKey: ['products'] })
      void qc.invalidateQueries({ queryKey: ['serials'] })
      void qc.invalidateQueries({ queryKey: ['cash'] })
      void qc.invalidateQueries({ queryKey: ['customers'] })
      void qc.invalidateQueries({ queryKey: ['sales'] })
      void qc.invalidateQueries({ queryKey: ['sale-drafts'] })
    }
  })
}

export function useSaleDrafts(): ReturnType<typeof useQuery<SaleDraftDTO[]>> {
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useQuery({
    queryKey: ['sale-drafts'],
    queryFn: async () => {
      const res = await requireDraftApi('listDrafts')({ sessionId })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    enabled: !!sessionId
  })
}

type SaveDraftInput = Omit<Parameters<typeof api.sales.saveDraft>[0], 'sessionId'>

export function useSaveSaleDraft(): ReturnType<
  typeof useMutation<SaleDraftDTO, Error, SaveDraftInput>
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (input) => {
      const res = await requireDraftApi('saveDraft')({ sessionId, ...input })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sale-drafts'] })
  })
}

export function useDeleteSaleDraft(): ReturnType<
  typeof useMutation<{ deleted: boolean }, Error, string>
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (id) => {
      const res = await requireDraftApi('deleteDraft')({ sessionId, id })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sale-drafts'] })
  })
}

/** Vendedores activos de la tienda, para atribuir la venta a un comisionista. */
export function useSellers(): ReturnType<typeof useQuery<SellerDTO[]>> {
  return useQuery({
    queryKey: ['sellers'],
    queryFn: async () => {
      const res = await api.sales.listSellers({})
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    }
  })
}

export function useDiscountUsd(): ReturnType<typeof useQuery<{ rateBp: number }>> {
  return useQuery({
    queryKey: ['discount-usd'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await api.settings.getDiscountUsd({})
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    }
  })
}
