const API_URL = "https://ecommerce-1-r5m4.onrender.com";
let products = [];
let cart = [];
let couponApplied = false;
let appliedCoupon = null;
let deliveryCharge = 0;
let selectedState = "";
let selectedCategory = "";
let wishlist = JSON.parse(localStorage.getItem("sriram-store-wishlist") || "[]");

const productGrid = document.querySelector("#product-grid");
const categoryFilter = document.querySelector("#category-filter");
const searchInput = document.querySelector("#search-input");
const cartItems = document.querySelector("#cart-items");
const authModal = document.querySelector("#auth-modal");
const profileModal = document.querySelector("#profile-modal");
const detailsModal = document.querySelector("#details-modal");
const checkoutModal = document.querySelector("#checkout-modal");
const orderEditModal = document.querySelector("#order-edit-modal");
const orderDetailsModal = document.querySelector("#order-details-modal");
const ordersList = document.querySelector("#orders-list");
const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
const profileLoginForm = document.querySelector("#profile-login-form");
const profileRegisterForm = document.querySelector("#profile-register-form");
const profileLoginTab = document.querySelector("#profile-login-tab");
const profileRegisterTab = document.querySelector("#profile-register-tab");
const authError = document.querySelector("#auth-error");
const profileError = document.querySelector("#profile-error");
const authStorageKey = "sriram-store-user";
const ordersStorageKey = "sriram-store-orders";
const wishlistStorageKey = "sriram-store-wishlist";
const notificationsStorageKey = "sriram-store-notifications";
const formatPrice = (price) => `₹${Number(price).toLocaleString("en-IN")}`;
const productById = (id) => products.find((product) => product.id === id);
const discountFor = (product) => Math.min(100, Math.max(0, Number(product.discount) || 0));
const finalPrice = (product) => Number(product.price) * (1 - discountFor(product) / 100);
const imageFor = (product) => {
  if (typeof product.image === "string" && /^https?:\/\//.test(product.image)) return product.image;
  if (typeof product.image === "string" && product.image.startsWith("/")) return `${apiUrl}${product.image}`;
  const imageName = product.name.toLowerCase().includes("tomato") ? "tomato" : product.name.toLowerCase().includes("mango") ? "mango" : product.name.toLowerCase().includes("carrot") ? "carrot" : "";
  return imageName ? `/images/${imageName}.jpg` : "";
};

function showToast(message, success = true) {
  const toast = document.querySelector("#toast");
  document.querySelector("#toast-message").textContent = message;
  document.querySelector(".toast-icon").textContent = success ? "✓" : "×";
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3000);
}

function getNotifications() {
  try { return JSON.parse(localStorage.getItem(notificationsStorageKey) || "[]"); } catch { return []; }
}
function addNotification(message) {
  const notifications = getNotifications();
  notifications.unshift({ id: Date.now(), message, time: new Date().toISOString(), read: false });
  localStorage.setItem(notificationsStorageKey, JSON.stringify(notifications.slice(0, 50)));
  renderNotifications();
}
function clearNotifications() {
  localStorage.setItem(notificationsStorageKey, "[]");
  renderNotifications();
}
function markNotificationRead(id) {
  const notifications = getNotifications();
  const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
  localStorage.setItem(notificationsStorageKey, JSON.stringify(updated));
  renderNotifications();
}
function renderNotifications() {
  const notifications = getNotifications();
  const unreadCount = notifications.filter((n) => !n.read).length;
  const countEl = document.querySelector("#notification-count");
  const button = document.querySelector("#notification-button");
  const dropdown = document.querySelector("#notification-dropdown");
  const list = document.querySelector("#notification-list");
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (countEl) countEl.textContent = unreadCount;
  if (button) {
    button.hidden = !user;
    countEl.style.display = unreadCount > 0 ? "grid" : "none";
  }
  if (!list) return;
  if (!notifications.length) {
    list.innerHTML = '<p class="notification-empty">No notifications yet</p>';
    return;
  }
  list.innerHTML = notifications.map((n) => `<div class="notification-item ${n.read ? "is-read" : ""}" data-notification-id="${n.id}"><p>${escapeHtml(n.message)}</p><small>${new Date(n.time).toLocaleString()}</small></div>`).join("");
  list.querySelectorAll("[data-notification-id]").forEach((item) => {
    item.addEventListener("click", () => {
      const id = Number(item.dataset.notificationId);
      markNotificationRead(id);
    });
  });
}

function getEstimatedDeliveryDays() {
  if (!selectedState) return 3;
  return getEstimatedDeliveryDaysForState(selectedState);
}

function getEstimatedDeliveryDaysForState(state) {
  const s = String(state || "").toLowerCase();
  if (["tamil nadu", "karnataka", "kerala", "andhra pradesh", "telangana", "puducherry"].includes(s)) return 2;
  if (["maharashtra", "gujarat", "goa", "delhi", "haryana", "punjab", "rajasthan"].includes(s)) return 3;
  return 4;
}

function renderStars(rating) {
  const full = Math.floor(rating || 0);
  const half = (rating || 0) % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
}

function showOrderSuccess({ orderId, items, subtotal, discount, total, delivery, couponCode, emailSent, email }) {
  const modal = document.querySelector("#order-success-modal");
  if (!modal) {
    showToast(emailSent ? `Order ${orderId} placed. Confirmation email sent.` : `Order ${orderId} placed.`);
    return;
  }
  const fmt = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
  const setText = (selector, value) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  };
  const toggleRow = (selector, show) => {
    const el = document.querySelector(selector);
    if (el) el.hidden = !show;
  };
  setText("#order-success-id", orderId || "—");
  setText("#order-success-items", items != null ? String(items) : "—");
  setText("#order-success-subtotal", fmt(subtotal));
  setText("#order-success-discount", `-${fmt(discount)}`);
  setText("#order-success-delivery", fmt(delivery));
  const deliveryDays = getEstimatedDeliveryDays();
  setText("#order-success-delivery-days", deliveryDays <= 1 ? "1 day" : `${deliveryDays} days`);
  setText("#order-success-total", fmt(total));
  toggleRow("#order-success-coupon-row", !!couponCode);
  toggleRow("#order-success-discount-row", Number(discount) > 0);
  if (couponCode) setText("#order-success-coupon", couponCode);
  const emailText = document.querySelector("#order-success-email-text");
  if (emailSent) {
    emailText.innerHTML = `A confirmation email has been sent to <strong>${email || "your address"}</strong>.`;
  } else {
    emailText.textContent = "Your order is confirmed. (Email notification is currently unavailable.)";
  }
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeOrderSuccess() {
  const modal = document.querySelector("#order-success-modal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-order-success]")) closeOrderSuccess();
});

function setAuthenticated(user) {
  if (user) {
    localStorage.setItem(authStorageKey, JSON.stringify(user));
    document.body.classList.remove("auth-locked");
    authModal.setAttribute("aria-hidden", "true");
    document.querySelector("#account-button").textContent = user.name;
    document.querySelector("#logout-button").hidden = false;
    loadProducts();
    renderOrders();
    renderNotifications();
    return;
  }
  localStorage.removeItem(authStorageKey);
  document.body.classList.add("auth-locked");
  authModal.setAttribute("aria-hidden", "false");
  document.querySelector("#account-button").textContent = "Account";
  document.querySelector("#logout-button").hidden = true;
  renderNotifications();
}

function setAuthMode(mode) {
  const loginMode = mode === "login";
  const registerMode = mode === "register";
  loginForm.classList.toggle("is-visible", loginMode);
  registerForm.classList.toggle("is-visible", registerMode);
  document.querySelector("#login-tab").classList.toggle("is-active", loginMode);
  document.querySelector("#register-tab").classList.toggle("is-active", registerMode);
  document.querySelector("#login-tab").setAttribute("aria-selected", loginMode);
  document.querySelector("#register-tab").setAttribute("aria-selected", registerMode);
  document.querySelector("#form-title").textContent = loginMode ? "Welcome back" : "Create your account";
  document.querySelector("#form-subtitle").textContent = loginMode ? "Sign in to pick up where you left off." : "Join Sriram Store for a faster checkout.";
  authError.textContent = "";
}

