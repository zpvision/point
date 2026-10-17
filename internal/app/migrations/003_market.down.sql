DROP TABLE market_reviews, market_orders, market_products, market_uploads, market_sellers;
DELETE FROM schema_migrations WHERE name='003_market.up.sql';
