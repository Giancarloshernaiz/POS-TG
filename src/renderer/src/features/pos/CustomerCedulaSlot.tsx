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
import {
  findCustomerByDoc,
  searchCustomers,
  useCustomers
} from '@renderer/features/customers/hooks'
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
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [quickCreate, setQuickCreate] = useState<{ docType: DocType; docId: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: suggestions = [], isFetching: loadingSuggestions } = useCustomers({
    search: docId.trim() || undefined,
    activeOnly: true
  })

  function selectCustomer(selected: CustomerDTO): void {
    setSuggestionsOpen(false)
    setDocId('')
    onCustomer(selected)
    onReady()
  }

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
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span className="font-medium text-emerald-700">
                Saldo a favor ${(customer.favorBalance / 100).toFixed(2)}
              </span>
              <span className="text-muted-foreground">
                Devoluciones ${(customer.returnCreditBalance / 100).toFixed(2)}
              </span>
              <span className="text-muted-foreground">
                Fidelización ${(customer.fidelityBalance / 100).toFixed(2)}
              </span>
              <span className="text-muted-foreground">
                Progreso ${(customer.fidelityAccumulated / 100).toFixed(2)} / $420.00
              </span>
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
      toast.error('Ingresa número de documento')
      return
    }
    setSearching(true)
    try {
      const found = await findCustomerByDoc(docType, id)
      if (found) {
        selectCustomer(found)
      } else {
        const matches = await searchCustomers(id)
        if (matches.length === 1) {
          selectCustomer(matches[0]!)
        } else if (matches.length > 1) {
          setSuggestionsOpen(true)
        } else if (/^\d+$/.test(id)) {
          setQuickCreate({ docType, docId: id })
        } else {
          toast.error('No se encontró ningún cliente con ese nombre o documento')
        }
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
            onChange={(e) => {
              setDocId(e.target.value)
              setSuggestionsOpen(Boolean(e.target.value.trim()))
            }}
            onFocus={() => setSuggestionsOpen(Boolean(docId.trim()))}
            onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
            placeholder="Nombre, cédula o RIF (Enter para buscar)"
            className="pl-8"
          />
          {suggestionsOpen && docId.trim() && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
              {loadingSuggestions ? (
                <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando clientes…
                </div>
              ) : suggestions.length > 0 ? (
                suggestions.slice(0, 8).map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectCustomer(candidate)}
                    className="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{candidate.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[candidate.docType, candidate.docId].filter(Boolean).join('-') ||
                          'Sin documento'}
                        {candidate.phone ? ` · ${candidate.phone}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-emerald-700">
                      Ref. {(candidate.favorBalance / 100).toFixed(2)} a favor
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  Sin coincidencias. Presiona Enter para crear por documento.
                </div>
              )}
            </div>
          )}
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
        Busca manualmente por nombre o documento. Si el documento no existe, podrás registrarlo.
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
