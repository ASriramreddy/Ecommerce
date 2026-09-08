import "dotenv/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import fs from "fs";
import express from "express";
import mysql from "mysql2";
import cors from "cors";
import path from "path";
import crypto from "crypto";
import nodemailer from "nodemailer";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRootEnv = resolve(__dirname, "../.env");
if (fs.existsSync(projectRootEnv)) {
    const lines = fs.readFileSync(projectRootEnv, "utf8").split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        if (process.env[key] === undefined) {
            process.env[key] = trimmed.slice(eq + 1).trim();
        }
    }
}

const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = Number(process.env.EMAIL_PORT);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const ORDER_NOTIFICATION_EMAIL = (process.env.ORDER_NOTIFICATION_EMAIL || process.env.EMAIL_USER || "").trim();

let emailTransporter = null;
if (EMAIL_HOST && EMAIL_PORT && EMAIL_USER && EMAIL_PASS) {
    emailTransporter = nodemailer.createTransport({
        host: EMAIL_HOST,
        port: EMAIL_PORT,
        secure: Number(EMAIL_PORT) === 465,
        auth: { user: EMAIL_USER, pass: EMAIL_PASS }
    });
    emailTransporter.verify().then(
        () => {
            console.log(`Email transporter verified. Sending as: ${EMAIL_USER}. Order notifications go to: ${ORDER_NOTIFICATION_EMAIL || "(unset)"}`);
        },
        (err) => console.error("Email transporter verification failed:", err.message)
    );
} else {
    console.warn("Email not configured. Set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS in .env to enable order confirmation emails.");
}

async function sendOrderEmail({ to, name, id, items, subtotal, discount, totalAmount, deliveryCharge, address, couponCode }) {
    if (!emailTransporter) {
        throw new Error("Email transporter not configured. Check EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS in .env");
    }
    const fmt = (value) => `Rs.${Number(value || 0).toLocaleString("en-IN")}`;
    const subtotalText = fmt(subtotal);
    const discountText = fmt(discount);
    const totalText = fmt(totalAmount);
    const deliveryText = fmt(deliveryCharge);
    const couponRow = couponCode ? `<tr><td style="padding:10px 14px;color:#666;">Coupon</td><td style="padding:10px 14px;text-align:right;"><strong>${couponCode}</strong></td></tr>` : "";
    const discountRow = Number(discount) > 0 ? `<tr><td style="padding:10px 14px;color:#666;">Discount</td><td style="padding:10px 14px;text-align:right;color:#2c5f2d;">-&#8377;${Number(discount).toLocaleString("en-IN")}</td></tr>` : "";

    const customerEmail = String(to || "").trim();
    const primaryRecipient = customerEmail || ORDER_NOTIFICATION_EMAIL;
    const ccList = ORDER_NOTIFICATION_EMAIL && customerEmail && ORDER_NOTIFICATION_EMAIL.toLowerCase() !== customerEmail.toLowerCase()
        ? [ORDER_NOTIFICATION_EMAIL]
        : [];

    const mailOptions = {
        from: `Sriram Store <${EMAIL_USER}>`,
        to: primaryRecipient,
        cc: ccList,
        replyTo: ORDER_NOTIFICATION_EMAIL || customerEmail || undefined,
        subject: `Order Confirmed - ${id} | Sriram Store`,
        headers: {
            "X-Entity-Ref-ID": id,
            "X-Mailer": "SriramStore/1.0"
        },
        text: `Order Confirmed!\n\nHello ${name},\n\nThank you for your order with Sriram Store.\n\nOrder ID: ${id}\nItems: ${items}${couponCode ? `\nCoupon: ${couponCode}` : ""}\nSubtotal: ${subtotalText}${Number(discount) > 0 ? `\nDiscount: -${discountText}` : ""}\nDelivery Charge: ${deliveryText}\nTotal Paid: ${totalText}\nDelivery Address: ${address}\n\nYour order has been successfully placed and will be processed shortly.\n\nThank you for shopping with us!\n\n— Sriram Store`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#fafafa;padding:20px;">
                <div style="background:#2c5f2d;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;text-align:center;">
                    <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:0.3px;">Order Confirmed!</h1>
                </div>
                <div style="background:#fff;padding:24px 22px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;">
                    <p style="margin:0 0 14px;">Hello <strong>${name}</strong>,</p>
                    <p style="margin:0 0 18px;color:#444;">Thank you for your order with <strong>Sriram Store</strong>. Below is your complete payment summary.</p>
                    <table style="width:100%;border-collapse:collapse;margin:0 0 18px;background:#f7faf5;border:1px solid #e3ecdc;border-radius:8px;">
                        <tr><td style="padding:10px 14px;color:#666;">Order ID</td><td style="padding:10px 14px;text-align:right;"><strong>${id}</strong></td></tr>
                        <tr><td style="padding:10px 14px;color:#666;">Items</td><td style="padding:10px 14px;text-align:right;"><strong>${items}</strong></td></tr>
                        ${couponRow}
                        <tr><td style="padding:10px 14px;color:#666;">Subtotal</td><td style="padding:10px 14px;text-align:right;">&#8377;${Number(subtotal || 0).toLocaleString("en-IN")}</td></tr>
                        ${discountRow}
                        <tr><td style="padding:10px 14px;color:#666;">Delivery Charge</td><td style="padding:10px 14px;text-align:right;">&#8377;${Number(deliveryCharge).toLocaleString("en-IN")}</td></tr>
                        <tr style="background:#eaf3e3;"><td style="padding:14px;color:#2c5f2d;font-size:15px;"><strong>Total Paid</strong></td><td style="padding:14px;text-align:right;color:#2c5f2d;font-size:20px;"><strong>&#8377;${Number(totalAmount).toLocaleString("en-IN")}</strong></td></tr>
                        <tr><td style="padding:10px 14px;color:#666;vertical-align:top;">Delivery Address</td><td style="padding:10px 14px;text-align:right;">${address}</td></tr>
                    </table>
                    <p style="margin:0 0 8px;">Your order has been successfully placed and will be processed shortly.</p>
                    <p style="margin:0;color:#666;font-size:13px;">Thank you for shopping with us!</p>
                    <p style="margin:14px 0 0;color:#999;font-size:12px;">— Sriram Store</p>
                </div>
            </div>
        `
    };

    try {
        return await emailTransporter.sendMail(mailOptions);
    } catch (firstErr) {
        console.warn(`[ORDERS] First email attempt failed: ${firstErr.message}. Retrying in 1s...`);
        await new Promise((r) => setTimeout(r, 1000));
        return await emailTransporter.sendMail(mailOptions);
    }
}

const app = express();
const adminTokens = new Set();

const uploadDirectory = path.join(__dirname, "..", "public", "images", "uploads");

fs.mkdirSync(uploadDirectory, { recursive: true });


// ===============================
// MIDDLEWARE
// ===============================

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "..")));

app.use(
    "/images",
    express.static(
        path.join(__dirname, "..", "public", "images")
    )
);


// ===============================
// MYSQL DATABASE
// ===============================

const dbConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    ssl: {
        rejectUnauthorized: false
    },

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: false
};


console.log("MySQL configuration:");
console.log("Host:", dbConfig.host);
console.log("Port:", dbConfig.port);
console.log("User:", dbConfig.user);
console.log(
    "Password:",
    dbConfig.password ? "FOUND" : "MISSING"
);
console.log("Database:", dbConfig.database);


const db = mysql.createPool(dbConfig);


// ===============================
// DATABASE SCHEMA INITIALIZATION
// ===============================

async function ensureDatabaseExists() {
    console.log(`✅ Using existing database "${dbConfig.database}"`);
}

const databaseReady = (async () => {
    try {
        await db.promise().getConnection().then((connection) => connection.release());
        console.log("✅ MySQL connected successfully");

        await ensureDatabaseExists();

        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("✅ Users table is ready");
    } catch (error) {
        console.error("❌ MySQL initialization failed");
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        throw error;
    }
})();

const inventoryReady = databaseReady.then(async () => {
    const dbPromise = db.promise();
    await dbPromise.query(`
        CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            category VARCHAR(100) NOT NULL,
            image VARCHAR(255),
            description TEXT NULL,
            stock INT NOT NULL DEFAULT 0,
            discount DECIMAL(5,2) NOT NULL DEFAULT 0,
            expiry DATE NULL
        )
    `);
    const [stockColumns] = await dbPromise.query("SHOW COLUMNS FROM products LIKE 'stock'");
    if (!stockColumns.length) {
        await dbPromise.query("ALTER TABLE products ADD COLUMN stock INT NOT NULL DEFAULT 0");
    }
    const [discountColumns] = await dbPromise.query("SHOW COLUMNS FROM products LIKE 'discount'");
    if (!discountColumns.length) {
        await dbPromise.query("ALTER TABLE products ADD COLUMN discount DECIMAL(5,2) NOT NULL DEFAULT 0");
    }
    const [expiryColumns] = await dbPromise.query("SHOW COLUMNS FROM products LIKE 'expiry'");
    if (!expiryColumns.length) {
        await dbPromise.query("ALTER TABLE products ADD COLUMN expiry DATE NULL");
    }
    const [descriptionColumns] = await dbPromise.query("SHOW COLUMNS FROM products LIKE 'description'");
    if (!descriptionColumns.length) {
        await dbPromise.query("ALTER TABLE products ADD COLUMN description TEXT NULL");
    }
    console.log("✅ Products table is ready");
}).catch((error) => {
    console.error("❌ Products table setup failed:", error.message);
    throw error;
});

const profilesReady = databaseReady.then(async () => {
    const dbPromise = db.promise();
    await dbPromise.query(`
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id INT PRIMARY KEY,
            phone VARCHAR(20),
            address TEXT,
            city VARCHAR(100),
            district VARCHAR(100),
            state VARCHAR(100),
            country VARCHAR(100) DEFAULT 'India',
            pin VARCHAR(10),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    const [districtCols] = await dbPromise.query("SHOW COLUMNS FROM user_profiles LIKE 'district'");
    if (!districtCols.length) {
        await dbPromise.query(
            "ALTER TABLE user_profiles ADD COLUMN district VARCHAR(100) AFTER city, ADD COLUMN state VARCHAR(100) AFTER district, ADD COLUMN country VARCHAR(100) DEFAULT 'India' AFTER state"
        );
    }
    console.log("✅ User profiles table is ready");
}).catch((error) => {
    console.error("❌ User profiles table setup failed:", error.message);
    throw error;
});

