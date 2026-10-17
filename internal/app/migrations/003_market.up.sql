CREATE TABLE market_sellers(
 id text PRIMARY KEY REFERENCES users(id), name text NOT NULL, legal_name text NOT NULL,
 tax_id text NOT NULL, contact text NOT NULL, warehouse text NOT NULL, created bigint NOT NULL
);
CREATE TABLE market_uploads(id text PRIMARY KEY,owner_id text NOT NULL REFERENCES users(id),storage_name text UNIQUE NOT NULL,mime text NOT NULL,created bigint NOT NULL);
CREATE TABLE market_products(
 id text PRIMARY KEY,seller_id text NOT NULL REFERENCES market_sellers(id),name text NOT NULL,
 description text NOT NULL,category text NOT NULL,price bigint NOT NULL CHECK(price BETWEEN 100 AND 100000000),
 stock integer NOT NULL CHECK(stock BETWEEN 0 AND 100000),image text NOT NULL REFERENCES market_uploads(id),
 active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 0,created bigint NOT NULL
);
CREATE INDEX market_products_seller ON market_products(seller_id,created DESC);
CREATE TABLE market_orders(
 id text PRIMARY KEY,buyer text NOT NULL REFERENCES users(id),seller_id text NOT NULL REFERENCES market_sellers(id),
 product_id text NOT NULL REFERENCES market_products(id),name text NOT NULL,price bigint NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),contact text NOT NULL,area text NOT NULL,
 proposal text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','proposed','confirmed','shipped','ready','completed','cancelled')),
 created bigint NOT NULL,CHECK(buyer<>seller_id)
);
CREATE INDEX market_orders_buyer ON market_orders(buyer,created DESC);
CREATE INDEX market_orders_seller ON market_orders(seller_id,created DESC);
CREATE TABLE market_reviews(order_id text PRIMARY KEY REFERENCES market_orders(id),product_id text NOT NULL REFERENCES market_products(id),rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),comment text NOT NULL,created bigint NOT NULL);
