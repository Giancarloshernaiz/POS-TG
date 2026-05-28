import type { z } from 'zod'
import type { Result } from './envelope'

export type RequestContract<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
  TErrors extends readonly string[] = readonly string[]
> = {
  kind: 'request'
  channel: string
  input: TInput
  output: TOutput
  errors: TErrors
}

export type SubscriptionContract<TPayload extends z.ZodTypeAny = z.ZodTypeAny> = {
  kind: 'subscription'
  channel: string
  output: TPayload
}

export type AnyContract = RequestContract | SubscriptionContract

export type ContractGroup = Record<string, AnyContract>

export type ContractMap = Record<string, ContractGroup>

export type InferRequestApi<C extends RequestContract> = (
  input: z.infer<C['input']>
) => Promise<Result<z.infer<C['output']>, C['errors'][number]>>

export type InferSubscriptionApi<C extends SubscriptionContract> = {
  subscribe: (handler: (payload: z.infer<C['output']>) => void) => Promise<() => void>
}

export type ApiOf<M extends ContractMap> = {
  [G in keyof M]: {
    [K in keyof M[G]]: M[G][K] extends RequestContract
      ? InferRequestApi<M[G][K]>
      : M[G][K] extends SubscriptionContract
        ? InferSubscriptionApi<M[G][K]>
        : never
  }
}

type RequestKeys<G extends ContractGroup> = {
  [K in keyof G]: G[K] extends RequestContract ? K : never
}[keyof G]

export type HandlersOf<M extends ContractMap> = {
  [G in keyof M]: {
    [K in RequestKeys<M[G]>]: M[G][K] extends RequestContract
      ? (
          input: z.infer<M[G][K]['input']>,
          ctx: HandlerContext
        ) => Promise<z.infer<M[G][K]['output']>>
      : never
  }
}

export type HandlerContext = {
  sender: { id: number }
  userId?: string
  sessionId?: string
}