function openProfile() {
  profileError.textContent = "";
  profileModal.setAttribute("aria-hidden", "false");
  profileModal.classList.add("open");
  setProfileAuthMode("login");
}

function closeProfile() {
  profileModal.classList.remove("open");
  profileModal.setAttribute("aria-hidden", "true");
}

function setProfileAuthMode(mode) {
  const loginMode = mode === "login";
  profileLoginForm.classList.toggle("is-visible", loginMode);
  profileRegisterForm.classList.toggle("is-visible", !loginMode);
  profileLoginTab.classList.toggle("is-active", loginMode);
  profileRegisterTab.classList.toggle("is-active", !loginMode);
  profileLoginTab.setAttribute("aria-selected", loginMode);
  profileRegisterTab.setAttribute("aria-selected", !loginMode);
  document.querySelector("#profile-title").textContent = loginMode ? "Welcome back" : "Create your account";
  document.querySelector("#profile-subtitle").textContent = loginMode ? "Sign in to your account." : "Create a new account.";
  profileError.textContent = "";
}

async function submitProfileAuth(form, endpoint, payload) {
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  profileError.textContent = "";
  try {
    const response = await fetch(`${apiUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid JSON response" }));
    if (!response.ok) throw new Error(result.error || "Authentication failed");
    if (result.token) {
      localStorage.setItem("sriram-admin-token", result.token);
      setAuthenticated(null);
      showToast("Admin authenticated");
      closeProfile();
      window.location.href = "admin-login.html";
      return;
    }
    setAuthenticated(result.user);
    showToast(endpoint.includes("register") ? "Account created successfully" : "Welcome back");
    closeProfile();
  } catch (error) {
    profileError.textContent = error.message;
    showToast(error.message, false);
  } finally {
    button.disabled = false;
  }
}

async function submitAuth(form, endpoint, payload) {
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  authError.textContent = "";
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid JSON response" }));
    if (!response.ok) throw new Error(result.error || "Authentication failed");
    if (result.token) {
      localStorage.setItem("sriram-admin-token", result.token);
      setAuthenticated(null);
      showToast("Admin authenticated");
      closeModal(authModal);
      window.location.href = "admin-login.html";
      return;
    }
    setAuthenticated(result.user);
    showToast(endpoint.includes("register") ? "Account created successfully" : "Welcome back");
  } catch (error) {
    authError.textContent = error.message;
    showToast(error.message, false);
  } finally {
    button.disabled = false;
  }
}

const rotatingLabels = ["Fresh today", "New arrival", "Best seller", "Limited stock", "Farm fresh", "Organic pick", "Popular", "Great value"];
let rotatingLabelIndex = 0;

function getRotatingLabel() {
  return rotatingLabels[rotatingLabelIndex];
}

function cycleRotatingLabel() {
  rotatingLabelIndex = (rotatingLabelIndex + 1) % rotatingLabels.length;
  const label = getRotatingLabel();
  document.querySelectorAll(".product-tag.rotating").forEach((span) => {
    span.textContent = label;
  });
  if (detailsModal.classList.contains("open")) {
    document.querySelector("#details-tag").textContent = label;
  }
}

function getExpiryTag(product) {
  if (!product.expiry) return null;
  const expiryDate = new Date(product.expiry);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiryDate.setHours(0, 0, 0, 0);
  if (expiryDate >= today) {
    return { text: "🟢 Fresh Today", className: "fresh-today" };
  }
  const daysExpired = Math.floor((today - expiryDate) / (1000 * 60 * 60 * 24));
  if (daysExpired === 1) {
    return { text: "🔵 Fresh Yesterday", className: "fresh-yesterday" };
  }
  return { text: "🔵 Regular", className: "regular" };
}

function updateExpiryTags() {
  document.querySelectorAll(".product-card").forEach((card) => {
    const productId = Number(card.dataset.detail);
    const product = productById(productId);
    if (!product) return;
    const tag = card.querySelector(".product-tag");
    if (!tag) return;
    const expiryTag = getExpiryTag(product);
    if (expiryTag) {
      tag.textContent = expiryTag.text;
      tag.className = `product-tag ${expiryTag.className}`;
    }
  });
  if (detailsModal.classList.contains("open")) {
    const product = productById(Number(detailsModal.dataset.productId));
    if (product) {
      const expiryTag = getExpiryTag(product);
      const detailsTag = document.querySelector("#details-tag");
      if (expiryTag && detailsTag) {
        detailsTag.textContent = expiryTag.text;
        detailsTag.className = `eyebrow ${expiryTag.className}`;
      }
    }
  }
}

function scheduleMidnightUpdate() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const msUntilMidnight = tomorrow - now;
  setTimeout(() => {
    updateExpiryTags();
    scheduleMidnightUpdate();
  }, msUntilMidnight);
}

function renderProducts() {
  const term = searchInput.value.trim().toLowerCase();
  const sortValue = document.querySelector("#sort-select")?.value || "";
  let visibleProducts = products.filter((product) => Number(product.stock) > 0).filter((product) => {
    const matchesSearch = `${product.name} ${product.color || ""} ${product.tag || ""}`.toLowerCase().includes(term);
    const matchesCategory = !selectedCategory || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  if (sortValue === "price-asc") {
    visibleProducts = [...visibleProducts].sort((a, b) => finalPrice(a) - finalPrice(b));
  } else if (sortValue === "price-desc") {
    visibleProducts = [...visibleProducts].sort((a, b) => finalPrice(b) - finalPrice(a));
  }
  const availableCount = visibleProducts.length;
  document.querySelector(".product-count").textContent = `${availableCount.toString().padStart(2, "0")} items`;
  productGrid.innerHTML = visibleProducts.map((product) => {
    const expiryTag = getExpiryTag(product);
    const tagHtml = expiryTag
      ? `<span class="product-tag ${expiryTag.className}">${expiryTag.text}</span>`
      : `<span class="product-tag rotating">${product.tag || getRotatingLabel()}</span>`;
    return `
    <article class="product-card" data-detail="${product.id}" tabindex="0">
      <div class="product-image"><img src="${imageFor(product)}" alt="Fresh ${product.name}" loading="lazy">${tagHtml}</div>
      <h3>${product.name}</h3>
      <div class="product-meta"><span>${product.color || "Fresh produce"}</span><span class="product-price">${formatPrice(finalPrice(product))}${discountFor(product) ? ` <del>${formatPrice(product.price)}</del>` : ""}</span></div>
      <div class="product-stock">${Number(product.stock) > 0 ? `${product.stock} in stock` : "Out of stock"}</div>
      <div class="product-rating">${renderStars(product.rating || 4)} <small>(${product.reviews || 0})</small></div>
      <button class="wishlist-button ${wishlist.includes(product.id) ? "is-saved" : ""}" type="button" data-wishlist="${product.id}" aria-label="${wishlist.includes(product.id) ? "Remove from" : "Add to"} wishlist">&#9825;</button>
      <div class="add-area" data-product="${product.id}">${renderAddControl(product)}</div>
    </article>`;
  }).join("") || '<p class="no-results">No fresh items found.</p>';
}

function renderCategoryFilter() {
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];
  const buttons = [{ label: "All", value: "" }, ...categories.map((category) => ({ label: category, value: category }))];
  categoryFilter.innerHTML = buttons.map((button) => `<button class="category-button ${selectedCategory === button.value ? "is-active" : ""}" type="button" data-category="${button.value}">${button.label}</button>`).join("");
}

function openDetails(id) {
  const product = productById(id);
  if (!product) return;
  detailsModal.dataset.productId = id;
  const image = imageFor(product);
  document.querySelector("#details-image").innerHTML = image ? `<img src="${image}" alt="Fresh ${product.name}">` : "";
  const expiryTag = getExpiryTag(product);
  const detailsTag = document.querySelector("#details-tag");
  if (expiryTag) {
    detailsTag.textContent = expiryTag.text;
    detailsTag.className = `eyebrow ${expiryTag.className}`;
  } else {
    detailsTag.textContent = product.category || getRotatingLabel();
    detailsTag.className = "eyebrow";
  }
  document.querySelector("#details-name").textContent = product.name;
  document.querySelector("#details-price").innerHTML = discountFor(product) ? `${formatPrice(finalPrice(product))} <del>${formatPrice(product.price)}</del>` : formatPrice(product.price);
  document.querySelector("#details-description").textContent = product.description || `Fresh ${product.name}, carefully selected and delivered in its best condition.`;
  document.querySelector("#details-unit").textContent = discountFor(product) ? `${discountFor(product)}% off · 1 pack` : "1 pack";
  document.querySelector("#details-quantity").textContent = "1";
  detailsModal.classList.add("open");
  detailsModal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function statusLabel(status) {
  const map = { placed: "Placed", processing: "Processing", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", returned: "Returned" };
  return map[status] || "Placed";
}

function paintOrders(orders) {
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  ordersList.innerHTML = orders.length ? orders.map((order) => {
    const status = order.status || "placed";
    const isFinal = ["cancelled", "returned", "delivered"].includes(status);
    const isReturned = status === "returned";
    const isCancelled = status === "cancelled";
    const isDelivered = status === "delivered";
    const editButton = !isFinal && order.userId && user?.id === order.userId ? `<button class="secondary-button" type="button" data-edit-order="${order.id}">Edit</button>` : "";
    const returnButton = isFinal ? "" : `<button class="return-order" type="button" data-return-order="${order.id}">Return</button>`;
    const cancelButton = isFinal ? "" : `<button class="cancel-order" type="button" data-cancel-order="${order.id}">Cancel order</button>`;
    const statusAction = isReturned
      ? `<span class="order-action-note" data-action="returned">Return processed by store</span>`
      : isCancelled
        ? `<span class="order-action-note" data-action="cancelled">Cancelled by store</span>`
        : isDelivered
          ? `<span class="order-action-note" data-action="delivered">Delivered</span>`
          : "";
    const addressState = (order.address || "").split(",").map((s) => s.trim()).pop() || "";
    const deliveryDays = getEstimatedDeliveryDaysForState(addressState);
    return `<div class="order-row" data-view-order="${order.id}"><div><strong>Order ${order.id}</strong><small>${order.items} item${order.items === 1 ? "" : "s"} · ${order.address} · ${deliveryDays} days</small></div><div class="order-actions"><span class="order-status" data-status="${status}">${statusLabel(status)}</span>${editButton}${returnButton}${cancelButton}${statusAction}</div></div>`;
  }).join("") : '<p class="empty-orders">Your placed orders will appear here.</p>';
}

async function renderOrders() {
  const localOrders = JSON.parse(localStorage.getItem(ordersStorageKey) || "[]");
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (user?.id) {
    try {
      const response = await fetch(`${apiUrl}/orders?userId=${user.id}`);
      const serverOrders = await response.json().catch(() => []);
      if (response.ok && Array.isArray(serverOrders)) {
        const localById = new Map(localOrders.map((o) => [o.id, o]));
        const merged = serverOrders.map((serverOrder) => {
          const local = localById.get(serverOrder.id);
          return {
            ...serverOrder,
            userId: serverOrder.userId || user.id,
            couponCode: serverOrder.couponCode || local?.couponCode,
            couponDiscount: serverOrder.couponDiscount || local?.couponDiscount,
            discount: serverOrder.discount || local?.discount,
            lineItems: local?.lineItems,
            orderTotal: serverOrder.totalAmount
          };
        });
        const localOnly = localOrders.filter((o) => !serverOrders.some((s) => s.id === o.id) && !o.userId);
        const all = [...merged, ...localOnly];
        localStorage.setItem(ordersStorageKey, JSON.stringify(all.map((o) => ({ ...o, status: o.status || "placed" }))));
        paintOrders(all);
        return;
      }
    } catch (error) {
      console.error("Could not load server orders:", error.message);
    }
  }
  paintOrders(localOrders);
}

async function openCheckout() {
  if (!cart.length) return showToast("Add something to your bag first", false);
  closeModal(detailsModal);
  checkoutModal.classList.add("open");
  checkoutModal.setAttribute("aria-hidden", "false");
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (user?.id) {
    try {
      const response = await fetch(`${apiUrl}/auth/me?userId=${user.id}`);
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.profile) {
        const address = String(result.profile.address || "").trim();
        const city = String(result.profile.city || "").trim();
        const district = String(result.profile.district || "").trim();
        const state = String(result.profile.state || "").trim();
        const country = String(result.profile.country || "").trim();
        const pin = String(result.profile.pin || "").trim();
        const phone = String(result.profile.phone || "").trim();
        const nameInput = document.querySelector("#customer-name");
        const phoneInput = document.querySelector("#customer-phone");
        if (address) document.querySelector("#customer-address").value = address;
        if (city) document.querySelector("#customer-city").value = city;
        if (district) document.querySelector("#customer-district").value = district;
        if (state) document.querySelector("#customer-state").value = state;
        if (country) document.querySelector("#customer-country").value = country;
        if (pin) document.querySelector("#customer-pin").value = pin;
        if (phone && !nameInput.value) nameInput.value = String(result.user?.name || "").trim();
        if (phone) phoneInput.value = phone;
      }
    } catch (error) {
      console.error("Profile prefetch failed:", error.message);
    }
  }
  syncCouponUI();
  renderCart();
  loadAvailableCoupons();
}

function updateCheckoutSummary(subtotal, discount, delivery) {
  const summary = document.querySelector("#checkout-summary");
  if (!summary) return;
  const discountAmount = discount || 0;
  const grandTotal = subtotal - discountAmount + delivery;
  document.querySelector("#checkout-subtotal").textContent = formatPrice(subtotal);
  const discountRow = document.querySelector(".checkout-summary-row.checkout-discount-row");
  const deliveryRow = document.querySelector("#checkout-delivery")?.closest(".checkout-summary-row");
  if (discountRow) discountRow.hidden = discountAmount === 0;
  const discountValue = document.querySelector("#checkout-discount");
  if (discountValue) discountValue.textContent = discountAmount === 0 ? "" : `-${formatPrice(discountAmount)}`;
  const deliveryValue = document.querySelector("#checkout-delivery");
  if (deliveryValue) deliveryValue.textContent = formatPrice(delivery);
  if (deliveryRow) deliveryRow.hidden = delivery === 0;
  document.querySelector("#checkout-grand-total").textContent = formatPrice(grandTotal);
  summary.hidden = !cart.length;
}

function renderCart() {
  syncActiveOffer();
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + finalPrice(productById(item.id)) * item.quantity, 0);
  const offerDiscount = activeOffer
    ? cart.reduce((sum, item) => {
        const product = productById(item.id);
        if (!offerAppliesToProduct(activeOffer, product)) return sum;
        return sum + finalPrice(product) * item.quantity * (Number(activeOffer.discount_percent) / 100);
      }, 0)
    : 0;
  const couponDiscount = couponApplied && appliedCoupon && !activeOffer ? subtotal * (appliedCoupon.discount_percent / 100) : 0;
  const discount = offerDiscount + couponDiscount;
  const total = subtotal - discount;
  const grandTotal = total + deliveryCharge;
  document.querySelector("#cart-count").textContent = count;
  document.querySelector("#cart-total").textContent = formatPrice(total);
  document.querySelector("#cart-discount").hidden = discount === 0;
  document.querySelector("#cart-discount-value").textContent = `-${formatPrice(discount)}`;
  const removeButton = document.querySelector("#remove-discount");
  if (removeButton) removeButton.hidden = discount === 0;
  const offerNote = document.querySelector(".offer-note");
  if (offerNote) {
    if (activeOffer) {
      const codeLabel = activeOffer.coupon_code ? ` (code: ${activeOffer.coupon_code})` : "";
      offerNote.textContent = `${activeOffer.name}: ${activeOffer.discount_percent}% off${codeLabel}`;
    } else if (couponApplied && appliedCoupon) {
      offerNote.textContent = `${appliedCoupon.code}: ${appliedCoupon.discount_percent}% off`;
    } else {
      offerNote.textContent = "10% off on orders over ₹500";
    }
  }
  const deliveryRow = document.querySelector("#cart-delivery");
  const deliveryValue = document.querySelector("#cart-delivery-value");
  if (deliveryRow && deliveryValue) {
    deliveryValue.textContent = formatPrice(deliveryCharge);
    deliveryRow.hidden = deliveryCharge === 0;
  }
  const grandTotalEl = document.querySelector("#cart-grand-total");
  if (grandTotalEl) grandTotalEl.textContent = formatPrice(grandTotal);
  updateCheckoutSummary(subtotal, discount, deliveryCharge);
  cartItems.innerHTML = cart.length ? cart.map((item) => {
    const product = productById(item.id);
    const stock = Number(product.stock) || 0;
    return `<div class="cart-item"><div class="cart-thumb"><img src="${imageFor(product)}" alt="${escapeHtml(product.name)}" loading="lazy"></div><div><h3>${product.name}</h3><p>${formatPrice(finalPrice(product))} each${discountFor(product) ? ` (${discountFor(product)}% off)` : ""}</p><small class="cart-stock">${stock} available · ${item.quantity} selected</small><div class="quantity-controls"><button type="button" data-change="${product.id}" data-amount="-1" aria-label="Decrease ${product.name} quantity">−</button><span>${item.quantity}</span><button type="button" data-change="${product.id}" data-amount="1" aria-label="Increase ${product.name} quantity" ${item.quantity >= stock ? "disabled" : ""}>+</button></div></div><div class="cart-item-side"><span class="cart-item-total">${formatPrice(finalPrice(product) * item.quantity)}</span><button class="remove-item" type="button" data-remove="${product.id}">Remove</button></div></div>`;
  }).join("") : '<p class="cart-empty">Your bag is waiting for something good.</p>';
}

function setCartOpen(open) {
  document.querySelector("#cart-drawer").classList.toggle("open", open);
  document.querySelector("#drawer-backdrop").classList.toggle("visible", open);
}

const inCart = (id) => cart.some((item) => item.id === id);
const qtyFor = (id) => cart.find((entry) => entry.id === id)?.quantity || 0;

function renderAddControl(product) {
  const id = product.id;
  const stock = Number(product.stock) || 0;
  const qty = qtyFor(id);
  const added = qty > 0;
  if (stock < 1) {
    return `<button class="add-button" type="button" data-add="${id}" disabled>Unavailable</button>`;
  }
  if (added) {
    const canSubtract = qty > 1;
    const canAdd = qty < stock;
    return `<button class="add-button added" type="button" aria-label="In bag"><span class="added-text">Added &#10003;</span></button><div class="add-qty"><button type="button" data-subtract="${id}" ${canSubtract ? "" : "disabled"} aria-label="Decrease ${product.name}">&minus;</button><strong class="qty-count">${qty}</strong><button type="button" data-addone="${id}" ${canAdd ? "" : "disabled"} aria-label="Increase ${product.name}">+</button></div>`;
  }
  return `<button class="add-button" type="button" data-add="${id}">Add to bag <span>+</span></button>`;
}

function addToCart(id) {
  const product = productById(id);
  if (!product || Number(product.stock) < 1) return showToast("This item is out of stock", false);
  const item = cart.find((entry) => entry.id === id);
  if (item && item.quantity >= Number(product.stock)) return showToast("You have reached the available stock", false);
  if (item) item.quantity += 1;
  else cart.push({ id, quantity: 1 });
  renderCart();
  refreshAddButtons();
  setCartOpen(true);
  showToast(`${productById(id).name} added to your bag`);
}

function refreshAddButtons() {
  document.querySelectorAll(".add-area").forEach((area) => {
    const id = Number(area.dataset.product);
    const product = productById(id);
    if (product) area.innerHTML = renderAddControl(product);
  });
}

function decreaseQty(id) {
  const item = cart.find((entry) => entry.id === id);
  if (!item) return;
  item.quantity -= 1;
  cart = cart.filter((entry) => entry.quantity > 0);
  renderCart();
  refreshAddButtons();
}

function toggleWishlist(id) {
  wishlist = wishlist.includes(id) ? wishlist.filter((item) => item !== id) : [...wishlist, id];
  localStorage.setItem(wishlistStorageKey, JSON.stringify(wishlist));
  renderProducts();
  renderWishlist();
  showToast(wishlist.includes(id) ? "Added to your wishlist" : "Removed from your wishlist");
}

function renderWishlist() {
  const saved = wishlist.map((id) => productById(id)).filter((product) => product && Number(product.stock) > 0);
  document.querySelector(".wishlist-count").textContent = `${saved.length.toString().padStart(2, "0")} saved`;
  document.querySelector("#wishlist-list").innerHTML = saved.length ? saved.map((product) => `<div class="wishlist-item"><strong>${product.name}</strong><span>${formatPrice(finalPrice(product))}</span><button class="add-button" type="button" data-wishlist-add="${product.id}">Add to bag</button><button class="remove-wishlist" type="button" data-wishlist-remove="${product.id}">Remove</button></div>`).join("") : '<p class="empty-orders">Save products here for your next order.</p>';
}

async function loadProducts() {
  try {
    const response = await fetch(`${API_URL}/products`);
    if (!response.ok) throw new Error("Products request failed");
    products = await response.json();
    selectedCategory = "";
    renderCategoryFilter();
    renderProducts();
    updateExpiryTags();
    refreshAddButtons();
    renderWishlist();
    await loadOffers();
  } catch (error) {
    productGrid.innerHTML = '<p class="no-results">Products are temporarily unavailable.</p>';
    showToast("Could not connect to the ecommerce database", false);
  }
}

let festivalOffers = [];
let activeOffer = null;

async function loadOffers() {
  try {
    const response = await fetch(`${API_URL}/offers`);
    festivalOffers = await response.json().catch(() => []);
    if (!Array.isArray(festivalOffers)) festivalOffers = [];
  } catch (error) {
    festivalOffers = [];
  }
  renderOfferBanner();
  loadAvailableCoupons();
  syncActiveOffer();
  renderCart();
}

function renderOfferBanner() {
  const track = document.querySelector("#offer-banner-track");
  if (!track) return;
  if (!festivalOffers.length) {
    track.innerHTML = `<div class="offer-card"><div class="offer-card-body"><p class="offer-card-festival">Fresh deal</p><p class="offer-card-title">Save 10% on orders over ₹500</p><div class="offer-card-actions"><span class="offer-code">WELCOME10</span></div></div></div>`;
    return;
  }
  track.innerHTML = festivalOffers.map((offer) => {
    const festivalName = offer.festival_name ? escapeHtml(offer.festival_name) : escapeHtml(offer.name);
    const offerName = escapeHtml(offer.name);
    const discount = Number(offer.discount_percent);
    const coupon = offer.coupon_code ? `<span class="offer-code">${escapeHtml(offer.coupon_code)}</span>` : "";
    const minOrder = Number(offer.min_order_amount) > 0 ? ` on orders over ₹${Number(offer.min_order_amount).toLocaleString("en-IN")}` : "";
    const dateRange = offer.start_date || offer.end_date ? `${offer.start_date || "Open"} → ${offer.end_date || "Open"}` : "";
    const image = offer.image_url || offer.festival_image_url || "";
    const imageHtml = image ? `<img class="offer-card-image" src="${escapeHtml(image)}" alt="${festivalName}" loading="lazy" onerror="this.style.display='none'">` : `<div class="offer-card-image" style="display:grid;place-items:center;color:var(--green);font-size:28px;">🎉</div>`;
    const shopNow = offer.coupon_code ? `<button class="offer-shop-now" type="button" data-shop-now="${escapeHtml(offer.coupon_code)}">Shop Now</button>` : `<button class="offer-shop-now" type="button" data-shop-now="">Shop Now</button>`;
    return `<div class="offer-card">${imageHtml}<div class="offer-card-body"><p class="offer-card-festival">${festivalName}</p><p class="offer-card-title">${offerName} — ${discount}% OFF${minOrder}</p>${dateRange ? `<p class="offer-card-dates">${escapeHtml(dateRange)}</p>` : ""}<div class="offer-card-actions">${coupon}${shopNow}</div></div></div>`;
  }).join("");
  track.querySelectorAll("[data-shop-now]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.shopNow;
      if (code) {
        applyOfferByCode(code);
      }
      document.querySelector("#products")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

async function applyOfferByCode(code) {
  const status = document.querySelector("#coupon-status") || document.querySelector("#bag-coupon-status");
  const input = document.querySelector("#coupon-code") || document.querySelector("#bag-coupon-code");
  if (input && status) {
    input.value = code;
    await applyCoupon(input, status);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
}

function offerAppliesToProduct(offer, product) {
  if (!product) return false;
  if (Array.isArray(offer.product_ids) && offer.product_ids.includes(Number(product.id))) return true;
  if (Array.isArray(offer.categories) && offer.categories.length) {
    const productCategory = String(product.category || "").trim().toLowerCase();
    if (productCategory && offer.categories.some((c) => String(c || "").trim().toLowerCase() === productCategory)) return true;
  }
  return false;
}

function findBestOffer() {
  const cartItemsDetailed = cart.map((item) => ({ item, product: productById(item.id) })).filter((c) => c.product);
  if (!cartItemsDetailed.length || !festivalOffers.length) return null;
  const candidates = [];
  for (const offer of festivalOffers) {
    const matching = cartItemsDetailed.filter((c) => offerAppliesToProduct(offer, c.product));
    if (!matching.length) continue;
    const eligibleSubtotal = matching.reduce((sum, c) => sum + finalPrice(c.product) * c.item.quantity, 0);
    const subtotal = cartItemsDetailed.reduce((sum, c) => sum + finalPrice(c.product) * c.item.quantity, 0);
    if (subtotal < Number(offer.min_order_amount || 0)) continue;
    const discount = eligibleSubtotal * (Number(offer.discount_percent) / 100);
    candidates.push({ offer, discount, eligibleSubtotal });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.discount - a.discount);
  return candidates[0];
}

function syncActiveOffer() {
  const best = findBestOffer();
  if (!best) {
    activeOffer = null;
    return;
  }
  activeOffer = {
    id: best.offer.id,
    name: best.offer.name,
    coupon_code: best.offer.coupon_code,
    discount_percent: Number(best.offer.discount_percent),
    min_order_amount: Number(best.offer.min_order_amount || 0)
  };
}

productGrid.addEventListener("click", (event) => {
  const wishlistButton = event.target.closest("[data-wishlist]");
  if (wishlistButton) return toggleWishlist(Number(wishlistButton.dataset.wishlist));
  const subtract = event.target.closest("[data-subtract]");
  if (subtract) return decreaseQty(Number(subtract.dataset.subtract));
  const addOne = event.target.closest("[data-addone]");
  if (addOne) return addToCart(Number(addOne.dataset.addone));
  const button = event.target.closest("[data-add]");
  if (button) {
    addToCart(Number(button.dataset.add));
    return;
  }
  if (event.target.closest(".add-area")) return;
  const card = event.target.closest("[data-detail]");
  if (card) openDetails(Number(card.dataset.detail));
});
categoryFilter.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  selectedCategory = button.dataset.category || "";
  renderCategoryFilter();
  renderProducts();
});
document.querySelector("#wishlist-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-wishlist-add]");
  if (button) addToCart(Number(button.dataset.wishlistAdd));
  const removeButton = event.target.closest("[data-wishlist-remove]");
  if (removeButton) toggleWishlist(Number(removeButton.dataset.wishlistRemove));
});
async function openOrderDetails(orderId) {
  const localOrders = JSON.parse(localStorage.getItem(ordersStorageKey) || "[]");
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  let order = localOrders.find((o) => o.id === orderId);
  if (user?.id) {
    try {
      const response = await fetch(`${apiUrl}/orders?userId=${user.id}`);
      const serverOrders = await response.json().catch(() => []);
      if (response.ok && Array.isArray(serverOrders)) {
        const serverOrder = serverOrders.find((o) => o.id === orderId);
        if (serverOrder) order = { ...order, ...serverOrder, orderTotal: serverOrder.totalAmount };
      }
    } catch (error) {
      console.error("Could not refresh order:", error.message);
    }
  }
  if (!order) return;
  const orderTotal = Number(order.orderTotal || 0);
  const delivery = Number(order.deliveryCharge || 0);
  const discount = Number(order.discount || order.couponDiscount || 0);
  document.querySelector("#order-details-id").textContent = order.id;
  document.querySelector("#order-details-status").textContent = statusLabel(order.status || "placed");
  document.querySelector("#order-details-items").textContent = `${order.items} item${order.items === 1 ? "" : "s"}`;
  const couponEl = document.querySelector("#order-details-coupon");
  const discountEl = document.querySelector("#order-details-discount");
  const serverCouponCode = order.couponCode || order.coupon_code || null;
  if (serverCouponCode) {
    couponEl.textContent = serverCouponCode;
    couponEl.style.color = "var(--green-dark)";
  } else {
    couponEl.textContent = "—";
    couponEl.style.color = "";
  }
  if (discount > 0) {
    discountEl.textContent = `-${formatPrice(discount)}`;
  } else {
    discountEl.textContent = "—";
  }
  document.querySelector("#order-details-address").textContent = order.address || "—";
  document.querySelector("#order-details-delivery").textContent = formatPrice(delivery);
  const deliveryDaysEl = document.querySelector("#order-details-delivery-days");
  if (deliveryDaysEl) {
    const stateFromAddress = (order.address || "").split(",").map((s) => s.trim()).pop();
    const estimatedDays = stateFromAddress ? getEstimatedDeliveryDaysForState(stateFromAddress) : 3;
    deliveryDaysEl.textContent = estimatedDays <= 1 ? "1 day" : `${estimatedDays} days`;
  }
  document.querySelector("#order-details-total").textContent = formatPrice(orderTotal);
  const returnBtn = document.querySelector("#request-return");
  if (returnBtn) {
    const final = ["cancelled", "returned", "delivered"].includes(order.status);
    returnBtn.hidden = final;
    returnBtn.textContent = order.status === "returned" ? "Return processed" : "Request return";
  }
  orderDetailsModal.dataset.orderId = order.id;
  orderDetailsModal.classList.add("open");
  orderDetailsModal.setAttribute("aria-hidden", "false");
}

