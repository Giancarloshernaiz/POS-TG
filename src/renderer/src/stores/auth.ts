import { create } from 'zustand'
import type { AuthSessionDTO } from '@shared/ipc/contracts/auth'

type AuthState = {
  session: AuthSessionDTO | null
  setSession: (s: AuthSessionDTO | null) => void
  hasPermission: (perm: string) => boolean
  clear: () => void
}

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  setSession: (session) => set({ session }),
  hasPermission: (perm) => get().session?.permissions.includes(perm) ?? false,
  clear: () => set({ session: null })
}))
