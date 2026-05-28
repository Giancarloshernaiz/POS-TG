import { create } from 'zustand'
import type { FxRateDTO } from '@shared/ipc/contracts/fx'

type FxState = {
  rate: FxRateDTO | null
  setRate: (r: FxRateDTO | null) => void
}

export const useFx = create<FxState>((set) => ({
  rate: null,
  setRate: (rate) => set({ rate })
}))
