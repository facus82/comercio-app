-- ============================================================
--  COMERCIO-APP  |  Datos de prueba
--  Librería Zona Norte — La Rioja Capital
--  Generado: 2026-05-22
--
--  INSTRUCCIONES:
--  1. Ejecutar en Supabase → SQL Editor
--  2. El comercio seed inicial del schema.sql ya existe:
--     reemplazarlo con UPDATE o usar el ID correcto.
--  3. Este archivo usa UUIDs fijos para FK consistentes.
--  4. IMPORTANTE: el campo usuario_id en cierres_caja es NOT NULL
--     (REFERENCES usuarios) — requiere que exista un usuario real.
--     Reemplazar :USER_ID por el UUID del usuario logueado.
-- ============================================================

BEGIN;

-- ============================================================
-- 0. LIMPIAR datos del seed inicial del schema (el comercio
--    vacío que se inserta en el BLOQUE 1)
-- ============================================================
-- Si ya existe un comercio del seed inicial, lo eliminamos
-- para reemplazarlo con los datos de prueba completos.
-- (En producción comentar este DELETE)
DELETE FROM comercios WHERE nombre = 'Mi Librería & Kiosco';

-- ============================================================
-- VARIABLES / IDs FIJOS
-- ============================================================
-- Usamos DO $$ para declarar variables y simplificar referencias
-- (Supabase SQL Editor admite bloques PL/pgSQL)
-- ============================================================

DO $$
DECLARE

  -- ── IDs principales ──────────────────────────────────────
  v_comercio   UUID := 'a1000000-0000-0000-0000-000000000001';

  -- Centros de costos
  v_cc_marcela UUID := 'a2000000-0000-0000-0000-000000000001';
  v_cc_graciela UUID := 'a2000000-0000-0000-0000-000000000002';

  -- Categorías
  v_cat_papeleria   UUID := 'a3000000-0000-0000-0000-000000000001';
  v_cat_escolares   UUID := 'a3000000-0000-0000-0000-000000000002';
  v_cat_informatica UUID := 'a3000000-0000-0000-0000-000000000003';
  v_cat_kiosco      UUID := 'a3000000-0000-0000-0000-000000000004';
  v_cat_merceria    UUID := 'a3000000-0000-0000-0000-000000000005';
  v_cat_agendas     UUID := 'a3000000-0000-0000-0000-000000000006';

  -- Proveedores
  v_prov_norte     UUID := 'a4000000-0000-0000-0000-000000000001';
  v_prov_papel     UUID := 'a4000000-0000-0000-0000-000000000002';
  v_prov_textil    UUID := 'a4000000-0000-0000-0000-000000000003';
  v_prov_kapelusz  UUID := 'a4000000-0000-0000-0000-000000000004';

  -- Productos (20)
  v_p_resma       UUID := 'a5000000-0000-0000-0000-000000000001'; -- Resma A4 x500
  v_p_cuaderno80  UUID := 'a5000000-0000-0000-0000-000000000002'; -- Cuaderno 80 hojas
  v_p_cuaderno48  UUID := 'a5000000-0000-0000-0000-000000000003'; -- Cuaderno 48 hojas
  v_p_lapbic      UUID := 'a5000000-0000-0000-0000-000000000004'; -- Lapicera BIC c/12
  v_p_marcador    UUID := 'a5000000-0000-0000-0000-000000000005'; -- Marcador perm. Faber
  v_p_tonner      UUID := 'a5000000-0000-0000-0000-000000000006'; -- Tóner HP 85A (stock bajo)
  v_p_cartuchoink UUID := 'a5000000-0000-0000-0000-000000000007'; -- Cartucho Epson T664 negro
  v_p_carpeta     UUID := 'a5000000-0000-0000-0000-000000000008'; -- Carpeta 3 argollas A4
  v_p_yerba       UUID := 'a5000000-0000-0000-0000-000000000009'; -- Yerba Taragüi 1kg (lotes)
  v_p_dulce       UUID := 'a5000000-0000-0000-0000-000000000010'; -- Dulce de leche Vauquita 400g (lotes)
  v_p_galletitas  UUID := 'a5000000-0000-0000-0000-000000000011'; -- Galletitas Oreo x3 pack (lotes)
  v_p_gaseosa     UUID := 'a5000000-0000-0000-0000-000000000012'; -- Gaseosa Coca Cola 1.5L (stock bajo)
  v_p_agua        UUID := 'a5000000-0000-0000-0000-000000000013'; -- Agua Villa del Sur 1.5L
  v_p_hilo_negro  UUID := 'a5000000-0000-0000-0000-000000000014'; -- Hilo Nylon Negro N°10
  v_p_hilo_blanco UUID := 'a5000000-0000-0000-0000-000000000015'; -- Hilo Nylon Blanco N°10
  v_p_cierre25    UUID := 'a5000000-0000-0000-0000-000000000016'; -- Cierre plástico 25cm
  v_p_cierre50    UUID := 'a5000000-0000-0000-0000-000000000017'; -- Cierre metal 50cm (stock bajo)
  v_p_agenda2026  UUID := 'a5000000-0000-0000-0000-000000000018'; -- Agenda 2026 Deluxe (promo)
  v_p_agenda_prac UUID := 'a5000000-0000-0000-0000-000000000019'; -- Agenda 2026 Práctica (promo)
  v_p_libro_mat   UUID := 'a5000000-0000-0000-0000-000000000020'; -- Libro Matemática 6to

  -- Lotes (para productos de kiosco)
  v_lote_yerba1   UUID := 'a6000000-0000-0000-0000-000000000001';
  v_lote_dulce1   UUID := 'a6000000-0000-0000-0000-000000000002';
  v_lote_galleta1 UUID := 'a6000000-0000-0000-0000-000000000003';
  v_lote_yerba2   UUID := 'a6000000-0000-0000-0000-000000000004';
  v_lote_dulce2   UUID := 'a6000000-0000-0000-0000-000000000005';

  -- Clientes
  v_cli_colegio  UUID := 'a7000000-0000-0000-0000-000000000001';
  v_cli_muni     UUID := 'a7000000-0000-0000-0000-000000000002';
  v_cli_fabian   UUID := 'a7000000-0000-0000-0000-000000000003';
  v_cli_cf       UUID := 'a7000000-0000-0000-0000-000000000004';

  -- Compras
  v_compra1 UUID := 'a8000000-0000-0000-0000-000000000001'; -- Norte
  v_compra2 UUID := 'a8000000-0000-0000-0000-000000000002'; -- Papel y Todo
  v_compra3 UUID := 'a8000000-0000-0000-0000-000000000003'; -- Textil Rioja
  v_compra4 UUID := 'a8000000-0000-0000-0000-000000000004'; -- Kapelusz
  v_compra5 UUID := 'a8000000-0000-0000-0000-000000000005'; -- Norte (2da compra)

  -- Compra items
  v_ci_y1   UUID := 'a8100000-0000-0000-0000-000000000001';
  v_ci_d1   UUID := 'a8100000-0000-0000-0000-000000000002';
  v_ci_g1   UUID := 'a8100000-0000-0000-0000-000000000003';
  v_ci_r1   UUID := 'a8100000-0000-0000-0000-000000000004';
  v_ci_c1   UUID := 'a8100000-0000-0000-0000-000000000005';
  v_ci_y2   UUID := 'a8100000-0000-0000-0000-000000000006';
  v_ci_d2   UUID := 'a8100000-0000-0000-0000-000000000007';

  -- Ventas (15)
  v_v01 UUID := 'a9000000-0000-0000-0000-000000000001';
  v_v02 UUID := 'a9000000-0000-0000-0000-000000000002';
  v_v03 UUID := 'a9000000-0000-0000-0000-000000000003';
  v_v04 UUID := 'a9000000-0000-0000-0000-000000000004';
  v_v05 UUID := 'a9000000-0000-0000-0000-000000000005';
  v_v06 UUID := 'a9000000-0000-0000-0000-000000000006';
  v_v07 UUID := 'a9000000-0000-0000-0000-000000000007';
  v_v08 UUID := 'a9000000-0000-0000-0000-000000000008';
  v_v09 UUID := 'a9000000-0000-0000-0000-000000000009';
  v_v10 UUID := 'a9000000-0000-0000-0000-000000000010';
  v_v11 UUID := 'a9000000-0000-0000-0000-000000000011';
  v_v12 UUID := 'a9000000-0000-0000-0000-000000000012';
  v_v13 UUID := 'a9000000-0000-0000-0000-000000000013';
  v_v14 UUID := 'a9000000-0000-0000-0000-000000000014';
  v_v15 UUID := 'a9000000-0000-0000-0000-000000000015';

  -- Presupuestos
  v_pr01 UUID := 'b0000000-0000-0000-0000-000000000001';
  v_pr02 UUID := 'b0000000-0000-0000-0000-000000000002';
  v_pr03 UUID := 'b0000000-0000-0000-0000-000000000003';
  v_pr04 UUID := 'b0000000-0000-0000-0000-000000000004';
  v_pr05 UUID := 'b0000000-0000-0000-0000-000000000005';
  v_pr06 UUID := 'b0000000-0000-0000-0000-000000000006';

  -- Obligaciones
  v_ob01 UUID := 'b1000000-0000-0000-0000-000000000001';
  v_ob02 UUID := 'b1000000-0000-0000-0000-000000000002';
  v_ob03 UUID := 'b1000000-0000-0000-0000-000000000003';
  v_ob04 UUID := 'b1000000-0000-0000-0000-000000000004';
  v_ob05 UUID := 'b1000000-0000-0000-0000-000000000005';
  v_ob06 UUID := 'b1000000-0000-0000-0000-000000000006';
  v_ob07 UUID := 'b1000000-0000-0000-0000-000000000007';

