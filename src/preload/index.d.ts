import type { contracts } from '@shared/ipc/contracts'
import type { ApiOf } from '@shared/ipc/types'

declare global {
  interface Window {
    api: ApiOf<typeof contracts>
  }
}

export {}
