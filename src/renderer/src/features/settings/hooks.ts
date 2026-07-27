import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import type { FxRateDTO } from '@shared/ipc/contracts/fx'
import type { StoreProfileDTO } from '@shared/ipc/contracts/settings'
import type { PrinterConfigDTO } from '@shared/ipc/contracts/print'
import type { BackupEntryDTO } from '@shared/ipc/contracts/backup'
import type { DeviceIdentityDTO, StoreOptionDTO } from '@shared/ipc/contracts/device'
import type {
  PullSummaryDTO,
  PushStatusDTO,
  UplinkLeaderStatusDTO
} from '@shared/ipc/contracts/sync'
import type { P2pStatusDTO, SerialConflictDTO } from '@shared/ipc/contracts/p2p'

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

export function useBackups(): ReturnType<typeof useQuery<BackupEntryDTO[]>> {
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useQuery({
    queryKey: ['settings', 'backups'],
    enabled: sessionId !== '',
    queryFn: async () => {
      const res = await api.backup.list({ sessionId })
      if (!res.ok) throw new Error(res.error.code)
      return res.data.backups
    }
  })
}

export function useCreateBackup(): ReturnType<typeof useMutation<BackupEntryDTO, Error, void>> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async () => {
      const res = await api.backup.create({ sessionId })
      if (!res.ok) throw new Error(res.error.code)
      return res.data.backup
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'backups'] })
  })
}

export function useRestoreBackup(): ReturnType<
  typeof useMutation<{ restarting: boolean }, Error, { path: string }>
> {
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async ({ path }) => {
      const res = await api.backup.restore({ sessionId, path })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    }
  })
}

export function useDeviceIdentity(): ReturnType<typeof useQuery<DeviceIdentityDTO>> {
  return useQuery({
    queryKey: ['device', 'identity'],
    queryFn: async () => {
      const res = await api.device.getIdentity({})
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    }
  })
}

export function useListStores(): ReturnType<
  typeof useMutation<StoreOptionDTO[], Error, { agroBaseUrl: string }>
> {
  return useMutation({
    mutationFn: async ({ agroBaseUrl }) => {
      const res = await api.device.listStores({ agroBaseUrl })
      if (!res.ok) throw new Error(res.error.code)
      return res.data.stores
    }
  })
}

export function useProvisionDevice(): ReturnType<
  typeof useMutation<
    DeviceIdentityDTO,
    Error,
    Omit<Parameters<typeof api.device.provision>[0], 'sessionId'>
  >
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.device.provision({ sessionId, ...input })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['device', 'identity'] })
  })
}

export function useSetNodeLabel(): ReturnType<
  typeof useMutation<DeviceIdentityDTO, Error, { nodeLabel: string }>
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async ({ nodeLabel }) => {
      const res = await api.device.setLabel({ sessionId, nodeLabel })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['device', 'identity'] })
  })
}

export function useSyncStatus(): ReturnType<
  typeof useQuery<{
    lastPull: PullSummaryDTO | null
    push: PushStatusDTO
    uplinkLeader: UplinkLeaderStatusDTO
  }>
> {
  return useQuery({
    queryKey: ['sync', 'status'],
    queryFn: async () => {
      const res = await api.sync.getStatus({})
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    refetchInterval: 30_000
  })
}

export function useRetryPush(): ReturnType<typeof useMutation<{ retried: number }, Error, void>> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async () => {
      const res = await api.sync.retryPush({ sessionId })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sync', 'status'] })
  })
}

export function usePullFromAgro(): ReturnType<typeof useMutation<PullSummaryDTO, Error, void>> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async () => {
      const res = await api.sync.pullFromAgro({ sessionId })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sync', 'status'] })
      void qc.invalidateQueries({ queryKey: ['products'] })
      void qc.invalidateQueries({ queryKey: ['inventory'] })
      void qc.invalidateQueries({ queryKey: ['customers'] })
    }
  })
}

export function useP2pStatus(): ReturnType<typeof useQuery<P2pStatusDTO>> {
  const qc = useQueryClient()

  useEffect(() => {
    let unsub: (() => void) | undefined
    void api.p2p.peersChanged
      .subscribe((status) => qc.setQueryData(['p2p', 'status'], status))
      .then((fn) => {
        unsub = fn
      })
    return () => unsub?.()
  }, [qc])

  return useQuery({
    queryKey: ['p2p', 'status'],
    queryFn: async () => {
      const res = await api.p2p.getStatus({})
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    refetchInterval: 15_000
  })
}

export function useSerialConflicts(): ReturnType<typeof useQuery<SerialConflictDTO[]>> {
  return useQuery({
    queryKey: ['p2p', 'serialConflicts'],
    queryFn: async () => {
      const res = await api.p2p.listSerialConflicts({ includeResolved: false })
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    refetchInterval: 20_000
  })
}

export function useResolveSerialConflict(): ReturnType<
  typeof useMutation<SerialConflictDTO, Error, { conflictId: string; notes?: string | null }>
> {
  const qc = useQueryClient()
  const sessionId = useAuth((s) => s.session?.id ?? '')
  return useMutation({
    mutationFn: async ({ conflictId, notes }) => {
      const res = await api.p2p.resolveSerialConflict({ sessionId, conflictId, notes })
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['p2p', 'serialConflicts'] })
  })
}