BEGIN

-- ============================================================
-- 1. COMERCIO
-- ============================================================
INSERT INTO comercios (
  id, nombre, nombre_fantasia, cuit, condicion_iva,
  ingresos_brutos, inicio_actividades,
  direccion, localidad, provincia,
  telefono, email,
  moneda_simbolo, iva_defecto, ticket_pie, presupuesto_validez_dias
) VALUES (
  v_comercio,
  'Librería Zona Norte SRL',
  'Librería Zona Norte',
  '30-71234567-8',
  'Responsable Inscripto',
  '91-123456-7',
  '2018-03-15',
  'Av. Libertad 1250, Local 3',
  'La Rioja',
  'La Rioja',
  '3804-452188',
  'zonanorte.lr@gmail.com',
  '$', 21,
  '¡Gracias por su compra! Conserve su comprobante.',
  15
);

-- ============================================================
-- 2. CENTROS DE COSTOS
-- ============================================================
INSERT INTO centros_costos (id, comercio_id, nombre, descripcion, color) VALUES
  (v_cc_marcela,
   v_comercio,
   'Marcela',
   'Resp. Inscripto — CUIT 20-12345678-9 — Librería y papelería',
   '#6366F1'),
  (v_cc_graciela,
   v_comercio,
   'Graciela',
   'Monotributista — CUIT 27-98765432-1 — Kiosco y mercería',
   '#10B981');

-- ============================================================
-- 3. CATEGORÍAS
-- ============================================================
INSERT INTO categorias (id, comercio_id, nombre, color) VALUES
  (v_cat_papeleria,   v_comercio, 'Papelería',         '#6366F1'),
  (v_cat_escolares,   v_comercio, 'Escolares',          '#3B82F6'),
  (v_cat_informatica, v_comercio, 'Informática',        '#8B5CF6'),
  (v_cat_kiosco,      v_comercio, 'Kiosco / Almacén',  '#F59E0B'),
  (v_cat_merceria,    v_comercio, 'Mercería',           '#EC4899'),
  (v_cat_agendas,     v_comercio, 'Agendas',            '#10B981');

-- ============================================================
-- 4. PROVEEDORES
-- ============================================================
INSERT INTO proveedores (
  id, comercio_id, razon_social, nombre_fantasia,
  cuit, telefono, email, localidad, provincia,
  condicion_iva, plazo_pago_dias, notas
) VALUES
  -- 1. Distribuidora Norte
  (v_prov_norte,
   v_comercio,
   'Distribuidora Norte SA',
   'Distr. Norte',
   '30-64512300-9',
   '3804-511200',
   'ventas@distrnorte.com.ar',
   'La Rioja', 'La Rioja',
   'Responsable Inscripto', 15,
   'Mayorista alimentación y kiosco. Entrega martes y viernes.'),

  -- 2. Papel y Todo
  (v_prov_papel,
   v_comercio,
   'Papel y Todo SA',
   'Papel y Todo',
   '30-59871234-6',
   '0351-4712340',
   'pedidos@papelyodo.com.ar',
   'Córdoba', 'Córdoba',
   'Responsable Inscripto', 30,
   'Papelería, insumos de oficina y escolares. Envío a domicilio.'),

  -- 3. Textil Rioja
  (v_prov_textil,
   v_comercio,
   'Textil Rioja SRL',
   'Textil Rioja',
   '30-71890123-4',
   '3804-488900',
   'textilrioja@hotmail.com',
   'La Rioja', 'La Rioja',
   'Responsable Inscripto', 30,
   'Hilos, cierres, botones y mercería en general.'),

  -- 4. Editorial Kapelusz
  (v_prov_kapelusz,
   v_comercio,
   'Editorial Kapelusz SA',
   'Kapelusz',
   '30-50123456-0',
   '011-4308-2200',
   'distribuciones@kapelusz.com.ar',
   'Buenos Aires', 'Buenos Aires',
   'Responsable Inscripto', 0,
   'Libros escolares y textos universitarios. Solo contado.');

-- ============================================================
-- 5. PRODUCTOS (20)
-- ============================================================
-- ── Papelería / Marcela ──────────────────────────────────────
INSERT INTO productos (
  id, comercio_id, centro_costo_id, categoria_id, proveedor_id,
  codigo, nombre, descripcion,
  precio_costo, precio_venta, precio_mayorista,
  iva_porcentaje, stock_actual, stock_minimo, stock_maximo,
  unidad_medida, controla_stock, controla_lotes
) VALUES

  -- 1. Resma A4
  (v_p_resma, v_comercio, v_cc_marcela, v_cat_papeleria, v_prov_papel,
   'PAP-001', 'Resma A4 x500h 75g Benson',
   'Resma de hojas A4 75g/m² — 500 hojas — marca Benson',
   3800, 5490, 4800,
   21, 42, 10, 200,
   'resma', true, false),

  -- 2. Cuaderno 80h
  (v_p_cuaderno80, v_comercio, v_cc_marcela, v_cat_escolares, v_prov_papel,
   'ESC-001', 'Cuaderno tapa dura 80 hojas rayado',
   'Cuaderno A4 tapa dura 80 hojas rayado — colores surtidos',
   680, 980, 850,
   21, 85, 20, 300,
   'unidad', true, false),

  -- 3. Cuaderno 48h
  (v_p_cuaderno48, v_comercio, v_cc_marcela, v_cat_escolares, v_prov_papel,
   'ESC-002', 'Cuaderno tapa dura 48 hojas cuadriculado',
   'Cuaderno A4 tapa dura 48 hojas cuadriculado — colores surtidos',
   480, 720, 620,
   21, 120, 30, 400,
   'unidad', true, false),

  -- 4. Lapicera BIC (caja x12)
  (v_p_lapbic, v_comercio, v_cc_marcela, v_cat_papeleria, v_prov_papel,
   'PAP-002', 'Lapicera BIC cristal caja x12 azul',
   'Caja de 12 lapiceras BIC cristal punta media azul',
   1850, 2600, 2200,
   21, 28, 5, 100,
   'caja', true, false),

  -- 5. Marcador permanente Faber
  (v_p_marcador, v_comercio, v_cc_marcela, v_cat_papeleria, v_prov_papel,
   'PAP-003', 'Marcador permanente Faber-Castell negro',
   'Marcador permanente punta gruesa — negro',
   420, 680, 590,
   21, 55, 10, 200,
   'unidad', true, false),

  -- 6. Tóner HP 85A — stock bajo
  (v_p_tonner, v_comercio, v_cc_marcela, v_cat_informatica, v_prov_papel,
   'INF-001', 'Tóner HP LaserJet 85A (CE285A)',
   'Cartucho de tóner negro para HP LaserJet P1102/M1132/M1212',
   14500, 22800, 19500,
   21, 2, 5, 20,   -- stock_actual(2) < stock_minimo(5)
   'unidad', true, false),

  -- 7. Cartucho Epson T664 negro
  (v_p_cartuchoink, v_comercio, v_cc_marcela, v_cat_informatica, v_prov_papel,
   'INF-002', 'Cartucho Epson T664 negro original',
   'Cartucho de tinta negra para Epson L100/L110/L200/L210/L355/L555',
   3200, 5100, 4400,
   21, 14, 4, 50,
   'unidad', true, false),

  -- 8. Carpeta 3 argollas
  (v_p_carpeta, v_comercio, v_cc_marcela, v_cat_papeleria, v_prov_papel,
   'PAP-004', 'Carpeta 3 argollas A4 lomo ancho',
   'Carpeta plástica A4 3 argollas lomo 4cm — colores surtidos',
   1100, 1650, 1400,
   21, 60, 15, 200,
   'unidad', true, false),

