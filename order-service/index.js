const { ApolloServer, gql } = require('apollo-server');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const fs = require('fs');

const typeDefs = gql(fs.readFileSync('./schema.graphql', { encoding: 'utf-8' }));

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 5432
});

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// URL SERVICE LAIN (WAJIB ISI HOSTING URL)
const USER_SERVICE_URL = process.env.USER_SERVICE_URL;     // contoh: https://user-service.up.railway.app/graphql
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL; // contoh: https://product-service.up.railway.app/graphql

async function fetchUserProfile(token) {
  const res = await fetch(USER_SERVICE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      query: `
        query {
          me {
            id
            name
            email
          }
        }
      `
    })
  });

  const json = await res.json();
  return json.data.me;
}

async function fetchProductById(id) {
  const res = await fetch(PRODUCT_SERVICE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        query($id: ID!) {
          productById(id: $id) {
            id
            name
            price
            stock
          }
        }
      `,
      variables: { id }
    })
  });

  const json = await res.json();
  return json.data.productById;
}

const resolvers = {
  Query: {
    myOrders: async (_, __, { user }) => {
      if (!user) throw new Error("Unauthorized");

      const res = await pool.query(
        "SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC",
        [user.id]
      );
      return res.rows;
    },

    orderById: async (_, { id }, { user }) => {
      if (!user) throw new Error("Unauthorized");

      const res = await pool.query("SELECT * FROM orders WHERE id=$1", [id]);
      return res.rows[0];
    }
  },

  Mutation: {
    createOrder: async (_, { productId, quantity }, { token }) => {
      if (!token) throw new Error("Unauthorized");

      // 1. Ambil user dari User Service
      const userProfile = await fetchUserProfile(token);
      if (!userProfile) throw new Error("User not found");

      // 2. Ambil produk dari Product Service
      const product = await fetchProductById(productId);
      if (!product) throw new Error("Product not found");

      if (product.stock < quantity) {
        throw new Error("Stock not enough");
      }

      const totalPrice = product.price * quantity;

      // 3. Simpan snapshot ke database (PERMANEN)
      const res = await pool.query(
        `INSERT INTO orders(
          user_id, user_name, user_email,
          product_id, product_name, product_price,
          quantity, total_price, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          userProfile.id,
          userProfile.name,
          userProfile.email,
          product.id,
          product.name,
          product.price,
          quantity,
          totalPrice,
          "CREATED"
        ]
      );

      return res.rows[0];
    },

    updateOrderStatus: async (_, { id, status }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error("Admin only");
      }

      const res = await pool.query(
        "UPDATE orders SET status=$1 WHERE id=$2 RETURNING *",
        [status, id]
      );
      return res.rows[0];
    },

    deleteOrder: async (_, { id }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error("Admin only");
      }

      await pool.query("DELETE FROM orders WHERE id=$1", [id]);
      return true;
    }
  }
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => {
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) {
      const token = auth.replace("Bearer ", "");
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return { user: decoded, token };
      } catch (err) {
        return {};
      }
    }
    return {};
  }
});

server.listen({ port: 4003 }).then(({ url }) => {
  console.log(`Order Service running at ${url}`);
});
