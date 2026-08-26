import { useState, useRef, useEffect } from 'react'
import {
  Trash2,
  Plus,
  X,
  ShoppingCart,
  Loader2,
  UserRound,
  CalendarDays,
  ScanLine,
  Banknote,
  CreditCard,
  Smartphone,
  Landmark,
  WalletCards,
  CircleDollarSign,
  Clock3,
  PauseCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Label } from '@renderer/components/ui/label'
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
import {
  findByCode,
  searchProducts,
  useCreateSale,
  printTicket,
  useSellers,
  useDiscountUsd,
  useSaleDrafts,
  useSaveSaleDraft,
  useDeleteSaleDraft
} from './hooks'
import { SaleDraftsDialog } from './SaleDraftsDialog'
import { CustomerCedulaSlot } from './CustomerCedulaSlot'
import { getCustomer } from '@renderer/features/customers/hooks'
import { fromCents } from '@renderer/lib/money'
import { PAYMENT_METHODS, type PaymentMethod } from '@renderer/lib/paymentMethods'
import { PAYMENT_CURRENCY } from '@shared/payment'
import { MoneyInput } from '@renderer/components/MoneyInput'
import type { ProductDTO } from '@shared/ipc/contracts/catalog'
import type { SaleDraftDTO } from '@shared/ipc/contracts/sales'
import {
  customerBenefitsCents,
  FIDELITY_REWARD_CENTS,
  totalAfterUsdDiscountCents,
  usdDiscountRateForSale,
  usdPaymentDiscountCents
} from '@shared/sale-discounts'

// Radix Select no admite value="" en un item, así que el "sin vendedor"
// necesita un centinela.
const NO_SELLER = '__none__'

type PayEntry = { id: string; method: PaymentMethod; amountCents: number }
type CurrencyMode = 'USD' | 'VES' | 'MIXED'

const PAYMENT_ICON: Record<PaymentMethod, typeof Banknote> = {
  cash_ves: Banknote,
  cash_usd: CircleDollarSign,
  card: CreditCard,
  pago_movil: Smartphone,
  transfer: Landmark,
  zelle: WalletCards,
  binance: CircleDollarSign,
  credit: CreditCard
}