-- ── Kiosco / Graciela (con lotes) ───────────────────────────
  -- 9. Yerba Taragüi 1kg
  (v_p_yerba, v_comercio, v_cc_graciela, v_cat_kiosco, v_prov_norte,
   'KIO-001', 'Yerba Taragüi Tradicional 1kg',
   'Yerba mate Taragüi con palo — paquete 1kg',
   2350, 3200, 2900,
   10.5, 48, 12, 150,
   'unidad', true, true),  -- controla_lotes = true

  -- 10. Dulce de leche Vauquita 400g
  (v_p_dulce, v_comercio, v_cc_graciela, v_cat_kiosco, v_prov_norte,
   'KIO-002', 'Dulce de leche Vauquita 400g',
   'Dulce de leche repostero Vauquita — pote 400g',
   980, 1450, 1300,
   10.5, 36, 10, 100,
   'unidad', true, true),  -- controla_lotes = true

  -- 11. Galletitas Oreo x3 pack
  (v_p_galletitas, v_comercio, v_cc_graciela, v_cat_kiosco, v_prov_norte,
   'KIO-003', 'Galletitas Oreo pack x3 unidades',
   'Pack 3 paquetes galletitas Oreo 36g c/u — sabor original',
   620, 980, 870,
   10.5, 72, 20, 200,
   'pack', true, true),  -- controla_lotes = true

  -- 12. Gaseosa Coca Cola 1.5L — stock bajo
  (v_p_gaseosa, v_comercio, v_cc_graciela, v_cat_kiosco, v_prov_norte,
   'KIO-004', 'Coca Cola 1.5L',
   'Gaseosa Coca-Cola botella 1.5 litros',
   1280, 1800, 1600,
   10.5, 6, 24, 120,  -- stock_actual(6) < stock_minimo(24)
   'unidad', true, false),

  -- 13. Agua Villa del Sur 1.5L
  (v_p_agua, v_comercio, v_cc_graciela, v_cat_kiosco, v_prov_norte,
   'KIO-005', 'Agua mineral Villa del Sur 1.5L',
   'Agua mineral sin gas Villa del Sur — botella 1.5L',
   580, 850, 750,
   10.5, 48, 12, 150,
   'unidad', true, false),

-- ── Mercería / Graciela ──────────────────────────────────────
  -- 14. Hilo Nylon Negro N°10
  (v_p_hilo_negro, v_comercio, v_cc_graciela, v_cat_merceria, v_prov_textil,
   'MER-001', 'Hilo Nylon Negro N°10 x500m',
   'Hilo nylon negro N°10 — cono 500 metros — uso general',
   1200, 1850, 1600,
   21, 22, 5, 80,
   'cono', true, false),

  -- 15. Hilo Nylon Blanco N°10
  (v_p_hilo_blanco, v_comercio, v_cc_graciela, v_cat_merceria, v_prov_textil,
   'MER-002', 'Hilo Nylon Blanco N°10 x500m',
   'Hilo nylon blanco N°10 — cono 500 metros — uso general',
   1200, 1850, 1600,
   21, 3, 5, 80,   -- stock_actual(3) < stock_minimo(5)
   'cono', true, false),

  -- 16. Cierre plástico 25cm
  (v_p_cierre25, v_comercio, v_cc_graciela, v_cat_merceria, v_prov_textil,
   'MER-003', 'Cierre plástico 25cm colores surtidos',
   'Cierres plásticos eclair 25cm — varios colores',
   180, 280, 240,
   21, 150, 30, 500,
   'unidad', true, false),

  -- 17. Cierre metal 50cm — stock bajo
  (v_p_cierre50, v_comercio, v_cc_graciela, v_cat_merceria, v_prov_textil,
   'MER-004', 'Cierre metal 50cm dorado/plateado',
   'Cierres metálicos eclair 50cm — dorado y plateado',
   320, 520, 450,
   21, 8, 20, 200,  -- stock_actual(8) < stock_minimo(20)
   'unidad', true, false),

-- ── Agendas / Marcela (con promoción) ───────────────────────
  -- 18. Agenda 2026 Deluxe (PROMO — precio_mayorista = precio promo)
  (v_p_agenda2026, v_comercio, v_cc_marcela, v_cat_agendas, v_prov_papel,
   'AGE-001', 'Agenda 2026 Deluxe tapa dura',
   'Agenda 2026 tapa dura — 1 día por página — varios colores. PROMO 20% OFF',
   4200, 7800, 6240,  -- precio_mayorista usado como precio promo
   21, 18, 5, 60,
   'unidad', true, false),

  -- 19. Agenda 2026 Práctica (PROMO)
  (v_p_agenda_prac, v_comercio, v_cc_marcela, v_cat_agendas, v_prov_papel,
   'AGE-002', 'Agenda 2026 Práctica semana a la vista',
   'Agenda 2026 semana a la vista tapa blanda. PROMO 15% OFF',
   2600, 4500, 3825,
   21, 25, 5, 80,
   'unidad', true, false),

-- ── Libros / Marcela ─────────────────────────────────────────
  -- 20. Libro Matemática 6to
  (v_p_libro_mat, v_comercio, v_cc_marcela, v_cat_escolares, v_prov_kapelusz,
   'LIB-001', 'Matemática 6 — Kapelusz Nueva Edición',
   'Libro de matemática para 6° grado — Kapelusz 2025',
   5800, 8900, 7800,
   21, 12, 3, 40,
   'unidad', true, false);

-- ============================================================
-- 6. LOTES (productos de kiosco con fecha de vencimiento)
-- ============================================================
INSERT INTO lotes (
  id, producto_id, numero_lote,
  fecha_vencimiento, fecha_fabricacion,
  cantidad_inicial, cantidad_actual,
  precio_costo, proveedor_id, estado
) VALUES
  -- Yerba lote 1
  (v_lote_yerba1, v_p_yerba,
   'L-TRG-240901',
   '2026-09-30', '2024-09-01',
   24, 22, 2350, v_prov_norte, 'activo'),

  -- Yerba lote 2 (más reciente)
  (v_lote_yerba2, v_p_yerba,
   'L-TRG-250201',
   '2027-02-28', '2025-02-01',
   24, 26, 2350, v_prov_norte, 'activo'),

  -- Dulce de leche lote 1
  (v_lote_dulce1, v_p_dulce,
   'L-VAU-250310',
   '2026-07-10', '2025-03-10',
   24, 18, 980, v_prov_norte, 'activo'),

  -- Dulce de leche lote 2
  (v_lote_dulce2, v_p_dulce,
   'L-VAU-250415',
   '2026-08-15', '2025-04-15',
   12, 18, 980, v_prov_norte, 'activo'),

  -- Galletitas lote 1
  (v_lote_galleta1, v_p_galletitas,
   'L-ORE-250120',
   '2026-06-20', '2025-01-20',
   48, 72, 620, v_prov_norte, 'activo');

