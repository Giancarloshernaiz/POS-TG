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
import { Textarea } from '@renderer/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import type { SupplierDTO } from '@shared/ipc/contracts/purchasing'
import { useCreateSupplier, useUpdateSupplier } from './hooks'
import {
  isValidRif,
  normalizeRif,
  CONTRIBUYENTE_TYPES,
  type ContribuyenteType
} from '@shared/fiscal'

const NO_TYPE = '__none__'

const schema = z.object({
  name: z.string().min(1, 'requerido').max(200),
  taxId: z
    .string()
    .max(20)
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || isValidRif(v), { message: 'RIF inválido (ej: J-12345678-9)' }),
  fiscalType: z.string().optional(),
  email: z.string().max(200).optional().or(z.literal('')),
  phone: z.string().max(50).optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  active: z.boolean()
})

type FormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier?: SupplierDTO | null
}

export function SupplierForm({ open, onOpenChange, supplier }: Props): React.JSX.Element {
  const createMut = useCreateSupplier()
  const updateMut = useUpdateSupplier()
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
      taxId: '',
      fiscalType: NO_TYPE,
      email: '',
      phone: '',
      address: '',
      notes: '',
      active: true
    }
  })

  useEffect(() => {
    if (open) {
      reset(
        supplier
          ? {
              name: supplier.name,
              taxId: supplier.taxId ?? '',
              fiscalType: supplier.fiscalType ?? NO_TYPE,
              email: supplier.email ?? '',
              phone: supplier.phone ?? '',
              address: supplier.address ?? '',
              notes: supplier.notes ?? '',
              active: supplier.active
            }
          : undefined
      )
    }
  }, [open, supplier, reset])

  async function onSubmit(values: FormValues): Promise<void> {
    setSubmitting(true)
    try {
      const payload = {
        name: values.name,
        taxId: values.taxId ? normalizeRif(values.taxId) : null,
        fiscalType:
          values.fiscalType && values.fiscalType !== NO_TYPE
            ? (values.fiscalType as ContribuyenteType)
            : null,
        email: values.email ? values.email : null,
        phone: values.phone ? values.phone : null,
        address: values.address ? values.address : null,
        notes: values.notes ? values.notes : null,
        active: values.active
      }
      if (supplier) {
        await updateMut.mutateAsync({ id: supplier.id, ...payload })
        toast.success('Proveedor actualizado')
      } else {
        await createMut.mutateAsync(payload)
        toast.success('Proveedor creado')
      }
      onOpenChange(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const human: Record<string, string> = {
        DUPLICATE_NAME: 'Ya existe un proveedor con ese nombre',
        NOT_FOUND: 'Proveedor no existe'
      }
      toast.error(human[msg] ?? msg)
    } finally {
      setSubmitting(false)
    }
  }

  // eslint-disable-next-line react-hooks/incompatible-library
  const active = watch('active')
  const fiscalType = watch('fiscalType')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{supplier ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e)
          }}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="taxId">RIF</Label>
              <Input id="taxId" placeholder="J-12345678-9" {...register('taxId')} />
              {errors.taxId && <p className="text-xs text-destructive">{errors.taxId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" {...register('phone')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo de contribuyente</Label>
            <Select
              value={fiscalType ?? NO_TYPE}
              onValueChange={(v) => setValue('fiscalType', v, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TYPE}>(sin especificar)</SelectItem>
                {CONTRIBUYENTE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Dirección</Label>
            <Input id="address" {...register('address')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" rows={2} {...register('notes')} />
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
              {supplier ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