ordersList.addEventListener("click", async (event) => {
  const cancelButton = event.target.closest("[data-cancel-order]");
  if (cancelButton) {
    const orderId = cancelButton.dataset.cancelOrder;
    if (!window.confirm(`Cancel order ${orderId}?`)) return;
    const orders = JSON.parse(localStorage.getItem(ordersStorageKey) || "[]");
    const updated = orders.filter((order) => order.id !== orderId);
    localStorage.setItem(ordersStorageKey, JSON.stringify(updated));
    const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
    if (user?.id) {
      try {
        await fetch(`${apiUrl}/orders/${encodeURIComponent(orderId)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id }),
        });
      } catch (error) {
        console.error("Cancel order on server failed:", error.message);
      }
    }
    renderOrders();
    showToast("Order cancelled");
    return;
  }
  const returnButton = event.target.closest("[data-return-order]");
  if (returnButton) {
    openOrderDetails(returnButton.dataset.returnOrder);
    return;
  }
  const editButton = event.target.closest("[data-edit-order]");
  if (editButton) {
    const orders = JSON.parse(localStorage.getItem(ordersStorageKey) || "[]");
    const order = orders.find((o) => o.id === editButton.dataset.editOrder);
    if (!order) return;
    const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
    if (!user?.id || order.userId !== user.id) {
      showToast("You can only edit your own orders", false);
      return;
    }
    document.querySelector("#edit-order-address").value = order.address || "";
    orderEditModal.dataset.orderId = order.id;
    orderEditModal.classList.add("open");
    orderEditModal.setAttribute("aria-hidden", "false");
    return;
  }
  const viewOrder = event.target.closest("[data-view-order]");
  if (viewOrder) openOrderDetails(viewOrder.dataset.viewOrder);
});
orderDetailsModal.querySelectorAll("[data-close-order-details]").forEach((element) => element.addEventListener("click", () => closeModal(orderDetailsModal)));
document.querySelector("#request-return").addEventListener("click", async () => {
  const orderId = orderDetailsModal.dataset.orderId;
  if (!orderId) return;
  const orders = JSON.parse(localStorage.getItem(ordersStorageKey) || "[]");
  const order = orders.find((o) => o.id === orderId);
  if (order) {
    order.status = "Return requested";
    localStorage.setItem(ordersStorageKey, JSON.stringify(orders));
  }
  document.querySelector("#order-details-status").textContent = "Return requested";
  renderOrders();
  closeModal(orderDetailsModal);
  showToast("Return request submitted");
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (user?.id) {
    try {
      await fetch(`${apiUrl}/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, address: order?.address || "", returnRequested: true }),
      });
    } catch (error) {
      console.error("Return request failed:", error.message);
    }
  }
});
productGrid.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest("[data-detail]");
  if (card) {
    event.preventDefault();
    openDetails(Number(card.dataset.detail));
  }
});
searchInput.addEventListener("input", renderProducts);

