const { chromium } = require("playwright");
const api = "http://localhost:3000";
const code = "PLAY" + Date.now().toString().slice(-6);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();

  // ---- ADMIN: log in + create coupon ----
  const admin = await ctx.newPage();
  await admin.goto(api + "/admin-login.html");
  await admin.fill("#admin-email", "admin@sriramstore.local");
  await admin.fill("#admin-password", "admin123");
  await Promise.all([
    admin.waitForResponse((r) => r.url().endsWith("/admin/login") && r.status() === 200),
    admin.click("form#admin-login-form button[type=submit]"),
  ]);
  console.log("admin logged in:", await admin.$eval("#admin-logout", (b) => b.style.display));

  // open Coupons tab
  await Promise.all([
    admin.waitForLoadState("networkidle"),
    admin.click("#coupons-tab"),
  ]);
  await admin.waitForTimeout(300);

  await admin.fill("#coupon-code-admin", code);
  await admin.fill("#coupon-discount", "10");
  await admin.fill("#coupon-min-order", "0");
  await Promise.all([
    admin.waitForResponse((r) => r.url().endsWith("/admin/coupons") && r.status() === 201),
    admin.click("#coupon-form button[type=submit]"),
  ]);
  await admin.waitForTimeout(300);
  const rows = await admin.$$eval("#coupon-list tr", (trs) => trs.map((t) => t.textContent.trim()));
  console.log("admin coupon list rows after create:", rows);

  // ---- CUSTOMER: register + login on storefront ----
  const page = await ctx.newPage();
  await page.goto(api + "/");
  // page loads auth-locked; auth modal is visible. register via auth modal.
  await page.click("#register-tab");
  const email = `cust_${Date.now()}@x.com`;
  await page.fill("#register-name", "Customer");
  await page.fill("#register-email", email);
  await page.fill("#register-password", "secret123");
  await page.click("form#register-form button[type=submit]");
  await page.waitForFunction(() => !document.body.classList.contains("auth-locked") || document.querySelector("#auth-error").textContent.length > 0, {}, { timeout: 15000 });
  const locked = await page.evaluate(() => document.body.classList.contains("auth-locked"));
  const errText = await page.textContent("#auth-error");
  const acct = await page.textContent("#account-button");
  console.log("register done -> locked:", locked, "error:", errText, "account:", acct);
  const addBtn = await page.$("[data-add]");
  const prodName = await addBtn.evaluate((b) => b.closest("article").querySelector("h3").textContent);
  await addBtn.click();
  await page.waitForTimeout(500);
  let cartTotal = await page.textContent("#cart-total");
  let discount = await page.textContent("#cart-discount-value");
  let discountHidden = await page.getAttribute("#cart-discount", "hidden");
  console.log(`after add (${prodName}) -> total: ${cartTotal} discount: ${discount} rowHidden: ${discountHidden}`);

  // ---- apply coupon in BAG ----
  await page.fill("#bag-coupon-code", code);
  await Promise.all([
    page.waitForResponse((r) => r.status() !== 0 && r.url().includes(`/coupons/${code}`)),
    page.click("#bag-apply-coupon"),
  ]);
  await page.waitForTimeout(700);
  cartTotal = await page.textContent("#cart-total");
  discount = await page.textContent("#cart-discount-value");
  discountHidden = await page.getAttribute("#cart-discount", "hidden");
  const status = await page.textContent("#bag-coupon-status");
  console.log(`after apply -> total: ${cartTotal} discount: ${discount} rowHidden: ${discountHidden} status: ${status}`);

  await browser.close();
})().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
