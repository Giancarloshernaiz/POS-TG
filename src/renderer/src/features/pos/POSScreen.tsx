import { useState, useRef, useEffect } from 'react'
import { Search, Trash2, Plus, X, ShoppingCart, Loader2, FlaskConical } from 'lucide-react'
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
import { findByCode, useCreateSale, printTicket } from './hooks'
import { SerialPickDialog } from './SerialPickDialog'
import { ProductPickerDialog } from './ProductPickerDialog'
import { CustomerCedulaSlot } from './CustomerCedulaSlot'
import { formatMoney, formatVes } from '@renderer/lib/money'
import { PAYMENT_METHODS, type PaymentMethod } from '@renderer/lib/paymentMethods'
import { PAYMENT_DIVISA } from '@shared/payment'
import { useIgtf } from '@renderer/features/settings/hooks'
import { MoneyInput } from '@renderer/components/MoneyInput'
import type { ProductDTO } from '@shared/ipc/contracts/catalog'

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
  const { data: igtfCfg } = useIgtf()
  const createSale = useCreateSale()
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
  const [serialProduct, setSerialProduct] = useState<ProductDTO | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false) // TEMP bypass: manual product picker
  const [pays, setPays] = useState<PayEntry[]>([])
  const [submitting, setSubmitting] = useState(false)

  // ---- Totals ----
  const subtotal = cart.lines.reduce((s, l) => s + l.effectivePrice * l.qty, 0)
  const taxTotal = cart.lines.reduce(
    (s, l) => s + Math.round(l.effectivePrice * l.qty * (l.taxRateBp / 10_000)),
    0
  )
  const goodsTotal = subtotal + taxTotal
  const igtfEnabled = igtfCfg?.enabled ?? false
  const igtfRateBp = igtfCfg?.rateBp ?? 0
  const igtfTotal = pays.reduce((s, p) => {
    if (!igtfEnabled || !PAYMENT_DIVISA[p.method]) return s
    return s + Math.round((p.amountCents * igtfRateBp) / 10_000)
  }, 0)
  const total = goodsTotal + igtfTotal
  const paid = pays.reduce((s, p) => s + p.amountCents, 0)
  const change = Math.max(0, paid - total)
  const remaining = Math.max(0, total - paid)

  function addProduct(product: ProductDTO): void {
    if (!product.active) {
      toast.error('Producto inactivo')
      return
    }
    if (product.tracksSerial) {
      setSerialProduct(product)
    } else {
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
  }

  async function handleCode(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const c = code.trim()
    if (!c) return
    try {
      const product = await findByCode(c)
      if (!product) {
        toast.error('Producto no encontrado')
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
    setPays((p) => [...p, { id: crypto.randomUUID(), method: 'cash_ves', amountCents: remaining }])
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
    const hasCredit = pays.some((p) => p.method === 'credit')
    if (hasCredit && !cart.customer) {
      toast.error('Crédito requiere seleccionar cliente')
      return
    }
    setSubmitting(true)
    try {
      const res = await createSale.mutateAsync({
        customerId: cart.customer?.id ?? null,
        lines: cart.lines.map((l) => ({
          productId: l.productId,
          serialId: l.serialId ?? null,
          qty: l.qty
        })),
        payments: pays.map((p) => ({
          method: p.method,
          amountUsd: p.amountCents,
          amountOriginal: null,
          reference: null
        })),
        notes: null
      })
      toast.success(
        `Venta ${res.sale.number} — total ${formatMoney(res.sale.total)}` +
          (res.changeUsd > 0 ? ` · vuelto ${formatMoney(res.changeUsd)}` : '')
      )
      // Print ticket (non-blocking: sale is already saved).
      void printTicket(authSessionId, res.sale.id).catch((err) => {
        const code = err instanceof Error ? err.message : String(err)
        if (code === 'PRINTER_NOT_CONFIGURED') {
          toast.info('Venta guardada. Configurá la impresora para imprimir tickets.')
        } else {
          toast.warning(`Venta guardada, pero no se pudo imprimir (${code}).`)
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
                  ? 'Escaneá código de barras o escribí SKU…'
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
          {/* TEMP BYPASS: manual product picker for testing without a scanner. Remove before prod. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setPickerOpen(true)}
            title="Modo prueba sin lector"
            disabled={!customerReady}
          >
            <FlaskConical className="h-4 w-4" />
            Buscar
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
                      Carrito vacío. Escaneá un producto.
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
              <TotalRow label="IVA" cents={taxTotal} rate={rate} />
              {igtfTotal > 0 && (
                <TotalRow label={`IGTF (${igtfRateBp / 100}%)`} cents={igtfTotal} rate={rate} />
              )}
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
              <span className="text-sm font-medium">Pagos</span>
              <Button size="sm" variant="outline" onClick={addPayment}>
                <Plus className="h-3 w-3" />
                Añadir
              </Button>
            </div>
            {pays.length === 0 && (
              <p className="text-xs text-muted-foreground">Añadí al menos un método de pago.</p>
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
                        <SelectItem key={m.value} value={m.value}>
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

      {/* TEMP BYPASS: manual product picker (no scanner). Remove before production. */}
      <ProductPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(product) => {
          addProduct(product)
          setPickerOpen(false)
          searchRef.current?.focus()
        }}
      />

      <SerialPickDialog
        key={serialProduct?.id ?? 'none'}
        product={serialProduct}
        onClose={() => setSerialProduct(null)}
        onPick={(serial) => {
          if (!serialProduct) return
          cart.addLine({
            productId: serialProduct.id,
            sku: serialProduct.sku,
            name: serialProduct.name,
            qty: 1,
            unitPrice: serialProduct.basePrice,
            effectivePrice: serialProduct.effectivePrice,
            taxRateBp: serialProduct.taxRateBp,
            tracksSerial: true,
            serialId: serial.id,
            serialImei: serial.imei
          })
          setSerialProduct(null)
          searchRef.current?.focus()
        }}
      />
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