const sortSelect = document.querySelector("#sort-select");
if (sortSelect) sortSelect.addEventListener("change", renderProducts);

const notificationButton = document.querySelector("#notification-button");
const notificationDropdown = document.querySelector("#notification-dropdown");
const notificationClear = document.querySelector("#notification-clear");
if (notificationButton && notificationDropdown) {
  notificationButton.addEventListener("click", (event) => {
    event.stopPropagation();
    notificationDropdown.classList.toggle("open");
  });
}
document.addEventListener("click", () => {
  if (notificationDropdown) notificationDropdown.classList.remove("open");
});
if (notificationClear) {
  notificationClear.addEventListener("click", (event) => {
    event.stopPropagation();
    clearNotifications();
  });
}
cartItems.addEventListener("click", (event) => {
  const change = event.target.closest("[data-change]");
  const remove = event.target.closest("[data-remove]");
  if (change) {
    const item = cart.find((entry) => entry.id === Number(change.dataset.change));
    const product = productById(Number(change.dataset.change));
    const amount = Number(change.dataset.amount);
    if (item && product && amount > 0 && item.quantity >= Number(product.stock)) {
      return showToast("You have reached the available stock", false);
    }
    if (item) item.quantity += amount;
    cart = cart.filter((entry) => entry.quantity > 0);
    renderCart();
    refreshAddButtons();
    loadAvailableCoupons();
  }
  if (remove) {
    cart = cart.filter((entry) => entry.id !== Number(remove.dataset.remove));
    renderCart();
    refreshAddButtons();
    loadAvailableCoupons();
  }
});
document.querySelector("#cart-button").addEventListener("click", () => setCartOpen(true));
document.querySelector("#account-button").addEventListener("click", () => {
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (user) {
    openProfile();
  }
});
document.querySelector("#logout-button").addEventListener("click", () => {
  setAuthenticated(null);
  showToast("You have been signed out");
});
document.querySelector("#close-cart").addEventListener("click", () => setCartOpen(false));
document.querySelector("#drawer-backdrop").addEventListener("click", () => setCartOpen(false));
document.querySelector("#place-order").addEventListener("click", openCheckout);
async function applyCoupon(codeInput, status) {
  const code = codeInput.value.trim().toUpperCase();
  if (!code) {
    couponApplied = false;
    appliedCoupon = null;
    status.textContent = "Enter a coupon code first.";
    status.className = "coupon-status is-invalid";
    renderCart();
    syncCouponUI();
    return;
  }
  status.textContent = "Validating...";
  status.className = "coupon-status";
  try {
    const response = await fetch(`${apiUrl}/coupons/${encodeURIComponent(code)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      couponApplied = false;
      appliedCoupon = null;
      status.textContent = data.error || "Invalid coupon code.";
      status.className = "coupon-status is-invalid";
    } else {
      const subtotal = cart.reduce((sum, item) => sum + finalPrice(productById(item.id)) * item.quantity, 0);
      if (subtotal < data.min_order_amount) {
        couponApplied = false;
        appliedCoupon = null;
        status.textContent = `Add &#8377;${Number(data.min_order_amount).toLocaleString("en-IN")} or more to use this code.`;
        status.className = "coupon-status is-invalid";
      } else {
        couponApplied = true;
        appliedCoupon = data;
        status.textContent = `${data.code} applied: ${data.discount_percent}% off your order.`;
        status.className = "coupon-status is-valid";
      }
    }
  } catch (error) {
    couponApplied = false;
    appliedCoupon = null;
    status.textContent = "Could not validate coupon. Please try again.";
    status.className = "coupon-status is-invalid";
  }
  renderCart();
  syncCouponUI();
}

