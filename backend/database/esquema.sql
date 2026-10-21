-- Estructura de la base de datos de SigmaS (sin datos).
-- Generado con: npm run esquema
-- Para una base nueva: ejecutar este archivo completo una sola vez.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `usuario` (
  `nit` varchar(20) NOT NULL,
  `nombre_dueno` varchar(100) NOT NULL,
  `foto` varchar(255) DEFAULT NULL,
  `nombre_empresa` varchar(100) NOT NULL,
  `correo` varchar(120) DEFAULT NULL,
  `google_id` varchar(64) DEFAULT NULL,
  `logo_empresa` varchar(255) DEFAULT NULL,
  `contrasena` varchar(255) NOT NULL,
  `direccion_empresa` varchar(150) DEFAULT NULL,
  `telefono_contacto` varchar(20) DEFAULT NULL,
  `red_social` varchar(150) DEFAULT NULL,
  PRIMARY KEY (`nit`),
  UNIQUE KEY `uq_usuario_correo` (`correo`),
  UNIQUE KEY `uq_usuario_google` (`google_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `factura` (
  `nombre_factura` varchar(50) NOT NULL,
  `nit_usuario` varchar(20) NOT NULL,
  `empresa` varchar(100) NOT NULL,
  `fecha` date NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `archivo` varchar(255) DEFAULT NULL,
  `archivo_nombre` varchar(255) DEFAULT NULL,
  `estado` enum('Pagada','En proceso','Vencida') NOT NULL DEFAULT 'En proceso',
  `fecha_pago` date DEFAULT NULL,
  PRIMARY KEY (`nombre_factura`),
  KEY `idx_factura_fecha` (`nit_usuario`,`fecha`),
  CONSTRAINT `fk_factura_usuario` FOREIGN KEY (`nit_usuario`) REFERENCES `usuario` (`nit`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vinculados` (
  `identificacion` varchar(30) NOT NULL,
  `nit_usuario` varchar(20) NOT NULL,
  `tipo_id` enum('NIT','Cedula') NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `direccion` varchar(150) DEFAULT NULL,
  `contacto` varchar(50) DEFAULT NULL,
  `ciudad` varchar(60) DEFAULT NULL,
  `correo` varchar(100) DEFAULT NULL,
  `tipo` enum('Proveedor','Cliente','Tercero') NOT NULL,
  `actividad` varchar(100) DEFAULT NULL,
  `tipo_inventario` enum('Insumo','Materia prima') DEFAULT NULL,
  PRIMARY KEY (`identificacion`),
  KEY `fk_vinculados_usuario` (`nit_usuario`),
  CONSTRAINT `fk_vinculados_usuario` FOREIGN KEY (`nit_usuario`) REFERENCES `usuario` (`nit`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `insumo` (
  `id_insumo` varchar(30) NOT NULL,
  `nit_usuario` varchar(20) NOT NULL,
  `id_vinculado` varchar(30) DEFAULT NULL,
  `categoria` varchar(60) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `talla` varchar(20) DEFAULT NULL,
  `cantidad` decimal(12,2) NOT NULL DEFAULT 0.00,
  `valor_unidad` decimal(12,2) NOT NULL DEFAULT 0.00,
  `foto` varchar(255) DEFAULT NULL,
  `stock_minimo` decimal(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id_insumo`),
  KEY `fk_insumo_usuario` (`nit_usuario`),
  KEY `fk_insumo_vinculado` (`id_vinculado`),
  CONSTRAINT `fk_insumo_usuario` FOREIGN KEY (`nit_usuario`) REFERENCES `usuario` (`nit`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_insumo_vinculado` FOREIGN KEY (`id_vinculado`) REFERENCES `vinculados` (`identificacion`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `materia_prima` (
  `id_materia` varchar(30) NOT NULL,
  `nit_usuario` varchar(20) NOT NULL,
  `id_vinculado` varchar(30) DEFAULT NULL,
  `nombre` varchar(100) NOT NULL,
  `cantidad` decimal(12,2) NOT NULL DEFAULT 0.00,
  `descripcion` text DEFAULT NULL,
  `composicion` varchar(150) DEFAULT NULL,
  `tipo_tejido` varchar(60) DEFAULT NULL,
  `color` varchar(40) DEFAULT NULL,
  `precio` decimal(12,2) NOT NULL DEFAULT 0.00,
  `unidad_medida` enum('metro','centimetro','metro cuadrado','kilogramo','rollo','pieza') NOT NULL,
  `stock_minimo` decimal(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id_materia`),
  KEY `fk_materia_usuario` (`nit_usuario`),
  KEY `fk_materia_vinculado` (`id_vinculado`),
  CONSTRAINT `fk_materia_usuario` FOREIGN KEY (`nit_usuario`) REFERENCES `usuario` (`nit`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_materia_vinculado` FOREIGN KEY (`id_vinculado`) REFERENCES `vinculados` (`identificacion`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `referencia` (
  `id_referencia` varchar(30) NOT NULL,
  `nit_usuario` varchar(20) NOT NULL,
  `id_vinculado` varchar(30) DEFAULT NULL,
  `foto` varchar(255) DEFAULT NULL,
  `tipo` varchar(60) DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `valor_prenda` decimal(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id_referencia`),
  KEY `fk_referencia_usuario` (`nit_usuario`),
  KEY `fk_referencia_vinculado` (`id_vinculado`),
  CONSTRAINT `fk_referencia_usuario` FOREIGN KEY (`nit_usuario`) REFERENCES `usuario` (`nit`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_referencia_vinculado` FOREIGN KEY (`id_vinculado`) REFERENCES `vinculados` (`identificacion`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cotizacion` (
  `id_cotizacion` varchar(30) NOT NULL,
  `nit_usuario` varchar(20) NOT NULL,
  `id_referencia` varchar(30) DEFAULT NULL,
  `ref_codigo` varchar(30) DEFAULT NULL,
  `ref_tipo` varchar(60) DEFAULT NULL,
  `ref_foto` varchar(255) DEFAULT NULL,
  `id_vinculado` varchar(30) DEFAULT NULL,
  `cantidad` int(10) unsigned NOT NULL DEFAULT 1,
  `valor_prenda` decimal(12,2) NOT NULL DEFAULT 0.00,
  `valor` decimal(14,2) NOT NULL DEFAULT 0.00,
  `utilidad` decimal(5,2) NOT NULL DEFAULT 0.00,
  `subtotal` decimal(14,2) NOT NULL DEFAULT 0.00,
  `iva` decimal(5,2) NOT NULL DEFAULT 0.00,
  `precio_final` decimal(14,2) NOT NULL DEFAULT 0.00,
  `fecha` date NOT NULL,
  PRIMARY KEY (`id_cotizacion`),
  KEY `fk_cotizacion_referencia` (`id_referencia`),
  KEY `idx_cotizacion_fecha` (`nit_usuario`,`fecha`),
  KEY `fk_cotizacion_vinculado` (`id_vinculado`),
  CONSTRAINT `fk_cotizacion_referencia` FOREIGN KEY (`id_referencia`) REFERENCES `referencia` (`id_referencia`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_cotizacion_usuario` FOREIGN KEY (`nit_usuario`) REFERENCES `usuario` (`nit`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cotizacion_vinculado` FOREIGN KEY (`id_vinculado`) REFERENCES `vinculados` (`identificacion`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `descripcion` (
  `id_descripcion` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `id_referencia` varchar(30) NOT NULL,
  `nombre_descripcion` varchar(100) NOT NULL,
  `descripcion` text DEFAULT NULL,
  PRIMARY KEY (`id_descripcion`),
  KEY `fk_descripcion_referencia` (`id_referencia`),
  CONSTRAINT `fk_descripcion_referencia` FOREIGN KEY (`id_referencia`) REFERENCES `referencia` (`id_referencia`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ficha_tecnica` (
  `id_ficha` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nit_usuario` varchar(20) NOT NULL,
  `id_referencia` varchar(30) DEFAULT NULL,
  `fecha` date NOT NULL,
  `observaciones` text DEFAULT NULL,
  PRIMARY KEY (`id_ficha`),
  KEY `idx_ficha_fecha` (`nit_usuario`,`fecha`),
  KEY `fk_ficha_referencia` (`id_referencia`),
  CONSTRAINT `fk_ficha_referencia` FOREIGN KEY (`id_referencia`) REFERENCES `referencia` (`id_referencia`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ficha_usuario` FOREIGN KEY (`nit_usuario`) REFERENCES `usuario` (`nit`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `precio_insumo` (
  `id_precio` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `id_insumo` varchar(30) NOT NULL,
  `unidad` varchar(30) NOT NULL,
  `valor` decimal(12,2) NOT NULL,
  PRIMARY KEY (`id_precio`),
  UNIQUE KEY `uq_precio_insumo` (`id_insumo`,`unidad`),
  CONSTRAINT `fk_precio_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `insumo` (`id_insumo`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `precio_materia` (
  `id_precio` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `id_materia` varchar(30) NOT NULL,
  `unidad` varchar(30) NOT NULL,
  `valor` decimal(12,2) NOT NULL,
  PRIMARY KEY (`id_precio`),
  UNIQUE KEY `uq_precio_materia` (`id_materia`,`unidad`),
  CONSTRAINT `fk_precio_materia` FOREIGN KEY (`id_materia`) REFERENCES `materia_prima` (`id_materia`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `suministro` (
  `id_suministro` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `id_referencia` varchar(30) NOT NULL,
  `tipo` enum('Insumo','Materia prima') NOT NULL DEFAULT 'Insumo',
  `id_insumo` varchar(30) DEFAULT NULL,
  `id_materia` varchar(30) DEFAULT NULL,
  `nombre` varchar(100) DEFAULT NULL,
  `categoria` varchar(60) DEFAULT NULL,
  `subcategoria` varchar(60) DEFAULT NULL,
  `cantidad` decimal(12,2) NOT NULL DEFAULT 0.00,
  `valor_unitario` decimal(12,2) NOT NULL DEFAULT 0.00,
  `unidad` varchar(30) DEFAULT NULL,
  `valor_total` decimal(14,2) GENERATED ALWAYS AS (`cantidad` * `valor_unitario`) STORED,
  `color` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`id_suministro`),
  KEY `fk_suministro_referencia` (`id_referencia`),
  KEY `fk_suministro_insumo` (`id_insumo`),
  KEY `fk_suministro_materia` (`id_materia`),
  CONSTRAINT `fk_suministro_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `insumo` (`id_insumo`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_suministro_materia` FOREIGN KEY (`id_materia`) REFERENCES `materia_prima` (`id_materia`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_suministro_referencia` FOREIGN KEY (`id_referencia`) REFERENCES `referencia` (`id_referencia`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `calendario` (
  `id_evento` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nit_usuario` varchar(20) NOT NULL,
  `titulo` varchar(120) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `tipo` enum('Pendiente','Entrega','Reunion','Pago','Compra','Produccion','Otro') NOT NULL DEFAULT 'Pendiente',
  `prioridad` enum('Baja','Media','Alta') NOT NULL DEFAULT 'Media',
  `estado` enum('Pendiente','En proceso','Completado','Cancelado') NOT NULL DEFAULT 'Pendiente',
  `fecha_inicio` datetime NOT NULL,
  `fecha_entrega` datetime DEFAULT NULL,
  `recordatorio` datetime DEFAULT NULL,
  `id_insumo` varchar(30) DEFAULT NULL,
  `id_materia` varchar(30) DEFAULT NULL,
  `id_vinculado` varchar(30) DEFAULT NULL,
  `id_referencia` varchar(30) DEFAULT NULL,
  `id_cotizacion` varchar(30) DEFAULT NULL,
  `nombre_factura` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id_evento`),
  KEY `idx_calendario_fecha` (`nit_usuario`,`fecha_inicio`),
  KEY `fk_cal_insumo` (`id_insumo`),
  KEY `fk_cal_materia` (`id_materia`),
  KEY `fk_cal_vinculado` (`id_vinculado`),
  KEY `fk_cal_referencia` (`id_referencia`),
  KEY `fk_cal_cotizacion` (`id_cotizacion`),
  KEY `fk_cal_factura` (`nombre_factura`),
  CONSTRAINT `fk_cal_cotizacion` FOREIGN KEY (`id_cotizacion`) REFERENCES `cotizacion` (`id_cotizacion`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_cal_factura` FOREIGN KEY (`nombre_factura`) REFERENCES `factura` (`nombre_factura`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_cal_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `insumo` (`id_insumo`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_cal_materia` FOREIGN KEY (`id_materia`) REFERENCES `materia_prima` (`id_materia`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_cal_referencia` FOREIGN KEY (`id_referencia`) REFERENCES `referencia` (`id_referencia`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_cal_usuario` FOREIGN KEY (`nit_usuario`) REFERENCES `usuario` (`nit`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cal_vinculado` FOREIGN KEY (`id_vinculado`) REFERENCES `vinculados` (`identificacion`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cotizacion_descuento` (
  `id_descuento` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `id_cotizacion` varchar(30) NOT NULL,
  `tipo` enum('Insumo','Materia prima') NOT NULL,
  `id_insumo` varchar(30) DEFAULT NULL,
  `id_materia` varchar(30) DEFAULT NULL,
  `nombre` varchar(100) DEFAULT NULL,
  `cantidad` decimal(12,2) NOT NULL,
  `unidad` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`id_descuento`),
  KEY `fk_descuento_cotizacion` (`id_cotizacion`),
  KEY `fk_descuento_insumo` (`id_insumo`),
  KEY `fk_descuento_materia` (`id_materia`),
  CONSTRAINT `fk_descuento_cotizacion` FOREIGN KEY (`id_cotizacion`) REFERENCES `cotizacion` (`id_cotizacion`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_descuento_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `insumo` (`id_insumo`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_descuento_materia` FOREIGN KEY (`id_materia`) REFERENCES `materia_prima` (`id_materia`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cotizacion_material` (
  `id_material` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `id_cotizacion` varchar(30) NOT NULL,
  `tipo` enum('Insumo','Materia prima') NOT NULL,
  `codigo` varchar(30) DEFAULT NULL,
  `nombre` varchar(100) DEFAULT NULL,
  `categoria` varchar(60) DEFAULT NULL,
  `color` varchar(40) DEFAULT NULL,
  `unidad` varchar(30) DEFAULT NULL,
  `por_prenda` decimal(12,2) NOT NULL,
  `valor_unitario` decimal(12,2) NOT NULL,
  PRIMARY KEY (`id_material`),
  KEY `fk_material_cotizacion` (`id_cotizacion`),
  CONSTRAINT `fk_material_cotizacion` FOREIGN KEY (`id_cotizacion`) REFERENCES `cotizacion` (`id_cotizacion`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ficha_proceso` (
  `id_proceso` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `id_ficha` int(10) unsigned NOT NULL,
  `orden` smallint(5) unsigned NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `descripcion` text DEFAULT NULL,
  PRIMARY KEY (`id_proceso`),
  KEY `fk_proceso_ficha` (`id_ficha`),
  CONSTRAINT `fk_proceso_ficha` FOREIGN KEY (`id_ficha`) REFERENCES `ficha_tecnica` (`id_ficha`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ficha_talla` (
  `id_ficha_talla` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `id_ficha` int(10) unsigned NOT NULL,
  `talla` varchar(20) NOT NULL,
  `cantidad` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id_ficha_talla`),
  KEY `fk_ficha_talla_ficha` (`id_ficha`),
  CONSTRAINT `fk_ficha_talla_ficha` FOREIGN KEY (`id_ficha`) REFERENCES `ficha_tecnica` (`id_ficha`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `suministro_talla` (
  `id_talla` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `id_suministro` int(10) unsigned NOT NULL,
  `talla` varchar(20) NOT NULL,
  `cantidad` decimal(12,2) NOT NULL,
  PRIMARY KEY (`id_talla`),
  KEY `fk_talla_suministro` (`id_suministro`),
  CONSTRAINT `fk_talla_suministro` FOREIGN KEY (`id_suministro`) REFERENCES `suministro` (`id_suministro`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `alertas` (
  `id_alerta` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nit_usuario` varchar(20) NOT NULL,
  `tipo` enum('Stock bajo','Factura vencida','Factura por vencer','Entrega proxima','Recordatorio') NOT NULL,
  `mensaje` varchar(255) NOT NULL,
  `fecha_generada` datetime NOT NULL DEFAULT current_timestamp(),
  `leida` tinyint(1) NOT NULL DEFAULT 0,
  `correo_enviado` tinyint(1) NOT NULL DEFAULT 0,
  `id_insumo` varchar(30) DEFAULT NULL,
  `id_materia` varchar(30) DEFAULT NULL,
  `nombre_factura` varchar(50) DEFAULT NULL,
  `id_evento` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id_alerta`),
  KEY `idx_alertas_leida` (`nit_usuario`,`leida`),
  KEY `fk_alerta_insumo` (`id_insumo`),
  KEY `fk_alerta_materia` (`id_materia`),
  KEY `fk_alerta_factura` (`nombre_factura`),
  KEY `fk_alerta_evento` (`id_evento`),
  CONSTRAINT `fk_alerta_evento` FOREIGN KEY (`id_evento`) REFERENCES `calendario` (`id_evento`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_alerta_factura` FOREIGN KEY (`nombre_factura`) REFERENCES `factura` (`nombre_factura`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_alerta_insumo` FOREIGN KEY (`id_insumo`) REFERENCES `insumo` (`id_insumo`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_alerta_materia` FOREIGN KEY (`id_materia`) REFERENCES `materia_prima` (`id_materia`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_alerta_usuario` FOREIGN KEY (`nit_usuario`) REFERENCES `usuario` (`nit`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
