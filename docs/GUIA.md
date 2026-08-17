# Guía del proyecto POS-TG — Fase 0 → Sprint 1.C

Estado actual: POS funcional offline end-to-end — auth, catálogo/inventario/compras, caja, clientes con cuenta corriente, ventas con pagos mixtos (métodos VE), IGTF/IVA, impresión ESC/POS y reportes.

---

## Sprint 1.C — Caja, ventas, pagos, impresión (resumen)

- **Caja:** apertura con monto inicial, ingresos/retiros, arqueo de cierre (esperado vs contado, sobrante/faltante), reporte X por método de pago. Migración `0006`.
- **Clientes:** CRUD, documento V/E/J/P/G, límite de crédito, cuenta corriente (saldo, ledger, abonos).
- **POS** ([POSScreen](../src/renderer/src/features/pos/POSScreen.tsx)): escaneo/SKU, selección de serial para productos con IMEI, carrito, cliente, panel de pagos multi-método, IGTF en vivo, vuelto, checkout transaccional.
- **Métodos de pago VE** ([payment.ts](../src/shared/payment.ts)): Efectivo Bs, Efectivo $, Tarjeta/Punto, Pago móvil, Transferencia, Zelle, Crédito. Efectivo $ y Zelle = divisa → IGTF 3%.
- **Motor de venta** ([sales.handler.ts](../src/main/ipc/handlers/sales.handler.ts)): totales/IVA/IGTF/descuento server-side, decremento de stock, seriales available→sold, movimiento de caja, cargo a cuenta corriente si crédito. Todo en una transacción SQLite atómica. Anulación reversa stock/serial/caja/AR.
- **Impresión ESC/POS** ([printer.service.ts](../src/main/infrastructure/printer/printer.service.ts)): ticket con datos fiscales de tienda, líneas, totales USD+Bs, IVA, IGTF, pagos. Auto-imprime al cobrar (no bloquea la venta si falla). Apertura de gaveta. Config en Configuración (red `tcp://IP:9100` o `printer:Nombre`).
- **Reportes** ([ReportsScreen](../src/renderer/src/features/reports/ReportsScreen.tsx)): historial de ventas (caja actual / todas), reimprimir, anular.

> Migraciones nuevas: `0006_sales.sql`. Antes de probar: `npm run db:rebuild:electron` → `npm run dev`.

### Ajustes post-1.C

- **Dashboard real:** KPIs (ventas de hoy, estado de caja, stock bajo, clientes con deuda) + listas de stock bajo y últimas ventas. [DashboardScreen](../src/renderer/src/features/dashboard/DashboardScreen.tsx).
- **IGTF opcional:** toggle on/off + tasa editable en Configuración ([IgtfCard](../src/renderer/src/features/settings/IgtfCard.tsx)). Solo se cobra en pagos en dólares (efectivo $ y Zelle). El motor de venta lee la config; si está apagado, IGTF = 0.
- **Abrir caja desde POS:** si no hay caja abierta, el Punto de venta muestra el formulario de apertura inline (sin cambiar de pantalla). [OpenCashForm](../src/renderer/src/features/cash/OpenCashForm.tsx) reutilizado.

### ⚠️ Bypass temporal — buscador manual de productos (ELIMINAR antes de producción)

Para testear ventas sin lector de código de barras, el POS tiene un botón **"Buscar"** (ícono matraz 🧪) que abre un selector manual de productos ([ProductPickerDialog](../src/renderer/src/features/pos/ProductPickerDialog.tsx) + `searchProducts` en [pos/hooks.ts](../src/renderer/src/features/pos/hooks.ts)).

**Esto es un bypass de prueba.** El flujo real del POS es por escaneo de código de barras. Antes de producción:

- Eliminar `ProductPickerDialog`, el botón "Buscar" y `searchProducts`, **o**
- Gatearlo detrás de un flag de "modo entrenamiento" (Fase 3).

Todos los puntos del bypass están marcados con comentarios `TEMP BYPASS` en el código.

---

## 1. Cambios aplicados (qué se construyó y por qué)

### Fase 0 — Bootstrap

