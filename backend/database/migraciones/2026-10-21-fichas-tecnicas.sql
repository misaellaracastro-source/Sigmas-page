-- Fichas técnicas: una referencia con sus procesos y las cantidades por talla.
-- fecha guarda el día en que se creó la ficha. Las descripciones y la foto se toman de la referencia.
CREATE TABLE ficha_tecnica (
  id_ficha INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nit_usuario VARCHAR(20) NOT NULL,
  id_referencia VARCHAR(30) NULL,
  fecha DATE NOT NULL,
  observaciones TEXT NULL,
  PRIMARY KEY (id_ficha),
  KEY idx_ficha_fecha (nit_usuario, fecha),
  KEY fk_ficha_referencia (id_referencia),
  CONSTRAINT fk_ficha_usuario FOREIGN KEY (nit_usuario)
    REFERENCES usuario (nit) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ficha_referencia FOREIGN KEY (id_referencia)
    REFERENCES referencia (id_referencia) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Procesos de la ficha en orden (corte, confección, estampado…)
CREATE TABLE ficha_proceso (
  id_proceso INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_ficha INT UNSIGNED NOT NULL,
  orden SMALLINT UNSIGNED NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT NULL,
  PRIMARY KEY (id_proceso),
  KEY fk_proceso_ficha (id_ficha),
  CONSTRAINT fk_proceso_ficha FOREIGN KEY (id_ficha)
    REFERENCES ficha_tecnica (id_ficha) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cantidad de prendas por talla
CREATE TABLE ficha_talla (
  id_ficha_talla INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_ficha INT UNSIGNED NOT NULL,
  talla VARCHAR(20) NOT NULL,
  cantidad INT UNSIGNED NOT NULL,
  PRIMARY KEY (id_ficha_talla),
  KEY fk_ficha_talla_ficha (id_ficha),
  CONSTRAINT fk_ficha_talla_ficha FOREIGN KEY (id_ficha)
    REFERENCES ficha_tecnica (id_ficha) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
