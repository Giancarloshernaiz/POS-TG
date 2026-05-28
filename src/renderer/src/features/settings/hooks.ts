import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import type { FxRateDTO } from '@shared/ipc/contracts/fx'
import type { StoreProfileDTO } from '@shared/ipc/contracts/settings'
import type { PrinterConfigDTO } from '@shared/ipc/contracts/print'

type IgtfCfg = { enabled: boolean; rateBp: number }

export function useIgtf(): ReturnType<typeof useQuery<IgtfCfg>> {
  return useQuery({
    queryKey: ['settings', 'igtf'],
    queryFn: async () => {
      const res = await api.settings.getIgtf({})
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    }
  })
}

export function useSetIgtf(): ReturnType<
  typeof useMutation<IgtfCfg, Error, { enabled: boolean; rateBp: number }>
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.settings.setIgtf({ sessionId, ...input })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'igtf'] })
  })
}

export function usePrinterConfig(): ReturnType<typeof useQuery<PrinterConfigDTO>> {
  return useQuery({
    queryKey: ['settings', 'printer'],
    queryFn: async () => {
      const res = await api.print.getConfig({})
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    }
  })
}

export function useSetPrinterConfig(): ReturnType<
  typeof useMutation<
    PrinterConfigDTO,
    Error,
    Omit<Parameters<typeof api.print.setConfig>[0], 'sessionId'>
  >
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.print.setConfig({ sessionId, ...input })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'printer'] })
  })
}

export function useTestPrinter(): ReturnType<typeof useMutation<{ ok: true }, Error, void>> {
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async () => {
      const res = await api.print.test({ sessionId })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    }
  })
}

export function useStoreProfile(): ReturnType<typeof useQuery<StoreProfileDTO | null>> {
  return useQuery({
    queryKey: ['settings', 'storeProfile'],
    queryFn: async () => {
      const res = await api.settings.getStoreProfile({})
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    }
  })
}

export function useSetStoreProfile(): ReturnType<
  typeof useMutation<StoreProfileDTO, Error, Parameters<typeof api.settings.setStoreProfile>[0]>
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.settings.setStoreProfile(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings', 'storeProfile'] })
    }
  })
}

export function useLowStockGlobal(): ReturnType<typeof useQuery<{ threshold: number }>> {
  return useQuery({
    queryKey: ['settings', 'lowStockGlobal'],
    queryFn: async () => {
      const res = await api.settings.getLowStockGlobal({})
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    }
  })
}

export function useSetLowStockGlobal(): ReturnType<
  typeof useMutation<{ threshold: number }, Error, { sessionId: string; threshold: number }>
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.settings.setLowStockGlobal(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings', 'lowStockGlobal'] })
      void qc.invalidateQueries({ queryKey: ['inventory'] })
    }
  })
}

export function useRefreshFx(): ReturnType<
  typeof useMutation<FxRateDTO, Error, { sessionId: string }>
> {
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.fx.refresh(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    }
  })
}

export function useSetManualFx(): ReturnType<
  typeof useMutation<FxRateDTO, Error, { sessionId: string; rate: number }>
> {
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.fx.setManual(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    }
  })
}