function syncCouponUI() {
  const bagInput = document.querySelector("#bag-coupon-code");
  const checkoutInput = document.querySelector("#coupon-code");
  const bagStatus = document.querySelector("#bag-coupon-status");
  const checkoutStatus = document.querySelector("#coupon-status");
  if (couponApplied && appliedCoupon) {
    if (bagInput && !bagInput.value) bagInput.value = appliedCoupon.code;
    if (checkoutInput && !checkoutInput.value) checkoutInput.value = appliedCoupon.code;
    const message = `${appliedCoupon.code} applied: ${appliedCoupon.discount_percent}% off your order.`;
    if (bagStatus) { bagStatus.textContent = message; bagStatus.className = "coupon-status is-valid"; }
    if (checkoutStatus) { checkoutStatus.textContent = message; checkoutStatus.className = "coupon-status is-valid"; }
  } else {
    if (bagInput) bagInput.value = "";
    if (checkoutInput) checkoutInput.value = "";
    if (bagStatus) { bagStatus.textContent = ""; bagStatus.className = "coupon-status"; }
    if (checkoutStatus) { checkoutStatus.textContent = ""; checkoutStatus.className = "coupon-status"; }
  }
}

function clearCoupon() {
  couponApplied = false;
  appliedCoupon = null;
  ["#coupon-code", "#bag-coupon-code"].forEach((selector) => {
    const el = document.querySelector(selector);
    if (el) el.value = "";
  });
  ["#coupon-status", "#bag-coupon-status"].forEach((selector) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = "";
  });
  renderCart();
}

