import { useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { RIF_TYPES } from '@shared/fiscal'
import type { CustomerDTO } from '@shared/ipc/contracts/customers'
import { useCreateCustomer } from './hooks'

type DocType = 'V' | 'E' | 'J' | 'P' | 'G'

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (customer: CustomerDTO) => void
  /** Prefill from the cédula input upstream. */
  initialDocType: DocType
  initialDocId: string
}

export function QuickCustomerCreate({
  open,
  onClose,
  onCreated,
  initialDocType,
  initialDocId
}: Props): React.JSX.Element {
  const createMut = useCreateCustomer()
  // Parent must remount this component (via key) for each new lookup; we rely on
  // useState initializers to read the latest initial props.
  const [name, setName] = useState('')
  const [docType, setDocType] = useState<DocType>(initialDocType)
  const [docId, setDocId] = useState(initialDocId)
  const [phone, setPhone] = useState('')

  async function submit(): Promise<void> {
    if (!name.trim()) {
      toast.error('Nombre requerido')
      return
    }
    if (!docId.trim()) {
      toast.error('Documento requerido')
      return
    }
    try {
      const created = await createMut.mutateAsync({
        name: name.trim(),
        docType,
        docId: docId.trim(),
        phone: phone.trim() || null,
        email: null,
        address: null,
        creditLimit: 0,
        specialDiscountBp: 0,
        active: true
      })
      toast.success(`Cliente ${created.name} creado`)
      onCreated(created)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg === 'FORBIDDEN' ? 'Sin permiso para crear clientes' : msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Registrar cliente nuevo
          </DialogTitle>
          <DialogDescription>
            El documento {docType}-{docId} no está en el sistema. Datos mínimos:
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="space-y-3"
        >
          <div className="space-y-2">
            <Label htmlFor="qcName">Nombre / Razón social</Label>
            <Input
              id="qcName"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Juan Pérez"
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
                <SelectTrigger>
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="qcDoc">Número</Label>
              <Input
                id="qcDoc"
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                placeholder="12345678"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="qcPhone">Teléfono</Label>
            <Input
              id="qcPhone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0414-1234567"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear y continuar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
