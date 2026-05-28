import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { ZodError } from 'zod'
import { err, ok, type Result } from '@shared/ipc/envelope'
import type { ContractMap, HandlerContext, HandlersOf } from '@shared/ipc/types'
import { logger } from '@main/logger'

type SubscriptionRegistry = Map<
  string,
  {
    contract: string
    webContents: WebContents
    unsubscribe?: () => void
  }
>

const subscriptions: SubscriptionRegistry = new Map()
let nextSubId = 1

export function registerContracts<C extends ContractMap>(
  contracts: C,
  handlers: HandlersOf<C>
): void {
  for (const groupName of Object.keys(contracts)) {
    const group = contracts[groupName]!
    const groupHandlers = handlers[groupName] as
      | Record<string, (input: unknown, ctx: HandlerContext) => Promise<unknown>>
      | undefined

    for (const opName of Object.keys(group)) {
      const def = group[opName]!
      if (def.kind === 'request') {
        const handler = groupHandlers?.[opName]
        if (!handler) {
          throw new Error(`Missing handler for ${def.channel}`)
        }
        registerRequest(def.channel, def.input, handler)
      } else if (def.kind === 'subscription') {
        registerSubscriptionMeta(def.channel)
      }
    }
  }
}

function registerRequest(
  channel: string,
  inputSchema: {
    safeParse: (raw: unknown) => { success: boolean; data?: unknown; error?: ZodError }
  },
  handler: (input: unknown, ctx: HandlerContext) => Promise<unknown>
): void {
  ipcMain.handle(
    channel,
    async (event: IpcMainInvokeEvent, raw: unknown): Promise<Result<unknown>> => {
      const parsed = inputSchema.safeParse(raw)
      if (!parsed.success) {
        return err('BAD_INPUT', parsed.error?.message ?? 'invalid input', parsed.error?.issues)
      }
      try {
        const ctx: HandlerContext = { sender: { id: event.sender.id } }
        const data = await handler(parsed.data, ctx)
        return ok(data)
      } catch (e) {
        const code =
          e instanceof Error && 'code' in e && typeof e.code === 'string' ? e.code : 'INTERNAL'
        const message = e instanceof Error ? e.message : String(e)
        logger.error({ channel, err: e }, 'ipc handler threw')
        return err(code, message)
      }
    }
  )
}

function registerSubscriptionMeta(channel: string): void {
  ipcMain.handle(`${channel}:subscribe`, (event) => {
    const id = String(nextSubId++)
    subscriptions.set(id, { contract: channel, webContents: event.sender })
    event.sender.once('destroyed', () => closeSubscription(id))
    return ok({ subscriptionId: id })
  })

  ipcMain.handle(
    `${channel}:unsubscribe`,
    (_event, { subscriptionId }: { subscriptionId: string }) => {
      closeSubscription(subscriptionId)
      return ok(true)
    }
  )
}

function closeSubscription(id: string): void {
  const sub = subscriptions.get(id)
  if (!sub) return
  sub.unsubscribe?.()
  subscriptions.delete(id)
}

export function publish(channel: string, payload: unknown): void {
  for (const [id, sub] of subscriptions) {
    if (sub.contract !== channel) continue
    if (sub.webContents.isDestroyed()) {
      subscriptions.delete(id)
      continue
    }
    sub.webContents.send(`${channel}:${id}`, payload)
  }
}
