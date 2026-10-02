# Historial de cambios — GestCom

Formato: lo más reciente arriba. Entre paréntesis, el commit.

---

## 2026-10-02

### Ventas
- **Anular una venta devuelve los productos al stock**, con un movimiento de entrada "Anulación venta #N" en el historial. Antes la venta quedaba anulada pero el stock seguía descontado. (`dff58ed`)
- Anular ahora **pide confirmación** (antes bastaba un click) y avisa si salió bien. (`dff58ed`)
- Una venta a Cta. Cte. a la que el cliente **ya le pagó algo no se puede anular**: avisa cuánto pagó (sin pedir confirmación antes) y sugiere usar **Devolución**. (`dff58ed`, `729927c`)
- **Devoluciones parciales o totales**: botón **"Devolución"** en el detalle de la venta. Se indica cuánto devuelve de cada producto (o "Devuelve todo"); lo devuelto vuelve al stock y la venta queda con lo que el cliente se llevó (descuentos y recargos se prorratean). Antes de confirmar se ve el valor y a dónde va la plata. (`729927c`)
- La plata devuelta se aplica en este orden: **1)** lo que falte pagar de esa venta en Cta. Cte., **2)** otras deudas del cliente, la que vence antes primero (se puede destildar), **3)** lo que sobra se le devuelve; en **efectivo con caja abierta** sale como **retiro de caja**, así el arqueo cierra. (`729927c`)
- Las ventas con devolución llevan la marca **"devolución"** en el listado, y el detalle muestra qué se devolvió y cuándo. En la cuenta del cliente, la devolución aparece en el historial de la deuda. (`729927c`)
- Fix: **las ventas y anulaciones hechas por un usuario cajero no movían el stock** (sólo el propietario podía modificar productos), y el historial registraba un movimiento que no había pasado. Ahora el stock se mueve en la base y funciona igual para propietario y cajero. Probado con un cajero: vender, devolver y anular. (`cf1707e`)
- Fix: si un producto aparecía en dos renglones de la misma venta, el stock podía descontarse mal. (`cf1707e`)
- Si la venta se guarda pero no se puede descontar el stock, se avisa sin marcarla como error, para no cobrarla dos veces. (`cf1707e`)
- Una venta que **ya tuvo una devolución no se puede anular** (la caja restaría dos veces lo reintegrado): el resto se devuelve con **Devolución → "Devuelve todo"**. (`cf1707e`)

### Reportes, dashboard y caja
- **Las devoluciones cuentan el día en que se hacen**: cada venta suma su total original en su fecha y la devolución resta en la suya. Así el reporte de un día no cambia porque al otro día devolvieron algo. Aplica a Reportes (con el aviso "devoluciones −$X"), ventas del período en el Dashboard, "Total vendido" de Caja y la caja del POS. (`729927c`)

### Compras y proveedores
- **"Revertir a pendiente"** también revierte los pagos registrados (queda un movimiento "Reversión de pagos" en la cuenta del proveedor). Antes la compra volvía a pendiente pero los pagos seguían descontando del saldo. (`dff58ed`)
- **"A pagar proveedores"** del Dashboard muestra lo que realmente se debe: las compras con pago parcial suman sólo lo que falta. (`dff58ed`)
- **Registrar pago** desde el Dashboard tiene en cuenta los pagos anteriores: muestra y precarga lo pendiente, no deja pagar de más y marca la compra como pagada al completar el total. (`dff58ed`)

### Stock
- **Agregar un lote** desde la ficha del producto registra el movimiento de stock (antes subía el stock sin dejar rastro en el historial). (`dff58ed`)

### Configuración requerida en Supabase
Ejecutar en SQL Editor: `013_devoluciones.sql` y `014_stock_ventas.sql` (versión final, con el bloqueo de anular con devolución). **Ambos ya aplicados y verificados en producción.**

---

## 2026-10-01

### Ventas / POS
- **Fotos grandes en la búsqueda**: cada resultado muestra la imagen del producto al costado (~4 líneas de alto) con nombre y precio más grandes, para reconocerlo de un vistazo. Al elegirlo queda como línea en el carrito y el buscador queda listo para el siguiente. En celular la foto es algo más chica. (`dc9a55f`)
- **Filtro por período** en el listado de ventas: **Hoy · 7 días · 15 días · Mes** (mes en curso), y el selector de fecha para ver un día puntual. (`f36b5e3`)
- **Buscador arriba de la tabla** con resumen del período: cantidad de ventas y total (sin anuladas). (`f36b5e3`)
- Fix: "hoy" se calculaba en UTC, así que después de las 21 h la lista saltaba al día siguiente. Ahora usa la hora local. (`f36b5e3`)
- Fix: sumar un producto con un ítem libre ya cargado en el carrito podía romper la pantalla. (`dc9a55f`)

### Caja
- Fix: el historial de **"Últimos cierres"** se rellenaba con cierres de ejemplo inventados (secciones "Graciela" y "Marcela") cuando había menos de 3 cierres reales, y aparecían en comercios reales. Ahora sólo se muestran los cierres del comercio; si no hay, un aviso. **Cada comercio ve únicamente sus propios datos.** (`31cb5a5`)
- Fix: confirmar una distribución desde el historial de cierres daba error al refrescar. (`31cb5a5`)

---

## 2026-09-30