const ordersReady = databaseReady.then(async () => {
    const dbPromise = db.promise();
    await dbPromise.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id VARCHAR(20) PRIMARY KEY,
            user_id INT NOT NULL,
            items INT NOT NULL,
            address TEXT NOT NULL,
            delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0,
            Total_Amount DECIMAL(10,2) NOT NULL DEFAULT 0,
            status ENUM('placed','processing','shipped','delivered','cancelled','returned') NOT NULL DEFAULT 'placed',
            coupon_code VARCHAR(50) NULL,
            coupon_discount DECIMAL(10,2) NOT NULL DEFAULT 0,
            discount DECIMAL(10,2) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    const [deliveryCols] = await dbPromise.query("SHOW COLUMNS FROM orders LIKE 'delivery_charge'");
    if (!deliveryCols.length) {
        await dbPromise.query("ALTER TABLE orders ADD COLUMN delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0");
    }
    const [totalCols] = await dbPromise.query("SHOW COLUMNS FROM orders LIKE 'Total_Amount'");
    if (!totalCols.length) {
        await dbPromise.query("ALTER TABLE orders ADD COLUMN Total_Amount DECIMAL(10,2) NOT NULL DEFAULT 0");
    }
    const [statusCols] = await dbPromise.query("SHOW COLUMNS FROM orders LIKE 'status'");
    if (statusCols.length) {
        const type = statusCols[0].Type || "";
        if (!type.includes("returned")) {
            await dbPromise.query("ALTER TABLE orders MODIFY COLUMN status ENUM('placed','processing','shipped','delivered','cancelled','returned') NOT NULL DEFAULT 'placed'");
        }
    }
    const [couponCodeCols] = await dbPromise.query("SHOW COLUMNS FROM orders LIKE 'coupon_code'");
    if (!couponCodeCols.length) {
        await dbPromise.query("ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(50) NULL AFTER status");
    }
    const [couponDiscountCols] = await dbPromise.query("SHOW COLUMNS FROM orders LIKE 'coupon_discount'");
    if (!couponDiscountCols.length) {
        await dbPromise.query("ALTER TABLE orders ADD COLUMN coupon_discount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER coupon_code");
    }
    const [discountCols] = await dbPromise.query("SHOW COLUMNS FROM orders LIKE 'discount'");
    if (!discountCols.length) {
        await dbPromise.query("ALTER TABLE orders ADD COLUMN discount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER coupon_discount");
    }
    console.log("✅ Orders table is ready");
}).catch((error) => {
    console.error("❌ Orders table setup failed:", error.message);
    throw error;
});

const deliveryChargesReady = databaseReady.then(async () => {
    const dbPromise = db.promise();
    await dbPromise.query(`
        CREATE TABLE IF NOT EXISTS delivery_charges (
            state VARCHAR(100) PRIMARY KEY,
            charge DECIMAL(10,2) NOT NULL DEFAULT 0,
            description VARCHAR(255)
        )
    `);
    const [rows] = await dbPromise.query("SELECT COUNT(*) AS count FROM delivery_charges");
    if (rows[0].count === 0) {
        const defaultCharges = [
            ["Delhi", 30, "Capital territory"],
            ["Maharashtra", 35, "Western region"],
            ["Tamil Nadu", 35, "Southern region"],
            ["Karnataka", 40, "Southern region"],
            ["Telangana", 40, "Southern region"],
            ["Andhra Pradesh", 40, "Southern region"],
            ["Kerala", 45, "Southern region"],
            ["West Bengal", 40, "Eastern region"],
            ["Odisha", 55, "Eastern region"],
            ["Bihar", 45, "Eastern region"],
            ["Jharkhand", 50, "Eastern region"],
            ["Uttar Pradesh", 45, "Northern region"],
            ["Rajasthan", 50, "Western region"],
            ["Gujarat", 40, "Western region"],
            ["Madhya Pradesh", 50, "Central region"],
            ["Chhattisgarh", 55, "Central region"],
            ["Punjab", 45, "Northern region"],
            ["Haryana", 40, "Northern region"],
            ["Uttarakhand", 50, "Northern region"],
            ["Himachal Pradesh", 50, "Northern region"],
            ["Chandigarh", 30, "Union territory"]
        ];
        const placeholders = defaultCharges.map(() => "(?, ?, ?)").join(", ");
        const values = defaultCharges.flatMap(([state, charge, desc]) => [state, charge, desc]);
        await dbPromise.query(
            `INSERT INTO delivery_charges (state, charge, description) VALUES ${placeholders}`,
            values
        );
    }
    console.log("✅ Delivery charges table is ready");
}).catch((error) => {
    console.error("❌ Delivery charges table setup failed:", error.message);
    throw error;
});

