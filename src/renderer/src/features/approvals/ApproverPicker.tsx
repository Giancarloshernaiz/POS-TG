import { Loader2, UserCheck } from 'lucide-react'
import { Label } from '@renderer/components/ui/label'
import { useApprovers } from './hooks'

type Props = {
  seleccion: number[]
  onChange: (ids: number[]) => void
}

/**
 * A quién se le pide la autorización.
 *
 * Se eligen al momento de solicitar, no se configuran una vez: quién está
 * disponible cambia por turno, y dirigirla a alguien que no está deja al
 * cajero esperando sin saberlo. Se admite más de uno; cualquiera puede
 * resolverla.
 */
export function ApproverPicker({ seleccion, onChange }: Props): React.JSX.Element {
  const { data, isLoading, error } = useApprovers()

  function toggle(id: number): void {
    onChange(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id])
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando autorizantes…
      </div>
    )
  }

  if (error) {
    return (
      <p className="py-2 text-sm text-destructive">
        No se pudo consultar quién puede autorizar. Revisa la conexión con Galas Cloud.
      </p>
    )
  }

  const approvers = data ?? []
  if (approvers.length === 0) {
    return (
      <p className="py-2 text-sm text-destructive">
        No hay usuarios con permiso para autorizar en Galas Cloud.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <UserCheck className="h-4 w-4" /> Pedir autorización a
      </Label>
      <div className="max-h-40 space-y-1 overflow-auto rounded-md border p-2">
        {approvers.map((a) => (
          <label
            key={a.id}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
          >
            <input
              type="checkbox"
              checked={seleccion.includes(a.id)}
              onChange={() => toggle(a.id)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="flex-1 truncate">{a.nombre}</span>
            <span className="text-xs text-muted-foreground">{a.rol}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Podés elegir a más de uno: alcanza con que cualquiera de ellos la apruebe.
      </p>
    </div>
  )
}
