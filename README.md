# GestCom — Sistema de gestión comercial

App web de gestión para comercios (librería/kiosco) en Argentina.  
Desarrollada con React + Vite, Supabase y desplegada en Vercel.

**Producción:** https://gestcom-five.vercel.app  
**Repositorio:** https://github.com/facus82/comercio-app

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite 6 |
| Routing | React Router v7 |
| Estilos | CSS custom properties (sin librería UI) |
| Backend / DB | Supabase (PostgreSQL + Auth + RLS) |
| Edge Functions | Supabase Edge Functions (Deno) |
| Deploy | Vercel (auto-deploy desde `master`) |
| PWA | vite-plugin-pwa (instalable en Android/iOS) |

---

## Módulos

| Módulo | Ruta | Estado |
|---|---|---|
| Dashboard | `/dashboard` | ✅ Completo |
| Stock | `/stock` | ✅ Completo |
| Ventas | `/ventas` | ✅ Completo |
| Compras | `/compras` | ✅ Completo |
| Proveedores | `/proveedores` | ✅ Completo |
| Clientes | `/clientes` | ✅ Completo |
| Presupuestos | `/presupuestos` | ✅ Completo |
| Caja | `/caja` | ✅ Completo |
| Obligaciones | `/obligaciones` | ✅ Completo |
| Config | `/config` | ✅ Completo |
| Reportes | `/reportes` | 🔜 Próximamente |
| Panel superadmin | `/superadmin` | ✅ Completo |

---

## Estructura del proyecto

```
comercio-app/
├── public/                     # Assets estáticos + íconos PWA
├── src/
│   ├── components/
│   │   ├── layout/             # AppLayout, Sidebar, Header, BottomNav, SuperAdminLayout
│   │   └── shared/             # ComingSoon
│   ├── hooks/                  # useAuth, useProductos, useVentas, useCompras, etc.
│   ├── lib/
│   │   ├── supabase.js         # Cliente Supabase (anon key)
│   │   ├── supabaseAdmin.js    # DEPRECATED — reemplazado por Edge Function
│   │   └── adminOps.js         # Helper para llamar a la Edge Function admin-ops
│   ├── migrations/             # SQL para ejecutar en Supabase SQL Editor
│   ├── pages/                  # Una carpeta por módulo
│   ├── router/index.jsx        # Definición de rutas + guards
│   └── styles/                 # tokens.css, components.css
├── supabase/
│   └── functions/
│       └── admin-ops/          # Edge Function server-side para operaciones admin
│           ├── index.ts
│           └── deno.json
├── .env                        # Variables locales (NO se sube a git)
├── .env.example                # Plantilla de variables de entorno
└── vercel.json                 # Rewrite SPA para rutas directas
```

---

## Variables de entorno

Copiar `.env.example` a `.env` y completar:

```env
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...          # clave pública (anon)
```

> ⚠️ `VITE_SUPABASE_SERVICE_KEY` **ya no es necesaria en el frontend**.  
> Las operaciones admin se ejecutan en la Edge Function `admin-ops` (server-side).  
> La `service_role` key vive como secreto en Supabase y nunca llega al browser.

---

## Roles de usuario

| Rol | Acceso |
|---|---|
| `superadmin` | Panel `/superadmin` — gestión de todos los comercios |
| `propietario` | Acceso completo al comercio asignado |
| `cajero` | Ventas, Caja, Stock (lectura) |
| `data_entry` | Stock, Compras, Proveedores |
| `readonly` | Solo lectura en todos los módulos |

---

## Seguridad

- **Auth:** Supabase Auth (email + contraseña). Invitaciones por email con link a `/set-password`.
- **RLS:** Row Level Security activo en Supabase — cada usuario solo ve datos de su comercio.
- **Operaciones admin:** La `service_role` key (bypasea RLS) vive únicamente en la Edge Function `admin-ops`.  
  El frontend la invoca enviando el JWT del usuario; la función verifica rol `superadmin` antes de ejecutar.
- **Contraseña mínima:** 8 caracteres.

---

## Edge Function: `admin-ops`

Ubicación: `supabase/functions/admin-ops/index.ts`

Maneja todas las operaciones del panel superadmin que requieren la service_role key:

| Operación | Descripción |
|---|---|
| `listar_comercios` | Todos los comercios con propietario |
| `crear_comercio` | Crea comercio + invita propietario |
| `toggle_comercio` | Activa / desactiva un comercio |
| `cambiar_plan` | Cambia el plan (basic/pro/enterprise) |
| `asignar_propietario` | Asigna o reemplaza el propietario de un comercio |
| `entrar_como` | Genera magic link para impersonar al propietario |
| `listar_usuarios` | Todos los usuarios + comercios activos |
| `crear_usuario` | Invita nuevo usuario a un comercio |
| `toggle_usuario` | Activa / desactiva un usuario |
| `editar_usuario` | Cambia nombre, rol o comercio de un usuario |
| `reset_password` | Genera link de recuperación de contraseña |
| `listar_planes` | Comercios con sus módulos activos |
| `guardar_modulos` | Guarda overrides de módulos por comercio |

### Re-deployar la Edge Function

```bash
supabase login --token <tu-personal-access-token>
supabase link --project-ref ylcbcmzwdlasbdwzrmhg
supabase functions deploy admin-ops
```

---

## Desarrollo local

```bash
npm install
npm run dev        # http://localhost:5173
```

---

## Deploy

Cada push a `master` despliega automáticamente en Vercel.

```bash
git add .
git commit -m "feat: descripción"
git push origin master
```

**Variables de entorno en Vercel:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

> `VITE_SUPABASE_SERVICE_KEY` **NO** debe estar en Vercel (fue removida por seguridad).

---

## Base de datos (Supabase)

**Proyecto:** `ylcbcmzwdlasbdwzrmhg`  
**21 tablas principales:**

```
comercios · usuarios · categorias · centros_costos
productos · lotes · precio_historial · stock_movimientos
clientes · ventas · venta_items · venta_pagos · venta_comprobantes
compras · compra_items · proveedores · proveedores_cc
presupuestos · presupuesto_items
cierres_caja · obligaciones_imp · obligaciones_pagos
```

**Migraciones SQL** en `src/migrations/` — ejecutar en Supabase → SQL Editor.

---

## PWA

Instalable como app nativa:
- **Android:** Chrome → "Agregar a pantalla de inicio"
- **iOS:** Safari → compartir → "Agregar a pantalla de inicio"