const couponsReady = databaseReady.then(async () => {
    const dbPromise = db.promise();
    await dbPromise.query(`
        CREATE TABLE IF NOT EXISTS coupons (
            code VARCHAR(50) PRIMARY KEY,
            discount_percent DECIMAL(5,2) NOT NULL,
            min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
            max_uses INT DEFAULT NULL,
            used_count INT NOT NULL DEFAULT 0,
            expires_at TIMESTAMP NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log("✅ Coupons table is ready");
}).catch((error) => {
    console.error("❌ Coupons table setup failed:", error.message);
    throw error;
});

const festivalsReady = databaseReady.then(async () => {
    const dbPromise = db.promise();
    await dbPromise.query(`
        CREATE TABLE IF NOT EXISTS festivals (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(150) NOT NULL UNIQUE,
            image_url VARCHAR(500) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    const [imageCols] = await dbPromise.query("SHOW COLUMNS FROM festivals LIKE 'image_url'");
    if (!imageCols.length) {
        await dbPromise.query("ALTER TABLE festivals ADD COLUMN image_url VARCHAR(500) NULL AFTER name");
    }
    console.log("✅ Festivals table is ready");
}).catch((error) => {
    console.error("❌ Festivals table setup failed:", error.message);
    throw error;
});

const offersReady = databaseReady.then(async () => {
    const dbPromise = db.promise();
    await dbPromise.query(`
        CREATE TABLE IF NOT EXISTS offers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            festival_id INT NULL,
            name VARCHAR(150) NOT NULL,
            coupon_code VARCHAR(50) NULL,
            discount_percent DECIMAL(5,2) NOT NULL,
            min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
            start_date DATE NULL,
            end_date DATE NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            image_url VARCHAR(500) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (festival_id) REFERENCES festivals(id) ON DELETE SET NULL
        )
    `);
    const [couponCodeCols] = await dbPromise.query("SHOW COLUMNS FROM offers LIKE 'coupon_code'");
    if (!couponCodeCols.length) {
        await dbPromise.query("ALTER TABLE offers ADD COLUMN coupon_code VARCHAR(50) NULL AFTER name");
    }
    const [codeUnique] = await dbPromise.query("SHOW INDEX FROM offers WHERE Key_name = 'coupon_code'");
    if (!codeUnique.length) {
        try {
            await dbPromise.query("ALTER TABLE offers ADD UNIQUE KEY coupon_code (coupon_code)");
        } catch (e) {}
    }
    const [offerImageCols] = await dbPromise.query("SHOW COLUMNS FROM offers LIKE 'image_url'");
    if (!offerImageCols.length) {
        await dbPromise.query("ALTER TABLE offers ADD COLUMN image_url VARCHAR(500) NULL AFTER is_active");
    }
    await dbPromise.query(`
        CREATE TABLE IF NOT EXISTS offer_products (
            offer_id INT NOT NULL,
            product_id INT NOT NULL,
            PRIMARY KEY (offer_id, product_id),
            FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
    `);
    await dbPromise.query(`
        CREATE TABLE IF NOT EXISTS offer_categories (
            offer_id INT NOT NULL,
            category VARCHAR(100) NOT NULL,
            PRIMARY KEY (offer_id, category),
            FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE
        )
    `);
    console.log("✅ Offers tables are ready");
}).catch((error) => {
    console.error("❌ Offers table setup failed:", error.message);
    throw error;
});

const supportReady = databaseReady.then(async () => {
    const dbPromise = db.promise();
    await dbPromise.query(`
        CREATE TABLE IF NOT EXISTS support_tickets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            email VARCHAR(200) NOT NULL,
            phone VARCHAR(20) NULL,
            order_id VARCHAR(50) NULL,
            category VARCHAR(100) NOT NULL,
            message TEXT NOT NULL,
            status ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    const [phoneCols] = await dbPromise.query("SHOW COLUMNS FROM support_tickets LIKE 'phone'");
    if (!phoneCols.length) {
        await dbPromise.query("ALTER TABLE support_tickets ADD COLUMN phone VARCHAR(20) NULL AFTER email");
    }
    await dbPromise.query(`
        CREATE TABLE IF NOT EXISTS support_replies (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ticket_id INT NOT NULL,
            message TEXT NOT NULL,
            is_customer_reply TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
        )
    `);
    console.log("✅ Support tickets and replies tables are ready");
}).catch((error) => {
    console.error("❌ Support tickets setup failed:", error.message);
    throw error;
});

Promise.all([inventoryReady, profilesReady, ordersReady, deliveryChargesReady, couponsReady, festivalsReady, offersReady, supportReady])
    .then(() => console.log("✅ All tables are ready"))
    .catch((error) => console.error("❌ Schema setup encountered errors:", error.message));


// ===============================
// YOUR OTHER API ROUTES
// ===============================

// Keep your existing:
// app.post("/auth/register", ...)
// app.post("/auth/login", ...)
// app.get("/api/products", ...)
// app.post("/api/orders", ...)
// etc.


// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Ecommerce Backend API is running");
});

app.listen(PORT, () => {
    console.log(
        `Server running at http://localhost:${PORT}`
    );
});

app.get("/products", async (req, res) => {
    try {
        await inventoryReady;
    } catch (error) {
        console.error("Inventory setup failed:", error.message);
        return res.status(503).json({ error: "Products are temporarily unavailable" });
    }
    db.query(
        "SELECT id, name, price, category, image, description, stock, discount, expiry FROM products ORDER BY id",
        (err, result) => {
        if (err) {
            console.error("Products query failed:", err.message);
            return res.status(503).json({ error: "Products are temporarily unavailable" });
        }
        res.json(result);
        },
    );
});

app.get("/health", (req, res) => {
    db.query("SELECT 1 AS connected", (err) => {
        if (err) return res.status(503).json({ connected: false, error: err.message });
        res.json({ connected: true });
    });
});

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
    const [salt, storedHash] = storedPassword.split(":");
    if (!salt || !storedHash) return false;
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
}

app.post("/auth/register", async (req, res) => {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const adminEmail = String(process.env.ADMIN_EMAIL || "admin@sriramstore.local").toLowerCase();

    if (!name || !email || password.length < 6) {
        return res.status(400).json({ error: "Name, email, and a password of at least 6 characters are required" });
    }
    if (email === adminEmail) {
        return res.status(403).json({ error: "This email is reserved for admin access" });
    }

    try {
        await databaseReady;
        const [result] = await db.promise().query(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            [name, email, hashPassword(password)],
        );
        res.status(201).json({ user: { id: result.insertId, name, email } });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "An account with this email already exists" });
        console.error("Registration failed:", error.message);
        res.status(503).json({ error: "Could not create account" });
    }
});

app.post("/auth/login", async (req, res) => {
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const adminEmail = String(process.env.ADMIN_EMAIL || "admin@sriramstore.local").toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || "admin123");

    if (email === adminEmail) {
        if (password !== adminPassword) {
            return res.status(401).json({ error: "Invalid admin credentials" });
        }
        const token = crypto.randomBytes(32).toString("hex");
        adminTokens.add(token);
        return res.json({ token });
    }

    try {
        await databaseReady;
        const [rows] = await db.promise().query("SELECT id, name, email, password_hash FROM users WHERE email = ?", [email]);
        if (!rows.length || !verifyPassword(password, rows[0].password_hash)) {
            return res.status(401).json({ error: "Email or password is incorrect" });
        }
        res.json({ user: { id: rows[0].id, name: rows[0].name, email: rows[0].email } });
    } catch (error) {
        console.error("Login failed:", error.message);
        res.status(503).json({ error: "Could not sign in" });
    }
});

app.get("/auth/me", async (req, res) => {
    const userId = Number(req.query.userId);
    if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ error: "Valid user id is required" });
    try {
        await databaseReady;
        await profilesReady;
        const [[user]] = await db.promise().query("SELECT id, name, email, created_at FROM users WHERE id = ?", [userId]);
        if (!user) return res.status(404).json({ error: "User not found" });
        const [[profile]] = await db.promise().query("SELECT phone, address, city, district, state, country, pin FROM user_profiles WHERE user_id = ?", [userId]);
        res.json({ user, profile: profile || {} });
    } catch (error) {
        console.error("Profile fetch failed:", error.message);
        res.status(503).json({ error: "Could not load profile" });
    }
});

app.patch("/auth/me", async (req, res) => {
    const body = req.body || {};
    const userId = Number(body.userId);
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const address = String(body.address || "").trim();
    const city = String(body.city || "").trim();
    const district = String(body.district || "").trim();
    const state = String(body.state || "").trim();
    const country = String(body.country || "").trim();
    const pin = String(body.pin || "").trim();
    if (!Number.isInteger(userId) || userId < 1 || !name) return res.status(400).json({ error: "Valid user id and name are required" });
    try {
        await databaseReady;
        await profilesReady;
        await db.promise().query("UPDATE users SET name = ? WHERE id = ?", [name, userId]);
        await db.promise().query(
            "INSERT INTO user_profiles (user_id, phone, address, city, district, state, country, pin) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE phone = VALUES(phone), address = VALUES(address), city = VALUES(city), district = VALUES(district), state = VALUES(state), country = VALUES(country), pin = VALUES(pin)",
            [userId, phone || null, address || null, city || null, district || null, state || null, country || null, pin || null]
        );
        const [[user]] = await db.promise().query("SELECT id, name, email, created_at FROM users WHERE id = ?", [userId]);
        const [[profile]] = await db.promise().query("SELECT phone, address, city, district, state, country, pin FROM user_profiles WHERE user_id = ?", [userId]);
        res.json({ user, profile: profile || {} });
    } catch (error) {
        console.error("Profile update failed:", error.message);
        res.status(503).json({ error: "Could not update profile" });
    }
});

function requireAdmin(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || !adminTokens.has(token)) return res.status(401).json({ error: "Admin authentication required" });
    next();
}

app.get("/admin/customers", requireAdmin, async (req, res) => {
    try {
        await databaseReady;
        await profilesReady;
        const [customers] = await db.promise().query(`
            SELECT u.id, u.name, u.email, u.created_at, p.phone, p.address, p.city, p.district, p.state, p.country, p.pin
            FROM users u
            LEFT JOIN user_profiles p ON p.user_id = u.id
            ORDER BY u.created_at DESC
        `);
        res.json(customers);
    } catch (error) {
        console.error("Admin customers fetch failed:", error.message);
        res.status(503).json({ error: "Could not load customers" });
    }
});

app.get("/admin/orders", requireAdmin, async (req, res) => {
    try {
        await databaseReady;
        await ordersReady;
        const [orders] = await db.promise().query(`
            SELECT o.id, o.user_id, u.name as user_name, u.email as user_email, o.items, o.address, o.delivery_charge, o.status, o.created_at
            FROM orders o
            JOIN users u ON u.id = o.user_id
            ORDER BY o.created_at DESC
        `);
        res.json(orders);
    } catch (error) {
        console.error("Admin orders fetch failed:", error.message);
        res.status(503).json({ error: "Could not load orders" });
    }
});

