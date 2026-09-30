-- 012_saldo_inicial.sql
-- Saldos iniciales de Cta. Cte. (deudas traídas de otro sistema al migrar).
-- Se guardan como una "venta" sin ítems con cc_monto = saldo, para que la deuda,
-- los vencimientos y los cobros funcionen igual que con cualquier venta a Cta. Cte.
-- La marca es_saldo_inicial las deja afuera de los totales de ventas (reportes, caja,
-- dashboard): esa venta ya se hizo y se contó en el sistema anterior.

ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS es_saldo_inicial BOOLEAN NOT NULL DEFAULT false;
