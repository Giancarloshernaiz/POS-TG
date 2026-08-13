import { z } from 'zod'

const printerConfig = z.object({
  type: z.enum(['epson', 'star']),
  interface: z.string(),
  widthChars: z.number().int(),
  enabled: z.boolean()
})

export const printContract = {
  getConfig: {
    kind: 'request',
    channel: 'print.getConfig',
    input: z.object({}).optional(),
    output: printerConfig,
    errors: [] as const
  },
  setConfig: {
    kind: 'request',
    channel: 'print.setConfig',
    input: printerConfig.extend({ sessionId: z.string() }),
    output: printerConfig,
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN'] as const
  },
  test: {
    kind: 'request',
    channel: 'print.test',
    input: z.object({ sessionId: z.string() }),
    output: z.object({ ok: z.literal(true) }),
    errors: [
      'NOT_AUTHENTICATED',
      'PRINTER_NOT_CONFIGURED',
      'PRINTER_OFFLINE',
      'PRINT_FAILED'
    ] as const
  },
  ticket: {
    kind: 'request',
    channel: 'print.ticket',
    input: z.object({
      sessionId: z.string(),
      saleId: z.string(),
      /** Reimpresión: la factura sale marcada como COPIA, igual que en AgroOne. */
      esCopia: z.boolean().default(false)
    }),
    output: z.object({ ok: z.literal(true) }),
    errors: [
      'NOT_AUTHENTICATED',
      'NOT_FOUND',
      'PRINTER_NOT_CONFIGURED',
      'PRINTER_OFFLINE',
      'PRINT_FAILED'
    ] as const
  },
  cashReport: {
    kind: 'request',
    channel: 'print.cashReport',
    input: z.object({ sessionId: z.string(), cashSessionId: z.string() }),
    output: z.object({ ok: z.literal(true) }),
    errors: [
      'NOT_AUTHENTICATED',
      'FORBIDDEN',
      'NOT_FOUND',
      'PRINTER_NOT_CONFIGURED',
      'PRINTER_OFFLINE',
      'PRINT_FAILED'
    ] as const
  },
  openDrawer: {
    kind: 'request',
    channel: 'print.openDrawer',
    input: z.object({ sessionId: z.string() }),
    output: z.object({ ok: z.literal(true) }),
    errors: ['NOT_AUTHENTICATED', 'FORBIDDEN', 'PRINTER_NOT_CONFIGURED', 'PRINT_FAILED'] as const
  }
} as const

export type PrinterConfigDTO = z.infer<typeof printerConfig>
