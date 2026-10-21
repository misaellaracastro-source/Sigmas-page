-- La cotización guarda una copia de su referencia (número, tipo, foto y materiales).
-- Así, si se elimina la referencia, la cotización conserva sus datos.
ALTER TABLE cotizacion
  ADD COLUMN ref_codigo VARCHAR(30) NULL AFTER id_referencia,
  ADD COLUMN ref_tipo VARCHAR(60) NULL AFTER ref_codigo,
  ADD COLUMN ref_foto VARCHAR(255) NULL AFTER ref_tipo;

UPDATE cotizacion c JOIN referencia r ON r.id_referencia = c.id_referencia
SET c.ref_codigo = r.id_referencia, c.ref_tipo = r.tipo, c.ref_foto = r.foto;

-- Materiales por prenda en el momento de la cotización
CREATE TABLE cotizacion_material (
  id_material INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_cotizacion VARCHAR(30) NOT NULL,
  tipo ENUM('Insumo','Materia prima') NOT NULL,
  codigo VARCHAR(30) NULL,
  nombre VARCHAR(100) NULL,
  categoria VARCHAR(60) NULL,
  color VARCHAR(40) NULL,
  unidad VARCHAR(30) NULL,
  por_prenda DECIMAL(12,2) NOT NULL,
  valor_unitario DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id_material),
  KEY fk_material_cotizacion (id_cotizacion),
  CONSTRAINT fk_material_cotizacion FOREIGN KEY (id_cotizacion)
    REFERENCES cotizacion (id_cotizacion) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO cotizacion_material (id_cotizacion, tipo, codigo, nombre, categoria, color, unidad, por_prenda, valor_unitario)
SELECT c.id_cotizacion, s.tipo, COALESCE(s.id_insumo, s.id_materia), s.nombre, s.categoria, s.color, s.unidad, s.cantidad, s.valor_unitario
FROM cotizacion c JOIN suministro s ON s.id_referencia = c.id_referencia
ORDER BY c.id_cotizacion, s.tipo DESC, s.id_suministro;

-- Facturas: nombre original del archivo subido
ALTER TABLE factura
  ADD COLUMN archivo_nombre VARCHAR(255) NULL AFTER archivo,
  ADD KEY idx_factura_fecha (nit_usuario, fecha);
