import { useState, useRef } from 'react'
import { Search, X, UserX, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { RIF_TYPES } from '@shared/fiscal'
import { findCustomerByDoc } from '@renderer/features/customers/hooks'
import { QuickCustomerCreate } from '@renderer/features/customers/QuickCustomerCreate'
import type { CustomerDTO } from '@shared/ipc/contracts/customers'

type DocType = 'V' | 'E' | 'J' | 'P' | 'G'

type Props = {
  customer: CustomerDTO | null
  walkIn: boolean
  onCustomer: (c: CustomerDTO | null) => void
  onWalkIn: () => void
  /** Called after a customer is set (lookup hit or quick-created) so POS can move focus to scanner. */
  onReady: () => void
}

export function CustomerCedulaSlot({
  customer,
  walkIn,
  onCustomer,
  onWalkIn,
  onReady
}: Props): React.JSX.Element {
  const [docType, setDocType] = useState<DocType>('V')
  const [docId, setDocId] = useState('')
  const [searching, setSearching] = useState(false)
  const [quickCreate, setQuickCreate] = useState<{ docType: DocType; docId: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Chip state (customer selected OR walk-in) ─────────────────────────────
  if (customer) {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <div className="flex items-center gap-3">
          <Badge variant="success">Cliente</Badge>
          <div>
            <div className="font-medium">{customer.name}</div>
            <div className="text-xs text-muted-foreground">
              {customer.docType}-{customer.docId}
              {customer.phone && ` · ${customer.phone}`}
              {customer.currentBalance > 0 && (
                <span className="ml-2 text-rose-600">
                  debe ${(customer.currentBalance / 100).toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onCustomer(null)}>
          <X className="h-4 w-4" />
          Cambiar
        </Button>
      </div>
    )
  }

  if (walkIn) {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <div className="flex items-center gap-3">
          <Badge variant="secondary">Consumidor final</Badge>
          <span className="text-sm text-muted-foreground">Venta sin cliente registrado</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onCustomer(null)}>
          <X className="h-4 w-4" />
          Cambiar
        </Button>
      </div>
    )
  }

  // ── Cédula entry ──────────────────────────────────────────────────────────
  async function search(): Promise<void> {
    const id = docId.trim()
    if (!id) {
      toast.error('Ingresá número de documento')
      return
    }
    setSearching(true)
    try {
      const found = await findCustomerByDoc(docType, id)
      if (found) {
        onCustomer(found)
        onReady()
      } else {
        setQuickCreate({ docType, docId: id })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSearching(false)
    }
  }

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault()
    void search()
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Cliente</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onWalkIn()
            onReady()
          }}
          title="Atajo: F8"
        >
          <UserX className="h-4 w-4" />
          Sin cliente (F8)
        </Button>
      </div>
      <form onSubmit={onSubmit} className="flex gap-2">
        <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RIF_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            autoFocus
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            placeholder="Cédula o RIF (Enter para buscar)"
            className="pl-8"
            inputMode="numeric"
          />
        </div>
        <Button type="submit" disabled={searching}>
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Buscar
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Si no existe, se abre un formulario rápido para registrarlo.
      </p>

      {quickCreate && (
        <QuickCustomerCreate
          key={`${quickCreate.docType}-${quickCreate.docId}`}
          open
          initialDocType={quickCreate.docType}
          initialDocId={quickCreate.docId}
          onClose={() => {
            setQuickCreate(null)
            inputRef.current?.focus()
          }}
          onCreated={(c) => {
            setQuickCreate(null)
            onCustomer(c)
            onReady()
          }}
        />
      )}
    </div>
  )
}
