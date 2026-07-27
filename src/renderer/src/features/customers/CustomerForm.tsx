import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { fromCents, toCents } from '@renderer/lib/money'
import { MoneyInput } from '@renderer/components/MoneyInput'
import type { CustomerDTO } from '@shared/ipc/contracts/customers'
import { useCreateCustomer, useUpdateCustomer } from './hooks'

const NO_DOC = '__none__'

const schema = z.object({
  name: z.string().min(1, 'requerido').max(200),
  docType: z.string().optional(),
  docId: z.string().max(20).optional().or(z.literal('')),
  phone: z.string().max(50).optional().or(z.literal('')),
  email: z.string().max(200).optional().or(z.literal('')),
  address: z.string().max(300).optional().or(z.literal('')),
  creditLimit: z.union([z.number().nonnegative(), z.nan()]).optional(),
  specialDiscountPct: z.union([z.number().min(0).max(100), z.nan()]).optional(),
  active: z.boolean()
})

type FormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: CustomerDTO | null
}

export function CustomerForm({ open, onOpenChange, customer }: Props): React.JSX.Element {
  const createMut = useCreateCustomer()
  const updateMut = useUpdateCustomer()
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      docType: NO_DOC,
      docId: '',
      phone: '',
      email: '',
      address: '',
      creditLimit: 0,
      specialDiscountPct: 0,
      active: true
    }
  })

  useEffect(() => {
    if (open) {
      reset(
        customer
          ? {
              name: customer.name,
              docType: customer.docType ?? NO_DOC,
              docId: customer.docId ?? '',
              phone: customer.phone ?? '',
              email: customer.email ?? '',
              address: customer.address ?? '',
              creditLimit: fromCents(customer.creditLimit),
              specialDiscountPct: customer.specialDiscountBp / 100,
              active: customer.active
            }
          : undefined
      )
    }
  }, [open, customer, reset])

  async function onSubmit(values: FormValues): Promise<void> {
    setSubmitting(true)
    try {
      const payload = {
        name: values.name,
        docType:
          values.docType && values.docType !== NO_DOC
            ? (values.docType as 'V' | 'E' | 'J' | 'P' | 'G')
            : null,
        docId: values.docId ? values.docId : null,
        phone: values.phone ? values.phone : null,
        email: values.email ? values.email : null,
        address: values.address ? values.address : null,
        creditLimit:
          values.creditLimit != null && !Number.isNaN(values.creditLimit)
            ? toCents(values.creditLimit)
            : 0,
        specialDiscountBp:
          values.specialDiscountPct != null && !Number.isNaN(values.specialDiscountPct)
            ? Math.round(values.specialDiscountPct * 100)
            : 0,
        active: values.active
      }
      if (customer) {
        await updateMut.mutateAsync({ id: customer.id, ...payload })
        toast.success('Cliente actualizado')
      } else {
        await createMut.mutateAsync(payload)
        toast.success('Cliente creado')
      }
      onOpenChange(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg === 'FORBIDDEN' ? 'Sin permiso' : msg)
    } finally {
      setSubmitting(false)
    }
  }

  const docType = watch('docType')
  const active = watch('active')
  const creditLimit = watch('creditLimit')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{customer ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e)
          }}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="name">Nombre / Razón social</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Tipo doc.</Label>
              <Select
                value={docType ?? NO_DOC}
                onValueChange={(v) => setValue('docType', v, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DOC}>—</SelectItem>
                  {RIF_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="docId">Cédula / RIF</Label>
              <Input id="docId" placeholder="12345678" {...register('docId')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" {...register('phone')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Dirección</Label>
            <Input id="address" {...register('address')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Límite de crédito</Label>
              <MoneyInput
                valueCents={toCents(
                  typeof creditLimit === 'number' && !Number.isNaN(creditLimit) ? creditLimit : 0
                )}
                onChangeCents={(c) => setValue('creditLimit', fromCents(c), { shouldDirty: true })}
              />
              <p className="text-xs text-muted-foreground">
                Monto máximo que puede deber en ventas a crédito. 0 = sin crédito.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="specialDiscountPct">Descuento especial (%)</Label>
              <Input
                id="specialDiscountPct"
                type="number"
                min={0}
                max={100}
                step="0.01"
                {...register('specialDiscountPct', { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Espejo de &quot;Descuento especial&quot; en AgroOne. Se sincroniza; aún no se aplica
                automático al precio en el POS.
              </p>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setValue('active', e.target.checked, { shouldDirty: true })}
              className="h-4 w-4 rounded border-input"
            />
            Activo
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {customer ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
