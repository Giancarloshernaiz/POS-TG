import { useState, useRef, useEffect } from 'react'
import {
  Search,
  Trash2,
  Plus,
  X,
  ShoppingCart,
  Loader2,
  UserRound
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Card, CardContent } from '@renderer/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useCart, type CartLine } from '@renderer/stores/cart'
import { useFx } from '@renderer/stores/fx'
import { useActiveSession } from '@renderer/features/cash/hooks'
import { OpenCashForm } from '@renderer/features/cash/OpenCashForm'
import { useAuth } from '@renderer/stores/auth'
import { findByCode, useCreateSale, printTicket, useSellers } from './hooks'
import { CustomerCedulaSlot } from './CustomerCedulaSlot'
import { QuickProductCreate } from './QuickProductCreate'
import { formatMoney, formatVes } from '@renderer/lib/money'
import { PAYMENT_METHODS, type PaymentMethod } from '@renderer/lib/paymentMethods'
import { PAYMENT_CURRENCY } from '@shared/payment'
import { MoneyInput } from '@renderer/components/MoneyInput'
import type { ProductDTO } from '@shared/ipc/contracts/catalog'

// Radix Select no admite value="" en un item, así que el "sin vendedor"
// necesita un centinela.
const NO_SELLER = '__none__'

type PayEntry = { id: string; method: PaymentMethod; amountCents: number }

export function POSScreen(): React.JSX.Element {
  const { data: activeSession, isLoading } = useActiveSession()

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }
  if (!activeSession) {
    // No open cash session → let the cashier open it right here (no need to switch screens).
    return <OpenCashForm context="pos" />
  }
  return <POSContent />
}