document.querySelector("#apply-coupon").addEventListener("click", () => applyCoupon(document.querySelector("#coupon-code"), document.querySelector("#coupon-status")));
document.querySelector("#bag-apply-coupon").addEventListener("click", () => applyCoupon(document.querySelector("#bag-coupon-code"), document.querySelector("#bag-coupon-status")));
document.querySelector("#remove-discount").addEventListener("click", clearCoupon);

async function loadAvailableCoupons() {
  const containers = [document.querySelector("#available-coupons"), document.querySelector("#bag-available-coupons")];
  try {
    const [couponsRes, offersRes] = await Promise.all([
      fetch(`${apiUrl}/coupons`).then((r) => r.json().catch(() => [])).catch(() => []),
      Promise.resolve(festivalOffers)
    ]);
    const coupons = Array.isArray(couponsRes) ? couponsRes : [];
    const offerCodes = (Array.isArray(offersRes) ? offersRes : [])
      .filter((o) => o.coupon_code)
      .map((o) => ({ code: o.coupon_code, discount_percent: Number(o.discount_percent), min_order_amount: Number(o.min_order_amount || 0), fromOffer: true }));
    const subtotal = cart.reduce((sum, item) => sum + finalPrice(productById(item.id)) * item.quantity, 0);
    const validCoupons = [...coupons, ...offerCodes].filter((c) => subtotal >= Number(c.min_order_amount || 0));
    const html = validCoupons.length ? validCoupons.map((c) => `<button class="coupon-chip" type="button" data-coupon-chip="${escapeHtml(c.code)}">${escapeHtml(c.code)} · ${Number(c.discount_percent)}% off</button>`).join("") : '<span class="no-coupons">No coupons available for your cart total</span>';
    containers.forEach((container) => { if (container) container.innerHTML = html; });
  } catch (error) {
    containers.forEach((container) => { if (container) container.innerHTML = ""; });
  }
}

