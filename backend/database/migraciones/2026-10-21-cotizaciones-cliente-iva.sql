-- Cotizaciones: cliente, valor de la prenda, utilidad e IVA.
--   valor        = valor_prenda × cantidad
--   utilidad     = porcentaje que escribe el usuario
--   subtotal     = valor + valor × utilidad / 100
--   iva          = porcentaje que escribe el usuario
--   precio_final = subtotal + subtotal × iva / 100   (lo que se cobra por el pedido)
-- fecha guarda el día en que se creó la cotización.
ALTER TABLE cotizacion
  ADD COLUMN id_vinculado VARCHAR(30) NULL AFTER id_referencia,
  ADD COLUMN valor_prenda DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER cantidad,
  ADD COLUMN subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER utilidad,
  ADD COLUMN iva DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER subtotal,
  ADD KEY idx_cotizacion_fecha (nit_usuario, fecha),
  ADD KEY fk_cotizacion_vinculado (id_vinculado),
  ADD CONSTRAINT fk_cotizacion_vinculado FOREIGN KEY (id_vinculado)
    REFERENCES vinculados (identificacion) ON DELETE SET NULL ON UPDATE CASCADE;