app.patch("/admin/orders/:id/status", requireAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    const status = String(req.body?.status || "").trim();
    const allowed = ["placed", "processing", "shipped", "delivered", "cancelled", "returned"];
    if (!id || !allowed.includes(status)) return res.status(400).json({ error: "Valid order id and status are required" });
    try {
        await ordersReady;
        const [result] = await db.promise().query("UPDATE orders SET status = ? WHERE id = ?", [status, id]);
        if (!result.affectedRows) return res.status(404).json({ error: "Order not found" });
        res.json({ id, status });
    } catch (error) {
        console.error("Order status update failed:", error.message);
        res.status(503).json({ error: "Could not update order status" });
    }
});

app.get("/admin/orders/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Valid order id is required" });
    try {
        await databaseReady;
        await ordersReady;
        const [[order]] = await db.promise().query(`
            SELECT o.id, o.user_id, u.name as user_name, u.email as user_email, u.phone as user_phone,
                   o.items, o.address, o.delivery_charge, o.Total_Amount, o.status, o.created_at
            FROM orders o
            JOIN users u ON u.id = o.user_id
            WHERE o.id = ?
        `, [id]);
        if (!order) return res.status(404).json({ error: "Order not found" });
        res.json({
            id: order.id,
            user_id: order.user_id,
            user_name: order.user_name,
            user_email: order.user_email,
            user_phone: order.user_phone,
            items: Number(order.items) || 0,
            address: order.address,
            delivery_charge: Number(order.delivery_charge) || 0,
            total_amount: Number(order.Total_Amount) || 0,
            status: order.status,
            created_at: order.created_at
        });
    } catch (error) {
        console.error("Admin order detail fetch failed:", error.message);
        res.status(503).json({ error: "Could not load order" });
    }
});

app.delete("/admin/orders/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Valid order id is required" });
    try {
        await ordersReady;
        const [result] = await db.promise().query("DELETE FROM orders WHERE id = ?", [id]);
        if (!result.affectedRows) return res.status(404).json({ error: "Order not found" });
        res.json({ id, deleted: true });
    } catch (error) {
        console.error("Admin order delete failed:", error.message);
        res.status(503).json({ error: "Could not delete order" });
    }
});

app.delete("/orders/:id", async (req, res) => {
    const id = String(req.params.id || "").trim();
    const userId = Number(req.body?.userId);
    if (!id) return res.status(400).json({ error: "Valid order id is required" });
    if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ error: "Valid user id is required" });
    try {
        await ordersReady;
        const [result] = await db.promise().query("DELETE FROM orders WHERE id = ? AND user_id = ?", [id, userId]);
        if (!result.affectedRows) return res.status(404).json({ error: "Order not found or not owned by this user" });
        res.json({ id, deleted: true });
    } catch (error) {
        console.error("Order deletion failed:", error.message);
        res.status(503).json({ error: "Could not delete order" });
    }
});

app.delete("/admin/orders", requireAdmin, async (req, res) => {
    try {
        await ordersReady;
        const [result] = await db.promise().query("DELETE FROM orders");
        res.json({ deleted: result.affectedRows || 0 });
    } catch (error) {
        console.error("Admin bulk order delete failed:", error.message);
        res.status(503).json({ error: "Could not delete orders" });
    }
});

app.get("/orders", async (req, res) => {
    const userId = Number(req.query.userId);
    if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ error: "Valid user id is required" });
    try {
        await ordersReady;
        const [rows] = await db.promise().query(
            "SELECT id, user_id, items, address, delivery_charge, Total_Amount, status, coupon_code, coupon_discount, discount, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC",
            [userId]
        );
        res.json(rows.map((row) => ({
            id: row.id,
            userId: row.user_id,
            items: row.items,
            address: row.address,
            deliveryCharge: Number(row.delivery_charge) || 0,
            totalAmount: Number(row.Total_Amount) || 0,
            status: row.status || "placed",
            couponCode: row.coupon_code || null,
            couponDiscount: Number(row.coupon_discount) || 0,
            discount: Number(row.discount) || 0,
            createdAt: row.created_at
        })));
    } catch (error) {
        console.error("Fetch user orders failed:", error.message);
        res.status(503).json({ error: "Could not load orders" });
    }
});

app.patch("/orders/:id", async (req, res) => {
    const id = String(req.params.id || "").trim();
    const body = req.body || {};
    const userId = Number(body.userId);
    const address = String(body.address || "").trim();
    const returnRequested = !!body.returnRequested;
    if (!id || !Number.isInteger(userId) || userId < 1 || (!address && !returnRequested)) return res.status(400).json({ error: "Valid order id, user id, and address are required" });
    try {
        await ordersReady;
        const [[order]] = await db.promise().query("SELECT id, user_id FROM orders WHERE id = ?", [id]);
        if (!order) return res.status(404).json({ error: "Order not found" });
        if (order.user_id !== userId) return res.status(403).json({ error: "You can only update your own orders" });
        if (returnRequested) {
            await db.promise().query("UPDATE orders SET status = ? WHERE id = ?", ["returned", id]);
            res.json({ id, status: "returned" });
        } else {
            await db.promise().query("UPDATE orders SET address = ? WHERE id = ?", [address, id]);
            res.json({ id, address });
        }
    } catch (error) {
        console.error("Order update failed:", error.message);
        res.status(503).json({ error: "Could not update order" });
    }
    
});

function saveUploadedImage(imageData) {
    const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(imageData);
    if (!match) return null;
    const imageBuffer = Buffer.from(match[2], "base64");
    if (imageBuffer.length > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller");
    const extension = match[1].split("/")[1].replace("jpeg", "jpg");
    const filename = `${crypto.randomBytes(12).toString("hex")}.${extension}`;
    fs.writeFileSync(path.join(uploadDirectory, filename), imageBuffer);
    return `/images/uploads/${filename}`;
}

app.post("/admin/login", async (req, res) => {
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const adminEmail = String(process.env.ADMIN_EMAIL || "admin@sriramstore.local").toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || "admin123");

    if (email === adminEmail && password === adminPassword) {
        const token = crypto.randomBytes(32).toString("hex");
        adminTokens.add(token);
        return res.json({ token });
    }

    try {
        await databaseReady;
        const [rows] = await db.promise().query("SELECT id, name, email, password_hash FROM users WHERE email = ?", [email]);
        if (!rows.length || !verifyPassword(password, rows[0].password_hash)) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        res.json({ user: { id: rows[0].id, name: rows[0].name, email: rows[0].email } });
    } catch (error) {
        console.error("Admin login fallback failed:", error.message);
        res.status(503).json({ error: "Login failed" });
    }
});

app.post("/admin/products", requireAdmin, async (req, res) => {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const price = Number(body.price);
    const category = String(body.category || "").trim();
    let image = String(body.image || "").trim() || null;
    const description = String(body.description || "").trim() || null;
    const stock = Number(body.stock);
    const discount = Number(body.discount || 0);
    const expiry = body.expiry ? String(body.expiry).trim() : null;
    if (!name || !Number.isFinite(price) || price < 0 || !category || !Number.isInteger(stock) || stock < 0 || !Number.isFinite(discount) || discount < 0 || discount > 100) return res.status(400).json({ error: "Enter valid product, stock, and discount values" });
    try {
        await inventoryReady;
        if (image?.startsWith("data:")) image = saveUploadedImage(image);
        const [result] = await db.promise().query("INSERT INTO products (name, price, category, image, description, stock, discount, expiry) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [name, price, category, image, description, stock, discount, expiry]);
        res.status(201).json({ id: result.insertId, name, price, category, image, description, stock, discount, expiry });
    } catch (error) {
        console.error("Admin product creation failed:", error.message);
        res.status(503).json({ error: "Could not add product" });
    }
});

app.delete("/admin/products/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid product id" });
    try {
        const [result] = await db.promise().query("DELETE FROM products WHERE id = ?", [id]);
        if (!result.affectedRows) return res.status(404).json({ error: "Product not found" });
        res.json({ deleted: true });
    } catch (error) {
        console.error("Admin product deletion failed:", error.message);
        res.status(503).json({ error: "Could not delete product" });
    }
});