function POSContent(): React.JSX.Element {
  const cart = useCart()
  const rate = useFx((s) => s.rate?.rate ?? null)
  const authSessionId = useAuth((s) => s.session?.id ?? '')
  const createSale = useCreateSale()
  // Comisionista de la venta. Opcional: no toda tienda trabaja con vendedores,
  // y el selector solo aparece si el máster mandó alguno para esta tienda.
  const { data: sellers } = useSellers()
  const [sellerId, setSellerId] = useState<string>('')
  const searchRef = useRef<HTMLInputElement>(null)

  const customerReady = cart.customer !== null || cart.walkIn

  // F8 = "Sin cliente / Consumidor final" shortcut (only meaningful pre-customer).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'F8' && !customerReady) {
        e.preventDefault()
        cart.setWalkIn(true)
        // Defer focus to next tick so the scanner input is mounted.
        setTimeout(() => searchRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [customerReady, cart])

  const [code, setCode] = useState('')
  const [unknownCode, setUnknownCode] = useState<string | null>(null) // quick-create on unknown scan
  const [pays, setPays] = useState<PayEntry[]>([])
  const [submitting, setSubmitting] = useState(false)
  const canCreateProduct = useAuth((s) => s.hasPermission('products.create'))

  // ---- Totals ----
  const subtotal = cart.lines.reduce((s, l) => s + l.effectivePrice * l.qty, 0)
  const total = subtotal
  const paid = pays.reduce((s, p) => s + p.amountCents, 0)
  const change = Math.max(0, paid - total)
  const remaining = Math.max(0, total - paid)

  function addProduct(product: ProductDTO): void {
    if (!product.active) {
      toast.error('Producto inactivo')
      return
    }
    // Todo se vende por unidades: el rastreo por serial/IMEI está desactivado.
    cart.addLine({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      qty: 1,
      unitPrice: product.basePrice,
      effectivePrice: product.effectivePrice,
      taxRateBp: product.taxRateBp,
      tracksSerial: false
    })
  }

  async function handleCode(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const c = code.trim()
    if (!c) return
    try {
      const product = await findByCode(c)
      if (!product) {
        if (canCreateProduct) {
          // Auto-open quick-create with the scanned code prefilled. After save it
          // gets added to the cart in onCreated.
          setUnknownCode(c)
        } else {
          toast.error('Producto no encontrado (sin permiso para crearlo)')
        }
        return
      }
      addProduct(product)
      setCode('')
      searchRef.current?.focus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  function addPayment(): void {
    setPays((current) => {
      const usedMethods = new Set(current.map((p) => p.method))
      const nextMethod =
        PAYMENT_METHODS.find((method) => !usedMethods.has(method.value))?.value ?? 'cash_ves'
      const paidByOthers = current.reduce((sum, payment) => sum + payment.amountCents, 0)
      return [
        ...current,
        {
          id: crypto.randomUUID(),
          method: nextMethod,
          amountCents: Math.max(0, total - paidByOthers)
        }
      ]
    })
  }

  function startMixedPayment(): void {
    const firstPart = Math.floor(total / 2)
    setPays([
      { id: crypto.randomUUID(), method: 'cash_ves', amountCents: firstPart },
      { id: crypto.randomUUID(), method: 'cash_usd', amountCents: total - firstPart }
    ])
  }

  function completePayment(id: string): void {
    setPays((current) => {
      const paidByOthers = current.reduce(
        (sum, payment) => sum + (payment.id === id ? 0 : payment.amountCents),
        0
      )
      return current.map((payment) =>
        payment.id === id
          ? { ...payment, amountCents: Math.max(0, total - paidByOthers) }
          : payment
      )
    })
  }

  async function checkout(): Promise<void> {
    if (cart.lines.length === 0) {
      toast.error('Carrito vacío')
      return
    }
    if (paid < total) {
      toast.error('El pago no cubre el total')
      return
    }
    if (pays.some((p) => PAYMENT_CURRENCY[p.method] === 'VES') && !rate) {
      toast.error('Se necesita una tasa de cambio para registrar pagos en bolívares')
      return
    }
    const hasCredit = pays.some((p) => p.method === 'credit')
    if (hasCredit && !cart.customer) {
      toast.error('Crédito requiere seleccionar cliente')
      return
    }
    setSubmitting(true)
    try {
      const res = await createSale.mutateAsync({
        customerId: cart.customer?.id ?? null,
        sellerId: sellerId || null,
        lines: cart.lines.map((l) => ({
          productId: l.productId,
          serialId: l.serialId ?? null,
          qty: l.qty
        })),
        payments: pays.map((p) => {
          const currency = PAYMENT_CURRENCY[p.method]
          return {
            method: p.method,
            amountUsd: p.amountCents,
            // AgroOne guarda el monto en la moneda indicada. Para VES se
            // conserva el equivalente real, no el valor numérico en USD.
            amountOriginal:
              currency === 'VES' && rate
                ? Math.round((p.amountCents / 100) * rate * 100) / 100
                : null,
            reference: null
          }
        }),
        notes: null
      })
      toast.success(
        `Venta ${res.sale.number} — total ${formatMoney(res.sale.total)}` +
          (res.changeUsd > 0 ? ` · vuelto ${formatMoney(res.changeUsd)}` : '')
      )
      // Print ticket (non-blocking: sale is already saved).
      void printTicket(authSessionId, res.sale.id).catch((err) => {
        const code = (err as { code?: string }).code
        const msg = err instanceof Error ? err.message : String(err)
        if (code === 'PRINTER_NOT_CONFIGURED') {
          toast.info('Venta guardada. Configura la impresora para imprimir tickets.')
        } else if (code === 'PRINTER_OFFLINE') {
          toast.warning(`Venta guardada. Impresora no responde: ${msg}`)
        } else {
          toast.warning(`Venta guardada, pero no se pudo imprimir. ${msg}`)
        }
      })
      cart.clear()
      setPays([])
      searchRef.current?.focus()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const human: Record<string, string> = {
        NO_CASH_SESSION: 'No hay caja abierta',
        INSUFFICIENT_STOCK: 'Stock insuficiente',
        SERIAL_NOT_AVAILABLE: 'Serial no disponible',
        PAYMENT_SHORT: 'El pago no cubre el total',
        CREDIT_NO_CUSTOMER: 'Crédito requiere cliente',
        CREDIT_LIMIT_EXCEEDED: 'Excede el límite de crédito del cliente',
        FORBIDDEN: 'Sin permiso para vender'
      }
      toast.error(human[msg] ?? msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid h-full grid-cols-[1fr_380px] gap-4">
      {/* Left: cart */}
      <div className="flex flex-col gap-3">
        <CustomerCedulaSlot
          customer={cart.customer}
          walkIn={cart.walkIn}
          onCustomer={(c) => cart.setCustomer(c)}
          onWalkIn={() => cart.setWalkIn(true)}
          onReady={() => setTimeout(() => searchRef.current?.focus(), 0)}
        />

        {(sellers ?? []).length > 0 && (
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select value={sellerId || NO_SELLER} onValueChange={(v) => setSellerId(v === NO_SELLER ? '' : v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Vendedor (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SELLER}>Sin vendedor</SelectItem>
                {(sellers ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {`${v.nombre} ${v.apellido}`.trim()}
                    {v.cedula ? ` · ${v.cedula}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <form
          onSubmit={handleCode}
          className={'flex gap-2 ' + (!customerReady ? 'pointer-events-none opacity-50' : '')}
        >
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={
                customerReady
                  ? 'Escanea código de barras o escribe SKU…'
                  : 'Primero identifica al cliente o toca "Sin cliente"'
              }
              className="pl-8"
              disabled={!customerReady}
            />
          </div>
          <Button type="submit" disabled={!customerReady}>
            <Plus className="h-4 w-4" />
            Agregar
          </Button>
        </form>

        <Card className="flex-1">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-28">Cant.</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.lines.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      <ShoppingCart className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      Carrito vacío. Escanea un producto.
                    </TableCell>
                  </TableRow>
                )}
                {cart.lines.map((l) => (
                  <CartRow key={l.key} line={l} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Right: checkout */}
      <div className="flex flex-col gap-3">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="space-y-1 text-sm">
              <TotalRow label="Subtotal" cents={subtotal} rate={rate} />
              <div className="flex items-center justify-between border-t pt-2 text-lg font-bold">
                <span>Total</span>
                <div className="text-right">
                  <div>{formatMoney(total)}</div>
                  {rate && (
                    <div className="text-xs font-normal text-muted-foreground">
                      {formatVes(total, rate)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Pagos</span>
                {pays.length > 1 && <Badge variant="secondary">Mixto</Badge>}
              </div>
              <div className="flex items-center gap-1">
                {pays.length <= 1 && (
                  <Button size="sm" variant="outline" onClick={startMixedPayment}>
                    Pago mixto
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={addPayment}>
                  <Plus className="h-3 w-3" />
                  Método
                </Button>
              </div>
            </div>
            {pays.length === 0 && (
              <p className="text-xs text-muted-foreground">Añade al menos un método de pago.</p>
            )}
            {pays.map((p) => (
              <div key={p.id} className="space-y-1 rounded-md border p-2">
                <div className="flex items-center gap-1">
                  <Select
                    value={p.method}
                    onValueChange={(v) =>
                      setPays((cur) =>
                        cur.map((x) => (x.id === p.id ? { ...x, method: v as PaymentMethod } : x))
                      )
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem
                          key={m.value}
                          value={m.value}
                          disabled={pays.some((other) => other.id !== p.id && other.method === m.value)}
                        >
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPays((cur) => cur.filter((x) => x.id !== p.id))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <MoneyInput
                  valueCents={p.amountCents}
                  onChangeCents={(cents) =>
                    setPays((cur) =>
                      cur.map((x) => (x.id === p.id ? { ...x, amountCents: cents } : x))
                    )
                  }
                />
                {pays.length > 1 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {PAYMENT_CURRENCY[p.method] === 'VES' ? 'Pago en bolívares' : 'Pago en dólares'}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => completePayment(p.id)}
                    >
                      Completar restante
                    </Button>
                  </div>
                )}
              </div>
            ))}

            <div className="space-y-1 border-t pt-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pagado</span>
                <span className="font-mono">{formatMoney(paid)}</span>
              </div>
              {remaining > 0 ? (
                <div className="flex justify-between text-rose-600">
                  <span>Falta</span>
                  <span className="font-mono font-semibold">{formatMoney(remaining)}</span>
                </div>
              ) : (
                <div className="flex justify-between text-emerald-600">
                  <span>Vuelto</span>
                  <span className="font-mono font-semibold">{formatMoney(change)}</span>
                </div>
              )}
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => void checkout()}
              disabled={submitting || cart.lines.length === 0 || remaining > 0}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cobrar {formatMoney(total)}
            </Button>
          </CardContent>
        </Card>
      </div>

      {unknownCode && (
        <QuickProductCreate
          key={unknownCode}
          open
          initialCode={unknownCode}
          onClose={() => {
            setUnknownCode(null)
            searchRef.current?.focus()
          }}
          onCreated={(p) => {
            addProduct(p)
            setUnknownCode(null)
            setCode('')
            searchRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}

function CartRow({ line }: { line: CartLine }): React.JSX.Element {
  const cart = useCart()
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{line.name}</div>
        <div className="text-xs text-muted-foreground">
          {line.sku}
          {line.serialImei && ` · ${line.serialImei}`}
        </div>
      </TableCell>
      <TableCell>
        {line.tracksSerial ? (
          <Badge variant="info">1</Badge>
        ) : (
          <Input
            type="number"
            min={1}
            value={line.qty}
            onChange={(e) => cart.setQty(line.key, parseInt(e.target.value || '1', 10))}
            className="h-8 w-20"
          />
        )}
      </TableCell>
      <TableCell className="text-right font-mono">{formatMoney(line.effectivePrice)}</TableCell>
      <TableCell className="text-right font-mono">
        {formatMoney(line.effectivePrice * line.qty)}
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" onClick={() => cart.removeLine(line.key)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  )
}

function TotalRow({
  label,
  cents,
  rate
}: {
  label: string
  cents: number
  rate: number | null
}): React.JSX.Element {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">
        {formatMoney(cents)}
        {rate && (
          <span className="ml-2 text-xs text-muted-foreground">{formatVes(cents, rate)}</span>
        )}
      </span>
    </div>
  )
}
