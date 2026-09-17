require("dotenv").config();

const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.PG_RAG_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  const result = await client.query(`
    SELECT
      vector_dims(embedding) AS dimensions,
      embedding <=> embedding AS self_distance
    FROM document_chunks
    LIMIT 1;
  `);

  console.table(result.rows);

  await client.end();
}

main().catch(console.error);