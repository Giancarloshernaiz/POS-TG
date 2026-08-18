import { create } from 'zustand'
import type { CustomerDTO } from '@shared/ipc/contracts/customers'

export type CartLine = {
  key: string // unique per line (product or product+serial)
  productId: string
  sku: string
  name: string
  qty: number
  unitPrice: number // base price cents
  effectivePrice: number // after discount cents
  taxRateBp: number
  tracksSerial: boolean
  serialId?: string
  serialImei?: string
}

type CartState = {
  lines: CartLine[]
  customer: CustomerDTO | null
  walkIn: boolean // explicit "consumidor final" choice
  addLine: (line: Omit<CartLine, 'key'>) => void
  setQty: (key: string, qty: number) => void
  removeLine: (key: string) => void
  setCustomer: (c: CustomerDTO | null) => void
  setWalkIn: (v: boolean) => void
  restore: (input: { lines: CartLine[]; customer: CustomerDTO | null; walkIn: boolean }) => void
  clear: () => void
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  customer: null,
  walkIn: false,
  addLine: (line) =>
    set((state) => {
      // Serialized lines are always distinct; non-serial merge by product.
      if (!line.tracksSerial) {
        const existing = state.lines.find((l) => l.productId === line.productId && !l.tracksSerial)
        if (existing) {
          return {
            lines: state.lines.map((l) =>
              l.key === existing.key ? { ...l, qty: l.qty + line.qty } : l
            )
          }
        }
      }
      const key = line.tracksSerial ? `${line.productId}:${line.serialId}` : line.productId
      if (state.lines.some((l) => l.key === key)) return state
      return { lines: [...state.lines, { ...line, key }] }
    }),
  setQty: (key, qty) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.key === key ? { ...l, qty: Math.max(1, qty) } : l))
    })),
  removeLine: (key) => set((state) => ({ lines: state.lines.filter((l) => l.key !== key) })),
  setCustomer: (customer) => set({ customer, walkIn: false }),
  setWalkIn: (walkIn) => set({ walkIn, customer: null }),
  restore: ({ lines, customer, walkIn }) =>
    set({ lines: lines.map((line) => ({ ...line })), customer, walkIn }),
  clear: () => set({ lines: [], customer: null, walkIn: false })
}))
