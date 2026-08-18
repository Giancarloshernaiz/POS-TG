import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import { useFx } from '@renderer/stores/fx'

/**
 * Subscribes to auto-pull events from the Galas Cloud scheduler. When the master
 * data refreshes, invalidate the affected caches and refresh the FX rate.
 * Call once near the app root (after auth).
 */
export function useAgroSyncInit(): void {
  const qc = useQueryClient()
  const setRate = useFx((s) => s.setRate)

  useEffect(() => {
    let unsub: (() => void) | undefined

    void api.sync.updated
      .subscribe((summary) => {
        void qc.invalidateQueries({ queryKey: ['products'] })
        void qc.invalidateQueries({ queryKey: ['inventory'] })
        void qc.invalidateQueries({ queryKey: ['customers'] })
        void qc.invalidateQueries({ queryKey: ['sync', 'status'] })
        if (summary?.rateUpdated) {
          void api.fx.getRate({}).then((res) => {
            if (res.ok) setRate(res.data)
          })
        }
      })
      .then((fn) => {
        unsub = fn
      })

    return () => {
      unsub?.()
    }
  }, [qc, setRate])
}