| Área                 | Qué se hizo                                                                                                                                                                         | Por qué                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| TypeScript           | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` en [tsconfig.node.json](../tsconfig.node.json) y [tsconfig.web.json](../tsconfig.web.json)                       | Atrapar bugs en compilación, no en producción                                    |
| Aliases              | `@shared`, `@main`, `@renderer` en [electron.vite.config.ts](../electron.vite.config.ts)                                                                                            | Imports limpios, sin `../../../`                                                 |
| IPC tipado           | [envelope.ts](../src/shared/ipc/envelope.ts) (`Result<T,E>`), [types.ts](../src/shared/ipc/types.ts), [router.ts](../src/main/ipc/router.ts), [bridge.ts](../src/preload/bridge.ts) | Un solo origen de verdad para canales + tipos; renderer nunca recibe excepciones |
| Seguridad Electron   | `sandbox:true`, `contextIsolation:true`, CSP estricta, `will-navigate` bloqueado en [main/index.ts](../src/main/index.ts)                                                           | Renderer no toca disco/red/hardware; superficie de ataque mínima                 |
| SQLite + Drizzle     | [client.ts](../src/main/infrastructure/db/client.ts) (WAL pragmas), [migrator.ts](../src/main/infrastructure/db/migrator.ts) (runner custom con backup)                             | Persistencia local robusta + migraciones transaccionales con rollback            |
| Logger               | [logger/index.ts](../src/main/logger/index.ts) — pino + crash handlers                                                                                                              | Diagnóstico; logs estructurados en `userData/logs/`                              |
| Splash + bootstrap   | Splash → migraciones → main window                                                                                                                                                  | UX en arranque; bloquea UI hasta DB lista                                        |
| Tailwind v4 + shadcn | [globals.css](../src/renderer/src/styles/globals.css) (tokens oklch)                                                                                                                | UI moderna sin config legacy                                                     |

### Sprint 1.A — Auth + sesión

- Migración `0001_init.sql`: roles, users, cash_sessions, cash_movements, audit_log, settings
- Hash de contraseñas con **argon2id** ([password.ts](../src/main/auth/password.ts))
- Sesiones en memoria con TTL 1h + inactividad 30min ([session.ts](../src/main/auth/session.ts))
- 5 roles, 27 permisos ([permissions.ts](../src/shared/auth/permissions.ts))
- Seed automático: roles + admin/admin1234 con cambio de contraseña forzado ([seed.ts](../src/main/auth/seed.ts))
- Rate-limit login (5/min/usuario), audit log de login/logout/cambio password
- UI: LoginScreen, ChangePasswordScreen, AppShell (sidebar filtrada por permisos), Dashboard

### Sprint 1.B — Catálogo + inventario + compras

- Migración `0002_catalog_purchasing.sql`: categories, products, stock_levels, serials, suppliers, purchase_orders, po_lines, goods_receipts, goods_receipt_lines
- FSM de seriales: `available → reserved → sold → returned → defective` ([serial.service.ts](../src/main/domain/inventory/serial.service.ts))
- Stock con upsert atómico ([stock.service.ts](../src/main/domain/inventory/stock.service.ts))
- Numeración PO/GR persistente (`PO-2026-00001`)
- PO lifecycle: `draft → submitted → partial → received` + recepción que actualiza stock y crea seriales en una transacción atómica
- UI: Productos, Inventario (stock + seriales), Proveedores, Compras (crear/enviar/recibir)

---

## 2. Configuraciones base (ya definidas, NO tocar salvo que sepas)

| Config                | Valor actual                                                         | Dónde                                                              |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| DB path               | `%APPDATA%/pos-tg/pos.sqlite`                                        | [client.ts](../src/main/infrastructure/db/client.ts) `getDbPath()` |
| WAL mode + pragmas    | `journal_mode=WAL`, `synchronous=NORMAL`, `cache=64MB`, `mmap=256MB` | [client.ts](../src/main/infrastructure/db/client.ts)               |
| Backups pre-migración | `%APPDATA%/pos-tg/backups/pre-migration/`                            | [migrator.ts](../src/main/infrastructure/db/migrator.ts)           |
| Logs                  | `%APPDATA%/pos-tg/logs/app.log` (prod), consola (dev)                | [logger/index.ts](../src/main/logger/index.ts)                     |
| Hash algoritmo        | argon2id, memoryCost 19MB, timeCost 2                                | [password.ts](../src/main/auth/password.ts)                        |
| App ID                | `com.smartautomatai.pos-tg`                                          | [main/index.ts](../src/main/index.ts)                              |

---

## 3. Configuraciones que TÚ deberías personalizar

### 3.1. Identidad de la app — PRIORITARIO

[package.json](../package.json):

```jsonc
"name": "pos-tg",            // cambia a nombre real del producto
"version": "1.0.0",
"author": "example.com",     // tu empresa
"description": "...",        // descripción real
"homepage": "https://electron-vite.org"  // tu sitio
```

> Cambiar `name` cambia la carpeta `%APPDATA%/<name>`. Si lo cambiás tras tener datos, migrá la carpeta o perdés la DB. También actualizá `APP_NAME` en [drizzle.config.ts](../drizzle.config.ts).

### 3.2. Moneda y locale — CONFIGURADO (USD + VES)

Sistema **bi-moneda**: USD es canónico (precios guardados en centavos USD), VES se deriva con la tasa BCV.

[src/renderer/src/lib/money.ts](../src/renderer/src/lib/money.ts) — `LOCALE = 'es-VE'`, formatters USD y VES.

**Tasa BCV (Sprint 1.B+):**

- Fuente: API `ve.dolarapi.com` primaria + scrape `bcv.org.ve` como fallback ([fx.service.ts](../src/main/infrastructure/fx/fx.service.ts))
- Refresco: al abrir la app + cada 6h vía node-cron ([scheduler.ts](../src/main/infrastructure/fx/scheduler.ts))
- Override manual desde Configuración (permiso `settings.manage`)
- Si no hay internet, usa última tasa cacheada en `settings` con aviso de antigüedad
- Precios se muestran USD arriba, VES debajo ([DualPrice.tsx](../src/renderer/src/components/DualPrice.tsx))

> ⚠️ El scrape de bcv.org.ve usa `rejectUnauthorized: false` (su cert SSL es inválido). Es un endpoint público read-only; aceptable pero documentado. Si querés evitarlo, dejá solo la API.

### 3.3. Credenciales admin default — SEGURIDAD

[src/main/auth/seed.ts](../src/main/auth/seed.ts):

```ts
const DEFAULT_ADMIN_USERNAME = 'admin'
const DEFAULT_ADMIN_PASSWORD = 'admin1234' // se fuerza cambio al 1er login
```

> Solo aplica en DB nueva. Para producción, cambialo o creá un flujo de setup inicial. El usuario debe cambiar password al primer login (ya implementado).

### 3.4. Política de sesión

[src/main/auth/session.ts](../src/main/auth/session.ts):

```ts
const SESSION_TTL_MS = 60 * 60 * 1000 // duración máxima sesión
const INACTIVITY_MS = 30 * 60 * 1000 // logout por inactividad
```

### 3.5. Rate-limit login

[src/main/ipc/handlers/auth.handler.ts](../src/main/ipc/handlers/auth.handler.ts):

```ts
const MAX_ATTEMPTS = 5
const WINDOW_MS = 60 * 1000
```

### 3.6. Umbral de stock bajo — CONFIGURABLE (Sprint 1.B+)

Jerarquía de 3 niveles, gana el más específico definido:

1. **Producto** — campo "Umbral stock bajo" en el form de producto (vacío = heredar)
2. **Categoría** — columna umbral en Productos → Categorías (vacío = heredar)
3. **Global** — Configuración → "Stock bajo — umbral global" (default 5)

Resolución: `producto ?? categoría ?? global` en [inventory.handler.ts](../src/main/ipc/handlers/inventory.handler.ts) `listStock`. El badge "Bajo" usa el umbral efectivo por producto.

### 3.7. Roles y permisos

[src/shared/auth/permissions.ts](../src/shared/auth/permissions.ts) — `DEFAULT_ROLES`. Ajustá qué permisos tiene cashier/manager/etc. según tu operación. Cambios solo afectan DB nueva (seed); para DB existente, editá la tabla `roles` o agregá UI de gestión (pendiente).

### 3.8. Datos de la tienda (logo, nombre, dirección para tickets)

Aún NO existe. Se añadirá en Sprint 1.C junto a impresión (tabla `settings` con `store.name`, `store.address`, etc.).

---

## 4. Comandos clave

```bash
npm run dev                    # desarrollo (HMR)
npm run build                  # typecheck + build producción
npm run typecheck              # solo chequeo de tipos
npm run lint                   # eslint
npm test                       # vitest
npm run db:generate            # generar migración desde cambios de schema Drizzle

