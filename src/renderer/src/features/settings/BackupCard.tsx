import { useState } from 'react'
import { Archive, Loader2, RotateCcw, Plus, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import type { BackupEntryDTO } from '@shared/ipc/contracts/backup'
import { useBackups, useCreateBackup, useRestoreBackup } from './hooks'

const KIND_LABEL: Record<BackupEntryDTO['kind'], string> = {
  daily: 'Diario',
  manual: 'Manual',
  'pre-migration': 'Pre-actualización'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function BackupCard(): React.JSX.Element {
  const { data: backups, isLoading } = useBackups()
  const createBackup = useCreateBackup()
  const restoreBackup = useRestoreBackup()
  const [confirm, setConfirm] = useState<BackupEntryDTO | null>(null)

  async function handleCreate(): Promise<void> {
    try {
      const b = await createBackup.mutateAsync()
      toast.success(`Respaldo creado (${formatSize(b.sizeBytes)})`)
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e)
      toast.error(code === 'FORBIDDEN' ? 'Sin permiso' : `No se pudo respaldar: ${code}`)
    }
  }

  async function handleRestore(): Promise<void> {
    if (!confirm) return
    try {
      await restoreBackup.mutateAsync({ path: confirm.path })
      toast.info('Restaurando respaldo… la aplicación se reiniciará.')
      setConfirm(null)
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e)
      const human: Record<string, string> = {
        FORBIDDEN: 'Sin permiso',
        BACKUP_NOT_FOUND: 'El respaldo ya no existe',
        BACKUP_PATH_INVALID: 'Ruta de respaldo inválida',
        BACKUP_TOO_NEW: 'El respaldo es de una versión más nueva; actualiza la app primero'
      }
      toast.error(human[code] ?? `No se pudo restaurar: ${code}`)
      setConfirm(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Archive className="h-4 w-4" /> Copias de seguridad
            </CardTitle>
            <CardDescription>
              Respaldo automático diario (se conservan 14 días) y antes de cada actualización.
              También puedes respaldar manualmente.
            </CardDescription>
          </div>
          <Button onClick={() => void handleCreate()} disabled={createBackup.isPending}>
            {createBackup.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Respaldar ahora
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando respaldos…
          </div>
        ) : !backups || backups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aún no hay respaldos. Crea uno con «Respaldar ahora».
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead className="w-32">Tipo</TableHead>
                <TableHead className="w-20">Versión</TableHead>
                <TableHead className="w-24 text-right">Tamaño</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((b) => (
                <TableRow key={b.path}>
                  <TableCell className="font-mono text-xs">{formatDate(b.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={b.kind === 'manual' ? 'default' : 'secondary'}>
                      {KIND_LABEL[b.kind]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {b.schemaVersion !== null ? `v${b.schemaVersion}` : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatSize(b.sizeBytes)}
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => setConfirm(b)}>
                      <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" /> Restaurar respaldo
            </DialogTitle>
            <DialogDescription>
              Esto reemplazará la base de datos actual por la del respaldo del{' '}
              <strong>{confirm ? formatDate(confirm.createdAt) : ''}</strong> y{' '}
              <strong>reiniciará la aplicación</strong>. Las ventas registradas después de ese
              respaldo se perderán. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleRestore()}
              disabled={restoreBackup.isPending}
            >
              {restoreBackup.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Restaurar y reiniciar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
