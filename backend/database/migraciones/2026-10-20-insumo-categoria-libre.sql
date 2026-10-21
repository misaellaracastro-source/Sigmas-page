-- Las categorías de insumo dejan de ser una lista fija (ENUM) para que cada
-- empresa pueda crear las suyas (Cierre, Cinta, Bolsa, Sesgo empitado...).
-- Los valores que ya existían se conservan tal cual.
ALTER TABLE insumo MODIFY categoria VARCHAR(60) NOT NULL;