-- ============================================================
-- 7. CLIENTES
-- ============================================================
INSERT INTO clientes (
  id, comercio_id, nombre, apellido, razon_social,
  cuit, telefono, email, direccion, localidad, provincia,
  tipo, limite_credito, saldo_cuenta, notas
) VALUES
  -- 1. Colegio San José → Factura A
  (v_cli_colegio, v_comercio,
   'Colegio San José', NULL, 'Colegio Privado San José SRL',
   '30-62345670-9', '3804-445566', 'administracion@colegiosanitjose.edu.ar',
   'Av. Maestra Blanca Acosta 250', 'La Rioja', 'La Rioja',
   'cuenta_corriente', 200000, -18400,
   'Resp. Inscripto — emitir Factura A. Pago a 30 días.'),

  -- 2. Municipalidad La Rioja → Factura C
  (v_cli_muni, v_comercio,
   'Municipalidad de La Rioja', NULL, 'Municipalidad de La Rioja',
   '30-99876543-2', '3804-420000', 'compras@larioja.gov.ar',
   'Rivadavia 150', 'La Rioja', 'La Rioja',
   'cuenta_corriente', 500000, 0,
   'Exento IVA — emitir Factura C. Requiere OC previa.'),

  -- 3. Fabián Torres → Factura B
  (v_cli_fabian, v_comercio,
   'Fabián', 'Torres', NULL,
   '20-28123456-7', '3804-612345', 'fabian.torres@gmail.com',
   'Corrientes 788', 'La Rioja', 'La Rioja',
   'cuenta_corriente', 50000, -5200,
   'Monotributista — emitir Factura B. Compra para su negocio.'),

  -- 4. Consumidor Final
  (v_cli_cf, v_comercio,
   'Consumidor Final', NULL, NULL,
   NULL, NULL, NULL,
   NULL, 'La Rioja', 'La Rioja',
   'consumidor_final', 0, 0,
   'Cliente genérico para ventas sin datos.');

-- ============================================================
-- 8. COMPRAS (5)
-- ============================================================

-- COMPRA 1 — Distribuidora Norte — PAGADA
INSERT INTO compras (
  id, comercio_id, proveedor_id, numero,
  fecha, fecha_vencimiento,
  tipo_comprobante, numero_comprobante,
  subtotal, descuento_monto, iva_monto, total,
  estado, notas
) VALUES (
  v_compra1, v_comercio, v_prov_norte, 'C-0001',
  '2026-04-15', '2026-04-30',
  'factura_a', '0001-00045123',
  62190.00, 0, 6529.95, 68719.95,
  'pagada',
  'Compra mensual kiosco — yerba, dulce y galletitas'
);

-- Items compra 1
INSERT INTO compra_items (id, compra_id, producto_id, lote_id, cantidad, precio_unitario, iva_porcentaje, descuento_pct, subtotal) VALUES
  (v_ci_y1, v_compra1, v_p_yerba,     v_lote_yerba2,   24, 2350.00, 10.5, 0, 56400.00),
  (v_ci_d1, v_compra1, v_p_dulce,     v_lote_dulce2,   12,  980.00, 10.5, 0, 11760.00),
  (v_ci_g1, v_compra1, v_p_galletitas,v_lote_galleta1, 48,  620.00, 10.5, 0, 29760.00);

-- Actualizar FK lotes → compra_item
UPDATE lotes SET compra_item_id = v_ci_y1 WHERE id = v_lote_yerba2;
UPDATE lotes SET compra_item_id = v_ci_d1 WHERE id = v_lote_dulce2;
UPDATE lotes SET compra_item_id = v_ci_g1 WHERE id = v_lote_galleta1;

-- COMPRA 2 — Papel y Todo — PENDIENTE
INSERT INTO compras (
  id, comercio_id, proveedor_id, numero,
  fecha, fecha_vencimiento,
  tipo_comprobante, numero_comprobante,
  subtotal, descuento_monto, iva_monto, total,
  estado, notas
) VALUES (
  v_compra2, v_comercio, v_prov_papel, 'C-0002',
  '2026-04-28', '2026-05-28',
  'factura_a', '0001-00012847',
  584000.00, 0, 122640.00, 706640.00,
  'pendiente',
  'Reposición papelería, resmas, cuadernos y agendas'
);

INSERT INTO compra_items (id, compra_id, producto_id, cantidad, precio_unitario, iva_porcentaje, descuento_pct, subtotal) VALUES
  (v_ci_r1, v_compra2, v_p_resma,       20, 3800.00, 21, 0,  76000.00),
  ('a8100000-0000-0000-0000-000000000008', v_compra2, v_p_cuaderno80, 50,  680.00, 21, 0,  34000.00),
  ('a8100000-0000-0000-0000-000000000009', v_compra2, v_p_cuaderno48, 80,  480.00, 21, 0,  38400.00),
  ('a8100000-0000-0000-0000-000000000010', v_compra2, v_p_lapbic,     10, 1850.00, 21, 0,  18500.00),
  ('a8100000-0000-0000-0000-000000000011', v_compra2, v_p_carpeta,    30, 1100.00, 21, 0,  33000.00),
  ('a8100000-0000-0000-0000-000000000012', v_compra2, v_p_agenda2026, 10, 4200.00, 21, 0,  42000.00),
  ('a8100000-0000-0000-0000-000000000013', v_compra2, v_p_agenda_prac,15, 2600.00, 21, 0,  39000.00);

-- COMPRA 3 — Textil Rioja — PENDIENTE
INSERT INTO compras (
  id, comercio_id, proveedor_id, numero,
  fecha, fecha_vencimiento,
  tipo_comprobante, numero_comprobante,
  subtotal, descuento_monto, iva_monto, total,
  estado, notas
) VALUES (
  v_compra3, v_comercio, v_prov_textil, 'C-0003',
  '2026-05-02', '2026-06-02',
  'factura_a', '0002-00008431',
  98200.00, 0, 20622.00, 118822.00,
  'pendiente',
  'Reposición mercería — hilos y cierres'
);

INSERT INTO compra_items (id, compra_id, producto_id, cantidad, precio_unitario, iva_porcentaje, descuento_pct, subtotal) VALUES
  ('a8100000-0000-0000-0000-000000000014', v_compra3, v_p_hilo_negro,  10, 1200.00, 21, 0, 12000.00),
  ('a8100000-0000-0000-0000-000000000015', v_compra3, v_p_hilo_blanco, 10, 1200.00, 21, 0, 12000.00),
  ('a8100000-0000-0000-0000-000000000016', v_compra3, v_p_cierre25,   100,  180.00, 21, 0, 18000.00),
  ('a8100000-0000-0000-0000-000000000017', v_compra3, v_p_cierre50,   100,  320.00, 21, 0, 32000.00);

-- COMPRA 4 — Editorial Kapelusz — PAGADA
INSERT INTO compras (
  id, comercio_id, proveedor_id, numero,
  fecha, fecha_vencimiento,
  tipo_comprobante, numero_comprobante,
  subtotal, descuento_monto, iva_monto, total,
  estado, notas
) VALUES (
  v_compra4, v_comercio, v_prov_kapelusz, 'C-0004',
  '2026-05-05', '2026-05-05',
  'factura_a', '0001-00098765',
  69600.00, 0, 14616.00, 84216.00,
  'pagada',
  'Libros escolares — pago contado'
);

INSERT INTO compra_items (id, compra_id, producto_id, cantidad, precio_unitario, iva_porcentaje, descuento_pct, subtotal) VALUES
  ('a8100000-0000-0000-0000-000000000018', v_compra4, v_p_libro_mat, 12, 5800.00, 21, 0, 69600.00);

-- COMPRA 5 — Distribuidora Norte — VENCIDA (sin pagar y expirada)
INSERT INTO compras (
  id, comercio_id, proveedor_id, numero,
  fecha, fecha_vencimiento,
  tipo_comprobante, numero_comprobante,
  subtotal, descuento_monto, iva_monto, total,
  estado, notas
) VALUES (
  v_compra5, v_comercio, v_prov_norte, 'C-0005',
  '2026-03-20', '2026-04-04',   -- vencimiento pasado
  'factura_a', '0001-00044891',
  38400.00, 0, 4032.00, 42432.00,
  'pendiente',                   -- pendiente + vencimiento pasado = VENCIDA en UI
  'Reposición gaseosas y agua — VENCIDA sin pagar'
);

INSERT INTO compra_items (id, compra_id, producto_id, cantidad, precio_unitario, iva_porcentaje, descuento_pct, subtotal) VALUES
  (v_ci_y2, v_compra5, v_p_gaseosa, 24, 1280.00, 10.5, 0, 30720.00),
  (v_ci_d2, v_compra5, v_p_agua,    24,  580.00, 10.5, 0, 13920.00);

