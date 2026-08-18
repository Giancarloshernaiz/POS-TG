import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import type { CustomerDTO, ArMovementDTO } from '@shared/ipc/contracts/customers'

export function useCustomers(input?: {
  search?: string | undefined
  activeOnly?: boolean | undefined
  withDebtOnly?: boolean | undefined
}): ReturnType<typeof useQuery<CustomerDTO[]>> {
  return useQuery({
    queryKey: ['customers', input],
    queryFn: async () => {
      const args: Parameters<typeof api.customers.list>[0] = {
        activeOnly: input?.activeOnly ?? false,
        withDebtOnly: input?.withDebtOnly ?? false
      }
      if (input?.search) args.search = input.search
      const res = await api.customers.list(args)
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    }
  })
}

export function useCustomerLedger(
  customerId: string | null
): ReturnType<typeof useQuery<ArMovementDTO[]>> {
  return useQuery({
    queryKey: ['customers', 'ledger', customerId],
    queryFn: async () => {
      if (!customerId) return []
      const res = await api.customers.ledger({ customerId, limit: 100 })
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    enabled: !!customerId
  })
}

export function useCreateCustomer(): ReturnType<
  typeof useMutation<
    CustomerDTO,
    Error,
    Omit<Parameters<typeof api.customers.create>[0], 'sessionId'>
  >
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.customers.create({ sessionId, ...input })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] })
  })
}

export function useUpdateCustomer(): ReturnType<
  typeof useMutation<
    CustomerDTO,
    Error,
    Omit<Parameters<typeof api.customers.update>[0], 'sessionId'>
  >
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.customers.update({ sessionId, ...input })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] })
  })
}

export async function findCustomerByDoc(
  docType: 'V' | 'E' | 'J' | 'P' | 'G',
  docId: string
): Promise<CustomerDTO | null> {
  const res = await api.customers.findByDoc({ docType, docId })
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}

export async function searchCustomers(search: string): Promise<CustomerDTO[]> {
  const res = await api.customers.list({ search, activeOnly: true, withDebtOnly: false })
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}

export function useRegisterArPayment(): ReturnType<
  typeof useMutation<
    CustomerDTO,
    Error,
    { customerId: string; amount: number; notes?: string | null }
  >
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.customers.registerPayment({
        sessionId,
        customerId: input.customerId,
        amount: input.amount,
        notes: input.notes ?? null
      })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] })
  })
}