document.querySelector("#cart-button").addEventListener("click", () => {
  setCartOpen(true);
  syncCouponUI();
  loadAvailableCoupons();
});

document.querySelector("#place-order").addEventListener("click", () => {
  loadAvailableCoupons();
});

document.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-coupon-chip]");
  if (!chip) return;
  const code = chip.dataset.couponChip || "";
  const bagInput = document.querySelector("#bag-coupon-code");
  const checkoutInput = document.querySelector("#coupon-code");
  if (bagInput) bagInput.value = code;
  if (checkoutInput) checkoutInput.value = code;
  applyCoupon(bagInput || checkoutInput, document.querySelector("#bag-coupon-status") || document.querySelector("#coupon-status"));
});
detailsModal.querySelectorAll("[data-close-details]").forEach((element) => element.addEventListener("click", () => closeModal(detailsModal)));
checkoutModal.querySelectorAll("[data-close-checkout]").forEach((element) => element.addEventListener("click", () => closeModal(checkoutModal)));
orderEditModal.querySelectorAll("[data-close-order-edit]").forEach((element) => element.addEventListener("click", () => closeModal(orderEditModal)));
profileModal.querySelectorAll("[data-close-profile]").forEach((element) => element.addEventListener("click", () => closeProfile()));
profileLoginTab.addEventListener("click", () => setProfileAuthMode("login"));
profileRegisterTab.addEventListener("click", () => setProfileAuthMode("register"));
profileLoginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!profileLoginForm.checkValidity()) return profileLoginForm.reportValidity();
  submitProfileAuth(profileLoginForm, "/auth/login", {
    email: document.querySelector("#profile-login-email").value,
    password: document.querySelector("#profile-login-password").value,
  });
});
profileRegisterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!profileRegisterForm.checkValidity()) return profileRegisterForm.reportValidity();
  submitProfileAuth(profileRegisterForm, "/auth/register", {
    name: document.querySelector("#profile-register-name").value,
    email: document.querySelector("#profile-register-email").value,
    password: document.querySelector("#profile-register-password").value,
  });
});
document.querySelector("#details-decrease").addEventListener("click", () => {
  const quantity = Number(document.querySelector("#details-quantity").textContent);
  document.querySelector("#details-quantity").textContent = Math.max(1, quantity - 1);
});
document.querySelector("#details-increase").addEventListener("click", () => {
  const quantity = Number(document.querySelector("#details-quantity").textContent);
  const product = productById(Number(detailsModal.dataset.productId));
  document.querySelector("#details-quantity").textContent = Math.min(Number(product?.stock) || 1, quantity + 1);
});
document.querySelector("#details-add").addEventListener("click", () => {
  const id = Number(detailsModal.dataset.productId);
  const quantity = Number(document.querySelector("#details-quantity").textContent);
  for (let count = 0; count < quantity; count += 1) addToCart(id);
  closeModal(detailsModal);
});
document.querySelector("#details-buy").addEventListener("click", () => {
  const id = Number(detailsModal.dataset.productId);
  const quantity = Number(document.querySelector("#details-quantity").textContent);
  for (let count = 0; count < quantity; count += 1) addToCart(id);
  closeModal(detailsModal);
  openCheckout();
});
document.querySelector("#checkout-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  const items = cart.reduce((sum, item) => sum + item.quantity, 0);
  const address = `${document.querySelector("#customer-address").value}, ${document.querySelector("#customer-city").value}, ${document.querySelector("#customer-district").value}, ${document.querySelector("#customer-state").value}, ${document.querySelector("#customer-pin").value}, ${document.querySelector("#customer-country").value}`;
  const orderSubtotal = cart.reduce((sum, item) => sum + finalPrice(productById(item.id)) * item.quantity, 0);
  const offerDiscount = activeOffer
    ? cart.reduce((sum, item) => {
        const product = productById(item.id);
        if (!offerAppliesToProduct(activeOffer, product)) return sum;
        return sum + finalPrice(product) * item.quantity * (Number(activeOffer.discount_percent) / 100);
      }, 0)
    : 0;
  const couponDiscount = couponApplied && appliedCoupon && !activeOffer ? orderSubtotal * (appliedCoupon.discount_percent / 100) : 0;
  const orderDiscount = offerDiscount + couponDiscount;
  const orderTotal = orderSubtotal - orderDiscount;
  const orderGrandTotal = orderTotal + deliveryCharge;
  const activeCouponCode = activeOffer?.coupon_code || (couponApplied && appliedCoupon ? appliedCoupon.code : "");
  let serverOrderId = null;
  let emailSent = false;
  let confirmationEmail = null;
  if (user) {
    try {
      const response = await fetch(`${apiUrl}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, items, address, couponCode: activeCouponCode, deliveryCharge, subtotal: orderSubtotal, discount: orderDiscount, totalAmount: orderTotal }),
      });
      const data = await response.json().catch(() => ({ error: "Invalid response" }));
      if (response.ok) {
        serverOrderId = data.id;
        emailSent = !!data.emailSent;
        confirmationEmail = data.email || (user && user.email) || null;
        await fetch(`${apiUrl}/auth/me`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            name: document.querySelector("#customer-name").value.trim(),
            phone: document.querySelector("#customer-phone").value.trim(),
            address: document.querySelector("#customer-address").value.trim(),
            city: document.querySelector("#customer-city").value.trim(),
            district: document.querySelector("#customer-district").value.trim(),
            state: document.querySelector("#customer-state").value.trim(),
            country: document.querySelector("#customer-country").value.trim(),
            pin: document.querySelector("#customer-pin").value.trim(),
          }),
        }).catch(() => {});
      } else {
        showToast(data.error || "Could not place order", false);
      }
    } catch (error) {
      showToast("Could not connect to server", false);
    }
  }
  const localOrders = JSON.parse(localStorage.getItem(ordersStorageKey) || "[]");
  const finalOrderId = serverOrderId || `SR${Date.now().toString().slice(-6)}`;
  localOrders.unshift({ id: finalOrderId, items, address, userId: user?.id || null, deliveryCharge, orderTotal, couponCode: activeCouponCode, couponDiscount: orderDiscount });
  localStorage.setItem(ordersStorageKey, JSON.stringify(localOrders));
  cart = [];
  clearCoupon();
  deliveryCharge = 0;
  selectedState = "";
  renderCart();
  refreshAddButtons();
  renderOrders();
  form.reset();
  closeModal(checkoutModal);
  setCartOpen(false);
  if (!user) {
    emailSent = false;
    confirmationEmail = null;
  }
  showOrderSuccess({
    orderId: finalOrderId,
    items,
    subtotal: orderSubtotal,
    discount: orderDiscount,
    total: orderGrandTotal,
    delivery: deliveryCharge,
    couponCode: activeCouponCode,
    emailSent,
    email: confirmationEmail
  });
  addNotification(`Order ${finalOrderId} placed successfully · ${items} item${items === 1 ? "" : "s"} · ${formatPrice(orderGrandTotal)}`);
  if (emailSent && confirmationEmail) {
    showToast(`Confirmation email sent to ${confirmationEmail}`);
  } else {
    showToast("Your order has been placed");
  }
});
document.querySelector("#order-edit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  const orderId = orderEditModal.dataset.orderId;
  const address = document.querySelector("#edit-order-address").value.trim();
  if (!orderId || !address) return showToast("Order ID and address are required", false);
  const localOrders = JSON.parse(localStorage.getItem(ordersStorageKey) || "[]");
  const localOrder = localOrders.find((o) => o.id === orderId);
  if (localOrder) {
    localOrder.address = address;
    localStorage.setItem(ordersStorageKey, JSON.stringify(localOrders));
    renderOrders();
  }
  if (user?.id) {
    try {
      const response = await fetch(`${apiUrl}/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, address }),
      });
      const data = await response.json().catch(() => ({ error: "Invalid response" }));
      if (!response.ok) showToast(data.error || "Could not update order", false);
    } catch (error) {
      showToast("Could not connect to server", false);
    }
  }
  closeModal(orderEditModal);
  showToast("Order address updated");
});
document.querySelector("#login-tab").addEventListener("click", () => setAuthMode("login"));
document.querySelector("#register-tab").addEventListener("click", () => setAuthMode("register"));

