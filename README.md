# GestCom — Sistema de gestión comercial

App web de gestión para comercios (librería/kiosco) en Argentina.  
Desarrollada con React + Vite, Supabase y desplegada en Vercel.

**Producción:** https://gestcom-five.vercel.app  
**Repositorio:** https://github.com/facus82/comercio-app

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite 8 |
| Routing | React Router v7 (páginas con carga bajo demanda) |
| Estilos | CSS custom properties (sin librería UI) · íconos Tabler |
| Backend / DB | Supabase (PostgreSQL + Auth + RLS + Storage) |
| Edge Functions | Supabase Edge Functions (Deno) |
| Deploy | Vercel (auto-deploy desde `master`) |
| PWA | vite-plugin-pwa (instalable en Android/iOS) |
| Excel | `xlsx` (se descarga sólo al importar/exportar) |
| Escáner | `BarcodeDetector` nativo + `@zxing/browser` (fallback, bajo demanda) |

---

## Módulos

| Módulo | Ruta | Estado |
|---|---|---|
| Dashboard | `/dashboard` | ✅ Completo |
| Stock | `/stock` | ✅ Completo |
| Ventas (POS) | `/ventas` | ✅ Completo |
| Modo caja (POS pantalla completa) | `/pos` | ✅ Completo |
| Compras | `/compras` | ✅ Completo |
| Proveedores | `/proveedores` | ✅ Completo |
| Clientes | `/clientes` | ✅ Completo |
| Presupuestos | `/presupuestos` | ✅ Completo |
| Caja | `/caja` | ✅ Completo |
| Obligaciones | `/obligaciones` | ✅ Completo |
| Config | `/config` | ✅ Completo |
| Reportes | `/reportes` | ✅ Completo |
| Panel superadmin | `/superadmin` | ✅ Completo |

---

## Funcionalidades destacadas

### Ventas / POS
- Búsqueda por nombre, código interno o código de barras (lector físico USB/Bluetooth o **cámara del celular**).
- Miniatura del producto en los resultados y en el carrito.
- Varios medios de pago por venta, vuelto en efectivo, descuento por efectivo y promociones (NxM, % por medio de pago, precio por cantidad).
- **Ítem libre** (producto no cargado) y **recargo** ($ o %, con concepto): el recargo se suma al total sin modificar el precio de los productos ni el stock (`ventas.recargo_monto`).
- **Alta rápida de cliente** desde el buscador ("+ Crear cliente"), con precarga de nombre o DNI/CUIT.
- **Responsive:** en celular pasa a una columna con barra fija inferior "Total · Cobrar".
- Atajos de teclado: `F2` cobrar · `F3` buscar · `F4` cliente · `F6` recargo · `F9` vaciar venta.

### Modo caja (`/pos`)
POS a pantalla completa pensado para dejar abierto todo el día en el mostrador.
- Si la caja está cerrada, redirige a `/caja?volver=pos`: se abre con arqueo y referencia del último cierre y vuelve solo al POS.
- Barra superior con cajero, hora de apertura, cantidad y total vendido desde la apertura.
- Encadena ventas: al cobrar muestra número, total y vuelto, y queda listo para la siguiente.
- Pantalla completa y pantalla siempre encendida (Wake Lock) donde el navegador lo permite.
- **Salir** vuelve a la app sin cerrar la caja; **Cerrar caja** lleva al arqueo de cierre.

### Cuenta corriente de clientes
- Venta a Cta. Cte. con **vencimiento por venta**: 7 / 14 / 30 días o fecha manual (default = plazo del cliente, 30 días).
- Exige cliente; **avisa** (no bloquea) si tiene deuda vencida o supera el límite de crédito.
- Cobros imputados a lo que vence primero (FIFO) mediante la función `registrar_cobro_cliente`; si es en efectivo y hay caja abierta, entra como ingreso de caja.
- Ficha de cuenta: saldo, vencido, pendientes, cobro y **historial por venta** (origen con ítems → pagos aplicados con saldo → cancelada).
- Recordatorio por **WhatsApp** con el mensaje ya armado.
- Dashboard: tarjeta **"A cobrar Cta. Cte."** (vencido / vence en 7 días) con desglose por cliente.

### Productos
- **Imagen del producto** optimizada: se comprime en el navegador (480 px, WebP) y queda en ~20-40 KB. "Sacar foto" abre la cámara en el celular.
- Código de barras cargado **escaneando con la cámara**.
- Multi-proveedor por producto, lotes con vencimiento, historial de precios.

---

## Estructura del proyecto

