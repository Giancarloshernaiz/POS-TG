import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { KeyRound, Loader2 } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@renderer/components/ui/card'

const formSchema = z
  .object({
    currentPassword: z.string().min(1, 'requerido'),
    newPassword: z.string().min(8, 'mínimo 8 caracteres'),
    confirmPassword: z.string()
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'no coincide'
  })

type FormValues = z.infer<typeof formSchema>

export function ChangePasswordScreen(): React.JSX.Element {
  const session = useAuth((s) => s.session)
  const clear = useAuth((s) => s.clear)
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' }
  })

  async function onSubmit(values: FormValues): Promise<void> {
    if (!session) return
    setServerError(null)
    setSubmitting(true)
    try {
      const res = await api.auth.changePassword({
        sessionId: session.id,
        currentPassword: values.currentPassword,
        newPassword: values.newPassword
      })
      if (res.ok) {
        clear()
      } else {
        const msg: Record<string, string> = {
          INVALID_CREDENTIALS: 'Contraseña actual inválida',
          WEAK_PASSWORD: 'Mínimo 8 caracteres',
          NOT_AUTHENTICATED: 'Sesión expirada'
        }
        setServerError(msg[res.error.code] ?? res.error.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
          <CardDescription>Tu contraseña debe cambiarse antes de continuar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e)
            }}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Contraseña actual</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                disabled={submitting}
                {...register('currentPassword')}
              />
              {errors.currentPassword && (
                <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nueva contraseña</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                disabled={submitting}
                {...register('newPassword')}
              />
              {errors.newPassword && (
                <p className="text-xs text-destructive">{errors.newPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar nueva contraseña</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                disabled={submitting}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>
            {serverError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {serverError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Cambiar y cerrar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
