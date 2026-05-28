import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import type { SaleDTO } from '@shared/ipc/contracts/sales'
import type { ProductDTO } from '@shared/ipc/contracts/catalog'
import type { SerialDTO } from '@shared/ipc/contracts/inventory'

export async function findByCode(code: string): Promise<ProductDTO | null> {
  const res = await api.catalog.findByCode({ code })
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMP BYPASS — búsqueda manual de productos para testear sin lector de código.
// Permite al cajero buscar/elegir productos en lugar de escanear. ELIMINAR (o
// dejar tras un flag de "modo entrenamiento") antes de producción: el flujo real
// del POS es por escaneo. Ver docs/GUIA.md §"Bypass temporal".
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
  const res = await api.print.ticket({ sessionId, saleId })
  if (!res.ok) throw new Error(res.error.code)
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
    }
  })
}
