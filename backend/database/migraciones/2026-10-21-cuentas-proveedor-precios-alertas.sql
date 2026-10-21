-- 1. Usuario: correo (para alertas e inicio con Google) y cuenta de Google vinculada
ALTER TABLE usuario
  ADD COLUMN correo VARCHAR(120) NULL AFTER nombre_empresa,
  ADD COLUMN google_id VARCHAR(64) NULL AFTER correo,
  ADD UNIQUE KEY uq_usuario_correo (correo),
  ADD UNIQUE KEY uq_usuario_google (google_id);

-- 2. Insumo: proveedor (vinculado con tipo de inventario "Insumo")
ALTER TABLE insumo
  ADD COLUMN id_vinculado VARCHAR(30) NULL AFTER nit_usuario,
  ADD KEY fk_insumo_vinculado (id_vinculado),
  ADD CONSTRAINT fk_insumo_vinculado FOREIGN KEY (id_vinculado)
    REFERENCES vinculados (identificacion) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Varios precios por insumo, cada uno con su unidad (por metro, por docena, por rollo...)
--    insumo.valor_unidad conserva el primer precio para lo que ya lo usa.
CREATE TABLE precio_insumo (
  id_precio INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_insumo VARCHAR(30) NOT NULL,
  unidad VARCHAR(30) NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id_precio),
  UNIQUE KEY uq_precio_insumo (id_insumo, unidad),
  CONSTRAINT fk_precio_insumo FOREIGN KEY (id_insumo)
    REFERENCES insumo (id_insumo) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Lo mismo para materia prima. materia_prima.precio conserva el primer precio.
CREATE TABLE precio_materia (
  id_precio INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_materia VARCHAR(30) NOT NULL,
  unidad VARCHAR(30) NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id_precio),
  UNIQUE KEY uq_precio_materia (id_materia, unidad),
  CONSTRAINT fk_precio_materia FOREIGN KEY (id_materia)
    REFERENCES materia_prima (id_materia) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Alertas: saber si ya se envió el correo
ALTER TABLE alertas
  ADD COLUMN correo_enviado TINYINT(1) NOT NULL DEFAULT 0 AFTER leida;

-- 6. Los registros que ya existían conservan su precio como primer precio de la lista
INSERT INTO precio_insumo (id_insumo, unidad, valor)
  SELECT i.id_insumo, 'unidad', i.valor_unidad FROM insumo i
  WHERE NOT EXISTS (SELECT 1 FROM precio_insumo p WHERE p.id_insumo = i.id_insumo);

INSERT INTO precio_materia (id_materia, unidad, valor)
  SELECT m.id_materia, IF(m.unidad_medida = 'centimetro', 'metro', m.unidad_medida), m.precio FROM materia_prima m
  WHERE NOT EXISTS (SELECT 1 FROM precio_materia p WHERE p.id_materia = m.id_materia);
