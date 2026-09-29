# Historial de cambios — GestCom

Formato: lo más reciente arriba. Entre paréntesis, el commit.

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