-- ============================================================
-- 9. STOCK_MOVIMIENTOS — entradas por compras
-- ============================================================
INSERT INTO stock_movimientos (
  comercio_id, producto_id, lote_id, tipo,
  cantidad, stock_anterior, stock_posterior,
  precio_unitario, motivo, referencia_tipo, referencia_id
) VALUES
  -- Compra 1 — Norte
  (v_comercio, v_p_yerba,      v_lote_yerba2,    'entrada', 24,  24, 48,  2350, 'Compra C-0001 — Distrib. Norte', 'compra', v_compra1),
  (v_comercio, v_p_dulce,      v_lote_dulce2,    'entrada', 12,  18, 36,   980, 'Compra C-0001 — Distrib. Norte', 'compra', v_compra1),
  (v_comercio, v_p_galletitas, v_lote_galleta1,  'entrada', 48,  24, 72,   620, 'Compra C-0001 — Distrib. Norte', 'compra', v_compra1),

  -- Compra 2 — Papel y Todo
  (v_comercio, v_p_resma,       NULL, 'entrada', 20, 22, 42,  3800, 'Compra C-0002 — Papel y Todo', 'compra', v_compra2),
  (v_comercio, v_p_cuaderno80,  NULL, 'entrada', 50, 35, 85,   680, 'Compra C-0002 — Papel y Todo', 'compra', v_compra2),
  (v_comercio, v_p_cuaderno48,  NULL, 'entrada', 80, 40,120,   480, 'Compra C-0002 — Papel y Todo', 'compra', v_compra2),
  (v_comercio, v_p_lapbic,      NULL, 'entrada', 10, 18, 28,  1850, 'Compra C-0002 — Papel y Todo', 'compra', v_compra2),
  (v_comercio, v_p_carpeta,     NULL, 'entrada', 30, 30, 60,  1100, 'Compra C-0002 — Papel y Todo', 'compra', v_compra2),
  (v_comercio, v_p_agenda2026,  NULL, 'entrada', 10,  8, 18,  4200, 'Compra C-0002 — Papel y Todo', 'compra', v_compra2),
  (v_comercio, v_p_agenda_prac, NULL, 'entrada', 15, 10, 25,  2600, 'Compra C-0002 — Papel y Todo', 'compra', v_compra2),

  -- Compra 3 — Textil Rioja
  (v_comercio, v_p_hilo_negro,  NULL, 'entrada', 10, 12, 22,  1200, 'Compra C-0003 — Textil Rioja', 'compra', v_compra3),
  (v_comercio, v_p_hilo_blanco, NULL, 'entrada', 10,  0, 10,  1200, 'Compra C-0003 — Textil Rioja', 'compra', v_compra3),
  (v_comercio, v_p_cierre25,    NULL, 'entrada',100, 50,150,   180, 'Compra C-0003 — Textil Rioja', 'compra', v_compra3),
  (v_comercio, v_p_cierre50,    NULL, 'entrada',100,  0,100,   320, 'Compra C-0003 — Textil Rioja', 'compra', v_compra3),

  -- Compra 4 — Kapelusz
  (v_comercio, v_p_libro_mat,   NULL, 'entrada', 12,  0, 12,  5800, 'Compra C-0004 — Kapelusz',     'compra', v_compra4),

  -- Compra 5 — Norte
  (v_comercio, v_p_gaseosa,     NULL, 'entrada', 24,  0, 24,  1280, 'Compra C-0005 — Distrib. Norte', 'compra', v_compra5),
  (v_comercio, v_p_agua,        NULL, 'entrada', 24,  0, 24,   580, 'Compra C-0005 — Distrib. Norte', 'compra', v_compra5);

-- Ajuste de stock: simular salidas anteriores (stock real)
INSERT INTO stock_movimientos (
  comercio_id, producto_id, tipo,
  cantidad, stock_anterior, stock_posterior,
  motivo
) VALUES
  (v_comercio, v_p_gaseosa, 'salida', 18, 24, 6,  'Ventas acumuladas periodo'),
  (v_comercio, v_p_tonner,  'salida',  3,  5, 2,  'Ventas acumuladas periodo'),
  (v_comercio, v_p_cierre50,'salida', 92,100, 8,  'Ventas acumuladas periodo'),
  (v_comercio, v_p_hilo_blanco,'salida', 7, 10, 3,'Ventas acumuladas periodo');

-- ============================================================
-- 10. VENTAS (15) — últimos 30 días
-- ============================================================

-- VENTA 1 — hace 29 días — Colegio San José — Factura A — transferencia
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v01, v_comercio, v_cli_colegio, 'V-0001',
   now() - INTERVAL '29 days',
   46280, 0, 9718.80, 55998.80, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v01, v_p_resma,      'Resma A4 x500h 75g Benson',         5, 5490, 0, 21, 27450),
  (v_v01, v_p_cuaderno80, 'Cuaderno tapa dura 80 hojas rayado', 10,  980, 0, 21,  9800),
  (v_v01, v_p_lapbic,     'Lapicera BIC cristal caja x12 azul', 3, 2600, 0, 21,  7800);
INSERT INTO venta_pagos (venta_id, medio_pago, monto) VALUES
  (v_v01, 'transferencia', 55998.80);
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, cae, cae_vencimiento, estado) VALUES
  (v_v01, 'factura_a', '0001', '00000001', '71234567890123', '2026-06-20', 'emitido');

-- VENTA 2 — hace 27 días — Consumidor Final — ticket — efectivo (con descuento)
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v02, v_comercio, v_cli_cf, 'V-0002',
   now() - INTERVAL '27 days',
   4430, 443, 834.54, 4821.54, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v02, v_p_yerba,   'Yerba Taragüi Tradicional 1kg', 1, 3200, 0,   10.5, 3200),
  (v_v02, v_p_galletitas,'Galletitas Oreo pack x3',      1,  980, 0,   10.5,  980),
  (v_v02, v_p_agua,    'Agua mineral Villa del Sur 1.5L',3,  850, 0,   10.5, 2550);
INSERT INTO venta_pagos (venta_id, medio_pago, monto, referencia) VALUES
  (v_v02, 'efectivo', 4821.54, '10% descuento efectivo');
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, estado) VALUES
  (v_v02, 'ticket', '0001', '00000002', 'emitido');

-- VENTA 3 — hace 25 días — Fabián Torres — Factura B — débito
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v03, v_comercio, v_cli_fabian, 'V-0003',
   now() - INTERVAL '25 days',
   22800, 0, 4788, 27588, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v03, v_p_tonner, 'Tóner HP LaserJet 85A (CE285A)', 1, 22800, 0, 21, 22800);
INSERT INTO venta_pagos (venta_id, medio_pago, monto) VALUES
  (v_v03, 'tarjeta_debito', 27588);
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, cae, cae_vencimiento, estado) VALUES
  (v_v03, 'factura_b', '0001', '00000003', '71234567890124', '2026-06-22', 'emitido');

-- VENTA 4 — hace 23 días — CF — ticket — efectivo — ítems Marcela y Graciela
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v04, v_comercio, v_cli_cf, 'V-0004',
   now() - INTERVAL '23 days',
   6640, 0, 908.40, 7548.40, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v04, v_p_cuaderno48, 'Cuaderno tapa dura 48 hojas cuadriculado', 2,  720, 0, 21,  1440),
  (v_v04, v_p_marcador,   'Marcador permanente Faber-Castell negro',   2,  680, 0, 21,  1360),
  (v_v04, v_p_dulce,      'Dulce de leche Vauquita 400g',              2, 1450, 0, 10.5,2900),
  (v_v04, v_p_galletitas, 'Galletitas Oreo pack x3',                   1,  980, 0, 10.5, 980);
INSERT INTO venta_pagos (venta_id, medio_pago, monto) VALUES
  (v_v04, 'efectivo', 7548.40);
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, estado) VALUES
  (v_v04, 'ticket', '0001', '00000004', 'emitido');

-- VENTA 5 — hace 21 días — Municipalidad — Factura C — transferencia
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v05, v_comercio, v_cli_muni, 'V-0005',
   now() - INTERVAL '21 days',
   142600, 0, 0, 142600, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v05, v_p_resma,      'Resma A4 x500h 75g Benson',         10, 5490, 0, 21, 54900),
  (v_v05, v_p_carpeta,    'Carpeta 3 argollas A4 lomo ancho',   20, 1650, 0, 21, 33000),
  (v_v05, v_p_cuaderno80, 'Cuaderno tapa dura 80 hojas rayado', 30,  980, 0, 21, 29400),
  (v_v05, v_p_lapbic,     'Lapicera BIC cristal caja x12 azul', 10, 2600, 0, 21, 26000);