### Migración desde otro sistema
- **Importar clientes desde Excel**: crea o actualiza (por CUIT, DNI o nombre) y carga **saldos iniciales de Cta. Cte.** con su vencimiento; muestra el total antes de importar y no duplica si se importa dos veces. Plantilla descargable. (`74fd2ec`)
- **"Cargar saldo inicial"** uno por uno desde la cuenta del cliente (se puede anular mientras no tenga cobros). El saldo inicial no suma en ventas, reportes, dashboard ni caja. Migración: `012_saldo_inicial.sql`. (`74fd2ec`)
- **Importador de productos compatible con AppSheet**: detecta columnas, entiende precios con formato argentino, crea categorías faltantes (avisando antes), sube imágenes desde URL o carpeta y no pisa el stock al actualizar. (`3e93590`)
- Modo **"sólo actualizar existentes"** para reimportar el mismo archivo (por ejemplo, sólo para agregar fotos). (`562a03c`)

### Stock
- **"+ Nueva…"** categoría o subcategoría directamente desde la ficha del producto, sin perder lo cargado. (`a3b8bad`)

### Modo oscuro y reportes
- **Modo oscuro**: automático según el sistema o elegido (Auto / Claro / Oscuro) desde el encabezado; se recuerda por dispositivo. (`e1b7f9b`)
- **Reportes rehechos**: comparación con el período anterior, gráfico de ventas por día, aviso de productos vendidos sin costo y nueva pestaña **Cuentas corrientes** (antigüedad de deuda, clientes con saldo, cobros). (`e1b7f9b`, `fb3383d`)
- Fix: "Este mes" y "Últimos 7 días" excluían las ventas del día. (`e1b7f9b`)

### Configuración requerida en Supabase
Ejecutar en SQL Editor: `012_saldo_inicial.sql`.

---

## 2026-09-29 (tarde)

- **Tema visual "Mostrador"**: alto contraste, acento verde, tipografía IBM Plex, montos con 2 decimales cuando no son enteros. (`ffe15dc`)
- Fix: **"¿Olvidaste tu contraseña?"** lleva al formulario de nueva contraseña. (`b4c554b`)
- Fix: un link de invitación/recuperación usado o vencido ya no queda "Verificando enlace…" para siempre; ofrece pedir uno nuevo. (`71ef3cd`)

---

## 2026-09-29

### Cuenta corriente de clientes
- **Ventas a Cta. Cte. con vencimiento por venta**: 7 / 14 / 30 días o fecha manual; por defecto el plazo del cliente (30 días). Requiere elegir cliente. (`a13a2c6`)
- **Avisos en el POS** si el cliente tiene deuda vencida o supera su límite de crédito (avisa, no bloquea). (`a13a2c6`)
- **Registro de cobros** con imputación a lo que vence primero; si es en efectivo y hay caja abierta, entra como ingreso de caja. (`a13a2c6`)
- **Historial por venta**: cada deuda muestra su origen (productos, recargo, pago en el momento, vencimiento), los pagos aplicados con el saldo restante y la cancelación. (`f266aad`)
- Recordatorio por **WhatsApp** y tarjeta **"A cobrar Cta. Cte."** en el panel de control. (`a13a2c6`)
- Migración: `010_clientes_cc.sql`.

### Ventas / POS
- **Recargo** en el carrito ($ o %, con concepto) que se suma al total sin tocar el precio de los productos. (`f266aad`)
- **Alta rápida de clientes** desde el buscador de la venta, con datos precargados. Búsqueda también por DNI y razón social. (`8ed5d78`)
- **Escáner de códigos con la cámara** del celular (varios productos seguidos, vibración y bip). (`404a169`)
- **POS responsive**: en celular, una columna con barra fija "Total · Cobrar". (`05be5dc`)
- **Atajos de teclado**: F2 cobrar, F3 buscar, F4 cliente, F6 recargo, F9 vaciar. (`05be5dc`)

### Modo caja
- Nueva ruta **`/pos`**: POS a pantalla completa para dejar abierto todo el día; encadena ventas, muestra lo vendido desde la apertura y mantiene la pantalla encendida. (`05be5dc`)
- La apertura se hace siempre desde el **módulo Caja** (arqueo + último cierre) y vuelve sola al modo caja. (`353d922`)

### Productos
- **Imágenes de productos** optimizadas (~20-40 KB por foto), con "Sacar foto" en el celular. Miniaturas en POS, carrito y Stock. (`913607d`)
- Código de barras cargado **escaneando con la cámara**. (`404a169`)
- Migración: `011_productos_imagenes.sql`.

### Celular
- Ficha de producto con **un solo scroll** (Proveedores ya no queda fijo a media pantalla) y tablas completas. (`404a169`)
- Botones **Cancelar / Guardar** pegados a la barra inferior, a lo ancho. (`ff6cc13`)
- Campos a 16 px (evita el zoom automático del iPhone), botones más grandes y tablas con scroll lateral. (`f266aad`)

### Rendimiento y diseño
- Páginas con carga bajo demanda y Excel descargado sólo al usarse: el bundle inicial bajó de **1.311 KB a 577 KB**. (`f266aad`)
- Pulido visual global: números alineados en tablas, foco visible con teclado, halo en campos, respuesta al tocar botones. (`f266aad`)

### Configuración requerida en Supabase
Ejecutar en SQL Editor, en orden: `010_clientes_cc.sql` y `011_productos_imagenes.sql`.