app.patch("/admin/products/:id/stock", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const stock = Number(req.body?.stock);
    const discount = Number(req.body?.discount || 0);
    const expiry = req.body?.expiry ? String(req.body.expiry).trim() : null;
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(stock) || stock < 0 || !Number.isFinite(discount) || discount < 0 || discount > 100) {
        return res.status(400).json({ error: "Stock must be whole and discount must be between 0 and 100" });
    }
    try {
        await inventoryReady;
        const [result] = await db.promise().query("UPDATE products SET stock = ?, discount = ?, expiry = ? WHERE id = ?", [stock, discount, expiry, id]);
        if (!result.affectedRows) return res.status(404).json({ error: "Product not found" });
        res.json({ id, stock, discount, expiry });
    } catch (error) {
        console.error("Stock update failed:", error.message);
        res.status(503).json({ error: "Could not update stock" });
    }
});

app.get("/admin/coupons", requireAdmin, async (req, res) => {
    try {
        await couponsReady;
        const [coupons] = await db.promise().query("SELECT code, discount_percent, min_order_amount, max_uses, used_count, expires_at, is_active, created_at FROM coupons ORDER BY created_at DESC");
        res.json(coupons);
    } catch (error) {
        console.error("Coupons fetch failed:", error.message);
        res.status(503).json({ error: "Could not load coupons" });
    }
});

app.post("/admin/coupons", requireAdmin, async (req, res) => {
    const body = req.body || {};
    const code = String(body.code || "").trim().toUpperCase();
    const discountPercent = Number(body.discountPercent);
    const minOrderAmount = Number(body.minOrderAmount || 0);
    const maxUses = body.maxUses ? Number(body.maxUses) : null;
    const expiresAt = body.expiresAt ? String(body.expiresAt).trim() : null;
    const isActive = body.isActive ? 1 : 0;
    if (!code || !Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
        return res.status(400).json({ error: "Valid coupon code and discount percent (0-100) are required" });
    }
    if (minOrderAmount < 0) {
        return res.status(400).json({ error: "Minimum order amount cannot be negative" });
    }
    try {
        await couponsReady;
        await db.promise().query(
            "INSERT INTO coupons (code, discount_percent, min_order_amount, max_uses, expires_at, is_active) VALUES (?, ?, ?, ?, ?, ?)",
            [code, discountPercent, minOrderAmount, maxUses, expiresAt, isActive]
        );
        res.status(201).json({ code, discount_percent: discountPercent, min_order_amount: minOrderAmount, max_uses: maxUses, expires_at: expiresAt, is_active: isActive });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "This coupon code already exists" });
        console.error("Coupon creation failed:", error.message);
        res.status(503).json({ error: "Could not create coupon" });
    }
});

app.delete("/admin/coupons/:code", requireAdmin, async (req, res) => {
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "Coupon code is required" });
    try {
        await couponsReady;
        const [result] = await db.promise().query("DELETE FROM coupons WHERE code = ?", [code]);
        if (!result.affectedRows) return res.status(404).json({ error: "Coupon not found" });
        res.json({ deleted: true });
    } catch (error) {
        console.error("Coupon deletion failed:", error.message);
        res.status(503).json({ error: "Could not delete coupon" });
    }
});

app.get("/coupons", async (req, res) => {
    try {
        await couponsReady;
        const [coupons] = await db.promise().query("SELECT code, discount_percent, min_order_amount, max_uses, used_count, expires_at, is_active FROM coupons WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > NOW())");
        res.json(coupons);
    } catch (error) {
        console.error("Coupons list fetch failed:", error.message);
        res.status(503).json({ error: "Could not load coupons" });
    }
});

app.get("/coupons/:code", async (req, res) => {
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "Coupon code is required" });
    try {
        await couponsReady;
        const [[coupon]] = await db.promise().query("SELECT code, discount_percent, min_order_amount, max_uses, used_count, expires_at, is_active FROM coupons WHERE code = ?", [code]);
        if (!coupon) return res.status(404).json({ error: "Invalid coupon code" });
        if (!coupon.is_active) return res.status(404).json({ error: "This coupon is inactive" });
        if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return res.status(404).json({ error: "This coupon has expired" });
        if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return res.status(404).json({ error: "This coupon has reached its usage limit" });
        res.json(coupon);
    } catch (error) {
        console.error("Coupon validation failed:", error.message);
        res.status(503).json({ error: "Could not validate coupon" });
    }
});

app.get("/admin/festivals", requireAdmin, async (req, res) => {
    try {
        await festivalsReady;
        const [rows] = await db.promise().query("SELECT id, name, image_url, created_at FROM festivals ORDER BY name ASC");
        res.json(rows);
    } catch (error) {
        console.error("Festivals fetch failed:", error.message);
        res.status(503).json({ error: "Could not load festivals" });
    }
});

app.post("/admin/festivals", requireAdmin, async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const imageUrl = String(req.body?.imageUrl || "").trim() || null;
    if (!name) return res.status(400).json({ error: "Festival name is required" });
    try {
        await festivalsReady;
        const [result] = await db.promise().query("INSERT INTO festivals (name, image_url) VALUES (?, ?)", [name, imageUrl]);
        res.status(201).json({ id: result.insertId, name, image_url: imageUrl });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "A festival with this name already exists" });
        console.error("Festival creation failed:", error.message);
        res.status(503).json({ error: "Could not create festival" });
    }
});

app.delete("/admin/festivals/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid festival id" });
    try {
        await festivalsReady;
        const [result] = await db.promise().query("DELETE FROM festivals WHERE id = ?", [id]);
        if (!result.affectedRows) return res.status(404).json({ error: "Festival not found" });
        res.json({ deleted: true });
    } catch (error) {
        console.error("Festival deletion failed:", error.message);
        res.status(503).json({ error: "Could not delete festival" });
    }
});

async function loadOffer(id) {
    const [[offer]] = await db.promise().query(
        "SELECT id, festival_id, name, coupon_code, discount_percent, min_order_amount, start_date, end_date, is_active, image_url, created_at FROM offers WHERE id = ?",
        [id]
    );
    if (!offer) return null;
    let festivalImageUrl = null;
    if (offer.festival_id) {
        const [[festival]] = await db.promise().query(
            "SELECT image_url FROM festivals WHERE id = ?",
            [offer.festival_id]
        );
        festivalImageUrl = festival?.image_url || null;
    }
    const [products] = await db.promise().query(
        `SELECT op.product_id, p.name FROM offer_products op JOIN products p ON p.id = op.product_id WHERE op.offer_id = ? ORDER BY p.name`,
        [id]
    );
    const [categories] = await db.promise().query(
        `SELECT category FROM offer_categories WHERE offer_id = ? ORDER BY category`,
        [id]
    );
    return {
        id: offer.id,
        festival_id: offer.festival_id,
        name: offer.name,
        coupon_code: offer.coupon_code,
        discount_percent: Number(offer.discount_percent),
        min_order_amount: Number(offer.min_order_amount),
        start_date: offer.start_date ? new Date(offer.start_date).toISOString().slice(0, 10) : null,
        end_date: offer.end_date ? new Date(offer.end_date).toISOString().slice(0, 10) : null,
        is_active: !!offer.is_active,
        image_url: offer.image_url || festivalImageUrl,
        festival_image_url: festivalImageUrl,
        product_ids: products.map((p) => p.product_id),
        product_names: products.map((p) => p.name),
        categories: categories.map((c) => c.category)
    };
}

app.get("/offers", async (req, res) => {
    try {
        await offersReady;
        const [rows] = await db.promise().query(`
            SELECT o.id, o.festival_id, f.name AS festival_name, o.name, o.coupon_code,
                   o.discount_percent, o.min_order_amount, o.start_date, o.end_date, o.is_active, o.created_at
            FROM offers o
            LEFT JOIN festivals f ON f.id = o.festival_id
            WHERE o.is_active = 1
              AND (o.start_date IS NULL OR o.start_date <= CURDATE())
              AND (o.end_date IS NULL OR o.end_date >= CURDATE())
            ORDER BY o.created_at DESC
        `);
        const enriched = await Promise.all(rows.map(async (r) => {
            const full = await loadOffer(r.id);
            return full || r;
        }));
        res.json(enriched);
    } catch (error) {
        console.error("Offers fetch failed:", error.message);
        res.status(503).json({ error: "Could not load offers" });
    }
});

app.get("/admin/offers", requireAdmin, async (req, res) => {
    try {
        await offersReady;
        const [rows] = await db.promise().query(`
            SELECT o.id, o.festival_id, f.name AS festival_name, o.name, o.coupon_code,
                   o.discount_percent, o.min_order_amount, o.start_date, o.end_date, o.is_active, o.created_at
            FROM offers o
            LEFT JOIN festivals f ON f.id = o.festival_id
            ORDER BY o.created_at DESC
        `);
        const enriched = await Promise.all(rows.map(async (r) => {
            const full = await loadOffer(r.id);
            return full || r;
        }));
        res.json(enriched);
    } catch (error) {
        console.error("Offers fetch failed:", error.message);
        res.status(503).json({ error: "Could not load offers" });
    }
});

