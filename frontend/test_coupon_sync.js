const http = require("http");
const api = "http://localhost:3000";

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, api);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { "Content-Type": "application/json", ...headers }
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  // Admin login
  const loginRes = await request("POST", "/admin/login", { email: "admin@sriramstore.local", password: "admin123" });
  const token = loginRes.data.token;
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // Create festival
  const festRes = await request("POST", "/admin/festivals", { name: "TestFest", imageUrl: "" }, authHeaders);
  console.log("create festival:", festRes.status, festRes.data);
  const festivalId = festRes.data.id;

  // Create offer with coupon code
  const code = "TEST" + Date.now().toString().slice(-6);
  const offerRes = await request("POST", "/admin/offers", {
    name: "Test Offer",
    festivalId,
    discountPercent: 15,
    couponCode: code,
    minOrderAmount: 0,
    startDate: null,
    endDate: null,
    isActive: true,
    productIds: [27],
    categories: []
  }, authHeaders);
  console.log("create offer:", offerRes.status, offerRes.data);

  // Verify coupon was synced
  const couponRes = await request("GET", `/coupons/${code}`);
  console.log("validate coupon:", couponRes.status, couponRes.data);

  // Update offer coupon code
  const newCode = "TEST" + Date.now().toString().slice(-6);
  const patchRes = await request("PATCH", `/admin/offers/${offerRes.data.id}`, { couponCode: newCode, discountPercent: 20 }, authHeaders);
  console.log("update offer:", patchRes.status, patchRes.data);

  // Verify new coupon
  const couponRes2 = await request("GET", `/coupons/${newCode}`);
  console.log("validate new coupon:", couponRes2.status, couponRes2.data);

  // Verify old coupon removed
  const oldCouponRes = await request("GET", `/coupons/${code}`);
  console.log("validate old coupon:", oldCouponRes.status, oldCouponRes.data);

  // Delete offer
  const delRes = await request("DELETE", `/admin/offers/${offerRes.data.id}`, null, authHeaders);
  console.log("delete offer:", delRes.status, delRes.data);

  // Verify coupon removed
  const afterDelRes = await request("GET", `/coupons/${newCode}`);
  console.log("validate after delete:", afterDelRes.status, afterDelRes.data);

  // Cleanup festival
  await request("DELETE", `/admin/festivals/${festivalId}`, null, authHeaders);
  console.log("cleanup festival done");
})().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