# Inspección DB (Drizzle Studio) — rompe binding Electron, requiere restaurar:
npm run db:studio              # rebuild para Node + abre studio
npm run db:rebuild:electron    # IMPORTANTE: restaurar antes de npm run dev
```

> **Trampa conocida:** `db:studio` recompila `better-sqlite3` para Node del sistema (ABI distinto a Electron). Después SIEMPRE corré `npm run db:rebuild:electron` o `npm run dev` falla con `NODE_MODULE_VERSION`. Para inspección diaria usá **DB Browser for SQLite** (no tiene este problema).

---

## 5. Lista de pasos para probar funciones

Antes de empezar: `npm run db:rebuild:electron` luego `npm run dev`.

### Test 0 — Reset limpio (opcional)

Para probar seed desde cero: cerrá la app, borrá `%APPDATA%/pos-tg/pos.sqlite` (+ `-wal`, `-shm`). Al reabrir corre migraciones 0001+0002 y seedea admin.

### Test 1 — Auth

1. App abre en LoginScreen
2. Login `admin` / `admin1234`
3. Redirige a ChangePasswordScreen (cambio forzado)
4. Poné contraseña nueva (≥8 chars) + confirmar → cierra sesión automático
5. Login de nuevo con contraseña nueva → entrás al Dashboard
6. **Verificá:** sidebar muestra todos los módulos (rol admin)

### Test 2 — Rate limit

1. Logout
2. Intentá login con contraseña incorrecta 6 veces seguidas
3. **Verificá:** al 6º intento → "Demasiados intentos. Esperá 1 minuto."

### Test 3 — Productos sincronizados

1. Crear los productos de prueba en **Tiendas Gala**.
2. Sincronizar la caja desde **Ajustes**.
3. Sidebar → **Productos**.
4. **Verificá:** los productos aparecen en la tabla; el filtro por categoría y la búsqueda por SKU funcionan.
5. **Verificá:** el POS permite editar productos existentes, pero no muestra ninguna opción para crear productos.

### Test 4 — Proveedores

1. Sidebar → **Proveedores**
2. "Nuevo proveedor": nombre `Distribuidora Norte`, CUIT, email, teléfono
3. **Verificá:** aparece en la tabla; editar funciona

### Test 5 — Orden de compra (PO)

1. Sidebar → **Compras** → "Nueva PO"
2. Proveedor: Distribuidora Norte
3. Agregar producto Samsung A52 → qty `5`, costo `200`
4. Agregar Camiseta → qty `10`, costo `8`
5. **Verificá:** total calculado en vivo = (5×200)+(10×8) = $1080
6. "Crear PO (draft)" → aparece en lista como "Borrador"
7. Click "Ver" → "Enviar" → estado pasa a "Enviada"

### Test 6 — Recepción con seriales

1. En la PO enviada → "Recibir mercancía"
2. Samsung A52: cantidad `5` + seriales (uno por línea):
   ```
   356789100000001
   356789100000002
   356789100000003
   356789100000004
   356789100000005
   ```
3. Camiseta: cantidad `10` (sin campo de seriales — no rastrea)
4. "Confirmar recepción"
5. **Verificá:** toast "Recepción GR-2026-00001 registrada"; PO pasa a "Recibida"

### Test 7 — Validación de seriales

Repetí recepción con errores para ver validaciones:

- Serial duplicado (mismo IMEI ya recibido) → error "Serial duplicado o ya existe"
- Cantidad seriales ≠ cantidad recibida → "Cantidad de seriales no coincide"
- Cantidad > pendiente → "Excede cantidad pedida"

### Test 8 — Inventario

1. Sidebar → **Inventario** → tab "Stock"
2. **Verificá:** Samsung A52 stock=5, seriales libres=5; Camiseta stock=10
3. Click "Ajustar" en Camiseta → delta `-2`, motivo "merma por daño" → Aplicar
4. **Verificá:** stock pasa a 8
5. Tab "Seriales / IMEI" → buscar `356789100000001`
6. **Verificá:** muestra producto, estado "Disponible", recibido vía `po:...`

### Test 9 — Permisos (RBAC)

1. Necesitás otro usuario. Por ahora no hay UI de usuarios (pendiente Sprint posterior). Opción: con DB Browser, copiá un user existente con `role_id` de cashier, o esperá la UI.
2. Cuando exista: login como cashier → **Verificá** sidebar NO muestra Compras/Proveedores (sin permiso `inventory.receive`).

### Test 10 — Persistencia offline

1. Cerrá la app completamente
2. Reabrí `npm run dev`
3. Login → **Verificá:** productos, proveedores, PO, stock y seriales siguen ahí (todo en SQLite local)

### Test 11 — Audit log

Con DB Browser abrí `audit_log`:

```sql
SELECT action, target_type, ts FROM audit_log ORDER BY ts DESC;
```

**Verificá:** registros de `auth.login`, `auth.password.change`, `po.create`, `po.submit`, `po.receive`, `inventory.adjust`.

---

## 6. Qué NO está implementado todavía (no son bugs)

- POS / ventas / carrito → Sprint 1.C
- Sesión de caja (apertura/cierre/arqueo) → Sprint 1.C
- Impresión ESC/POS + gaveta → Sprint 1.C
- Reportes X/Z → Sprint 1.C
- Clientes + cuenta corriente → Sprint 1.C
- Gestión de usuarios desde UI → Sprint posterior
- Datos de tienda para tickets → Sprint 1.C
- Variantes (talla/color) → Fase 3
- Sync multi-caja LAN → Fase 2
- Devoluciones → Fase 3

Los módulos en el sidebar sin implementar (POS, Caja, Clientes, Reportes, Configuración) muestran placeholder "Módulo aún no implementado".
