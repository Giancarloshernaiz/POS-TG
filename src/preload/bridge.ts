import { contextBridge, ipcRenderer } from 'electron'
import { contracts } from '@shared/ipc/contracts'

type AnyResult = { ok: boolean; data?: unknown; error?: unknown }

function buildApi(): Record<string, Record<string, unknown>> {
  const api: Record<string, Record<string, unknown>> = {}

  for (const groupName of Object.keys(contracts)) {
    const group = (contracts as Record<string, Record<string, { kind: string; channel: string }>>)[
      groupName
    ]!
    api[groupName] = {}
    for (const opName of Object.keys(group)) {
      const def = group[opName]!
      if (def.kind === 'request') {
        api[groupName][opName] = (input: unknown): Promise<AnyResult> =>
          ipcRenderer.invoke(def.channel, input)
      } else if (def.kind === 'subscription') {
        api[groupName][opName] = {
          subscribe: async (handler: (payload: unknown) => void): Promise<() => void> => {
            const res = (await ipcRenderer.invoke(`${def.channel}:subscribe`)) as {
              ok: boolean
              data: { subscriptionId: string }
            }
            if (!res.ok) throw new Error('subscribe failed')
            const subId = res.data.subscriptionId
            const channel = `${def.channel}:${subId}`
            const listener = (_e: unknown, payload: unknown): void => handler(payload)
            ipcRenderer.on(channel, listener)
            return () => {
              ipcRenderer.removeListener(channel, listener)
              void ipcRenderer.invoke(`${def.channel}:unsubscribe`, { subscriptionId: subId })
            }
          }
        }
      }
    }
  }

  return api
}

export const api = buildApi()

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('contextBridge.exposeInMainWorld failed', error)
  }
} else {
  ;(window as unknown as { api: typeof api }).api = api
}
