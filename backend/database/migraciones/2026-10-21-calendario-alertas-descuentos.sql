-- Facturas: fecha de vencimiento para avisar cuando una factura está por vencer o ya venció
ALTER TABLE factura
  ADD COLUMN fecha_vencimiento DATE NULL AFTER fecha;

-- Nuevo tipo de alerta: factura por vencer (antes de la fecha de vencimiento)
ALTER TABLE alertas
  MODIFY COLUMN tipo ENUM('Stock bajo','Factura vencida','Factura por vencer','Entrega proxima','Recordatorio') NOT NULL;

-- Lo que cada cotización descontó del inventario (para devolverlo si se edita o se elimina).
-- cantidad está en la unidad del inventario (la de la tela o el primer precio del insumo).
CREATE TABLE cotizacion_descuento (
  id_descuento INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_cotizacion VARCHAR(30) NOT NULL,
  tipo ENUM('Insumo','Materia prima') NOT NULL,
  id_insumo VARCHAR(30) NULL,
  id_materia VARCHAR(30) NULL,
  nombre VARCHAR(100) NULL,
  cantidad DECIMAL(12,2) NOT NULL,
  unidad VARCHAR(30) NULL,
  PRIMARY KEY (id_descuento),
  KEY fk_descuento_cotizacion (id_cotizacion),
  KEY fk_descuento_insumo (id_insumo),
  KEY fk_descuento_materia (id_materia),
  CONSTRAINT fk_descuento_cotizacion FOREIGN KEY (id_cotizacion)
    REFERENCES cotizacion (id_cotizacion) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_descuento_insumo FOREIGN KEY (id_insumo)
    REFERENCES insumo (id_insumo) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_descuento_materia FOREIGN KEY (id_materia)
    REFERENCES materia_prima (id_materia) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