function formatReference(cents: number): string {
  return fromCents(cents).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function formatBolivares(cents: number, rate: number | null): string {
  if (!rate) return '—'
  return (fromCents(cents) * rate).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

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
  const { data: discountUsd } = useDiscountUsd()
  const { data: saleDrafts = [], isLoading: draftsLoading } = useSaleDrafts()
  const saveSaleDraft = useSaveSaleDraft()
  const deleteSaleDraft = useDeleteSaleDraft()
  const [sellerId, setSellerId] = useState<string>('')
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>('MIXED')
  const [useStoreCredit, setUseStoreCredit] = useState(false)
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
  const [productSuggestions, setProductSuggestions] = useState<ProductDTO[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [searchingProducts, setSearchingProducts] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [pays, setPays] = useState<PayEntry[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [draftsOpen, setDraftsOpen] = useState(false)
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)

  useEffect(() => {
    const term = code.trim()
    if (!customerReady || !term) {
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearchingProducts(true)
      void searchProducts(term)
        .then((products) => {
          if (cancelled) return
          setProductSuggestions(products.slice(0, 8))
          setSuggestionsOpen(true)
          setActiveSuggestion(-1)
        })
        .catch(() => {
          if (cancelled) return
          setProductSuggestions([])
          setSuggestionsOpen(true)
          setActiveSuggestion(-1)
        })
        .finally(() => {
          if (!cancelled) setSearchingProducts(false)
        })
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [code, customerReady])

  // ---- Totals ----
  const grossSubtotal = cart.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0)
  const subtotal = cart.lines.reduce((s, l) => s + l.effectivePrice * l.qty, 0)
  const productDiscount = grossSubtotal - subtotal
  const configuredDiscountUsdRateBp = discountUsd?.rateBp ?? 0
  const discountUsdRateBp = usdDiscountRateForSale(configuredDiscountUsdRateBp, useStoreCredit)
  const discountPayments = pays.map((p) => ({
    amountCents: p.amountCents,
    currency: PAYMENT_CURRENCY[p.method]
  }))
  const usdDiscount = usdPaymentDiscountCents(subtotal, discountPayments, discountUsdRateBp)
  const totalBeforeBenefits = totalAfterUsdDiscountCents(
    subtotal,
    discountPayments,
    discountUsdRateBp
  )
  const benefits = customerBenefitsCents(
    totalBeforeBenefits,
    cart.customer?.fidelityBalance ?? 0,
    cart.customer?.returnCreditBalance ?? 0,
    useStoreCredit
  )
  const total = benefits.totalCents
  const paid = pays.reduce((s, p) => s + p.amountCents, 0)
  const change = Math.max(0, paid - total)
  const remaining = Math.max(0, total - paid)
  const paymentMethods = PAYMENT_METHODS.filter((method) => {
    if (currencyMode === 'MIXED') return true
    return method.currency === currencyMode
  })

  function amountToCompleteWithBenefits(entries: PayEntry[], targetIndex: number): number {
    const paidByOthers = entries.reduce(
      (sum, payment, index) => sum + (index === targetIndex ? 0 : payment.amountCents),
      0
    )
    let low = 0
    let high = Math.max(subtotal, totalBeforeBenefits)
    while (low < high) {
      const candidate = Math.floor((low + high) / 2)
      const trial = entries.map((payment, index) =>
        index === targetIndex ? { ...payment, amountCents: candidate } : payment
      )
      const trialPayments = trial.map((payment) => ({
        amountCents: payment.amountCents,
        currency: PAYMENT_CURRENCY[payment.method]
      }))
      const beforeBenefits = totalAfterUsdDiscountCents(subtotal, trialPayments, discountUsdRateBp)
      const trialTotal = customerBenefitsCents(
        beforeBenefits,
        cart.customer?.fidelityBalance ?? 0,
        cart.customer?.returnCreditBalance ?? 0,
        useStoreCredit
      ).totalCents
      if (paidByOthers + candidate >= trialTotal) high = candidate
      else low = candidate + 1
    }
    return low
  }

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

  function selectProduct(product: ProductDTO): void {
    addProduct(product)
    setCode('')
    setProductSuggestions([])
    setSuggestionsOpen(false)
    setActiveSuggestion(-1)
    setTimeout(() => searchRef.current?.focus(), 0)
  }

  async function handleCode(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const c = code.trim()
    if (!c) return
    try {
      const product = await findByCode(c)
      if (!product) {
        toast.error(
          'Producto no encontrado. Debe crearse en Tiendas Gala y sincronizarse con el POS.'
        )
        setCode('')
        setProductSuggestions([])
        setSuggestionsOpen(false)
        setSearchingProducts(false)
        setActiveSuggestion(-1)
        searchRef.current?.focus()
        return
      }
      selectProduct(product)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  function togglePaymentMethod(method: PaymentMethod): void {
    setPays((current) => {
      if (current.some((payment) => payment.method === method)) {
        return current.filter((payment) => payment.method !== method)
      }
      const next = [...current, { id: crypto.randomUUID(), method, amountCents: 0 }]
      const targetIndex = next.length - 1
      next[targetIndex]!.amountCents = amountToCompleteWithBenefits(next, targetIndex)
      return next
    })
  }

  function completePayment(id: string): void {
    setPays((current) => {
      const targetIndex = current.findIndex((payment) => payment.id === id)
      const amount = amountToCompleteWithBenefits(current, targetIndex)
      return current.map((payment) =>
        payment.id === id ? { ...payment, amountCents: amount } : payment
      )
    })
  }

  function resetWorkspace(): void {
    cart.clear()
    setPays([])
    setSellerId('')
    setCurrencyMode('MIXED')
    setUseStoreCredit(false)
    setActiveDraftId(null)
    setCode('')
    setProductSuggestions([])
    setSuggestionsOpen(false)
  }

  async function holdSale(): Promise<void> {
    if (cart.lines.length === 0) {
      toast.error('Agrega al menos un producto antes de poner la venta en espera')
      return
    }
    const label = cart.customer?.name ?? (cart.walkIn ? 'Consumidor final' : 'Cliente pendiente')
    try {
      await saveSaleDraft.mutateAsync({
        ...(activeDraftId ? { id: activeDraftId } : {}),
        label,
        state: {
          customerId: cart.customer?.id ?? null,
          customerLabel: label,
          walkIn: cart.walkIn,
          sellerId: sellerId || null,
          currencyMode,
          useStoreCredit,
          lines: cart.lines,
          payments: pays
        }
      })
      toast.success(activeDraftId ? 'Venta en espera actualizada' : 'Venta puesta en espera')
      resetWorkspace()
      setTimeout(() => searchRef.current?.focus(), 0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la venta')
    }
  }

  async function resumeDraft(draft: SaleDraftDTO): Promise<void> {
    const hasCurrentData =
      cart.lines.length > 0 || cart.customer !== null || cart.walkIn || pays.length > 0
    if (hasCurrentData) {
      toast.warning('Pon la venta actual en espera antes de abrir otra')
      return
    }

    try {
      const customer = draft.state.customerId ? await getCustomer(draft.state.customerId) : null
      if (draft.state.customerId && !customer) {
        toast.warning('El cliente guardado ya no está disponible; selecciónalo nuevamente')
      }
      cart.restore({
        lines: draft.state.lines as CartLine[],
        customer,
        walkIn: customer ? false : draft.state.walkIn
      })
      setSellerId(draft.state.sellerId ?? '')
      setCurrencyMode(draft.state.currencyMode)
      setUseStoreCredit(customer ? draft.state.useStoreCredit : false)
      setPays(draft.state.payments as PayEntry[])
      setActiveDraftId(draft.id)
      setDraftsOpen(false)
      toast.success(`Venta de ${draft.label} retomada`)
      setTimeout(() => searchRef.current?.focus(), 0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo retomar la venta')
    }
  }

  async function removeDraft(draft: SaleDraftDTO): Promise<void> {
    if (!window.confirm(`¿Eliminar la venta en espera de ${draft.label}?`)) return
    setDeletingDraftId(draft.id)
    try {
      await deleteSaleDraft.mutateAsync(draft.id)
      if (activeDraftId === draft.id) setActiveDraftId(null)
      toast.success('Venta en espera eliminada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar la venta')
    } finally {
      setDeletingDraftId(null)
    }
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
            // Galas Cloud guarda el monto en la moneda indicada. Para VES se
            // conserva el equivalente real, no el valor numérico en USD.
            amountOriginal:
              currency === 'VES' && rate
                ? Math.round((p.amountCents / 100) * rate * 100) / 100
                : null,
            reference: null
          }
        }),
        draftId: activeDraftId,
        useStoreCredit,
        notes: null
      })
      toast.success(
        `Venta ${res.sale.number} — total Ref. ${formatReference(res.sale.total)}` +
          (res.changeUsd > 0 ? ` · vuelto Ref. ${formatReference(res.changeUsd)}` : '')
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
      resetWorkspace()
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
    <div className="flex min-h-full flex-col gap-5 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Nueva venta</h2>
            {activeDraftId && <Badge variant="secondary">Venta retomada</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Registra el cliente, escanea los productos y distribuye el cobro entre uno o varios
            métodos de pago.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setDraftsOpen(true)}>
            <Clock3 className="mr-2 h-4 w-4" />
            Facturas en espera
            {saleDrafts.length > 0 && (
              <Badge className="ml-2 px-1.5" variant="secondary">
                {saleDrafts.length}
              </Badge>
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={cart.lines.length === 0 || saveSaleDraft.isPending}
            onClick={() => void holdSale()}
          >
            {saveSaleDraft.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PauseCircle className="mr-2 h-4 w-4" />
            )}
            {activeDraftId ? 'Actualizar factura' : 'Guardar factura'}
          </Button>
        </div>
      </div>

      {/* Ficha de la venta, equivalente al encabezado de Tiendas Gala. */}
      <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
        <CustomerCedulaSlot
          customer={cart.customer}
          walkIn={cart.walkIn}
          onCustomer={(c) => {
            cart.setCustomer(c)
            setUseStoreCredit(false)
            setPays([])
          }}
          onWalkIn={() => {
            cart.setWalkIn(true)
            setUseStoreCredit(false)
            setPays([])
          }}
          onReady={() => setTimeout(() => searchRef.current?.focus(), 0)}
        />

        {cart.customer && cart.customer.returnCreditBalance > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div>
              <div className="text-sm font-medium text-emerald-900">
                Crédito por devolución disponible
              </div>
              <div className="text-xs text-emerald-700">
                Se aplicará hasta Ref. {formatReference(cart.customer.returnCreditBalance)} después
                de la fidelización.
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant={useStoreCredit ? 'default' : 'outline'}
              onClick={() => {
                setUseStoreCredit((current) => !current)
                setPays([])
              }}
            >
              {useStoreCredit ? 'Crédito aplicado' : 'Usar crédito'}
            </Button>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Vendedor
            </Label>
            <Select
              value={sellerId || NO_SELLER}
              onValueChange={(v) => setSellerId(v === NO_SELLER ? '' : v)}
            >
              <SelectTrigger className="h-9 bg-background">
                <UserRound className="mr-2 h-4 w-4 text-muted-foreground" />
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

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Moneda de cobro
            </Label>
            <Select
              value={currencyMode}
              onValueChange={(value) => {
                setCurrencyMode(value as CurrencyMode)
                setPays([])
              }}
            >
              <SelectTrigger className="h-9 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">Referencia</SelectItem>
                <SelectItem value="VES">Bolívares</SelectItem>
                <SelectItem value="MIXED">Mixto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Fecha</Label>
            <div className="flex h-9 items-center gap-2 rounded-md border bg-muted px-3 text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              {new Date().toLocaleDateString('es-VE')}
            </div>
          </div>
        </div>
      </div>

      {/* Detalle de productos */}
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3 className="font-semibold">Detalle de productos</h3>
            <p className="text-xs text-muted-foreground">
              Escanea consecutivamente o busca manualmente por SKU, código o nombre.
            </p>
          </div>
          <Badge variant="secondary">{cart.lines.length} líneas</Badge>
        </div>

        <form
          onSubmit={handleCode}
          className={
            'flex gap-2 rounded-lg border bg-background p-2 shadow-sm ' +
            (!customerReady ? 'pointer-events-none opacity-50' : '')
          }
        >
          <div className="relative flex-1">
            <ScanLine className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={code}
              onChange={(e) => {
                const nextCode = e.target.value
                const hasSearch = Boolean(nextCode.trim())
                setCode(nextCode)
                setProductSuggestions([])
                setSuggestionsOpen(hasSearch)
                setSearchingProducts(hasSearch)
                setActiveSuggestion(-1)
              }}
              onFocus={() => {
                if (code.trim()) setSuggestionsOpen(true)
              }}
              onBlur={() => {
                window.setTimeout(() => setSuggestionsOpen(false), 120)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSuggestionsOpen(false)
                  setActiveSuggestion(-1)
                  return
                }
                if (e.key === 'ArrowDown' && productSuggestions.length > 0) {
                  e.preventDefault()
                  setSuggestionsOpen(true)
                  setActiveSuggestion((current) =>
                    current >= productSuggestions.length - 1 ? 0 : current + 1
                  )
                  return
                }
                if (e.key === 'ArrowUp' && productSuggestions.length > 0) {
                  e.preventDefault()
                  setSuggestionsOpen(true)
                  setActiveSuggestion((current) =>
                    current <= 0 ? productSuggestions.length - 1 : current - 1
                  )
                  return
                }
                if (
                  e.key === 'Enter' &&
                  suggestionsOpen &&
                  activeSuggestion >= 0 &&
                  productSuggestions[activeSuggestion]
                ) {
                  e.preventDefault()
                  selectProduct(productSuggestions[activeSuggestion])
                }
              }}
              placeholder={
                customerReady
                  ? 'Escanea un código o busca por SKU o nombre…'
                  : 'Primero identifica al cliente o toca "Sin cliente"'
              }
              className="pl-8"
              disabled={!customerReady}
            />
            {suggestionsOpen && customerReady && code.trim() && (
              <div
                role="listbox"
                aria-label="Productos encontrados"
                className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
              >
                {searchingProducts ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Buscando productos…
                  </div>
                ) : productSuggestions.length > 0 ? (
                  productSuggestions.map((product, index) => (
                    <button
                      key={product.id}
                      type="button"
                      role="option"
                      aria-selected={activeSuggestion === index}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActiveSuggestion(index)}
                      onClick={() => selectProduct(product)}
                      className={`flex w-full items-center justify-between gap-4 rounded-sm px-3 py-2 text-left text-sm transition-colors ${
                        activeSuggestion === index
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{product.name}</span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          SKU: {product.sku}
                          {product.barcode ? ` · Código: ${product.barcode}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-mono font-semibold">
                          Ref. {formatReference(product.effectivePrice)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Stock: {product.stock}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No hay productos que coincidan con la búsqueda.
                  </div>
                )}
              </div>
            )}
          </div>
          <Button type="submit" disabled={!customerReady}>
            <Plus className="h-4 w-4" />
            Agregar
          </Button>
        </form>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/70 text-[11px] uppercase tracking-wide">
                  <TableHead className="min-w-64">Producto</TableHead>
                  <TableHead className="w-24 text-center">Cant.</TableHead>
                  <TableHead className="min-w-28 text-right">Precio Bs</TableHead>
                  <TableHead className="min-w-24 text-right">Precio Ref.</TableHead>
                  <TableHead className="w-20 text-right">% Desc.</TableHead>
                  <TableHead className="min-w-24 text-right">Ref. c/desc.</TableHead>
                  <TableHead className="min-w-28 text-right">Bs c/desc.</TableHead>
                  <TableHead className="min-w-28 text-right">Subt. Bs</TableHead>
                  <TableHead className="min-w-24 text-right">Subt. Ref.</TableHead>
                  <TableHead className="w-14 text-center">Acc.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.lines.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={10}
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

      {/* Métodos de pago y total, con la jerarquía visual de Tiendas Gala. */}
      <div className="grid items-start gap-5 rounded-xl border bg-muted/30 p-5 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <Card className="order-2 lg:sticky lg:top-0">
          <CardContent className="space-y-3 p-4">
            <div className="text-right">
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Total a pagar
              </div>
              {rate && (
                <Badge variant="outline" className="mt-1 border-blue-200 bg-blue-50 text-blue-700">
                  Tasa BCV: {rate.toFixed(2)} Bs/Ref.
                </Badge>
              )}
            </div>
            <div className="space-y-1 text-sm">
              <TotalRow label="Subtotal productos" cents={grossSubtotal} />
              {productDiscount > 0 && (
                <TotalRow label="Descuento productos" cents={-productDiscount} />
              )}
              {usdDiscount > 0 && (
                <TotalRow
                  label={`Descuento pago en referencia (${(discountUsdRateBp / 100).toFixed(2)}%)`}
                  cents={-usdDiscount}
                />
              )}
              {benefits.fidelityAppliedCents > 0 && (
                <TotalRow
                  label={`Fidelización (Ref. ${formatReference(FIDELITY_REWARD_CENTS)})`}
                  cents={-benefits.fidelityAppliedCents}
                />
              )}
              {benefits.creditAppliedCents > 0 && (
                <TotalRow
                  label="Crédito a favor"
                  cents={-benefits.creditAppliedCents}
                />
              )}
              <div className="flex items-end justify-between border-t pt-3">
                <span className="text-sm font-medium text-muted-foreground">
                  Cantidad Ref. / Bs
                </span>
                <div className="text-right">
                  <div className="text-2xl font-bold">Ref. {formatReference(total)}</div>
                  {rate && (
                    <div className="text-sm font-medium text-muted-foreground">
                      Bs {formatBolivares(total, rate)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="order-1">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold uppercase tracking-wide">
                  Métodos de pago
                </span>
                {pays.length > 1 && <Badge variant="secondary">Mixto</Badge>}
              </div>
              <span className="text-xs text-muted-foreground">Selecciona uno o varios métodos</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {paymentMethods.map((method) => {
                const selected = pays.some((payment) => payment.method === method.value)
                const disabled = method.value === 'credit' && !cart.customer
                const Icon = PAYMENT_ICON[method.value]
                return (
                  <button
                    key={method.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => togglePaymentMethod(method.value)}
                    className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border p-3 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      selected
                        ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary/30'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full ${
                        selected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-xs font-medium leading-tight">{method.label}</span>
                    <Badge variant="outline" className="text-[9px]">
                      {method.currency === 'VES' ? 'Bs' : 'Ref.'}
                    </Badge>
                  </button>
                )
              })}
            </div>

            {pays.length === 0 && (
              <p className="text-xs text-muted-foreground">Añade al menos un método de pago.</p>
            )}
            {pays.map((p) => (
              <div key={p.id} className="space-y-1 rounded-md border p-2">
                <div className="flex items-center gap-1">
                  <div className="flex flex-1 items-center gap-2 text-sm font-medium">
                    {(() => {
                      const Icon = PAYMENT_ICON[p.method]
                      return <Icon className="h-4 w-4 text-primary" />
                    })()}
                    {PAYMENT_METHODS.find((method) => method.value === p.method)?.label ?? p.method}
                  </div>
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
                  referenceLabel="Ref."
                  onChangeCents={(cents) =>
                    setPays((cur) =>
                      cur.map((x) => (x.id === p.id ? { ...x, amountCents: cents } : x))
                    )
                  }
                />
                {pays.length > 1 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {PAYMENT_CURRENCY[p.method] === 'VES'
                        ? 'Pago en bolívares'
                        : 'Pago en referencia'}
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
                <span className="font-mono">Ref. {formatReference(paid)}</span>
              </div>
              {remaining > 0 ? (
                <div className="flex justify-between text-rose-600">
                  <span>Falta</span>
                  <span className="font-mono font-semibold">Ref. {formatReference(remaining)}</span>
                </div>
              ) : (
                <div className="flex justify-between text-emerald-600">
                  <span>Vuelto</span>
                  <span className="font-mono font-semibold">Ref. {formatReference(change)}</span>
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
              Cobrar Ref. {formatReference(total)}
            </Button>
          </CardContent>
        </Card>
      </div>
      <SaleDraftsDialog
        open={draftsOpen}
        onOpenChange={setDraftsOpen}
        drafts={saleDrafts}
        isLoading={draftsLoading}
        deletingId={deletingDraftId}
        onResume={(draft) => void resumeDraft(draft)}
        onDelete={(draft) => void removeDraft(draft)}
      />
    </div>
  )
}

function CartRow({ line }: { line: CartLine }): React.JSX.Element {
  const cart = useCart()
  const rate = useFx((state) => state.rate?.rate ?? null)
  const discountBp =
    line.unitPrice > 0
      ? Math.round(((line.unitPrice - line.effectivePrice) / line.unitPrice) * 10000)
      : 0
  const lineTotal = line.effectivePrice * line.qty
  return (
    <TableRow>
      <TableCell className="text-center">
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
            className="mx-auto h-8 w-20 text-center"
          />
        )}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {formatBolivares(line.unitPrice, rate)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {formatReference(line.unitPrice)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {discountBp > 0 ? `${(discountBp / 100).toFixed(2)}%` : '—'}
      </TableCell>
      <TableCell className="text-right font-mono text-xs font-medium">
        {formatReference(line.effectivePrice)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs font-medium">
        {formatBolivares(line.effectivePrice, rate)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs font-semibold">
        {formatBolivares(lineTotal, rate)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs font-semibold">
        {formatReference(lineTotal)}
      </TableCell>
      <TableCell className="text-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:bg-destructive/10"
          onClick={() => cart.removeLine(line.key)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  )
}

function TotalRow({
  label,
  cents
}: {
  label: string
  cents: number
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="min-w-0 flex-1 text-muted-foreground">{label}</span>
      <span className="w-40 shrink-0 text-right font-mono">Ref. {formatReference(cents)}</span>
    </div>
  )
}