INSERT INTO venta_pagos (venta_id, medio_pago, monto, referencia) VALUES
  (v_v05, 'transferencia', 142600, 'OC-MUN-2026-0892');
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, cae, cae_vencimiento, estado) VALUES
  (v_v05, 'factura_c', '0001', '00000005', '71234567890125', '2026-06-24', 'emitido');

-- VENTA 6 — hace 18 días — CF — ticket — efectivo
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v06, v_comercio, v_cli_cf, 'V-0006',
   now() - INTERVAL '18 days',
   5150, 0, 735.75, 5885.75, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v06, v_p_carpeta,    'Carpeta 3 argollas A4 lomo ancho', 2, 1650, 0, 21, 3300),
  (v_v06, v_p_marcador,   'Marcador permanente Faber-Castell',  2,  680, 0, 21, 1360),
  (v_v06, v_p_gaseosa,    'Coca Cola 1.5L',                    1, 1800, 0, 10.5,1800);
INSERT INTO venta_pagos (venta_id, medio_pago, monto) VALUES
  (v_v06, 'efectivo', 5885.75);
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, estado) VALUES
  (v_v06, 'ticket', '0001', '00000006', 'emitido');

-- VENTA 7 — hace 15 días — Fabián Torres — Factura B — Marcela y Graciela
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v07, v_comercio, v_cli_fabian, 'V-0007',
   now() - INTERVAL '15 days',
   12820, 0, 2244.45, 15064.45, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v07, v_p_agenda2026,  'Agenda 2026 Deluxe tapa dura',      1, 7800, 0, 21,  7800),
  (v_v07, v_p_hilo_negro,  'Hilo Nylon Negro N°10 x500m',        2, 1850, 0, 21,  3700),
  (v_v07, v_p_cierre25,    'Cierre plástico 25cm',               5,  280, 0, 21,  1400),
  (v_v07, v_p_yerba,       'Yerba Taragüi Tradicional 1kg',       1, 3200, 0, 10.5, 3200);
INSERT INTO venta_pagos (venta_id, medio_pago, monto) VALUES
  (v_v07, 'tarjeta_debito', 15064.45);
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, cae, cae_vencimiento, estado) VALUES
  (v_v07, 'factura_b', '0001', '00000007', '71234567890126', '2026-06-27', 'emitido');

-- VENTA 8 — hace 13 días — CF — ticket — Mercado Pago
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v08, v_comercio, v_cli_cf, 'V-0008',
   now() - INTERVAL '13 days',
   3670, 0, 535.59, 4205.59, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v08, v_p_dulce,      'Dulce de leche Vauquita 400g', 2, 1450, 0, 10.5, 2900),
  (v_v08, v_p_cartuchoink,'Cartucho Epson T664 negro',     1, 5100, 0, 21,   5100);
INSERT INTO venta_pagos (venta_id, medio_pago, monto, referencia) VALUES
  (v_v08, 'mercado_pago', 4205.59, 'MP-2026051-891234');
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, estado) VALUES
  (v_v08, 'ticket', '0001', '00000008', 'emitido');

-- VENTA 9 — hace 11 días — Colegio San José — Factura A — CC
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v09, v_comercio, v_cli_colegio, 'V-0009',
   now() - INTERVAL '11 days',
   71680, 0, 15052.80, 86732.80, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v09, v_p_libro_mat,  'Matemática 6 — Kapelusz',             8, 8900, 0, 21, 71200),
  (v_v09, v_p_cuaderno80, 'Cuaderno tapa dura 80 hojas rayado', 10,  980, 0, 21,  9800),
  (v_v09, v_p_lapbic,     'Lapicera BIC cristal caja x12 azul',  3, 2600, 0, 21,  7800);
INSERT INTO venta_pagos (venta_id, medio_pago, monto, referencia) VALUES
  (v_v09, 'cuenta_corriente', 86732.80, 'CC Colegio San José');
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, cae, cae_vencimiento, estado) VALUES
  (v_v09, 'factura_a', '0001', '00000009', '71234567890127', '2026-06-29', 'emitido');

-- VENTA 10 — hace 9 días — CF — ticket — efectivo (descuento)
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v10, v_comercio, v_cli_cf, 'V-0010',
   now() - INTERVAL '9 days',
   9580, 958, 1817.82, 10439.82, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v10, v_p_agenda_prac,'Agenda 2026 Práctica semana a la vista', 2, 4500, 10, 21, 8100),
  (v_v10, v_p_marcador,   'Marcador permanente Faber-Castell',       2,  680,  0, 21, 1360),
  (v_v10, v_p_gaseosa,    'Coca Cola 1.5L',                          1, 1800,  0, 10.5,1800);
INSERT INTO venta_pagos (venta_id, medio_pago, monto, referencia) VALUES
  (v_v10, 'efectivo', 10439.82, '10% descuento efectivo');
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, estado) VALUES
  (v_v10, 'ticket', '0001', '00000010', 'emitido');

-- VENTA 11 — hace 7 días — CF — ticket — débito — Marcela y Graciela
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v11, v_comercio, v_cli_cf, 'V-0011',
   now() - INTERVAL '7 days',
   9130, 0, 1459.50, 10589.50, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v11, v_p_resma,      'Resma A4 x500h 75g Benson',          1, 5490, 0, 21, 5490),
  (v_v11, v_p_yerba,      'Yerba Taragüi Tradicional 1kg',        1, 3200, 0, 10.5,3200),
  (v_v11, v_p_galletitas, 'Galletitas Oreo pack x3',              1,  980, 0, 10.5, 980);
INSERT INTO venta_pagos (venta_id, medio_pago, monto) VALUES
  (v_v11, 'tarjeta_debito', 10589.50);
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, estado) VALUES
  (v_v11, 'ticket', '0001', '00000011', 'emitido');

-- VENTA 12 — hace 5 días — CF — ticket — efectivo
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v12, v_comercio, v_cli_cf, 'V-0012',
   now() - INTERVAL '5 days',
   7030, 0, 1085.55, 8115.55, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v12, v_p_cuaderno80, 'Cuaderno tapa dura 80 hojas rayado',  3,  980, 0, 21, 2940),
  (v_v12, v_p_lapbic,     'Lapicera BIC cristal caja x12 azul',  1, 2600, 0, 21, 2600),
  (v_v12, v_p_hilo_blanco,'Hilo Nylon Blanco N°10 x500m',         1, 1850, 0, 21, 1850),
  (v_v12, v_p_cierre25,   'Cierre plástico 25cm',                 3,  280, 0, 21,  840);
INSERT INTO venta_pagos (venta_id, medio_pago, monto) VALUES
  (v_v12, 'efectivo', 8115.55);
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, estado) VALUES
  (v_v12, 'ticket', '0001', '00000012', 'emitido');

-- VENTA 13 — hace 3 días — Municipalidad — Factura C — transferencia
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v13, v_comercio, v_cli_muni, 'V-0013',
   now() - INTERVAL '3 days',
   89000, 0, 0, 89000, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v13, v_p_resma,     'Resma A4 x500h 75g Benson',          10, 5490, 0, 21, 54900),
  (v_v13, v_p_cuaderno48,'Cuaderno tapa dura 48 hojas cuadriculado', 30, 720, 0, 21, 21600),
  (v_v13, v_p_marcador,  'Marcador permanente Faber-Castell negro', 15, 680, 0, 21, 10200);
INSERT INTO venta_pagos (venta_id, medio_pago, monto, referencia) VALUES
  (v_v13, 'transferencia', 89000, 'OC-MUN-2026-0935');
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, cae, cae_vencimiento, estado) VALUES
  (v_v13, 'factura_c', '0001', '00000013', '71234567890128', '2026-07-03', 'emitido');

