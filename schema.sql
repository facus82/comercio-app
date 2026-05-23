-- ============================================================
--  COMERCIO-APP  |  Schema SQL para Supabase
--  Librería / Kiosco  |  Argentina
--  Roles: propietario · cajero · data_entry · readonly
--
--  INSTRUCCIONES:
--  Ejecutar BLOQUE 1 completo, luego BLOQUE 2 completo.
--  Cada bloque puede pegarse por separado en el SQL Editor.
-- ============================================================


-- ============================================================
-- ██████████████  BLOQUE 1 — TABLAS  ████████████████████████
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Trigger helper para updated_at (no referencia ninguna tabla)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 1. COMERCIOS
-- ============================================================
CREATE TABLE comercios (
  id                       UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre                   TEXT        NOT NULL,
  nombre_fantasia          TEXT,
  cuit                     TEXT        UNIQUE,
  condicion_iva            TEXT        NOT NULL DEFAULT 'Responsable Inscripto'
                             CHECK (condicion_iva IN (
                               'Responsable Inscripto','Monotributista',
                               'Exento','Consumidor Final')),
  ingresos_brutos          TEXT,
  inicio_actividades       DATE,
  direccion                TEXT,
  localidad                TEXT        DEFAULT 'La Rioja',
  provincia                TEXT        DEFAULT 'La Rioja',
  telefono                 TEXT,
  email                    TEXT,
  logo_url                 TEXT,
  moneda_simbolo           TEXT        NOT NULL DEFAULT '$',
  iva_defecto              NUMERIC(5,2) NOT NULL DEFAULT 21,
  ticket_pie               TEXT        DEFAULT '¡Gracias por su compra!',
  presupuesto_validez_dias INTEGER     DEFAULT 15,
  activo                   BOOLEAN     NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tg_comercios_updated_at
  BEFORE UPDATE ON comercios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 2. CENTROS_COSTOS
-- ============================================================
CREATE TABLE centros_costos (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id UUID        NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  nombre      TEXT        NOT NULL,
  descripcion TEXT,
  color       TEXT        DEFAULT '#3b82f6',
  activo      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, nombre)
);

CREATE INDEX idx_centros_costos_comercio ON centros_costos(comercio_id);

-- ============================================================
-- 3. USUARIOS
-- ============================================================
CREATE TABLE usuarios (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  comercio_id UUID        NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  nombre      TEXT        NOT NULL,
  apellido    TEXT,
  email       TEXT        NOT NULL,
  rol         TEXT        NOT NULL DEFAULT 'cajero'
                CHECK (rol IN ('propietario','cajero','data_entry','readonly')),
  avatar_url  TEXT,
  activo      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tg_usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_usuarios_comercio ON usuarios(comercio_id);
CREATE INDEX idx_usuarios_rol      ON usuarios(rol);

-- ============================================================
-- 4. CATEGORIAS
-- ============================================================
CREATE TABLE categorias (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id UUID        NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  nombre      TEXT        NOT NULL,
  descripcion TEXT,
  color       TEXT        DEFAULT '#3b82f6',
  icono       TEXT,
  activo      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, nombre)
);

CREATE INDEX idx_categorias_comercio ON categorias(comercio_id);

-- ============================================================
-- 5. PRODUCTOS  (proveedor_id FK diferida, se agrega luego)
-- ============================================================
CREATE TABLE productos (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id      UUID         NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  centro_costo_id  UUID         REFERENCES centros_costos(id) ON DELETE SET NULL,
  categoria_id     UUID         REFERENCES categorias(id) ON DELETE SET NULL,
  proveedor_id     UUID,
  codigo           TEXT,
  codigo_barras    TEXT,
  nombre           TEXT         NOT NULL,
  descripcion      TEXT,
  precio_costo     NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_venta     NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_mayorista NUMERIC(12,2),
  iva_porcentaje   NUMERIC(5,2)  NOT NULL DEFAULT 21,
  stock_actual     NUMERIC(10,3) NOT NULL DEFAULT 0,
  stock_minimo     NUMERIC(10,3) NOT NULL DEFAULT 0,
  stock_maximo     NUMERIC(10,3),
  unidad_medida    TEXT         NOT NULL DEFAULT 'unidad',
  es_servicio      BOOLEAN      NOT NULL DEFAULT false,
  controla_stock   BOOLEAN      NOT NULL DEFAULT true,
  controla_lotes   BOOLEAN      NOT NULL DEFAULT false,
  imagen_url       TEXT,
  notas            TEXT,
  activo           BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, codigo),
  UNIQUE (comercio_id, codigo_barras)
);

