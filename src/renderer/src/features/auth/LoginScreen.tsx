import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LogIn, Loader2 } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardDescription
} from '@renderer/components/ui/card'
import logoUrl from '@renderer/assets/logo.png'

const formSchema = z.object({
  username: z.string().min(1, 'requerido'),
  password: z.string().min(1, 'requerido')
})

type FormValues = z.infer<typeof formSchema>

export function LoginScreen(): React.JSX.Element {
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const setSession = useAuth((s) => s.setSession)

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: '', password: '' }
  })

  async function onSubmit(values: FormValues): Promise<void> {
    setServerError(null)
    setSubmitting(true)
    try {
      const res = await api.auth.login(values)
      if (res.ok) {
        setSession(res.data)
      } else {
        const msgMap: Record<string, string> = {
          INVALID_CREDENTIALS: 'Usuario o contraseña inválido',
          USER_INACTIVE: 'Usuario inactivo. Contacta al administrador.',
          RATE_LIMITED: 'Demasiados intentos. Espera 1 minuto.',
          BAD_INPUT: 'Datos inválidos'
        }
        setServerError(msgMap[res.error.code] ?? res.error.message)
      }
    } catch (e) {
      setServerError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img
            src={logoUrl}
            alt="Tiendas Galas"
            className="mb-2 h-20 w-auto max-w-56 object-contain"
          />
          <CardDescription>Inicia sesión para continuar</CardDescription>
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
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                disabled={submitting}
                {...register('username')}
              />
              {errors.username && (
                <p className="text-xs text-destructive">{errors.username.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                disabled={submitting}
                {...register('password')}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
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
                <LogIn className="h-4 w-4" />
              )}
              Entrar
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Default: admin / admin1234 (cambia al entrar)
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