-- VENTA 14 — ayer — CF — ticket — efectivo — Marcela y Graciela
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v14, v_comercio, v_cli_cf, 'V-0014',
   now() - INTERVAL '1 day',
   12960, 0, 1924.50, 14884.50, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v14, v_p_agenda2026, 'Agenda 2026 Deluxe tapa dura',    1, 7800, 0, 21,  7800),
  (v_v14, v_p_libro_mat,  'Matemática 6 — Kapelusz',          1, 8900, 0, 21,  8900),
  (v_v14, v_p_dulce,      'Dulce de leche Vauquita 400g',     2, 1450, 0, 10.5,2900),
  (v_v14, v_p_agua,       'Agua mineral Villa del Sur 1.5L',  2,  850, 0, 10.5,1700);
INSERT INTO venta_pagos (venta_id, medio_pago, monto) VALUES
  (v_v14, 'efectivo', 14884.50);
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, estado) VALUES
  (v_v14, 'ticket', '0001', '00000014', 'emitido');

-- VENTA 15 — hoy — CF — ticket — débito
INSERT INTO ventas (id, comercio_id, cliente_id, numero, fecha, subtotal, descuento_monto, iva_monto, total, estado, canal) VALUES
  (v_v15, v_comercio, v_cli_cf, 'V-0015',
   now(),
   6360, 0, 918.60, 7278.60, 'completada', 'mostrador');
INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal) VALUES
  (v_v15, v_p_cuaderno80,'Cuaderno tapa dura 80 hojas rayado',  3,  980, 0, 21, 2940),
  (v_v15, v_p_carpeta,   'Carpeta 3 argollas A4 lomo ancho',    2, 1650, 0, 21, 3300),
  (v_v15, v_p_yerba,     'Yerba Taragüi Tradicional 1kg',        1, 3200, 0, 10.5,3200),
  (v_v15, v_p_galletitas,'Galletitas Oreo pack x3',              1,  980, 0, 10.5, 980);
INSERT INTO venta_pagos (venta_id, medio_pago, monto) VALUES
  (v_v15, 'tarjeta_debito', 7278.60);
INSERT INTO venta_comprobantes (venta_id, tipo, punto_venta, numero, estado) VALUES
  (v_v15, 'ticket', '0001', '00000015', 'emitido');

-- ============================================================
-- 11. PRESUPUESTOS (6)
-- ============================================================
INSERT INTO presupuestos (
  id, comercio_id, cliente_id, cliente_nombre,
  numero, fecha, fecha_vencimiento,
  subtotal, descuento_monto, total,
  estado, notas, venta_id
) VALUES
  -- PRES-0001: borrador
  (v_pr01, v_comercio, NULL, 'María González',
   'PRES-0001',
   (CURRENT_DATE - 2)::date, (CURRENT_DATE + 13)::date,
   24500, 0, 24500,
   'pendiente', 'Útiles escolares para dos chicos. A confirmar.', NULL),

  -- PRES-0002: enviado
  (v_pr02, v_comercio, v_cli_fabian, 'Fabián Torres',
   'PRES-0002',
   (CURRENT_DATE - 5)::date, (CURRENT_DATE + 10)::date,
   89400, 0, 89400,
   'pendiente', 'Pedido papelería para taller. Enviado por WhatsApp.', NULL),

  -- PRES-0003: aprobado → no convertido aún
  (v_pr03, v_comercio, v_cli_colegio, 'Colegio San José',
   'PRES-0003',
   (CURRENT_DATE - 10)::date, (CURRENT_DATE + 5)::date,
   187500, 18750, 168750,
   'aprobado', 'Pedido material escolar año 2026. 10% descuento por volumen.', NULL),

  -- PRES-0004: convertido en venta (→ v_v05)
  (v_pr04, v_comercio, v_cli_muni, 'Municipalidad de La Rioja',
   'PRES-0004',
   (CURRENT_DATE - 25)::date, (CURRENT_DATE - 10)::date,
   142600, 0, 142600,
   'convertido', 'Convertido en V-0005.', v_v05),

  -- PRES-0005: vencido
  (v_pr05, v_comercio, NULL, 'Roberto Gómez',
   'PRES-0005',
   (CURRENT_DATE - 30)::date, (CURRENT_DATE - 15)::date,
   14600, 0, 14600,
   'vencido', 'No respondió. Venció sin confirmación.', NULL),

  -- PRES-0006: rechazado
  (v_pr06, v_comercio, NULL, 'Ana Laura Sánchez',
   'PRES-0006',
   (CURRENT_DATE - 20)::date, (CURRENT_DATE - 5)::date,
   45000, 0, 45000,
   'rechazado', 'Rechazó por precio. Fue a otra librería.', NULL);

-- Items de presupuestos
INSERT INTO presupuesto_items (presupuesto_id, producto_id, descripcion, cantidad, precio_unitario, descuento_pct, subtotal) VALUES
  -- PRES-0001
  (v_pr01, v_p_cuaderno80, 'Cuaderno tapa dura 80 hojas', 10,  980, 0,  9800),
  (v_pr01, v_p_cuaderno48, 'Cuaderno tapa dura 48 hojas',  5,  720, 0,  3600),
  (v_pr01, v_p_lapbic,     'Lapicera BIC caja x12',         2, 2600, 0,  5200),
  (v_pr01, v_p_carpeta,    'Carpeta 3 argollas A4',          3, 1650, 0,  4950),
  -- PRES-0002
  (v_pr02, v_p_resma,      'Resma A4 x500h',               10, 5490, 0, 54900),
  (v_pr02, v_p_cartuchoink,'Cartucho Epson T664 negro',      3, 5100, 0, 15300),
  (v_pr02, v_p_marcador,   'Marcador permanente Faber',      5,  680, 0,  3400),
  -- PRES-0003
  (v_pr03, v_p_libro_mat,  'Matemática 6 Kapelusz',         15, 8900, 10, 120150),
  (v_pr03, v_p_cuaderno80, 'Cuaderno tapa dura 80 hojas',   50,  980, 10, 44100),
  (v_pr03, v_p_lapbic,     'Lapicera BIC caja x12',         10, 2600, 10, 23400),
  -- PRES-0004
  (v_pr04, v_p_resma,      'Resma A4 x500h',               10, 5490, 0, 54900),
  (v_pr04, v_p_carpeta,    'Carpeta 3 argollas A4',         20, 1650, 0, 33000),
  (v_pr04, v_p_cuaderno80, 'Cuaderno tapa dura 80 hojas',   30,  980, 0, 29400),
  (v_pr04, v_p_lapbic,     'Lapicera BIC caja x12',         10, 2600, 0, 26000),
  -- PRES-0005
  (v_pr05, v_p_agenda2026, 'Agenda 2026 Deluxe',             1, 7800, 0,  7800),
  (v_pr05, v_p_agenda_prac,'Agenda 2026 Práctica',            3, 4500, 0, 13500),
  -- PRES-0006
  (v_pr06, v_p_resma,      'Resma A4 x500h',                5, 5490, 0, 27450),
  (v_pr06, v_p_tonner,     'Tóner HP 85A',                   1,22800, 0, 22800);

-- ============================================================
-- 12. OBLIGACIONES IMPOSITIVAS (7)
-- ============================================================
INSERT INTO obligaciones_imp (
  id, comercio_id, nombre, categoria, organismo,
  monto_estimado, dia_vencimiento, periodicidad,
  proximo_vencimiento, alerta_dias_antes, notas, activo
) VALUES
  -- 1. IVA Marcela — pagada en pago aparte
  (v_ob01, v_comercio,
   'IVA Marcela',
   'impuesto_nacional', 'AFIP — IVA Responsable Inscripto',
   48000, 20, 'mensual',
   '2026-06-20', 7,
   'CUIT 20-12345678-9 — Declaración mensual. Vence el 20 de cada mes.',
   true),

  -- 2. IIBB Marcela — pagada
  (v_ob02, v_comercio,
   'IIBB Marcela',
   'impuesto_provincial', 'DGR La Rioja — Ingresos Brutos',
   12500, 15, 'mensual',
   '2026-06-15', 5,
   'CUIT 20-12345678-9 — Régimen general. Vence el 15.',
   true),

  -- 3. Municipal Marcela — pendiente
  (v_ob03, v_comercio,
   'Tasa Municipal Marcela',
   'impuesto_municipal', 'Municipalidad de La Rioja',
   4800, 10, 'mensual',
   '2026-06-10', 5,
   'Habilitación comercial. Vence el 10 de cada mes.',
   true),

  -- 4. F931 Marcela — pendiente
  (v_ob04, v_comercio,
   'F.931 Empleados Marcela',
   'impuesto_nacional', 'AFIP — Seguridad Social F.931',
   28000, 13, 'mensual',
   '2026-06-13', 5,
   'CUIT 20-12345678-9 — 1 empleado. Vence el 13.',
   true),

  -- 5. Monotributo Graciela — pagada
  (v_ob05, v_comercio,
   'Monotributo Graciela',
   'impuesto_nacional', 'AFIP — Monotributo',
   38500, 20, 'mensual',
   '2026-06-20', 5,
   'CUIT 27-98765432-1 — Categoría H. Vence el 20.',
   true),

  -- 6. IIBB Graciela — VENCIDA (alerta roja)
  (v_ob06, v_comercio,
   'IIBB Graciela',
   'impuesto_provincial', 'DGR La Rioja — Ingresos Brutos Monotributo',
   3200, 15, 'mensual',
   '2026-05-15', 5,   -- fecha pasada = VENCIDA
   'CUIT 27-98765432-1 — Régimen simplificado. VENCIDA — pagar urgente.',
   true),

  -- 7. Municipal Graciela — pendiente
  (v_ob07, v_comercio,
   'Tasa Municipal Graciela',
   'impuesto_municipal', 'Municipalidad de La Rioja',
   4800, 10, 'mensual',
   '2026-06-10', 5,
   'Habilitación comercial (misma tasa que Marcela — local compartido).',
   true);

