import { useEffect } from 'react'
import { api } from '@renderer/lib/api'
import { useFx } from '@renderer/stores/fx'

/**
 * Loads the cached FX rate once and subscribes to live updates from main.
 * Call once near the app root (after auth).
 */
export function useFxInit(): void {
  const setRate = useFx((s) => s.setRate)

  useEffect(() => {
    let unsub: (() => void) | undefined

    void api.fx.getRate({}).then((res) => {
      if (res.ok) setRate(res.data)
    })

    void api.fx.updated
      .subscribe((rate) => setRate(rate))
      .then((fn) => {
        unsub = fn
      })

    return () => {
      unsub?.()
    }
  }, [setRate])
}