async function lookupPincode(pincode) {
  const statusEl = document.querySelector("#pincode-status");
  const districtEl = document.querySelector("#customer-district");
  const stateEl = document.querySelector("#customer-state");
  const cityEl = document.querySelector("#customer-city");
  const countryEl = document.querySelector("#customer-country");

  if (!/^\d{6}$/.test(pincode)) {
    statusEl.textContent = "";
    return;
  }

  statusEl.textContent = "Looking up pincode...";
  statusEl.className = "pincode-status is-loading";

  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const data = await response.json();

    if (data && data[0] && data[0].Status === "Success" && data[0].PostOffice && data[0].PostOffice.length > 0) {
      const postOffice = data[0].PostOffice[0];
      districtEl.value = postOffice.District || "";
      stateEl.value = postOffice.State || "";
      countryEl.value = postOffice.Country || "India";
      if (!cityEl.value && postOffice.Name) {
        cityEl.value = postOffice.Name;
      }
      const areaName = postOffice.Name || postOffice.District;
      statusEl.textContent = `📍 ${areaName}, ${postOffice.District}, ${postOffice.State}`;
      statusEl.className = "pincode-status is-valid";
      const popup = document.querySelector("#pincode-popup");
      const areaEl = document.querySelector("#pincode-area");
      const districtEl2 = document.querySelector("#pincode-district");
      if (popup && areaEl && districtEl2) {
        areaEl.textContent = `${postOffice.Name}${postOffice.Block ? `, ${postOffice.Block}` : ""}`;
        districtEl2.textContent = `${postOffice.District}, ${postOffice.State}`;
        popup.classList.add("show");
        popup.setAttribute("aria-hidden", "false");
      }
      const state = postOffice.State || "";
      selectedState = state;
      const infoEl = document.querySelector("#delivery-charge-info");
      if (state && infoEl) {
        infoEl.textContent = "Checking delivery charges...";
        infoEl.className = "delivery-charge-info is-loading";
        try {
          const chargeResponse = await fetch(`${apiUrl}/delivery-charge/${encodeURIComponent(state)}`);
          const chargeData = await chargeResponse.json().catch(() => ({}));
          if (chargeResponse.ok && typeof chargeData.delivery_charge === "number") {
            deliveryCharge = Number(chargeData.delivery_charge);
            infoEl.textContent = chargeData.description ? `Delivery: ${formatPrice(deliveryCharge)} (${chargeData.description})` : `Delivery charge: ${formatPrice(deliveryCharge)}`;
            infoEl.className = "delivery-charge-info is-valid";
          } else {
            deliveryCharge = 40;
            infoEl.textContent = `Delivery charge: ${formatPrice(deliveryCharge)}`;
            infoEl.className = "delivery-charge-info is-valid";
          }
        } catch (error) {
          deliveryCharge = 40;
          infoEl.textContent = `Delivery charge: ${formatPrice(deliveryCharge)}`;
          infoEl.className = "delivery-charge-info is-valid";
        }
        renderCart();
      } else if (infoEl) {
        deliveryCharge = 40;
        infoEl.textContent = `Delivery charge: ${formatPrice(deliveryCharge)}`;
        infoEl.className = "delivery-charge-info is-valid";
        renderCart();
      }
    } else {
      statusEl.textContent = "Pincode not found. Please check and enter manually.";
      statusEl.className = "pincode-status is-invalid";
      deliveryCharge = 0;
      selectedState = "";
      const infoEl = document.querySelector("#delivery-charge-info");
      if (infoEl) {
        infoEl.textContent = "";
        infoEl.className = "delivery-charge-info";
      }
      renderCart();
    }
  } catch (error) {
    statusEl.textContent = "Could not verify pincode. Please enter details manually.";
    statusEl.className = "pincode-status is-invalid";
    deliveryCharge = 0;
    selectedState = "";
    const infoEl = document.querySelector("#delivery-charge-info");
    if (infoEl) {
      infoEl.textContent = "";
      infoEl.className = "delivery-charge-info";
    }
    renderCart();
  }
}

document.querySelector("#customer-pin").addEventListener("input", (event) => {
  const pincode = event.target.value.trim();
  if (/^\d{6}$/.test(pincode)) {
    lookupPincode(pincode);
  } else {
    const statusEl = document.querySelector("#pincode-status");
    statusEl.textContent = "";
    statusEl.className = "pincode-status";
    deliveryCharge = 0;
    selectedState = "";
    const infoEl = document.querySelector("#delivery-charge-info");
    if (infoEl) {
      infoEl.textContent = "";
      infoEl.className = "delivery-charge-info";
    }
    renderCart();
    const popup = document.querySelector("#pincode-popup");
    if (popup) {
      popup.classList.remove("show");
      popup.setAttribute("aria-hidden", "true");
    }
  }
});

document.querySelector("#customer-pin").addEventListener("focus", () => {
  const popup = document.querySelector("#pincode-popup");
  const pincode = document.querySelector("#customer-pin").value.trim();
  if (/^\d{6}$/.test(pincode) && popup?.querySelector("#pincode-area")?.textContent) {
    popup.classList.add("show");
    popup.setAttribute("aria-hidden", "false");
  }
});

document.querySelector("#customer-pin").addEventListener("blur", () => {
  setTimeout(() => {
    const popup = document.querySelector("#pincode-popup");
    if (popup && document.activeElement?.id !== "customer-pin") {
      popup.classList.remove("show");
      popup.setAttribute("aria-hidden", "true");
    }
  }, 200);
});
loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!loginForm.checkValidity()) return loginForm.reportValidity();
  submitAuth(loginForm, "/auth/login", {
    email: document.querySelector("#login-email").value,
    password: document.querySelector("#login-password").value,
  });
});
registerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!registerForm.checkValidity()) return registerForm.reportValidity();
  submitAuth(registerForm, "/auth/register", {
    name: document.querySelector("#register-name").value,
    email: document.querySelector("#register-email").value,
    password: document.querySelector("#register-password").value,
  });
});
document.querySelectorAll(".password-toggle").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const passwordInput = toggle.parentElement.querySelector("input");
    const showing = passwordInput.type === "text";
    passwordInput.type = showing ? "password" : "text";
    toggle.textContent = showing ? "Show" : "Hide";
  });
});

const navLinks = document.querySelectorAll(".nav-link");

function setActiveNavLink() {
  const hash = window.location.hash || "#shop";
  navLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === hash);
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.forEach((l) => l.classList.remove("active"));
    link.classList.add("active");
  });
});

window.addEventListener("hashchange", setActiveNavLink);
setActiveNavLink();

renderCart();
renderWishlist();
setAuthenticated(JSON.parse(localStorage.getItem(authStorageKey) || "null"));
setInterval(cycleRotatingLabel,   1 * 60 * 1000); // Change rotating label every 1 minute 
scheduleMidnightUpdate();