```
comercio-app/
├── public/                     # Assets estáticos + íconos PWA
├── src/
│   ├── components/
│   │   ├── layout/             # AppLayout, Sidebar, Header, BottomNav, SuperAdminLayout
│   │   └── shared/             # Skeleton, ImagenProducto (miniatura + campo foto),
│   │                           # EscanerCodigo (lector con cámara), ComingSoon
│   ├── hooks/                  # useAuth, useProductos, useVentas, useCaja,
│   │                           # useCuentasCobrar (deudas, cobros, historial Cta. Cte.), etc.
│   ├── lib/
│   │   ├── supabase.js         # Cliente Supabase (anon key)
│   │   ├── imagenes.js         # Compresión y subida de imágenes de productos
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

> ⚠️ La service_role key **no se usa en el frontend**. En `.env` se llama `SUPABASE_SERVICE_KEY` (sin `VITE_`, para que Vite nunca la publique) y sólo sirve para scripts locales.  
> Las operaciones admin se ejecutan en la Edge Function `admin-ops` (server-side).  
> La `service_role` key vive como secreto en Supabase y nunca llega al browser.

---

## Roles de usuario

| Rol | Acceso |
|---|---|
| `superadmin` | Panel `/superadmin` — gestión de todos los comercios |
| `propietario` | Acceso completo al comercio asignado |
| `cajero` | Ventas, Modo caja, Caja, cobros de Cta. Cte., alta de clientes, Stock (lectura) |
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

> La service_role key (`SUPABASE_SERVICE_KEY`) **NO** debe estar en Vercel.

---

## Base de datos (Supabase)

**Proyecto:** `ylcbcmzwdlasbdwzrmhg`  
**Tablas:**

```
comercios · usuarios · categorias · subcategorias · centros_costos
productos · producto_proveedores · lotes · precio_historial · stock_movimientos · promociones
clientes · clientes_cobros
ventas · venta_items · venta_pagos · venta_comprobantes · venta_promociones
compras · compra_items · proveedores · proveedores_cc
presupuestos · presupuesto_items
cierres_caja · caja_movimientos · obligaciones_imp · obligaciones_pagos
```

**Storage (buckets públicos):** `logos` (logo del comercio) · `productos` (imágenes, máx. 200 KB, carpeta por comercio).

### Migraciones

Base: `schema.sql`. Las migraciones están en `src/migrations/` y se ejecutan **en orden** en Supabase → SQL Editor.

| Archivo | Qué hace |
|---|---|
| `002_superadmin.sql` | Rol superadmin, columnas plan/activo en comercios |
| `003_subcategorias.sql` | Subcategorías de productos |
| `004_compras_flete.sql` | Flete en compras (se distribuye por unidad en el costo) |
| `005_promociones.sql` | Promociones y descuentos |
| `006_caja_movimientos.sql` | Ingresos y retiros manuales de caja |
| `006_venta_promociones.sql` | Promociones aplicadas en cada venta |
| `007_caja_mov_cc.sql` | Centro de costo en movimientos de caja |
| `007_promo_precio_qty.sql` | Promoción de precio por cantidad (bundle) |
| `008_caja_comprobante.sql` | N° de comprobante en movimientos de caja |
| `009_caja_distribucion.sql` | Monto distribuido al cierre de caja |
| `010_clientes_cc.sql` | Cta. Cte. de clientes: `ventas.cc_monto/cc_pagado/fecha_vencimiento`, `clientes.plazo_dias`, tabla `clientes_cobros`, función `registrar_cobro_cliente` |
| `011_productos_imagenes.sql` | Bucket `productos` en Storage + políticas por comercio |

> `producto_proveedores` (multi-proveedor) se creó directamente en Supabase, sin archivo de migración.  
> `clientes.saldo_cuenta` quedó en desuso: el saldo se calcula desde `ventas` (`cc_monto − cc_pagado`).

---

## PWA

Instalable como app nativa:
- **Android:** Chrome → "Agregar a pantalla de inicio"
- **iOS:** Safari → compartir → "Agregar a pantalla de inicio"

Tras un deploy, cerrar y volver a abrir la app para que tome la versión nueva.  
La cámara (escáner y fotos) requiere HTTPS: funciona en producción, no desde `localhost` en el celular.

---

## Rendimiento

- Cada página se carga cuando se abre (`React.lazy`); el bundle inicial sólo trae login, layout y dashboard (~577 KB, ~164 KB gzip).
- `xlsx` y `@zxing/browser` se descargan únicamente cuando se usan.
- Imágenes con nombre único y cache de 1 año.

---

## Historial de cambios

Ver [CHANGELOG.md](CHANGELOG.md).