CREATE TRIGGER tg_productos_updated_at
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_productos_comercio      ON productos(comercio_id);
CREATE INDEX idx_productos_codigo_barras ON productos(codigo_barras);
CREATE INDEX idx_productos_categoria     ON productos(categoria_id);
CREATE INDEX idx_productos_proveedor     ON productos(proveedor_id);
CREATE INDEX idx_productos_activo        ON productos(activo);

-- ============================================================
-- 6. LOTES  (proveedor_id y compra_item_id FKs diferidas)
-- ============================================================
CREATE TABLE lotes (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id       UUID         NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  numero_lote       TEXT,
  fecha_vencimiento DATE,
  fecha_fabricacion DATE,
  cantidad_inicial  NUMERIC(10,3) NOT NULL DEFAULT 0,
  cantidad_actual   NUMERIC(10,3) NOT NULL DEFAULT 0,
  precio_costo      NUMERIC(12,2),
  proveedor_id      UUID,
  compra_item_id    UUID,
  estado            TEXT         NOT NULL DEFAULT 'activo'
                      CHECK (estado IN ('activo','agotado','vencido','retirado')),
  notas             TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER tg_lotes_updated_at
  BEFORE UPDATE ON lotes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_lotes_producto    ON lotes(producto_id);
CREATE INDEX idx_lotes_vencimiento ON lotes(fecha_vencimiento);
CREATE INDEX idx_lotes_estado      ON lotes(estado);

-- ============================================================
-- 7. PRECIO_HISTORIAL
-- ============================================================
CREATE TABLE precio_historial (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id      UUID         NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  precio_costo     NUMERIC(12,2),
  precio_venta     NUMERIC(12,2),
  precio_mayorista NUMERIC(12,2),
  motivo           TEXT,
  usuario_id       UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_precio_historial_producto ON precio_historial(producto_id, created_at DESC);

-- ============================================================
-- 8. CLIENTES
-- ============================================================
CREATE TABLE clientes (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id    UUID         NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  nombre         TEXT         NOT NULL,
  apellido       TEXT,
  razon_social   TEXT,
  dni            TEXT,
  cuit           TEXT,
  telefono       TEXT,
  email          TEXT,
  direccion      TEXT,
  localidad      TEXT,
  provincia      TEXT         DEFAULT 'La Rioja',
  tipo           TEXT         NOT NULL DEFAULT 'consumidor_final'
                   CHECK (tipo IN ('consumidor_final','cuenta_corriente','mayorista')),
  limite_credito NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_cuenta   NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas          TEXT,
  activo         BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, dni),
  UNIQUE (comercio_id, cuit)
);

CREATE TRIGGER tg_clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_clientes_comercio ON clientes(comercio_id);
CREATE INDEX idx_clientes_tipo     ON clientes(tipo);

-- ============================================================
-- 9. PROVEEDORES
-- ============================================================
CREATE TABLE proveedores (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id     UUID         NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  razon_social    TEXT         NOT NULL,
  nombre_fantasia TEXT,
  cuit            TEXT,
  telefono        TEXT,
  email           TEXT,
  direccion       TEXT,
  localidad       TEXT,
  provincia       TEXT         DEFAULT 'La Rioja',
  condicion_iva   TEXT         DEFAULT 'Responsable Inscripto',
  plazo_pago_dias INTEGER      DEFAULT 30,
  notas           TEXT,
  activo          BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, cuit)
);

CREATE TRIGGER tg_proveedores_updated_at
  BEFORE UPDATE ON proveedores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_proveedores_comercio ON proveedores(comercio_id);

-- FKs diferidas ahora que proveedores existe
ALTER TABLE productos ADD CONSTRAINT fk_productos_proveedor
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL;

ALTER TABLE lotes ADD CONSTRAINT fk_lotes_proveedor
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL;