app.get("/admin/offers/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid offer id" });
    try {
        await offersReady;
        const offer = await loadOffer(id);
        if (!offer) return res.status(404).json({ error: "Offer not found" });
        res.json(offer);
    } catch (error) {
        console.error("Offer fetch failed:", error.message);
        res.status(503).json({ error: "Could not load offer" });
    }
});

async function replaceOfferTargets(offerId, productIds, categories) {
    await db.promise().query("DELETE FROM offer_products WHERE offer_id = ?", [offerId]);
    await db.promise().query("DELETE FROM offer_categories WHERE offer_id = ?", [offerId]);
    if (Array.isArray(productIds) && productIds.length) {
        const values = productIds.map((pid) => [offerId, Number(pid)]);
        await db.promise().query(
            `INSERT INTO offer_products (offer_id, product_id) VALUES ${values.map(() => "(?, ?)").join(", ")}`,
            values.flat()
        );
    }
    if (Array.isArray(categories) && categories.length) {
        const seen = new Set();
        const values = [];
        for (const c of categories) {
            const trimmed = String(c || "").trim();
            if (!trimmed || seen.has(trimmed)) continue;
            seen.add(trimmed);
            values.push([offerId, trimmed]);
        }
        if (values.length) {
            await db.promise().query(
                `INSERT INTO offer_categories (offer_id, category) VALUES ${values.map(() => "(?, ?)").join(", ")}`,
                values.flat()
            );
        }
    }
}

app.post("/admin/offers", requireAdmin, async (req, res) => {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const discountPercent = Number(body.discountPercent);
    const festivalId = body.festivalId ? Number(body.festivalId) : null;
    const couponCode = body.couponCode ? String(body.couponCode).trim().toUpperCase() : null;
    const minOrderAmount = Number(body.minOrderAmount || 0);
    const startDate = body.startDate ? String(body.startDate).trim() : null;
    const endDate = body.endDate ? String(body.endDate).trim() : null;
    const isActive = body.isActive === false ? 0 : 1;
    const imageUrl = String(body.imageUrl || "").trim() || null;
    const productIds = Array.isArray(body.productIds) ? body.productIds.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0) : [];
    const categories = Array.isArray(body.categories) ? body.categories : [];

    if (!name || !Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
        return res.status(400).json({ error: "Valid offer name and discount (0-100) are required" });
    }
    if (minOrderAmount < 0) return res.status(400).json({ error: "Minimum order cannot be negative" });
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
        return res.status(400).json({ error: "End date must be on or after the start date" });
    }
    if (!productIds.length && !categories.length) {
        return res.status(400).json({ error: "Select at least one product or category" });
    }

    try {
        await offersReady;
        if (couponCode) {
            const [existing] = await db.promise().query("SELECT id FROM offers WHERE coupon_code = ?", [couponCode]);
            if (existing.length) return res.status(409).json({ error: "This coupon code is already used on another offer" });
        }
        const [result] = await db.promise().query(
            "INSERT INTO offers (festival_id, name, coupon_code, discount_percent, min_order_amount, start_date, end_date, is_active, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [festivalId, name, couponCode, discountPercent, minOrderAmount, startDate || null, endDate || null, isActive, imageUrl]
        );
        await replaceOfferTargets(result.insertId, productIds, categories);
        if (couponCode) {
            await db.promise().query(
                `INSERT INTO coupons (code, discount_percent, min_order_amount, max_uses, expires_at, is_active) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE discount_percent = VALUES(discount_percent), min_order_amount = VALUES(min_order_amount), max_uses = VALUES(max_uses), expires_at = VALUES(expires_at), is_active = VALUES(is_active)`,
                [couponCode, discountPercent, minOrderAmount, maxUses, endDate || null, isActive]
            );
        }
        const offer = await loadOffer(result.insertId);
        res.status(201).json(offer);
    } catch (error) {
        console.error("Offer creation failed:", error.message);
        res.status(503).json({ error: "Could not create offer" });
    }
});

app.patch("/admin/offers/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid offer id" });
    const body = req.body || {};
    const updates = [];
    const params = [];
    const allowedSimple = [
        ["name", (v) => String(v || "").trim()],
        ["discountPercent", (v) => Number(v)],
        ["minOrderAmount", (v) => Number(v)],
        ["startDate", (v) => v ? String(v).trim() : null],
        ["endDate", (v) => v ? String(v).trim() : null],
        ["festivalId", (v) => v ? Number(v) : null]
    ];
    for (const [key, transform] of allowedSimple) {
        if (body[key] !== undefined) {
            const value = transform(body[key]);
            if (key === "name" && !value) return res.status(400).json({ error: "Offer name is required" });
            if (key === "discountPercent" && (!Number.isFinite(value) || value <= 0 || value > 100)) return res.status(400).json({ error: "Discount must be between 0 and 100" });
            if (key === "minOrderAmount" && value < 0) return res.status(400).json({ error: "Minimum order cannot be negative" });
            updates.push(`${key === "discountPercent" ? "discount_percent" : key === "minOrderAmount" ? "min_order_amount" : key === "festivalId" ? "festival_id" : key === "startDate" ? "start_date" : key === "endDate" ? "end_date" : key} = ?`);
            params.push(value);
        }
    }
    if (body.couponCode !== undefined) {
        const code = body.couponCode ? String(body.couponCode).trim().toUpperCase() : null;
        if (code) {
            const [dup] = await db.promise().query("SELECT id FROM offers WHERE coupon_code = ? AND id <> ?", [code, id]);
            if (dup.length) return res.status(409).json({ error: "This coupon code is already used on another offer" });
        }
        updates.push("coupon_code = ?");
        params.push(code);
    }
    if (body.imageUrl !== undefined) {
        const imageUrl = String(body.imageUrl || "").trim() || null;
        updates.push("image_url = ?");
        params.push(imageUrl);
    }
    if (body.isActive !== undefined) {
        updates.push("is_active = ?");
        params.push(body.isActive ? 1 : 0);
    }
    try {
        await offersReady;
        if (updates.length) {
            params.push(id);
            await db.promise().query(`UPDATE offers SET ${updates.join(", ")} WHERE id = ?`, params);
        }
        if (body.productIds !== undefined || body.categories !== undefined) {
            const productIds = Array.isArray(body.productIds) ? body.productIds.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0) : [];
            const categories = Array.isArray(body.categories) ? body.categories : [];
            if (!productIds.length && !categories.length) return res.status(400).json({ error: "Select at least one product or category" });
            await replaceOfferTargets(id, productIds, categories);
        }
        if (body.couponCode !== undefined) {
            const [[updated]] = await db.promise().query("SELECT coupon_code, discount_percent, min_order_amount, end_date, is_active FROM offers WHERE id = ?", [id]);
            if (updated?.coupon_code) {
                await db.promise().query(
                    `INSERT INTO coupons (code, discount_percent, min_order_amount, max_uses, expires_at, is_active) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE discount_percent = VALUES(discount_percent), min_order_amount = VALUES(min_order_amount), max_uses = VALUES(max_uses), expires_at = VALUES(expires_at), is_active = VALUES(is_active)`,
                    [updated.coupon_code, updated.discount_percent, updated.min_order_amount, null, updated.end_date || null, updated.is_active]
                );
            } else {
                await db.promise().query("DELETE FROM coupons WHERE code = (SELECT coupon_code FROM offers WHERE id = ?)", [id]);
            }
        }
        const offer = await loadOffer(id);
        if (!offer) return res.status(404).json({ error: "Offer not found" });
        res.json(offer);
    } catch (error) {
        console.error("Offer update failed:", error.message);
        res.status(503).json({ error: "Could not update offer" });
    }
});

app.delete("/admin/offers/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid offer id" });
    try {
        await offersReady;
        const [[existing]] = await db.promise().query("SELECT coupon_code FROM offers WHERE id = ?", [id]);
        const [result] = await db.promise().query("DELETE FROM offers WHERE id = ?", [id]);
        if (!result.affectedRows) return res.status(404).json({ error: "Offer not found" });
        if (existing?.coupon_code) {
            await db.promise().query("DELETE FROM coupons WHERE code = ?", [existing.coupon_code]).catch(() => {});
        }
        res.json({ deleted: true });
    } catch (error) {
        console.error("Offer deletion failed:", error.message);
        res.status(503).json({ error: "Could not delete offer" });
    }
});

