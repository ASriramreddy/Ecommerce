import "dotenv/config";
import mysql from "mysql2/promise";

const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
});

console.log("✅ Aiven MySQL connected!");

const [rows] = await connection.query("SELECT 1 AS test");
console.log(rows);

await connection.end();