-- ============================================================
-- 10. PROVEEDORES_CC
-- ============================================================
CREATE TABLE proveedores_cc (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  proveedor_id    UUID         NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  tipo            TEXT         NOT NULL
                    CHECK (tipo IN ('cargo','pago','nota_credito','ajuste')),
  monto           NUMERIC(12,2) NOT NULL,
  saldo_anterior  NUMERIC(12,2) NOT NULL,
  saldo_posterior NUMERIC(12,2) NOT NULL,
  concepto        TEXT         NOT NULL,
  referencia_tipo TEXT,
  referencia_id   UUID,
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_proveedores_cc_proveedor ON proveedores_cc(proveedor_id, created_at DESC);

-- ============================================================
-- 11. COMPRAS
-- ============================================================
CREATE TABLE compras (
  id                 UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id        UUID         NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  proveedor_id       UUID         NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  numero             TEXT,
  fecha              DATE         NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento  DATE,
  tipo_comprobante   TEXT         NOT NULL DEFAULT 'factura'
                       CHECK (tipo_comprobante IN (
                         'factura','factura_a','factura_b','factura_c',
                         'remito','ticket','nota_credito')),
  numero_comprobante TEXT,
  subtotal           NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento_monto    NUMERIC(12,2) NOT NULL DEFAULT 0,
  iva_monto          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total              NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado             TEXT         NOT NULL DEFAULT 'pendiente'
                       CHECK (estado IN ('pendiente','pagada','parcial','anulada')),
  notas              TEXT,
  usuario_id         UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, numero)
);

CREATE TRIGGER tg_compras_updated_at
  BEFORE UPDATE ON compras
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_compras_comercio  ON compras(comercio_id);
CREATE INDEX idx_compras_fecha     ON compras(fecha DESC);
CREATE INDEX idx_compras_proveedor ON compras(proveedor_id);
CREATE INDEX idx_compras_estado    ON compras(estado);

-- ============================================================
-- 12. COMPRA_ITEMS
-- ============================================================
CREATE TABLE compra_items (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  compra_id       UUID         NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id     UUID         NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  lote_id         UUID         REFERENCES lotes(id) ON DELETE SET NULL,
  cantidad        NUMERIC(10,3) NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL,
  iva_porcentaje  NUMERIC(5,2)  NOT NULL DEFAULT 21,
  descuento_pct   NUMERIC(5,2)  NOT NULL DEFAULT 0,
  subtotal        NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_compra_items_compra   ON compra_items(compra_id);
CREATE INDEX idx_compra_items_producto ON compra_items(producto_id);

-- FK diferida de lotes → compra_items
ALTER TABLE lotes ADD CONSTRAINT fk_lotes_compra_item
  FOREIGN KEY (compra_item_id) REFERENCES compra_items(id) ON DELETE SET NULL;

-- ============================================================
-- 13. VENTAS
-- ============================================================
CREATE TABLE ventas (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id     UUID         NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  cliente_id      UUID         REFERENCES clientes(id) ON DELETE SET NULL,
  numero          TEXT,
  fecha           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento_monto NUMERIC(12,2) NOT NULL DEFAULT 0,
  recargo_monto   NUMERIC(12,2) NOT NULL DEFAULT 0,
  iva_monto       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado          TEXT         NOT NULL DEFAULT 'completada'
                    CHECK (estado IN ('completada','anulada','pendiente')),
  canal           TEXT         NOT NULL DEFAULT 'mostrador'
                    CHECK (canal IN ('mostrador','whatsapp','telefono','web')),
  notas           TEXT,
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, numero)
);

CREATE INDEX idx_ventas_comercio ON ventas(comercio_id);
CREATE INDEX idx_ventas_fecha    ON ventas(fecha DESC);
CREATE INDEX idx_ventas_cliente  ON ventas(cliente_id);
CREATE INDEX idx_ventas_estado   ON ventas(estado);

