CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  user_name VARCHAR(150) NOT NULL,
  user_email VARCHAR(150) NOT NULL,
  product_id INT NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  product_price NUMERIC(12,2) NOT NULL,
  quantity INT NOT NULL,
  total_price NUMERIC(12,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'CREATED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