app.get("/delivery-charge/:state", async (req, res) => {
    const state = String(req.params.state || "").trim();
    if (!state) return res.status(400).json({ error: "State is required" });
    try {
        await deliveryChargesReady;
        const [[charge]] = await db.promise().query("SELECT state, charge, description FROM delivery_charges WHERE state = ?", [state]);
        if (charge) {
            res.json({ state: charge.state, delivery_charge: Number(charge.charge), description: charge.description });
        } else {
            res.json({ state, delivery_charge: 40, description: "Standard delivery" });
        }
    } catch (error) {
        console.error("Delivery charge lookup failed:", error.message);
        res.status(503).json({ error: "Could not determine charge" });
    }
});

app.post("/test-email", async (req, res) => {
    const body = req.body || {};
    const requestedTo = String(body.to || "").trim();
    const to = requestedTo || ORDER_NOTIFICATION_EMAIL || EMAIL_USER;
    if (!to) return res.status(400).json({ error: "Recipient 'to' is required" });
    if (!emailTransporter) return res.status(503).json({ error: "Email transporter not configured" });
    try {
        const info = await emailTransporter.sendMail({
            from: `Sriram Store <${EMAIL_USER}>`,
            to,
            subject: "Test Email from Sriram Store",
            text: "If you see this, your email configuration is working correctly.",
            html: `<div style="font-family:Arial;padding:20px;"><h2>Test Email</h2><p>If you see this, your email configuration is working correctly.</p></div>`
        });
        console.log(`[TEST-EMAIL] Sent to ${to}, messageId=${info.messageId}`);
        res.json({ ok: true, messageId: info.messageId, to });
    } catch (err) {
        console.error("[TEST-EMAIL] Failed:", err.message);
        res.status(500).json({ error: err.message });
    }
});

async function sendSupportEmail({ to, name, phone, orderId, category, message }) {
    if (!emailTransporter) {
        throw new Error("Email transporter not configured. Check EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS in .env");
    }
    const categoryLabel = String(category || "general").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const mailOptions = {
        from: `Sriram Store Support <${EMAIL_USER}>`,
        to: to || ORDER_NOTIFICATION_EMAIL,
        replyTo: to || ORDER_NOTIFICATION_EMAIL,
        subject: `Support Request: ${categoryLabel} | Sriram Store`,
        text: `New Support Request\n\nName: ${name}\nEmail: ${to}\nPhone: ${phone || "N/A"}\nOrder ID: ${orderId || "N/A"}\nCategory: ${categoryLabel}\n\nMessage:\n${message}\n\n— Sriram Store Support`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#fafafa;padding:20px;">
                <div style="background:#2c5f2d;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;text-align:center;">
                    <h1 style="margin:0;color:#fff;font-size:22px;">New Support Request</h1>
                </div>
                <div style="background:#fff;padding:24px 22px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;">
                    <table style="width:100%;border-collapse:collapse;margin:0 0 18px;background:#f7faf5;border:1px solid #e3ecdc;border-radius:8px;">
                        <tr><td style="padding:10px 14px;color:#666;">Name</td><td style="padding:10px 14px;text-align:right;"><strong>${name}</strong></td></tr>
                        <tr><td style="padding:10px 14px;color:#666;">Email</td><td style="padding:10px 14px;text-align:right;">${to}</td></tr>
                        <tr><td style="padding:10px 14px;color:#666;">Phone</td><td style="padding:10px 14px;text-align:right;">${phone || "N/A"}</td></tr>
                        <tr><td style="padding:10px 14px;color:#666;">Order ID</td><td style="padding:10px 14px;text-align:right;">${orderId || "N/A"}</td></tr>
                        <tr><td style="padding:10px 14px;color:#666;">Category</td><td style="padding:10px 14px;text-align:right;">${categoryLabel}</td></tr>
                        <tr><td style="padding:10px 14px;color:#666;vertical-align:top;">Message</td><td style="padding:10px 14px;text-align:right;white-space:pre-wrap;">${message}</td></tr>
                    </table>
                    <p style="margin:0;color:#666;font-size:13px;">Please respond to this support request as soon as possible.</p>
                    <p style="margin:14px 0 0;color:#999;font-size:12px;">— Sriram Store Support</p>
                </div>
            </div>
        `
    };

    try {
        return await emailTransporter.sendMail(mailOptions);
    } catch (firstErr) {
        console.warn(`[SUPPORT] First email attempt failed: ${firstErr.message}. Retrying in 1s...`);
        await new Promise((r) => setTimeout(r, 1000));
        return await emailTransporter.sendMail(mailOptions);
    }
}

app.post("/support", async (req, res) => {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim() || null;
    const orderId = String(body.orderId || "").trim() || null;
    const category = String(body.category || "").trim();
    const message = String(body.message || "").trim();

    if (!name || !email || !category || !message) {
        return res.status(400).json({ error: "Name, email, category, and message are required" });
    }

    try {
        await supportReady;
        const [result] = await db.promise().query(
            "INSERT INTO support_tickets (name, email, phone, order_id, category, message) VALUES (?, ?, ?, ?, ?, ?)",
            [name, email, phone, orderId, category, message]
        );

        let emailSent = false;
        let emailError = null;
        if (emailTransporter) {
            (async () => {
                try {
                    await sendSupportEmail({ to: email, name, phone, orderId, category, message });
                    emailSent = true;
                } catch (err) {
                    emailSent = false;
                    emailError = err.message;
                    console.error("[SUPPORT] Email notification failed:", err.message);
                }
            })();
        } else {
            emailError = "Email transporter not configured";
        }

        res.status(201).json({
            id: result.insertId,
            name,
            email,
            phone,
            orderId,
            category,
            message,
            emailSent,
            emailError
        });
    } catch (error) {
        console.error("Support ticket creation failed:", error.message);
        res.status(503).json({ error: "Could not submit support request", detail: error.message });
    }
});

app.get("/support/faq", async (req, res) => {
    const faqs = [
        { question: "How do I track my order?", answer: "You can track your order from the \"My orders\" section on the home page. We also send updates via email and SMS." },
        { question: "What is your delivery timeline?", answer: "We typically deliver within 24-48 hours depending on your location. You will see the estimated delivery date at checkout." },
        { question: "How can I cancel or return an order?", answer: "You can request a cancellation or return from the order details page. Orders can be cancelled before they are shipped." },
        { question: "Do you offer cash on delivery?", answer: "Yes, cash on delivery is available for most locations. You can select this option at checkout." },
        { question: "How do I apply a coupon code?", answer: "Enter your coupon code in the checkout page under \"Discount code\" and click Apply. The discount will be reflected in your total." }
    ];
    res.json(faqs);
});

app.get("/admin/support", requireAdmin, async (req, res) => {
    try {
        await supportReady;
        const [tickets] = await db.promise().query("SELECT id, name, email, phone, order_id, category, message, status, created_at FROM support_tickets ORDER BY created_at DESC");
        res.json(tickets);
    } catch (error) {
        console.error("Support tickets fetch failed:", error.message);
        res.status(503).json({ error: "Could not load support tickets" });
    }
});

app.patch("/admin/support/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const status = String(req.body?.status || "").trim();
    const allowed = ["open", "in_progress", "resolved", "closed"];
    if (!Number.isInteger(id) || id < 1 || !allowed.includes(status)) return res.status(400).json({ error: "Valid ticket id and status are required" });
    try {
        await supportReady;
        const [result] = await db.promise().query("UPDATE support_tickets SET status = ? WHERE id = ?", [status, id]);
        if (!result.affectedRows) return res.status(404).json({ error: "Ticket not found" });
        res.json({ id, status });
    } catch (error) {
        console.error("Support ticket update failed:", error.message);
        res.status(503).json({ error: "Could not update ticket" });
    }
});

app.delete("/admin/support/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Valid ticket id is required" });
    try {
        await supportReady;
        const [result] = await db.promise().query("DELETE FROM support_tickets WHERE id = ?", [id]);
        if (!result.affectedRows) return res.status(404).json({ error: "Ticket not found" });
        res.json({ id, deleted: true });
    } catch (error) {
        console.error("Support ticket deletion failed:", error.message);
        res.status(503).json({ error: "Could not delete ticket" });
    }
});

app.get("/admin/support/:id/replies", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Valid ticket id is required" });
    try {
        await supportReady;
        const [replies] = await db.promise().query("SELECT id, ticket_id, message, created_at FROM support_replies WHERE ticket_id = ? ORDER BY created_at ASC", [id]);
        res.json(replies);
    } catch (error) {
        console.error("Support replies fetch failed:", error.message);
        res.status(503).json({ error: "Could not load replies" });
    }
});

app.post("/support/:id/reply", async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body || {};
    const email = String(body.email || "").trim();
    const message = String(body.message || "").trim();
    if (!Number.isInteger(id) || id < 1 || !email || !message) return res.status(400).json({ error: "Valid ticket id, email, and message are required" });
    try {
        await supportReady;
        const [[ticket]] = await db.promise().query("SELECT id, name, email, order_id, category, message AS ticket_message, status, created_at FROM support_tickets WHERE id = ?", [id]);
        if (!ticket) return res.status(404).json({ error: "Ticket not found" });
        if (ticket.email.toLowerCase() !== email.toLowerCase()) return res.status(403).json({ error: "Email does not match ticket owner" });
        const [result] = await db.promise().query("INSERT INTO support_replies (ticket_id, message, is_customer_reply) VALUES (?, ?, 1)", [id, message]);
        res.status(201).json({ id: result.insertId, ticket_id: id, message, created_at: new Date().toISOString() });
    } catch (error) {
        console.error("Customer support reply failed:", error.message);
        res.status(503).json({ error: "Could not add reply" });
    }
});

app.post("/admin/support/:id/replies", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body || {};
    const message = String(body.message || "").trim();
    if (!Number.isInteger(id) || id < 1 || !message) return res.status(400).json({ error: "Valid ticket id and message are required" });
    try {
        await supportReady;
        const [[ticket]] = await db.promise().query("SELECT id, name, email, order_id, category, message AS ticket_message, status, created_at FROM support_tickets WHERE id = ?", [id]);
        if (!ticket) return res.status(404).json({ error: "Ticket not found" });
        const [result] = await db.promise().query("INSERT INTO support_replies (ticket_id, message) VALUES (?, ?)", [id, message]);
        if (emailTransporter && ticket.email) {
            (async () => {
                try {
                    const categoryLabel = String(ticket.category || "general").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                    await emailTransporter.sendMail({
                        from: `Sriram Store Support <${EMAIL_USER}>`,
                        to: ticket.email,
                        subject: `Re: Support Ticket #${id} - ${categoryLabel}`,
                        text: `Dear ${ticket.name},\n\nWe have replied to your support request.\n\nYour original message:\n${ticket.ticket_message}\n\nOur reply:\n${message}\n\nTicket ID: ${id}\nCategory: ${categoryLabel}\nStatus: ${ticket.status}\n\nYou can view your ticket anytime.\n\n— Sriram Store Support`,
                        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#fafafa;padding:20px;"><div style="background:#2c5f2d;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;text-align:center;"><h1 style="margin:0;color:#fff;font-size:22px;">Support Ticket Update</h1></div><div style="background:#fff;padding:24px 22px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;"><p style="margin:0 0 14px;">Dear <strong>${ticket.name}</strong>,</p><p style="margin:0 0 18px;color:#444;">We have replied to your support request. Here is the update:</p><table style="width:100%;border-collapse:collapse;margin:0 0 18px;background:#f7faf5;border:1px solid #e3ecdc;border-radius:8px;"><tr><td style="padding:10px 14px;color:#666;">Ticket ID</td><td style="padding:10px 14px;text-align:right;"><strong>${id}</strong></td></tr><tr><td style="padding:10px 14px;color:#666;">Category</td><td style="padding:10px 14px;text-align:right;">${categoryLabel}</td></tr><tr><td style="padding:10px 14px;color:#666;vertical-align:top;">Your Message</td><td style="padding:10px 14px;text-align:right;white-space:pre-wrap;">${ticket.ticket_message}</td></tr><tr style="background:#eaf3e3;"><td style="padding:10px 14px;color:#2c5f2d;vertical-align:top;"><strong>Our Reply</strong></td><td style="padding:10px 14px;text-align:right;white-space:pre-wrap;color:#2c5f2d;"><strong>${message}</strong></td></tr></table><p style="margin:0;color:#666;font-size:13px;">If you have any further questions, please reply to this email or submit a new support request.</p><p style="margin:14px 0 0;color:#999;font-size:12px;">— Sriram Store Support</p></div></div>`
                    });
                } catch (err) {
                    console.error("[SUPPORT] Reply email notification failed:", err.message);
                }
            })();
        }
        res.status(201).json({ id: result.insertId, ticket_id: id, message, created_at: new Date().toISOString() });
    } catch (error) {
        console.error("Support reply creation failed:", error.message);
        res.status(503).json({ error: "Could not add reply" });
    }
});