-- ============================================================
-- 14. VENTA_COMPROBANTES
-- ============================================================
CREATE TABLE venta_comprobantes (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id        UUID        NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  tipo            TEXT        NOT NULL
                    CHECK (tipo IN (
                      'ticket','factura_a','factura_b','factura_c',
                      'nota_credito_a','nota_credito_b','nota_credito_c',
                      'remito')),
  punto_venta     TEXT,
  numero          TEXT,
  cae             TEXT,
  cae_vencimiento DATE,
  qr_data         TEXT,
  pdf_url         TEXT,
  estado          TEXT        NOT NULL DEFAULT 'emitido'
                    CHECK (estado IN ('emitido','anulado')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_venta_comprobantes_venta ON venta_comprobantes(venta_id);

-- ============================================================
-- 15. VENTA_ITEMS
-- ============================================================
CREATE TABLE venta_items (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id        UUID         NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id     UUID         NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  lote_id         UUID         REFERENCES lotes(id) ON DELETE SET NULL,
  descripcion     TEXT         NOT NULL,
  cantidad        NUMERIC(10,3) NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL,
  descuento_pct   NUMERIC(5,2)  NOT NULL DEFAULT 0,
  iva_porcentaje  NUMERIC(5,2)  NOT NULL DEFAULT 21,
  subtotal        NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_venta_items_venta    ON venta_items(venta_id);
CREATE INDEX idx_venta_items_producto ON venta_items(producto_id);

-- ============================================================
-- 16. VENTA_PAGOS
-- ============================================================
CREATE TABLE venta_pagos (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id   UUID         NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  medio_pago TEXT         NOT NULL
               CHECK (medio_pago IN (
                 'efectivo','tarjeta_debito','tarjeta_credito',
                 'transferencia','mercado_pago','cuenta_corriente','otro')),
  monto      NUMERIC(12,2) NOT NULL,
  referencia TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_venta_pagos_venta ON venta_pagos(venta_id);

-- ============================================================
-- 17. PRESUPUESTOS
-- ============================================================
CREATE TABLE presupuestos (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id      UUID         NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  cliente_id       UUID         REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre   TEXT,
  numero           TEXT,
  fecha            DATE         NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento_monto  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total            NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado           TEXT         NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN (
                       'pendiente','aprobado','rechazado','vencido','convertido')),
  notas            TEXT,
  venta_id         UUID         REFERENCES ventas(id) ON DELETE SET NULL,
  usuario_id       UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (comercio_id, numero)
);

CREATE TRIGGER tg_presupuestos_updated_at
  BEFORE UPDATE ON presupuestos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_presupuestos_comercio ON presupuestos(comercio_id);
CREATE INDEX idx_presupuestos_cliente  ON presupuestos(cliente_id);
CREATE INDEX idx_presupuestos_estado   ON presupuestos(estado);

-- ============================================================
-- 18. PRESUPUESTO_ITEMS
-- ============================================================
CREATE TABLE presupuesto_items (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  presupuesto_id  UUID         NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  producto_id     UUID         REFERENCES productos(id) ON DELETE SET NULL,
  descripcion     TEXT         NOT NULL,
  cantidad        NUMERIC(10,3) NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL,
  descuento_pct   NUMERIC(5,2)  NOT NULL DEFAULT 0,
  subtotal        NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_presupuesto_items_presupuesto ON presupuesto_items(presupuesto_id);

-- ============================================================
-- 19. CIERRES_CAJA
-- ============================================================
CREATE TABLE cierres_caja (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id           UUID         NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  usuario_id            UUID         NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  fecha_apertura        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  fecha_cierre          TIMESTAMPTZ,
  saldo_apertura        NUMERIC(12,2) NOT NULL DEFAULT 0,
  efectivo_contado      NUMERIC(12,2),
  total_ventas_efectivo NUMERIC(12,2) DEFAULT 0,
  total_ventas_debito   NUMERIC(12,2) DEFAULT 0,
  total_ventas_credito  NUMERIC(12,2) DEFAULT 0,
  total_ventas_transfer NUMERIC(12,2) DEFAULT 0,
  total_ventas_mp       NUMERIC(12,2) DEFAULT 0,
  total_ventas_cc       NUMERIC(12,2) DEFAULT 0,
  total_egresos         NUMERIC(12,2) DEFAULT 0,
  total_ingresos_extra  NUMERIC(12,2) DEFAULT 0,
  saldo_sistema         NUMERIC(12,2),
  diferencia            NUMERIC(12,2),
  estado                TEXT         NOT NULL DEFAULT 'abierta'
                          CHECK (estado IN ('abierta','cerrada')),
  notas_cierre          TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_cierres_caja_comercio ON cierres_caja(comercio_id);
CREATE INDEX idx_cierres_caja_estado   ON cierres_caja(estado);

-- ============================================================
-- 20. STOCK_MOVIMIENTOS
-- ============================================================
CREATE TABLE stock_movimientos (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id     UUID         NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  producto_id     UUID         NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  lote_id         UUID         REFERENCES lotes(id) ON DELETE SET NULL,
  tipo            TEXT         NOT NULL
                    CHECK (tipo IN ('entrada','salida','ajuste','devolucion','transferencia')),
  cantidad        NUMERIC(10,3) NOT NULL,
  stock_anterior  NUMERIC(10,3) NOT NULL,
  stock_posterior NUMERIC(10,3) NOT NULL,
  precio_unitario NUMERIC(12,2),
  motivo          TEXT,
  referencia_tipo TEXT,
  referencia_id   UUID,
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_mov_comercio ON stock_movimientos(comercio_id);
CREATE INDEX idx_stock_mov_producto ON stock_movimientos(producto_id, created_at DESC);
CREATE INDEX idx_stock_mov_tipo     ON stock_movimientos(tipo);

-- ============================================================
-- 21. OBLIGACIONES_IMP
-- ============================================================
CREATE TABLE obligaciones_imp (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id         UUID         NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  nombre              TEXT         NOT NULL,
  categoria           TEXT         NOT NULL DEFAULT 'otro'
                        CHECK (categoria IN (
                          'impuesto_nacional','impuesto_provincial','impuesto_municipal',
                          'servicio','alquiler','empleado','proveedor','seguro','otro')),
  organismo           TEXT,
  monto_estimado      NUMERIC(12,2) NOT NULL,
  dia_vencimiento     INTEGER      CHECK (dia_vencimiento BETWEEN 1 AND 31),
  periodicidad        TEXT         NOT NULL DEFAULT 'mensual'
                        CHECK (periodicidad IN (
                          'diario','semanal','mensual','bimestral',
                          'trimestral','semestral','anual','unico')),
  proximo_vencimiento DATE,
  proveedor_id        UUID         REFERENCES proveedores(id) ON DELETE SET NULL,
  alerta_dias_antes   INTEGER      DEFAULT 5,
  notas               TEXT,
  activo              BOOLEAN      NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER tg_obligaciones_updated_at
  BEFORE UPDATE ON obligaciones_imp
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_obligaciones_comercio    ON obligaciones_imp(comercio_id);
CREATE INDEX idx_obligaciones_vencimiento ON obligaciones_imp(proximo_vencimiento);

-- Tabla auxiliar de pagos (no cuenta como tabla #22 — es soporte de obligaciones_imp)
CREATE TABLE obligaciones_pagos (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  obligacion_id UUID         NOT NULL REFERENCES obligaciones_imp(id) ON DELETE CASCADE,
  fecha_pago    DATE         NOT NULL DEFAULT CURRENT_DATE,
  monto         NUMERIC(12,2) NOT NULL,
  medio_pago    TEXT         NOT NULL DEFAULT 'transferencia',
  comprobante   TEXT,
  periodo       TEXT,
  notas         TEXT,
  usuario_id    UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_obligaciones_pagos ON obligaciones_pagos(obligacion_id, created_at DESC);

-- ============================================================
-- SEED INICIAL
-- ============================================================
INSERT INTO comercios (
  nombre, nombre_fantasia, condicion_iva,
  localidad, provincia, moneda_simbolo, iva_defecto, ticket_pie
) VALUES (
  'Mi Librería & Kiosco', 'LibroKiosco', 'Responsable Inscripto',
  'La Rioja', 'La Rioja', '$', 21, '¡Gracias por su compra!'
);


-- ============================================================
-- ██████████████  BLOQUE 2 — RLS Y POLICIES  ████████████████
-- ============================================================
-- Ejecutar DESPUÉS del Bloque 1.
-- auth_rol() se crea aquí porque requiere que public.usuarios exista.
-- ============================================================

-- Función helper: devuelve el rol del usuario autenticado
CREATE OR REPLACE FUNCTION auth_rol()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT rol FROM public.usuarios WHERE id = auth.uid()
$$;

-- ── Habilitar RLS ──────────────────────────────────────────
ALTER TABLE comercios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE centros_costos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias         ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE precio_historial   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores_cc     ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras            ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_comprobantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_pagos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cierres_caja       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movimientos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligaciones_imp   ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligaciones_pagos ENABLE ROW LEVEL SECURITY;

-- ── COMERCIOS ─────────────────────────────────────────────
CREATE POLICY "comercio_select" ON comercios
  FOR SELECT TO authenticated
  USING (id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "comercio_update" ON comercios
  FOR UPDATE TO authenticated
  USING (
    id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() = 'propietario'
  );

-- ── CENTROS_COSTOS ────────────────────────────────────────
CREATE POLICY "cc_select" ON centros_costos
  FOR SELECT TO authenticated
  USING (comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "cc_write" ON centros_costos
  FOR ALL TO authenticated
  USING (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','data_entry')
  )
  WITH CHECK (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','data_entry')
  );

-- ── USUARIOS ──────────────────────────────────────────────
CREATE POLICY "usuarios_select" ON usuarios
  FOR SELECT TO authenticated
  USING (comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "usuarios_write" ON usuarios
  FOR ALL TO authenticated
  USING (auth_rol() = 'propietario')
  WITH CHECK (auth_rol() = 'propietario');

-- ── CATEGORIAS ────────────────────────────────────────────
CREATE POLICY "cat_select" ON categorias
  FOR SELECT TO authenticated
  USING (comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "cat_write" ON categorias
  FOR ALL TO authenticated
  USING (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','data_entry')
  )
  WITH CHECK (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','data_entry')
  );

-- ── PRODUCTOS ─────────────────────────────────────────────
CREATE POLICY "prod_select" ON productos
  FOR SELECT TO authenticated
  USING (comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "prod_write" ON productos
  FOR ALL TO authenticated
  USING (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','data_entry')
  )
  WITH CHECK (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','data_entry')
  );

-- ── LOTES ─────────────────────────────────────────────────
CREATE POLICY "lotes_select" ON lotes
  FOR SELECT TO authenticated
  USING (
    producto_id IN (
      SELECT id FROM productos
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
  );

CREATE POLICY "lotes_write" ON lotes
  FOR ALL TO authenticated
  USING (
    producto_id IN (
      SELECT id FROM productos
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','data_entry')
  )
  WITH CHECK (
    producto_id IN (
      SELECT id FROM productos
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','data_entry')
  );

-- ── PRECIO_HISTORIAL ──────────────────────────────────────
CREATE POLICY "ph_select" ON precio_historial
  FOR SELECT TO authenticated
  USING (
    producto_id IN (
      SELECT id FROM productos
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
  );

CREATE POLICY "ph_insert" ON precio_historial
  FOR INSERT TO authenticated
  WITH CHECK (
    producto_id IN (
      SELECT id FROM productos
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','data_entry')
  );

-- ── CLIENTES ──────────────────────────────────────────────
CREATE POLICY "cli_select" ON clientes
  FOR SELECT TO authenticated
  USING (comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "cli_write" ON clientes
  FOR ALL TO authenticated
  USING (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','cajero','data_entry')
  )
  WITH CHECK (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','cajero','data_entry')
  );

-- ── PROVEEDORES ───────────────────────────────────────────
CREATE POLICY "prov_select" ON proveedores
  FOR SELECT TO authenticated
  USING (comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "prov_write" ON proveedores
  FOR ALL TO authenticated
  USING (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','data_entry')
  )
  WITH CHECK (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','data_entry')
  );

-- ── PROVEEDORES_CC ────────────────────────────────────────
CREATE POLICY "pcc_select" ON proveedores_cc
  FOR SELECT TO authenticated
  USING (
    proveedor_id IN (
      SELECT id FROM proveedores
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
  );

CREATE POLICY "pcc_insert" ON proveedores_cc
  FOR INSERT TO authenticated
  WITH CHECK (
    proveedor_id IN (
      SELECT id FROM proveedores
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','data_entry')
  );

-- ── COMPRAS ───────────────────────────────────────────────
CREATE POLICY "comp_select" ON compras
  FOR SELECT TO authenticated
  USING (comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "comp_write" ON compras
  FOR ALL TO authenticated
  USING (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','data_entry')
  )
  WITH CHECK (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','data_entry')
  );

-- ── COMPRA_ITEMS ──────────────────────────────────────────
CREATE POLICY "ci_select" ON compra_items
  FOR SELECT TO authenticated
  USING (
    compra_id IN (
      SELECT id FROM compras
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
  );

CREATE POLICY "ci_write" ON compra_items
  FOR ALL TO authenticated
  USING (
    compra_id IN (
      SELECT id FROM compras
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','data_entry')
  )
  WITH CHECK (
    compra_id IN (
      SELECT id FROM compras
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','data_entry')
  );

-- ── VENTAS ────────────────────────────────────────────────
CREATE POLICY "ven_select" ON ventas
  FOR SELECT TO authenticated
  USING (comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "ven_write" ON ventas
  FOR ALL TO authenticated
  USING (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','cajero')
  )
  WITH CHECK (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','cajero')
  );

-- ── VENTA_COMPROBANTES ────────────────────────────────────
CREATE POLICY "vcomp_select" ON venta_comprobantes
  FOR SELECT TO authenticated
  USING (
    venta_id IN (
      SELECT id FROM ventas
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
  );

CREATE POLICY "vcomp_write" ON venta_comprobantes
  FOR ALL TO authenticated
  USING (
    venta_id IN (
      SELECT id FROM ventas
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','cajero')
  )
  WITH CHECK (
    venta_id IN (
      SELECT id FROM ventas
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','cajero')
  );

-- ── VENTA_ITEMS ───────────────────────────────────────────
CREATE POLICY "vi_select" ON venta_items
  FOR SELECT TO authenticated
  USING (
    venta_id IN (
      SELECT id FROM ventas
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
  );

CREATE POLICY "vi_write" ON venta_items
  FOR ALL TO authenticated
  USING (
    venta_id IN (
      SELECT id FROM ventas
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','cajero')
  )
  WITH CHECK (
    venta_id IN (
      SELECT id FROM ventas
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','cajero')
  );

-- ── VENTA_PAGOS ───────────────────────────────────────────
CREATE POLICY "vp_select" ON venta_pagos
  FOR SELECT TO authenticated
  USING (
    venta_id IN (
      SELECT id FROM ventas
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
  );

CREATE POLICY "vp_write" ON venta_pagos
  FOR ALL TO authenticated
  USING (
    venta_id IN (
      SELECT id FROM ventas
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','cajero')
  )
  WITH CHECK (
    venta_id IN (
      SELECT id FROM ventas
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','cajero')
  );

-- ── PRESUPUESTOS ──────────────────────────────────────────
CREATE POLICY "pres_select" ON presupuestos
  FOR SELECT TO authenticated
  USING (comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "pres_write" ON presupuestos
  FOR ALL TO authenticated
  USING (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','cajero','data_entry')
  )
  WITH CHECK (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','cajero','data_entry')
  );

-- ── PRESUPUESTO_ITEMS ─────────────────────────────────────
CREATE POLICY "pi_select" ON presupuesto_items
  FOR SELECT TO authenticated
  USING (
    presupuesto_id IN (
      SELECT id FROM presupuestos
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
  );

CREATE POLICY "pi_write" ON presupuesto_items
  FOR ALL TO authenticated
  USING (
    presupuesto_id IN (
      SELECT id FROM presupuestos
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','cajero','data_entry')
  )
  WITH CHECK (
    presupuesto_id IN (
      SELECT id FROM presupuestos
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','cajero','data_entry')
  );

-- ── CIERRES_CAJA ──────────────────────────────────────────
CREATE POLICY "ck_select" ON cierres_caja
  FOR SELECT TO authenticated
  USING (comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "ck_write" ON cierres_caja
  FOR ALL TO authenticated
  USING (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','cajero')
  )
  WITH CHECK (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','cajero')
  );

-- ── STOCK_MOVIMIENTOS ─────────────────────────────────────
CREATE POLICY "sm_select" ON stock_movimientos
  FOR SELECT TO authenticated
  USING (comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "sm_insert" ON stock_movimientos
  FOR INSERT TO authenticated
  WITH CHECK (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','cajero','data_entry')
  );

-- ── OBLIGACIONES_IMP ──────────────────────────────────────
CREATE POLICY "ob_select" ON obligaciones_imp
  FOR SELECT TO authenticated
  USING (comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "ob_write" ON obligaciones_imp
  FOR ALL TO authenticated
  USING (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','data_entry')
  )
  WITH CHECK (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','data_entry')
  );

-- ── OBLIGACIONES_PAGOS ────────────────────────────────────
CREATE POLICY "opag_select" ON obligaciones_pagos
  FOR SELECT TO authenticated
  USING (
    obligacion_id IN (
      SELECT id FROM obligaciones_imp
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
  );

CREATE POLICY "opag_write" ON obligaciones_pagos
  FOR ALL TO authenticated
  USING (
    obligacion_id IN (
      SELECT id FROM obligaciones_imp
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','data_entry')
  )
  WITH CHECK (
    obligacion_id IN (
      SELECT id FROM obligaciones_imp
      WHERE comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    )
    AND auth_rol() IN ('propietario','data_entry')
  );
