-- Suministros de una referencia: ahora se enlazan al insumo o a la materia prima usada.
-- Se guarda una copia del nombre y del precio para que la referencia no cambie si el inventario cambia.
ALTER TABLE suministro
  ADD COLUMN tipo ENUM('Insumo','Materia prima') NOT NULL DEFAULT 'Insumo' AFTER id_referencia,
  ADD COLUMN id_insumo VARCHAR(30) NULL AFTER tipo,
  ADD COLUMN id_materia VARCHAR(30) NULL AFTER id_insumo,
  ADD COLUMN nombre VARCHAR(100) NULL AFTER id_materia,
  ADD COLUMN unidad VARCHAR(30) NULL AFTER valor_unitario,
  ADD KEY fk_suministro_insumo (id_insumo),
  ADD KEY fk_suministro_materia (id_materia),
  ADD CONSTRAINT fk_suministro_insumo FOREIGN KEY (id_insumo)
    REFERENCES insumo (id_insumo) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_suministro_materia FOREIGN KEY (id_materia)
    REFERENCES materia_prima (id_materia) ON DELETE SET NULL ON UPDATE CASCADE;

-- Tallas de la materia prima: cuánto se usa en cada talla. suministro.cantidad guarda el promedio.
CREATE TABLE suministro_talla (
  id_talla INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_suministro INT UNSIGNED NOT NULL,
  talla VARCHAR(20) NOT NULL,
  cantidad DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id_talla),
  KEY fk_talla_suministro (id_suministro),
  CONSTRAINT fk_talla_suministro FOREIGN KEY (id_suministro)
    REFERENCES suministro (id_suministro) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