app.post("/orders", async (req, res) => {
    const body = req.body || {};
    const userId = Number(body.userId);
    const items = Number(body.items);
    const address = String(body.address || "").trim();
    const couponCode = String(body.couponCode || "").trim().toUpperCase();
    const deliveryCharge = Number(body.deliveryCharge || 0);
    const subtotal = Number(body.subtotal || 0);
    const discount = Number(body.discount || 0);
    const totalAmount = Number(body.totalAmount || 0) + deliveryCharge;
    console.log(`[ORDERS] New order request: user=${userId} items=${items} subtotal=${subtotal} discount=${discount} delivery=${deliveryCharge} total=${totalAmount}`);
    if (!Number.isInteger(userId) || userId < 1 || !Number.isInteger(items) || items < 1 || !address) return res.status(400).json({ error: "Valid user id, items, and address are required" });
    try {
        await databaseReady;
        await ordersReady;
        if (couponCode) {
            await couponsReady;
            await offersReady;
            const [[coupon]] = await db.promise().query("SELECT * FROM coupons WHERE code = ?", [couponCode]);
            if (coupon) {
                if (!coupon.is_active) return res.status(400).json({ error: "Invalid coupon code" });
                if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return res.status(400).json({ error: "This coupon has expired" });
                if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return res.status(400).json({ error: "This coupon has reached its usage limit" });
                await db.promise().query("UPDATE coupons SET used_count = used_count + 1 WHERE code = ?", [couponCode]);
            } else {
                const [[offer]] = await db.promise().query(
                    "SELECT id, name, discount_percent, min_order_amount, is_active, start_date, end_date FROM offers WHERE coupon_code = ? AND is_active = 1 AND (start_date IS NULL OR start_date <= CURDATE()) AND (end_date IS NULL OR end_date >= CURDATE())",
                    [couponCode]
                );
                if (!offer) return res.status(400).json({ error: "Invalid coupon code" });
            }
        }
        const id = `SR${Date.now().toString().slice(-6)}`;

        // 1. SAVE ORDER
        await db.promise().query(
    "INSERT INTO orders (id, user_id, items, address, delivery_charge, Total_Amount, coupon_code, coupon_discount, discount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, userId, items, address, deliveryCharge, totalAmount, couponCode || null, discount, discount]
);

        // 2. GET USER EMAIL
        const [[user]] = await db.promise().query(
    "SELECT name, email FROM users WHERE id = ?",
    [userId]
);
console.log("USER FROM DATABASE:", user);
console.log("USER EMAIL:", user?.email);

        console.log(`[ORDERS] User lookup result:`, user);

        // 3. SEND ORDER CONFIRMATION EMAIL (fire-and-forget so the response is fast)
        let emailSent = !!(emailTransporter && user && user.email);
        let emailError = !emailSent
            ? (!emailTransporter
                ? "Email transporter not configured on server. Check EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS in .env"
                : "User has no email on file")
            : null;
        if (emailTransporter && user && user.email) {
            (async () => {
                try {
                    const info = await sendOrderEmail({
                        to: user.email,
                        name: user.name,
                        id,
                        items,
                        subtotal,
                        discount,
                        totalAmount,
                        deliveryCharge,
                        address,
                        couponCode
                    });
                    const actualRecipient = user.email;
                    const ccNote = ORDER_NOTIFICATION_EMAIL && ORDER_NOTIFICATION_EMAIL.toLowerCase() !== user.email.toLowerCase()
                        ? ` (cc: ${ORDER_NOTIFICATION_EMAIL})`
                        : "";
                    console.log(`[ORDERS] Confirmation email sent. FROM: ${EMAIL_USER} -> TO: ${actualRecipient}${ccNote}. messageId=${info && info.messageId}`);
                } catch (err) {
                    console.error("[ORDERS] Order confirmation email failed:", err.message);
                }
            })();
        } else if (!emailTransporter) {
            console.error("[ORDERS]", emailError);
        } else {
            console.warn("[ORDERS]", emailError);
        }

        // 4. RESPONSE
        res.status(201).json({
            id,
            user_id: userId,
            items,
            address,
            delivery_charge: deliveryCharge,
            total_amount: totalAmount,
            status: "placed",
            emailSent: emailSent,
            email: user ? user.email : null,
            emailError: emailError
        });

    } catch (error) {
        console.error("Order creation failed:", error.message);

        res.status(503).json({
            error: "Could not place order",
            detail: error.message
        });
    }
});