-- Pagos de obligaciones
INSERT INTO obligaciones_pagos (
  obligacion_id, fecha_pago, monto, medio_pago, comprobante, periodo, notas
) VALUES
  -- IVA Marcela 04/2026 pagado
  (v_ob01, '2026-05-20', 45800, 'transferencia', 'VEP-20260520-001', '04/2026',
   'IVA 04/2026 cancelado. Saldo a favor $2200.'),

  -- IIBB Marcela 04/2026 pagada
  (v_ob02, '2026-05-15', 11900, 'transferencia', 'VEP-20260515-002', '04/2026',
   'IIBB 04/2026 cancelado.'),

  -- Monotributo Graciela 05/2026 pagado
  (v_ob05, '2026-05-20', 38500, 'debito_automatico', 'DEB-20260520-001', '05/2026',
   'Débito automático. Banco Macro.');

END $$;

-- ============================================================
-- 13. CIERRES DE CAJA — bloque independiente
-- usuario_id es NOT NULL → requiere que ya exista un usuario.
-- Este bloque se saltea solo si no hay usuarios todavía.
-- Si ves el NOTICE de omisión: logueate una vez a la app
-- y volvé a pegar solo este bloque DO $cierres$ ... END $cierres$;
-- ============================================================
DO $cierres$
DECLARE
  v_comercio   UUID := 'a1000000-0000-0000-0000-000000000001';
  v_usuario_id UUID;
BEGIN
  SELECT id INTO v_usuario_id
  FROM usuarios
  WHERE comercio_id = v_comercio
  LIMIT 1;

  IF v_usuario_id IS NULL THEN
    RAISE NOTICE '⚠ CIERRES DE CAJA omitidos: no hay usuarios en la tabla. Logueate una vez a la app y volvé a ejecutar este bloque.';
  ELSE
    INSERT INTO cierres_caja (
      comercio_id, usuario_id,
      fecha_apertura, fecha_cierre,
      saldo_apertura,
      efectivo_contado,
      total_ventas_efectivo,
      total_ventas_debito,
      total_ventas_credito,
      total_ventas_transfer,
      total_ventas_mp,
      total_ventas_cc,
      total_egresos,
      total_ingresos_extra,
      saldo_sistema, diferencia,
      estado, notas_cierre
    ) VALUES

      -- Cierre hace 3 días — diferencia cero
      (v_comercio, v_usuario_id,
       (now() - INTERVAL '3 days')::date + TIME '08:30',
       (now() - INTERVAL '3 days')::date + TIME '20:15',
       8000,
       21650.52, 18200.50, 12400.00, 0, 5490.00, 0, 0,
       2500, 0,
       (8000 + 18200.50), (21650.52 - (8000 + 18200.50)),
       'cerrada', NULL),

      -- Cierre hace 2 días — diferencia cero
      (v_comercio, v_usuario_id,
       (now() - INTERVAL '2 days')::date + TIME '08:30',
       (now() - INTERVAL '2 days')::date + TIME '20:30',
       8000,
       32780.00, 28980.00, 15064.45, 0, 0, 4205.59, 86732.80,
       1800, 0,
       (8000 + 28980.00), (32780.00 - (8000 + 28980.00)),
       'cerrada', NULL),

      -- Cierre ayer — diferencia -$350 (cajero contó de menos)
      (v_comercio, v_usuario_id,
       (now() - INTERVAL '1 day')::date + TIME '08:30',
       (now() - INTERVAL '1 day')::date + TIME '20:00',
       8000,
       23534.50, 23884.50, 7278.60, 0, 89000.00, 0, 0,
       3200, 0,
       (8000 + 23884.50), (23534.50 - (8000 + 23884.50)),
       'cerrada', 'Diferencia de $-350. Posible error al dar vuelto. Revisado.');

    RAISE NOTICE '✓ Cierres de caja insertados (usuario: %).', v_usuario_id;
  END IF;
END $cierres$;

COMMIT;

-- ============================================================
-- VERIFICACIÓN RÁPIDA (ejecutar por separado si querés)
-- ============================================================
/*
SELECT 'comercios'      AS tabla, COUNT(*) FROM comercios;
SELECT 'centros_costos' AS tabla, COUNT(*) FROM centros_costos;
SELECT 'categorias'     AS tabla, COUNT(*) FROM categorias;
SELECT 'proveedores'    AS tabla, COUNT(*) FROM proveedores;
SELECT 'productos'      AS tabla, COUNT(*) FROM productos;
SELECT 'lotes'          AS tabla, COUNT(*) FROM lotes;
SELECT 'clientes'       AS tabla, COUNT(*) FROM clientes;
SELECT 'compras'        AS tabla, COUNT(*) FROM compras;
SELECT 'compra_items'   AS tabla, COUNT(*) FROM compra_items;
SELECT 'ventas'         AS tabla, COUNT(*) FROM ventas;
SELECT 'venta_items'    AS tabla, COUNT(*) FROM venta_items;
SELECT 'venta_pagos'    AS tabla, COUNT(*) FROM venta_pagos;
SELECT 'venta_comprobantes' AS tabla, COUNT(*) FROM venta_comprobantes;
SELECT 'presupuestos'   AS tabla, COUNT(*) FROM presupuestos;
SELECT 'presupuesto_items' AS tabla, COUNT(*) FROM presupuesto_items;
SELECT 'obligaciones_imp' AS tabla, COUNT(*) FROM obligaciones_imp;
SELECT 'obligaciones_pagos' AS tabla, COUNT(*) FROM obligaciones_pagos;
SELECT 'cierres_caja'   AS tabla, COUNT(*) FROM cierres_caja;
SELECT 'stock_movimientos' AS tabla, COUNT(*) FROM stock_movimientos;

-- Productos con stock bajo mínimo:
SELECT nombre, stock_actual, stock_minimo
FROM productos
WHERE stock_actual < stock_minimo;

-- Obligaciones vencidas:
SELECT nombre, proximo_vencimiento
FROM obligaciones_imp
WHERE proximo_vencimiento < CURRENT_DATE AND activo;

-- Compras vencidas sin pagar:
SELECT numero, fecha_vencimiento, total
FROM compras
WHERE estado = 'pendiente' AND fecha_vencimiento < CURRENT_DATE;
*/

-- ============================================================
-- PARA BORRAR TODOS LOS DATOS DE PRUEBA ANTES DE PRODUCCIÓN:
-- TRUNCATE TABLE ventas, venta_items, venta_pagos, venta_comprobantes,
--   presupuestos, presupuesto_items, compras, compra_items,
--   cierres_caja, stock_movimientos, lotes, precio_historial,
--   obligaciones_imp, obligaciones_pagos, clientes, proveedores,
--   proveedores_cc, productos, categorias, centros_costos
--   RESTART IDENTITY CASCADE;
-- Luego borrar el comercio:
-- DELETE FROM comercios WHERE id = 'a1000000-0000-0000-0000-000000000001';
-- ============================================================
