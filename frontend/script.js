// The backend serves this frontend as static files, so the API is always same-origin.
// Opening index.html directly from disk falls back to the local dev server.
const API_URL = window.location.protocol === "file:"
  ? "https://ecommerce-1-r5m4.onrender.com/products"
  : window.location.origin;
const API_BASE = API_URL;
const ORDER_REQUEST_TIMEOUT_MS = 20000;

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error && error.name === "AbortError") {
      const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`);
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

let products = [];
let cart = [];
let couponApplied = false;
let appliedCoupon = null;
let deliveryCharge = 0;
let selectedState = "";
let selectedCategory = "";
let wishlist = JSON.parse(localStorage.getItem("sriram-store-wishlist") || "[]");

let productGrid = document.querySelector("#product-grid");
let categoryFilter = document.querySelector("#category-filter");
let searchInput = document.querySelector("#search-input");
let cartItems = document.querySelector("#cart-items");
let authModal = document.querySelector("#auth-modal");
let profileModal = document.querySelector("#profile-modal");
let detailsModal = document.querySelector("#details-modal");
let checkoutModal = document.querySelector("#checkout-modal");
let orderEditModal = document.querySelector("#order-edit-modal");
let orderDetailsModal = document.querySelector("#order-details-modal");
let ordersList = document.querySelector("#orders-list");
let loginForm = document.querySelector("#login-form");
let registerForm = document.querySelector("#register-form");
let profileLoginForm = document.querySelector("#profile-login-form");
let profileRegisterForm = document.querySelector("#profile-register-form");
let profileLoginTab = document.querySelector("#profile-login-tab");
let profileRegisterTab = document.querySelector("#profile-register-tab");
let authError = document.querySelector("#auth-error");
let profileError = document.querySelector("#profile-error");
const authStorageKey = "sriram-store-user";
const ordersStorageKey = "sriram-store-orders";
const wishlistStorageKey = "sriram-store-wishlist";
const notificationsStorageKey = "sriram-store-notifications";
const addressesStorageKey = "sriram-store-addresses";
const formatPrice = (price) => `₹${Number(price).toLocaleString("en-IN")}`;
const productById = (id) => products.find((product) => product.id === id);
const discountFor = (product) => Math.min(100, Math.max(0, Number(product.discount) || 0));
const finalPrice = (product) => Number(product.price) * (1 - discountFor(product) / 100);
const imageFor = (product) => {
  if (typeof product.image === "string" && /^https?:\/\//.test(product.image)) return product.image;
  if (typeof product.image === "string" && product.image.startsWith("/")) {
    return `${API_URL}${product.image}`;
  }
  const imageName = product.name.toLowerCase().includes("tomato") ? "tomato" : product.name.toLowerCase().includes("mango") ? "mango" : product.name.toLowerCase().includes("carrot") ? "carrot" : "";
  if (imageName) {
    return `/images/${imageName}_2.jpg`;
  }
  return "";
};

// Delivery checker state
let deliveryCheckerPincode = "";
let deliveryCheckerState = "";
let deliveryCheckerNotDeliverable = false;

function getDeliveryDays(state) {
  if (!state) return null;
  const s = state.toLowerCase().trim().replace(/\s+/g, ' ');
  // South states - 2 days
  if (["tamil nadu", "karnataka", "kerala", "andhra pradesh", "telangana", "puducherry", "tamilnadu", "andhrapradesh"].includes(s)) return 2;
  // West/North states - 3 days
  if (["maharashtra", "gujarat", "goa", "delhi", "haryana", "punjab", "rajasthan", "madhya pradesh", "uttar pradesh", "bihar", "jharkhand", "west bengal", "odisha", "chhattisgarh", "uttarakhand", "himachal pradesh", "jammu and kashmir", "ladakh", "punjab", "chandigarh"].includes(s)) return 3;
  // Default - 4 days
  return 4;
}

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
  // Also clear from server
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (user?.id) {
    fetch(`${API_URL}/notifications?userId=${user.id}`, { method: "DELETE" }).catch(() => {});
  }
}
function markNotificationRead(id) {
  const notifications = getNotifications();
  const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
  localStorage.setItem(notificationsStorageKey, JSON.stringify(updated));
  renderNotifications();
}
function markAllNotificationsRead() {
  const notifications = getNotifications();
  const updated = notifications.map((n) => ({ ...n, read: true }));
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
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = item.dataset.notificationId;
      markNotificationRead(id);
    });
  });
}

// Address Management
function getAddresses() {
  try { return JSON.parse(localStorage.getItem(addressesStorageKey) || "[]"); } catch { return []; }
}

function saveAddresses(addresses) {
  localStorage.setItem(addressesStorageKey, JSON.stringify(addresses));
}

function getDefaultAddress() {
  const addresses = getAddresses();
  return addresses.find(a => a.isDefault) || addresses[0] || null;
}

function addAddress(address) {
  const addresses = getAddresses();
  const newAddress = {
    id: Date.now().toString(),
    ...address,
    isDefault: addresses.length === 0, // First address is default
    createdAt: new Date().toISOString()
  };
  addresses.push(newAddress);
  saveAddresses(addresses);
  return newAddress;
}

function updateAddress(id, updates) {
  const addresses = getAddresses();
  const index = addresses.findIndex(a => a.id === id);
  if (index !== -1) {
    addresses[index] = { ...addresses[index], ...updates };
    saveAddresses(addresses);
    return addresses[index];
  }
  return null;
}

function deleteAddress(id) {
  const addresses = getAddresses();
  const filtered = addresses.filter(a => a.id !== id);
  // If deleted was default, make first remaining default
  if (addresses.find(a => a.id === id && a.isDefault) && filtered.length > 0) {
    filtered[0].isDefault = true;
  }
  saveAddresses(filtered);
}

function setDefaultAddress(id) {
  const addresses = getAddresses();
  addresses.forEach(a => a.isDefault = a.id === id);
  saveAddresses(addresses);
}

function populateAddressForm(address) {
  if (!address) return;
  document.querySelector("#customer-name").value = address.name || "";
  document.querySelector("#customer-phone").value = address.phone || "";
  document.querySelector("#customer-address").value = address.address || "";
  document.querySelector("#customer-city").value = address.city || "";
  document.querySelector("#customer-district").value = address.district || "";
  document.querySelector("#customer-state").value = address.state || "";
  document.querySelector("#customer-pin").value = address.pin || "";
  document.querySelector("#customer-country").value = address.country || "India";
}

function clearAddressForm() {
  document.querySelector("#customer-name").value = "";
  document.querySelector("#customer-phone").value = "";
  document.querySelector("#customer-address").value = "";
  document.querySelector("#customer-city").value = "";
  document.querySelector("#customer-district").value = "";
  document.querySelector("#customer-state").value = "";
  document.querySelector("#customer-pin").value = "";
  document.querySelector("#customer-country").value = "India";
}

function renderAddressSelector() {
  const selector = document.querySelector("#address-selector");
  if (!selector) return;
  const addresses = getAddresses();
  const currentValue = selector.value;
  selector.innerHTML = '<option value="">Select a saved address or add new</option>' +
    addresses.map(a => `<option value="${a.id}" ${a.isDefault ? ' (default)' : ''}>${a.name} — ${getAddressShort(a)}</option>`).join("");
  if (currentValue) selector.value = currentValue;
}

function getAddressShort(address) {
  if (!address) return "";
  return `${address.address}, ${address.city}, ${address.district}, ${address.state} ${address.pin}`;
}

let serverNotificationTimer = null;
let orderRefreshTimer = null;

async function loadServerNotifications() {
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (!user?.id) return;
  try {
    const response = await fetch(`${API_URL}/notifications?userId=${encodeURIComponent(user.id)}`);
    if (!response.ok) return;
    const serverNotifications = await response.json();
    if (!Array.isArray(serverNotifications)) return;
    const existingNotifications = getNotifications();
    const existingServerMap = new Map(
      existingNotifications
        .filter(n => String(n.id).startsWith("server-"))
        .map(n => [String(n.id), n])
    );
    const localNotifications = existingNotifications.filter(n => !String(n.id).startsWith("server-"));
    
    const mergedServerNotifications = serverNotifications.map(notification => {
      const serverId = `server-${notification.id}`;
      const existing = existingServerMap.get(serverId);
      return {
        id: serverId,
        message: notification.message,
        time: notification.created_at,
        read: existing?.read || false
      };
    });
    
    const merged = [...mergedServerNotifications, ...localNotifications].slice(0, 50);
    localStorage.setItem(notificationsStorageKey, JSON.stringify(merged));
    renderNotifications();
  } catch (error) {
    console.error("Could not load user notifications:", error.message);
  }
}

function startServerNotificationPolling() {
  if (serverNotificationTimer) clearInterval(serverNotificationTimer);
  loadServerNotifications();
  serverNotificationTimer = setInterval(loadServerNotifications, 15000);
}

function stopServerNotificationPolling() {
  if (serverNotificationTimer) clearInterval(serverNotificationTimer);
  serverNotificationTimer = null;
}

function startOrderRefresh() {
  if (orderRefreshTimer) clearInterval(orderRefreshTimer);
  orderRefreshTimer = setInterval(renderOrders, 15000);
}

function stopOrderRefresh() {
  if (orderRefreshTimer) clearInterval(orderRefreshTimer);
  orderRefreshTimer = null;
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

function productUnit(product) {
  const source = `${product?.name || ""} ${product?.description || ""}`;
  const match = source.match(/(?:^|\s)(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*(kg|g|grams?)(?=\s|$|[),.-])/i);
  if (match) {
    const rawAmount = match[1].replace(/\s/g, "");
    const amount = rawAmount.includes("/")
      ? rawAmount.split("/").reduce((numerator, value, index) => index ? numerator / Number(value) : Number(value), 0)
      : Number(rawAmount);
    const unit = match[2].toLowerCase() === "kg" ? "kg" : "g";
    const displayAmount = rawAmount === "1/2" || amount === 0.5 ? "1/2" : amount;
    return `${displayAmount} ${unit}`;
  }

  const category = String(product?.category || "").toLowerCase();
  if (category.includes("sweet")) return "1/2 kg";
  if (category.includes("snack")) return "200 g";
  return "1 pack";
}

async function loadProductReviews(productId) {
  try {
    const [reviewsRes, ratingRes] = await Promise.all([
      fetch(`${API_URL}/products/${productId}/reviews`).then(r => r.json().catch(() => [])),
      fetch(`${API_URL}/products/${productId}/rating`).then(r => r.json().catch(() => ({ avgRating: 0, reviewCount: 0 })))
    ]);
    const reviews = Array.isArray(reviewsRes) ? reviewsRes : [];
    const rating = ratingRes?.avgRating || 0;
    const count = ratingRes?.reviewCount || 0;
    renderReviews(reviews, rating, count);
  } catch (error) {
    console.error("Could not load reviews:", error.message);
    renderReviews([], 0, 0);
  }
}

function renderReviews(reviews, avgRating, count) {
  const list = document.querySelector("#reviews-list");
  const averageEl = document.querySelector("#reviews-average");
  if (!list || !averageEl) return;
  averageEl.textContent = avgRating ? `${avgRating.toFixed(1)} ★ (${count})` : "No ratings yet";
  if (!reviews.length) {
    list.innerHTML = '<p class="no-reviews">No reviews yet. Be the first to review!</p>';
    return;
  }
  list.innerHTML = reviews.map((review) => `
    <div class="review-item">
      <div class="review-meta">
        <span class="review-author">${escapeHtml(review.userName || "Customer")}</span>
        <span class="review-date">${new Date(review.createdAt).toLocaleDateString()}</span>
      </div>
      <div class="review-stars">${renderStars(review.rating)}</div>
      <p class="review-comment">${escapeHtml(review.comment || "")}</p>
    </div>
  `).join("");
}

let selectedRating = 0;

async function submitReview(productId) {
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (!user?.id) return showToast("Please sign in to review", false);
  if (!selectedRating) return showToast("Please select a rating", false);
  const comment = document.querySelector("#review-comment")?.value?.trim() || "";
  try {
    const response = await fetch(`${API_URL}/products/${productId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, rating: selectedRating, comment })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not submit review");
    showToast("Review submitted successfully");
    selectedRating = 0;
    if (document.querySelector("#review-comment")) document.querySelector("#review-comment").value = "";
    document.querySelectorAll("#star-rating-input button").forEach((btn, idx) => {
      btn.classList.toggle("is-active", idx < selectedRating);
    });
    await loadProductReviews(productId);
    await loadProducts();
  } catch (error) {
    showToast(error.message, false);
  }
}

async function submitRatingFromOrderDetails(productId, rating, comment) {
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (!user?.id) return showToast("Please sign in to review", false);
  try {
    const response = await fetch(`${API_URL}/products/${productId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, rating, comment })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not submit rating");
    showToast("Rating submitted successfully");
    const ratingForm = document.querySelector(`.order-product-rating[data-product-id="${productId}"] .rating-form`);
    if (ratingForm) {
      ratingForm.innerHTML = '<div class="rating-submitted">Thank you for your rating!</div>';
    }
    await loadProductReviews(productId);
    await loadProducts();
  } catch (error) {
    showToast(error.message, false);
  }
}

function showOrderSuccess({ orderId, items, subtotal, discount, total, delivery, couponCode, emailStatus, emailError, email, canPollEmail }) {
  const modal = document.querySelector("#order-success-modal");
  if (!modal) {
    console.error("Order success modal not found in DOM");
    showToast(`Order ${orderId} placed.`);
    return;
  }
  try {
    const fmt = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
    const setText = (selector, value) => {
      const el = modal.querySelector(selector);
      if (el) el.textContent = value;
    };
    const toggleRow = (selector, show) => {
      const el = modal.querySelector(selector);
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
    updateOrderSuccessEmail(emailStatus, email, emailError);
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    console.log("Order success modal opened");
    if (canPollEmail && emailStatus === "sending" && orderId) {
      startOrderEmailStatusPolling(orderId, email);
    }
  } catch (e) {
    console.error("Error in showOrderSuccess:", e);
    showToast(`Order ${orderId} placed successfully`, true);
  }
}

const ORDER_EMAIL_POLL_INTERVAL_MS = 3000;
// SMTP handshake plus send can legitimately take ~25s, so poll for ~45s.
const ORDER_EMAIL_POLL_MAX_ATTEMPTS = 15;
const orderEmailPollTimers = new Map();

function clearOrderEmailStatusPolling(orderId) {
  const timer = orderEmailPollTimers.get(String(orderId));
  if (timer) {
    clearTimeout(timer);
    orderEmailPollTimers.delete(String(orderId));
  }
}

function startOrderEmailStatusPolling(orderId, fallbackEmail) {
  clearOrderEmailStatusPolling(orderId);
  let attempts = 0;
  const poll = async () => {
    attempts += 1;
    if (!document.querySelector("#order-success-modal")?.classList.contains("open")) {
      clearOrderEmailStatusPolling(orderId);
      return;
    }
    try {
      const response = await fetchWithTimeout(
        `${API_URL}/orders/${encodeURIComponent(orderId)}/email-status`,
        {},
        10000
      );
      if (!response.ok) throw new Error(`status ${response.status}`);
      const data = await response.json().catch(() => ({}));
      const status = data.emailStatus || "unknown";
      updateOrderSuccessEmail(status, data.email || fallbackEmail, data.emailError);
      if (status === "sent" || status === "failed" || status === "unavailable") {
        clearOrderEmailStatusPolling(orderId);
        if (status === "sent") {
          showToast(`Confirmation email sent to ${data.email || fallbackEmail}`);
        }
        return;
      }
    } catch (error) {
      console.warn("Order email status poll failed:", error.message);
    }
    if (attempts >= ORDER_EMAIL_POLL_MAX_ATTEMPTS) {
      clearOrderEmailStatusPolling(orderId);
      return;
    }
    const timer = setTimeout(poll, ORDER_EMAIL_POLL_INTERVAL_MS);
    orderEmailPollTimers.set(String(orderId), timer);
  };
  const timer = setTimeout(poll, ORDER_EMAIL_POLL_INTERVAL_MS);
  orderEmailPollTimers.set(String(orderId), timer);
}

function updateOrderSuccessEmail(emailStatus, email, emailError) {
  const emailText = document.querySelector("#order-success-email-text");
  if (!emailText) return;
  const target = escapeHtml(email || "your address");
  if (emailStatus === "sent") {
    emailText.innerHTML = `A confirmation email has been sent to <strong>${target}</strong>.`;
    return;
  }
  if (emailStatus === "sending") {
    emailText.innerHTML = `Your order is confirmed. Sending the confirmation email to <strong>${target}</strong>&hellip;`;
    return;
  }
  if (emailStatus === "failed") {
    emailText.textContent = "Your order is confirmed, but the confirmation email could not be sent. Your order number is shown above; contact support if you need a copy.";
    return;
  }
  if (emailStatus === "unavailable") {
    emailText.textContent = `Your order is confirmed. Email confirmations are currently unavailable${emailError ? ` (${emailError})` : ""}. Your order number is shown above.`;
    return;
  }
  emailText.textContent = "Your order is confirmed.";
}

function closeOrderSuccess() {
  const modal = document.querySelector("#order-success-modal");
  if (!modal) return;
  for (const orderId of [...orderEmailPollTimers.keys()]) clearOrderEmailStatusPolling(orderId);
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
    startServerNotificationPolling();
    startOrderRefresh();
    loadReferralData();
    return;
  }
  stopServerNotificationPolling();
  stopOrderRefresh();
  localStorage.removeItem(authStorageKey);
  document.body.classList.add("auth-locked");
  authModal.setAttribute("aria-hidden", "false");
  document.querySelector("#account-button").textContent = "Account";
  document.querySelector("#logout-button").hidden = true;
  renderNotifications();
  document.querySelector("#referral-section").hidden = true;
}

function showWelcomeSpinIfNew(user) {
  if (!user?.id) return;
  const flagKey = `sriram-store-welcome-spin-shown-${user.id}`;
  const hasShown = localStorage.getItem(flagKey);
  if (hasShown) return;

  localStorage.setItem(flagKey, "true");

  setTimeout(() => {
    const spinSection = document.querySelector("#spin-win");
    if (spinSection) {
      spinSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const statusEl = document.querySelector("#spin-status");
    if (statusEl) {
      statusEl.textContent = "Welcome! Spin the wheel for your first reward.";
      statusEl.className = "spin-status is-valid";
    }
  }, 500);
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
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  profileError.textContent = "";
  profileModal.setAttribute("aria-hidden", "false");
  profileModal.classList.add("open");
  if (user) {
    document.querySelector("#profile-title").textContent = user.name || "Your profile";
    document.querySelector("#profile-subtitle").textContent = user.email || "Signed in account";
    profileLoginTab.hidden = true;
    profileRegisterTab.hidden = true;
    profileLoginForm.hidden = true;
    profileRegisterForm.hidden = true;
    return;
  }
  profileLoginTab.hidden = false;
  profileRegisterTab.hidden = false;
  profileLoginForm.hidden = false;
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
      closeProfile();
      window.location.href = "admin-login.html";
      return;
    }
    if (endpoint.includes("register")) {
      form.reset();
      setProfileAuthMode("login");
      showToast("Account created. Please sign in.");
    } else {
      setAuthenticated(result.user);
      showWelcomeSpinIfNew(result.user);
      showToast("Welcome back");
      closeProfile();
    }
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
    if (endpoint.includes("register")) {
      form.reset();
      setAuthMode("login");
      showToast("Account created. Please sign in.");
    } else {
      setAuthenticated(result.user);
      showWelcomeSpinIfNew(result.user);
      showToast("Welcome back");
      initReferralIfLoggedIn();
      applyStoredReferralCode();
    }
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
  let visibleProducts = products.filter((product) => {
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
  const deliveryDays = getDeliveryDays(deliveryCheckerState);
  const isNotDeliverable = deliveryCheckerNotDeliverable;
  const isDeliveryChecked = deliveryCheckerPincode && !isNotDeliverable;
  productGrid.innerHTML = visibleProducts.map((product) => {
    const deliveryHtml = isDeliveryChecked ? `<div class="product-delivery available">✅ Delivery available to this pincode</div>` : (deliveryDays ? `<div class="product-delivery">Delivery in ${deliveryDays} day${deliveryDays > 1 ? "s" : ""}</div>` : "");
    const notDeliverableHtml = isNotDeliverable ? `<div class="product-not-deliverable">❌ Not deliverable to your area</div>` : "";
    const shareUrl = `${window.location.origin}${window.location.pathname}?product=${product.id}`;
    return `
    <article class="product-card" data-detail="${product.id}" tabindex="0">
      <div class="product-image"><img src="${imageFor(product)}" alt="Fresh ${product.name}" loading="lazy"></div>
      <h3>${product.name}</h3>
      <div class="product-meta"><span>${product.color || "Fresh produce"}</span><span class="product-price">${formatPrice(finalPrice(product))}${discountFor(product) ? ` <del>${formatPrice(product.price)}</del>` : ""}</span></div>
      <div class="product-stock">${Number(product.stock) > 0 ? `${product.stock} in stock` : "Out of stock"}</div>
      <div class="product-rating">${renderStars(product.rating || 4)} <small>(${product.reviews || 0})</small></div>
      ${deliveryHtml}
      ${notDeliverableHtml}
      <button class="share-button" type="button" data-share-url="${shareUrl}" data-share-title="${product.name}" aria-label="Share ${product.name}">&#128257;</button>
      <button class="wishlist-button ${wishlist.includes(product.id) ? "is-saved" : ""}" type="button" data-wishlist="${product.id}" aria-label="${wishlist.includes(product.id) ? "Remove from" : "Add to"} wishlist">&#9825;</button>
      <div class="add-area" data-product="${product.id}">${renderAddControl(product)}</div>
    </article>`;
  }).join("") || '<p class="no-results">No products found.</p>';
}

function renderCategoryFilter() {
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];
  const buttons = [{ label: "All", value: "" }, ...categories.map((category) => ({ label: category, value: category }))];
  categoryFilter.innerHTML = buttons.map((button) => {
    return `<button class="category-button ${selectedCategory === button.value ? "is-active" : ""}" type="button" data-category="${button.value}">${button.label}</button>`;
  }).join("");
}

async function openDetails(id) {
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
  document.querySelector("#details-unit").textContent = discountFor(product) ? `${discountFor(product)}% off · ${productUnit(product)}` : productUnit(product);
  document.querySelector("#details-quantity").textContent = "1";
  const productId = Number(detailsModal.dataset.productId);
  await loadProductReviews(productId);
  detailsModal.classList.add("open");
  detailsModal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function statusLabel(status) {
  const normalizedStatus = String(status || "placed").toLowerCase();
  const map = { placed: "Order", packed: "Packed", processing: "Processing", shipped: "Shipped", out_for_delivery: "Out for Delivery", delivered: "Delivered", cancelled: "Cancelled", returned: "Returned", "return requested": "Return Requested" };
  return map[normalizedStatus] || "Order";
}

function normalizeOrderStatus(status) {
  return String(status || "placed").trim().toLowerCase();
}

function renderOrderTracking(status) {
  const normalizedStatus = String(status || "placed").toLowerCase();
  const tracking = document.querySelector("#order-tracking");
  if (!tracking) return;
  if (["cancelled", "returned", "return requested"].includes(normalizedStatus)) {
    tracking.innerHTML = `<span class="tracking-terminal is-${normalizedStatus.replace(/\s+/g, "-")}">${statusLabel(normalizedStatus)}</span>`;
    return;
  }
  const steps = [
    { value: "placed", label: "Order" },
    { value: "packed", label: "Packed" },
    { value: "shipped", label: "Shipped" },
    { value: "out_for_delivery", label: "Out for Delivery" },
    { value: "delivered", label: "Delivered" }
  ];
  const currentIndex = Math.max(0, steps.findIndex((step) => step.value === normalizedStatus));
  if (normalizedStatus === "processing") steps[0].label = "Processing";
  tracking.innerHTML = steps.map((step, index) => `
    <span class="tracking-step ${index < currentIndex ? "is-complete" : ""} ${index === currentIndex ? "is-current" : ""}">
      ${step.label}
    </span>
  `).join("");
}

function paintOrders(orders) {
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  ordersList.innerHTML = orders.length ? orders.map((order) => {
    const status = normalizeOrderStatus(order.status);
    const productIds = Array.isArray(order.productIds) ? order.productIds : (order.lineItems || []).map((item) => Number(item.id)).filter(Boolean);
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
          ? `<span class="order-action-note" data-action="delivered">Delivered</span><button class="rate-product" type="button" data-rate-order="${order.id}">Rate Product</button>`
          : "";
    const addressState = (order.address || "").split(",").map((s) => s.trim()).pop() || "";
    const deliveryDays = getEstimatedDeliveryDaysForState(addressState);
    return `<div class="order-row" data-view-order="${order.id}"><div><strong>Order ${order.id}</strong><small>${order.items} item${order.items === 1 ? "" : "s"} · ${order.address} · ${deliveryDays} days</small></div><div class="order-actions"><span class="order-status" data-status="${status}">${statusLabel(status)}</span>${editButton}${returnButton}${cancelButton}${statusAction}</div></div>`;
  }).join("") : '<p class="empty-orders">Your placed orders will appear here.</p>';
}

function getOrderProductIds(order) {
  if (Array.isArray(order?.productIds)) {
    return order.productIds.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  }
  if (typeof order?.productIds === "string") {
    try {
      const ids = JSON.parse(order.productIds);
      if (Array.isArray(ids)) return ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    } catch {
      // Fall back to line items below.
    }
  }
  return Array.isArray(order?.lineItems)
    ? order.lineItems.map((item) => Number(item.id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];
}

async function renderOrders() {
  const localOrders = JSON.parse(localStorage.getItem(ordersStorageKey) || "[]");
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (user?.id) {
    try {
      const response = await fetch(`${API_URL}/orders?userId=${user.id}`);
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
            productIds: serverOrder.productIds?.length ? serverOrder.productIds : (local?.productIds || []),
            orderTotal: serverOrder.totalAmount
          };
        });
        const localOnly = localOrders.filter((o) => !serverOrders.some((s) => s.id === o.id) && !o.userId);
        const all = [...merged, ...localOnly];
        localStorage.setItem(ordersStorageKey, JSON.stringify(all.map((o) => ({ ...o, status: o.status || "placed" }))));
        paintOrders(all);
        refreshOpenOrderDetails(all);
        return;
      }
    } catch (error) {
      console.error("Could not load server orders:", error.message);
    }
  }
  paintOrders(localOrders);
  refreshOpenOrderDetails(localOrders);
}

function refreshOpenOrderDetails(orders) {
  if (!orderDetailsModal.classList.contains("open")) return;
  const order = orders.find((item) => String(item.id) === String(orderDetailsModal.dataset.orderId));
  if (!order) return;
  const status = normalizeOrderStatus(order.status);
  document.querySelector("#order-details-status").textContent = statusLabel(status);
  renderOrderTracking(status);
  if (status === "delivered") {
    const rateActions = document.querySelector("#order-rate-actions");
    const orderProductIds = getOrderProductIds(order);
    const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
    if (rateActions) {
      if (orderProductIds.length) {
        rateActions.innerHTML = orderProductIds.map((productId) => {
          const product = productById(productId);
          const productName = product?.name || "Product";
          return `
            <div class="order-product-rating" data-product-id="${productId}">
              <h4>${escapeHtml(productName)}</h4>
              <div class="rating-form" data-product-id="${productId}">
                <div class="star-rating-input" data-product-id="${productId}">
                  <button type="button" data-rating="1" aria-label="1 star">★</button>
                  <button type="button" data-rating="2" aria-label="2 stars">★</button>
                  <button type="button" data-rating="3" aria-label="3 stars">★</button>
                  <button type="button" data-rating="4" aria-label="4 stars">★</button>
                  <button type="button" data-rating="5" aria-label="5 stars">★</button>
                </div>
                <textarea rows="2" placeholder="Share your experience with this product..." data-review-comment="${productId}"></textarea>
                <button class="primary-button submit-rating" type="button" data-submit-rating="${productId}" ${user?.id ? "" : "disabled"}>Submit Rating</button>
                ${!user?.id ? '<small class="rating-login-hint">Sign in to submit a rating</small>' : ""}
              </div>
            </div>
          `;
        }).join("");
      } else {
        rateActions.innerHTML = '<p class="empty-orders" style="text-align:center;padding:16px;color:#999;">No products to rate in this order.</p>';
      }
    }
  } else {
    const rateActions = document.querySelector("#order-rate-actions");
    if (rateActions) rateActions.innerHTML = "";
  }
}

async function openCheckout() {
  if (!cart.length) return showToast("Add something to your bag first", false);
  closeModal(detailsModal);
  checkoutModal.classList.add("open");
  checkoutModal.setAttribute("aria-hidden", "false");
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  
  // Render address selector
  renderAddressSelector();
  
  // Load saved pincode and user profile IN PARALLEL (don't block modal open)
  const savedPincode = localStorage.getItem("sriram-store-delivery-pincode");
  
  // Fire both requests in parallel
  const pincodePromise = savedPincode ? fetch(`https://api.postalpincode.in/pincode/${savedPincode}`).then(r => r.json().catch(() => ({}))).catch(() => ({})) : Promise.resolve({});
  const profilePromise = user?.id ? fetch(`${API_URL}/auth/me?userId=${user.id}`).then(r => r.json().catch(() => ({}))).catch(() => ({})) : Promise.resolve({});
  
  // Show modal immediately, populate when data arrives
  const [pincodeData, profileData] = await Promise.all([pincodePromise, profilePromise]);
  
  // Populate pincode data
  if (pincodeData && pincodeData[0] && pincodeData[0].Status === "Success" && pincodeData[0].PostOffice && pincodeData[0].PostOffice.length > 0) {
    const office = pincodeData[0].PostOffice[0];
    const city = office.District || "";
    const district = office.District || "";
    const state = office.State || "";
    document.querySelector("#customer-city").value = city;
    document.querySelector("#customer-district").value = district;
    document.querySelector("#customer-state").value = state;
    document.querySelector("#customer-pin").value = savedPincode;
    document.querySelector("#customer-country").value = "India";
  }
  
  // Load default address
  const defaultAddress = getDefaultAddress();
  if (defaultAddress) {
    populateAddressForm(defaultAddress);
    document.querySelector("#address-selector").value = defaultAddress.id;
  } else if (profileData.profile) {
    // Try to load from user profile
    const address = String(profileData.profile.address || "").trim();
    const city = String(profileData.profile.city || "").trim();
    const district = String(profileData.profile.district || "").trim();
    const state = String(profileData.profile.state || "").trim();
    const country = String(profileData.profile.country || "").trim();
    const pin = String(profileData.profile.pin || "").trim();
    const phone = String(profileData.profile.phone || "").trim();
    const nameInput = document.querySelector("#customer-name");
    const phoneInput = document.querySelector("#customer-phone");
    if (address) document.querySelector("#customer-address").value = address;
    if (city && !document.querySelector("#customer-city").value) document.querySelector("#customer-city").value = city;
    if (district && !document.querySelector("#customer-district").value) document.querySelector("#customer-district").value = district;
    if (state && !document.querySelector("#customer-state").value) document.querySelector("#customer-state").value = state;
    if (country && !document.querySelector("#customer-country").value) document.querySelector("#customer-country").value = country;
    if (pin && !document.querySelector("#customer-pin").value) document.querySelector("#customer-pin").value = pin;
    if (phone && !nameInput.value) nameInput.value = String(profileData.user?.name || "").trim();
    if (phone) phoneInput.value = phone;
  }
  
  // Address selector change handler
  const addressSelector = document.querySelector("#address-selector");
  if (addressSelector) {
    addressSelector.onchange = () => {
      const selectedId = addressSelector.value;
      if (selectedId) {
        const addresses = getAddresses();
        const addr = addresses.find(a => a.id === selectedId);
        if (addr) populateAddressForm(addr);
      } else {
        clearAddressForm();
      }
    };
  }
  
  // Add new address button
  const addNewBtn = document.querySelector("#add-new-address-btn");
  if (addNewBtn) {
    addNewBtn.onclick = () => {
      const name = prompt("Enter name for this address:");
      if (!name) return;
      const address = prompt("Enter full address (house, street, area):");
      if (!address) return;
      const city = document.querySelector("#customer-city").value || prompt("City:") || "";
      const district = document.querySelector("#customer-district").value || prompt("District:") || "";
      const state = document.querySelector("#customer-state").value || prompt("State:") || "";
      const pin = document.querySelector("#customer-pin").value || prompt("PIN code:") || "";
      const phone = document.querySelector("#customer-phone").value || prompt("Phone:") || "";
      
      const newAddr = addAddress({
        name,
        address,
        city,
        district,
        state,
        pin,
        phone,
        country: "India"
      });
      
      renderAddressSelector();
      document.querySelector("#address-selector").value = newAddr.id;
      populateAddressForm(newAddr);
      showToast("Address saved!");
    };
  }
  
  syncCouponUI();
  renderCart();
  loadAvailableCoupons();
  
  // Re-initialize pincode autofill for checkout modal
  setTimeout(initPincodeAutofill, 100);
  
  // Apply stored referral code if any
  applyStoredReferralCode();
}

// Referral System
async function loadReferralData() {
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (!user?.id) return;
  try {
    const headers = { "x-user": JSON.stringify(user) };
    const [codeRes, statsRes] = await Promise.all([
      fetch(`${API_URL}/referral/code`, { headers }),
      fetch(`${API_URL}/referral/stats`, { headers })
    ]);
    const codeData = await codeRes.json().catch(() => ({}));
    const statsData = await statsRes.json().catch(() => ({}));
    
    // If API fails, generate local fallback code
    let referralCode = codeData.referralCode;
    if (!referralCode) {
      referralCode = generateLocalReferralCode(user.id);
      document.querySelector("#referral-code").textContent = referralCode;
    } else {
      document.querySelector("#referral-code").textContent = referralCode;
    }
    
    if (statsData.stats) {
      document.querySelector("#stat-total-referrals").textContent = statsData.stats.total_referrals || 0;
      document.querySelector("#stat-successful").textContent = statsData.stats.successful_referrals || 0;
      document.querySelector("#stat-earnings").textContent = `₹${Number(statsData.stats.total_rewards_earned || 0).toLocaleString("en-IN")}`;
    } else {
      // Set default stats if API fails
      document.querySelector("#stat-total-referrals").textContent = 0;
      document.querySelector("#stat-successful").textContent = 0;
      document.querySelector("#stat-earnings").textContent = "₹0";
    }
    if (statsData.referrals) {
      renderReferralHistory(statsData.referrals);
    } else {
      renderReferralHistory([]);
    }
    document.querySelector("#referral-section").hidden = false;
  } catch (error) {
    console.error("Referral data load failed:", error.message);
    // Fallback: generate local code
    const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
    if (user?.id) {
      document.querySelector("#referral-code").textContent = generateLocalReferralCode(user.id);
      document.querySelector("#stat-total-referrals").textContent = 0;
      document.querySelector("#stat-successful").textContent = 0;
      document.querySelector("#stat-earnings").textContent = "₹0";
      renderReferralHistory([]);
      document.querySelector("#referral-section").hidden = false;
    }
  }
}

function generateLocalReferralCode(userId) {
  const prefix = "SRI";
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${userId}${random}`;
}

function renderReferralHistory(referrals) {
  const list = document.querySelector("#referral-list");
  if (!list) return;
  if (!referrals.length) {
    list.innerHTML = '<p class="empty-orders">No referrals yet. Share your code to start earning!</p>';
    return;
  }
  list.innerHTML = referrals.map(r => `
    <div class="referral-item">
      <div class="referral-info">
        <strong>${escapeHtml(r.referee_name || "Friend")}</strong>
        <small>${new Date(r.created_at).toLocaleDateString()}</small>
      </div>
      <span class="referral-status ${r.status}">${r.status === "completed" ? "✅ Completed" : r.status === "pending" ? "⏳ Pending" : "❌ Expired"}</span>
    </div>
  `).join("");
}

function initReferralButtons() {
  if (window.__referralButtonsInited) return;
  window.__referralButtonsInited = true;
  const copyBtn = document.querySelector("#copy-referral-btn");
  if (copyBtn) {
    copyBtn.onclick = () => {
      const code = document.querySelector("#referral-code").textContent;
      navigator.clipboard.writeText(code).then(() => showToast("Referral code copied!"));
    };
  }
  const shareBtn = document.querySelector("#share-referral-btn");
  if (shareBtn) {
    shareBtn.onclick = () => {
      const code = document.querySelector("#referral-code").textContent;
      const baseUrl = window.location.origin + window.location.pathname.split("/").slice(0, -1).join("/") + "/";
      const url = baseUrl + "?ref=" + code;
      if (navigator.share) {
        navigator.share({ title: "Sriram Store Referral", text: "Join Sriram Store and get ₹50 off your first order!", url }).catch(() => {});
      } else {
        navigator.clipboard.writeText(url).then(() => showToast("Referral link copied!"));
      }
    };
  }
  const linkBtn = document.querySelector("#share-referral-link-btn");
  if (linkBtn) {
    linkBtn.onclick = () => {
      const code = document.querySelector("#referral-code").textContent;
      const baseUrl = window.location.origin + window.location.pathname.split("/").slice(0, -1).join("/") + "/";
      const url = baseUrl + "?ref=" + code;
      navigator.clipboard.writeText(url).then(() => showToast("Referral link copied!"));
    };
  }
}

// Call referral init when user logs in
function initReferralIfLoggedIn() {
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (user?.id) {
    loadReferralData();
    initReferralButtons();
  }
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
  const countEl = document.querySelector("#wishlist-count");
  const badgeEl = document.querySelector("#wishlist-badge");
  const listEl = document.querySelector("#wishlist-list");
  if (countEl) countEl.textContent = saved.length;
  if (badgeEl) badgeEl.textContent = saved.length;
  if (listEl) {
    listEl.innerHTML = saved.length ? saved.map((product) => `<div class="wishlist-item"><strong>${product.name}</strong><span>${formatPrice(finalPrice(product))}</span><button class="add-button" type="button" data-wishlist-add="${product.id}">Add to bag</button><button class="remove-wishlist" type="button" data-wishlist-remove="${product.id}">Remove</button></div>`).join("") : '<p class="empty-orders">Save products here for your next order.</p>';
  }
}

async function loadProducts() {
  try {
    console.log("Loading products from:", `${API_URL}/products`);
    const response = await fetch(`${API_URL}/products`);
    console.log("Response status:", response.status);
    if (!response.ok) throw new Error(`Products request failed: ${response.status}`);
    products = await response.json();
    console.log("Loaded products:", products);
    console.log("Products count:", products.length);
    
    selectedCategory = "";
    renderCategoryFilter();
    renderProducts();
    updateExpiryTags();
    refreshAddButtons();
    await loadOffers();
  } catch (error) {
    console.error("loadProducts error:", error);
    productGrid.innerHTML = '<p class="no-results">Products are temporarily unavailable.</p>';
    showToast("Could not connect to the ecommerce database", false);
  }
}

let festivalOffers = [];
let activeOffer = null;
let couponRefreshTimer = null;

function startCouponRefresh() {
  if (couponRefreshTimer) clearInterval(couponRefreshTimer);
  couponRefreshTimer = setInterval(() => {
    loadAvailableCoupons();
  }, 15000);
}

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
  startCouponRefresh();
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
  const isLink = button.tagName === "A";
  selectedCategory = button.dataset.category || "";
  renderCategoryFilter();
  renderProducts();
  if (isLink) return;
});
const wishlistList = document.querySelector("#wishlist-list");
if (wishlistList) {
  wishlistList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-wishlist-add]");
    if (button) addToCart(Number(button.dataset.wishlistAdd));
    const removeButton = event.target.closest("[data-wishlist-remove]");
    if (removeButton) toggleWishlist(Number(removeButton.dataset.wishlistRemove));
  });
}
async function openOrderDetails(orderId) {
  const localOrders = JSON.parse(localStorage.getItem(ordersStorageKey) || "[]");
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  let order = localOrders.find((o) => o.id === orderId);
  if (user?.id) {
    try {
      const response = await fetch(`${API_URL}/orders?userId=${user.id}`);
      const serverOrders = await response.json().catch(() => []);
      if (response.ok && Array.isArray(serverOrders)) {
        const serverOrder = serverOrders.find((o) => o.id === orderId);
        if (serverOrder) order = { ...order, ...serverOrder, productIds: serverOrder.productIds?.length ? serverOrder.productIds : (order?.productIds || []), orderTotal: serverOrder.totalAmount };
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
  const orderStatus = normalizeOrderStatus(order.status);
  document.querySelector("#order-details-status").textContent = statusLabel(orderStatus);
  renderOrderTracking(orderStatus);
  const rateActions = document.querySelector("#order-rate-actions");
    const orderProductIds = getOrderProductIds(order);
  if (rateActions) {
    if (orderStatus === "delivered") {
      const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
      rateActions.innerHTML = orderProductIds.map((productId) => {
        const product = productById(productId);
        const productName = product?.name || "Product";
        return `
          <div class="order-product-rating" data-product-id="${productId}">
            <h4>${escapeHtml(productName)}</h4>
            <div class="rating-form" data-product-id="${productId}">
              <div class="star-rating-input" data-product-id="${productId}">
                <button type="button" data-rating="1" aria-label="1 star">★</button>
                <button type="button" data-rating="2" aria-label="2 stars">★</button>
                <button type="button" data-rating="3" aria-label="3 stars">★</button>
                <button type="button" data-rating="4" aria-label="4 stars">★</button>
                <button type="button" data-rating="5" aria-label="5 stars">★</button>
              </div>
              <textarea rows="2" placeholder="Share your experience with this product..." data-review-comment="${productId}"></textarea>
              <button class="primary-button submit-rating" type="button" data-submit-rating="${productId}" ${user?.id ? "" : "disabled"}>Submit Rating</button>
              ${!user?.id ? '<small class="rating-login-hint">Sign in to submit a rating</small>' : ""}
            </div>
          </div>
        `;
      }).join("");
    } else {
      rateActions.innerHTML = "";
    }
  }
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
        const response = await fetch(`${API_URL}/orders/${encodeURIComponent(orderId)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id }),
        });
        if (response.ok) await loadServerNotifications();
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
  const rateOrder = event.target.closest("[data-rate-order]");
  if (rateOrder) {
    openOrderDetails(rateOrder.dataset.rateOrder);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const rateActions = document.querySelector("#order-rate-actions");
        if (rateActions) {
          rateActions.scrollIntoView({ behavior: "smooth", block: "start" });
          const card = document.querySelector(".checkout-modal.open .checkout-card");
          if (card) card.scrollTop = rateActions.offsetTop - 20;
        }
      }, 100);
    });
    return;
  }
  const viewOrder = event.target.closest("[data-view-order]");
  if (viewOrder) openOrderDetails(viewOrder.dataset.viewOrder);
});
orderDetailsModal.addEventListener("click", (event) => {
    const starButton = event.target.closest(".star-rating-input button[data-rating]");
    if (starButton) {
      const productId = Number(starButton.closest(".star-rating-input").dataset.productId);
      const rating = Number(starButton.dataset.rating);
      document.querySelectorAll(`.star-rating-input[data-product-id="${productId}"] button`).forEach((btn, idx) => {
        btn.classList.toggle("is-active", idx < rating);
      });
      return;
    }
    const submitButton = event.target.closest(".submit-rating");
    if (submitButton) {
      const productId = Number(submitButton.dataset.submitRating);
      const rating = document.querySelector(`.star-rating-input[data-product-id="${productId}"] button.is-active`);
      const ratingValue = rating ? Number(rating.dataset.rating) : 0;
      const comment = document.querySelector(`textarea[data-review-comment="${productId}"]`)?.value?.trim() || "";
      if (!ratingValue) return showToast("Please select a rating", false);
      submitRatingFromOrderDetails(productId, ratingValue, comment);
      return;
    }
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
  document.querySelector("#order-details-status").textContent = statusLabel("return requested");
  renderOrderTracking("return requested");
  renderOrders();
  closeModal(orderDetailsModal);
  showToast("Return request submitted");
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (user?.id) {
    try {
      const response = await fetch(`${API_URL}/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, address: order?.address || "", returnRequested: true }),
      });
if (response.ok) await loadServerNotifications();
    } catch (error) {
      console.error("Return request failed:", error.message);
    }
  }
});

document.querySelector("#download-invoice").addEventListener("click", async () => {
  const orderId = orderDetailsModal.dataset.orderId;
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (!orderId || !user?.id) return showToast("Please log in to download invoice", false);
  try {
    const response = await fetch(`${API_URL}/orders/${encodeURIComponent(orderId)}/invoice?userId=${user.id}`);
    const invoice = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(invoice.error || "Failed to fetch invoice");
    generateInvoicePdf(invoice, "download");
  } catch (error) {
    console.error("Download invoice failed:", error);
    showToast("Could not download invoice", false);
  }
});

document.querySelector("#print-invoice").addEventListener("click", async () => {
  const orderId = orderDetailsModal.dataset.orderId;
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (!orderId || !user?.id) return showToast("Please log in to print invoice", false);
  try {
    const response = await fetch(`${API_URL}/orders/${encodeURIComponent(orderId)}/invoice?userId=${user.id}`);
    const invoice = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(invoice.error || "Failed to fetch invoice");
    generateInvoicePdf(invoice, "print");
  } catch (error) {
    console.error("Print invoice failed:", error);
    showToast("Could not print invoice", false);
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
    if (notificationDropdown.classList.contains("open")) {
      markAllNotificationsRead();
    }
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
    const response = await fetch(`${API_URL}/coupons/${encodeURIComponent(code)}`);
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
      fetch(`${API_URL}/coupons`).then((r) => r.json().catch(() => [])).catch(() => []),
      Promise.resolve(festivalOffers)
    ]);
    const coupons = Array.isArray(couponsRes) ? couponsRes : [];
    const offerCodes = (Array.isArray(offersRes) ? offersRes : [])
      .filter((o) => o.coupon_code)
      .map((o) => ({ code: o.coupon_code, discount_percent: Number(o.discount_percent), min_order_amount: Number(o.min_order_amount || 0), fromOffer: true }));
    const subtotal = cart.reduce((sum, item) => sum + finalPrice(productById(item.id)) * item.quantity, 0);
    const availableCoupons = [...coupons, ...offerCodes];
    const html = availableCoupons.length
      ? availableCoupons.map((c) => {
          const minimum = Number(c.min_order_amount || 0);
          const eligible = subtotal >= minimum;
          const minimumLabel = minimum > 0 ? ` · Min order ${formatPrice(minimum)}` : "";
          return `<button class="coupon-chip${eligible ? "" : " is-ineligible"}" type="button" data-coupon-chip="${escapeHtml(c.code)}" ${eligible ? "" : `title="Add ${formatPrice(minimum - subtotal)} more to use this coupon"`}>${escapeHtml(c.code)} · ${Number(c.discount_percent)}% off${minimumLabel}</button>`;
        }).join("")
      : '<span class="no-coupons">No active coupons available</span>';
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
  const isCheckoutCoupon = Boolean(chip.closest("#available-coupons"));
  const input = document.querySelector(isCheckoutCoupon ? "#coupon-code" : "#bag-coupon-code");
  const status = document.querySelector(isCheckoutCoupon ? "#coupon-status" : "#bag-coupon-status");
  const otherInput = document.querySelector(isCheckoutCoupon ? "#bag-coupon-code" : "#coupon-code");
  if (input) input.value = code;
  if (otherInput) otherInput.value = code;
  if (input && status) applyCoupon(input, status);
});
detailsModal.querySelectorAll("[data-close-details]").forEach((element) => element.addEventListener("click", () => closeModal(detailsModal)));
document.querySelector("#star-rating-input")?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-rating]");
  if (!button) return;
  selectedRating = Number(button.dataset.rating);
  document.querySelectorAll("#star-rating-input button").forEach((btn, idx) => {
    btn.classList.toggle("is-active", idx < selectedRating);
  });
});
document.querySelector("#submit-review")?.addEventListener("click", async () => {
  const productId = Number(detailsModal.dataset.productId);
  if (!productId) return;
  await submitReview(productId);
});
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
  openCheckout();
});
document.querySelector("#details-buy").addEventListener("click", () => {
  const id = Number(detailsModal.dataset.productId);
  const quantity = Number(document.querySelector("#details-quantity").textContent);
  for (let count = 0; count < quantity; count += 1) addToCart(id);
  closeModal(detailsModal);
  openCheckout();
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
          const chargeResponse = await fetch(`${API_URL}/delivery-charge/${encodeURIComponent(state)}`);
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

function initPincodeAutofill() {
  const pinInput = document.querySelector("#customer-pin");
  if (!pinInput) return;

  pinInput.addEventListener("input", (event) => {
    const pincode = event.target.value.trim();
    if (/^\d{6}$/.test(pincode)) {
      lookupPincode(pincode);
    } else {
      const statusEl = document.querySelector("#pincode-status");
      if (statusEl) {
        statusEl.textContent = "";
        statusEl.className = "pincode-status";
      }
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

  pinInput.addEventListener("focus", () => {
    const popup = document.querySelector("#pincode-popup");
    const pincode = pinInput.value.trim();
    if (/^\d{6}$/.test(pincode) && popup?.querySelector("#pincode-area")?.textContent) {
      popup.classList.add("show");
      popup.setAttribute("aria-hidden", "false");
    }
  });

  pinInput.addEventListener("blur", () => {
    setTimeout(() => {
      const popup = document.querySelector("#pincode-popup");
      if (popup && document.activeElement?.id !== "customer-pin") {
        popup.classList.remove("show");
        popup.setAttribute("aria-hidden", "true");
      }
    }, 200);
  });

  // Click on pincode popup to fill details
  const popup = document.querySelector("#pincode-popup");
  if (popup) {
    popup.addEventListener("click", () => {
      const areaEl = document.querySelector("#pincode-area");
      const districtEl2 = document.querySelector("#pincode-district");
      if (areaEl && districtEl2) {
        const areaText = areaEl.textContent || "";
        const districtText = districtEl2.textContent || "";
        // Parse area and district from popup
        const parts = districtText.split(", ");
        const district = parts[0] || "";
        const state = parts[1] || "";
        const city = areaText.split(",")[0] || "";
        
        document.querySelector("#customer-city").value = city;
        document.querySelector("#customer-district").value = district;
        document.querySelector("#customer-state").value = state;
        document.querySelector("#customer-country").value = "India";
        
        popup.classList.remove("show");
        popup.setAttribute("aria-hidden", "true");
        showToast("Address filled from pincode");
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPincodeAutofill);
} else {
  initPincodeAutofill();
}
loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!loginForm.checkValidity()) return loginForm.reportValidity();
  submitAuth(loginForm, "/auth/login", {
    email: document.querySelector("#login-email").value,
    password: document.querySelector("#login-password").value,
  });
});
function showForgotPasswordFlow() {
  const email = prompt("Enter your email to reset your password:");
  if (!email || !email.includes("@")) {
    if (email) alert("Please enter a valid email address");
    return;
  }
  fetch(`${API_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })
    .then((r) => r.json().catch(() => ({})))
    .then((data) => {
      if (data.error) {
        alert(data.error);
        return;
      }
      alert(data.message || "OTP sent to your email");
      const otp = prompt("Enter the 6-digit OTP sent to your email:");
      if (!otp || otp.length !== 6) {
        if (otp) alert("Please enter a valid 6-digit OTP");
        return;
      }
      fetch(`${API_URL}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      })
        .then((r) => r.json().catch(() => ({})))
        .then((data) => {
          if (data.error) {
            alert(data.error);
            return;
          }
          alert(data.message || "OTP verified successfully");
          const newPassword = prompt("Enter your new password (min 6 characters):");
          if (!newPassword || newPassword.length < 6) {
            if (newPassword) alert("Password must be at least 6 characters");
            return;
          }
fetch(`${API_URL}/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, otp, password: newPassword }),
          })
            .then((r) => r.json().catch(() => ({})))
            .then((data) => {
              if (data.error) {
                alert(data.error);
} else {
                alert(data.message || "Password reset successfully");
              }
            })
            .catch(() => alert("Could not connect. Please try again."));
        })
        .catch(() => alert("Could not connect. Please try again."));
    })
    .catch(() => alert("Could not connect. Please try again."));
}

document.querySelector("#forgot-password-link")?.addEventListener("click", showForgotPasswordFlow);
document.querySelector("#profile-forgot-password-link")?.addEventListener("click", showForgotPasswordFlow);
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

  const urlParams = new URLSearchParams(window.location.search);
  const urlCategory = urlParams.get("category");
  if (urlCategory) {
    selectedCategory = urlCategory;
  }

  renderCart();
  renderWishlist();
  setAuthenticated(JSON.parse(localStorage.getItem(authStorageKey) || "null"));

  initDeliveryChecker();

  const viewToggle = document.querySelector("#view-toggle");
  if (viewToggle) {
    const savedView = localStorage.getItem("product-view") || "grid";
    if (savedView === "list") {
      productGrid.classList.add("is-list");
      viewToggle.textContent = "☰";
    }
    viewToggle.addEventListener("click", () => {
      const isList = productGrid.classList.toggle("is-list");
      viewToggle.textContent = isList ? "☰" : "⊞";
      localStorage.setItem("product-view", isList ? "list" : "grid");
    });
  }

setInterval(cycleRotatingLabel,   1 * 60 * 1000);
scheduleMidnightUpdate();

function initShareButtons() {
  document.addEventListener("click", (event) => {
    const shareBtn = event.target.closest(".share-button");
    if (!shareBtn) return;
    const url = shareBtn.dataset.shareUrl;
    const title = shareBtn.dataset.shareTitle;
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        showToast(`Copied link for ${title}`);
      }).catch(() => {
        showToast("Failed to copy link", false);
      });
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initShareButtons);
} else {
  initShareButtons();
}

function initDeliveryChecker() {
  const pincodeInput = document.querySelector("#home-pincode");
  const editBtn = document.querySelector("#edit-delivery-pincode");

  const savedPincode = localStorage.getItem("sriram-store-delivery-pincode");
  if (savedPincode) {
    deliveryCheckerPincode = savedPincode;
    pincodeInput.value = savedPincode;
    pincodeInput.disabled = true;
    editBtn.hidden = false;
    checkDelivery(savedPincode, false);
  }

  // Auto-check delivery when 6 digits entered
  if (pincodeInput) {
    pincodeInput.addEventListener("input", (event) => {
      const pincode = event.target.value.trim();
      if (/^\d{6}$/.test(pincode)) {
        checkDelivery(pincode, true);
      }
    });
  }

  // Edit button to change pincode
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      localStorage.removeItem("sriram-store-delivery-pincode");
      deliveryCheckerPincode = "";
      deliveryCheckerState = "";
      deliveryCheckerNotDeliverable = false;
      pincodeInput.value = "";
      pincodeInput.disabled = false;
      editBtn.hidden = true;
      pincodeInput.focus();
      renderProducts();
    });
  }

  // Handle referral code from URL
  handleReferralFromURL();
  
  // Initialize referral if user logged in
  initReferralIfLoggedIn();
}

// Handle referral code from URL (e.g., ?ref=SRI123ABC)
function handleReferralFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get("ref");
  const isLoginRedirect = urlParams.get("login") === "true";
  
  if (refCode && !isLoginRedirect) {
    localStorage.setItem("sriram-store-referral-code", refCode.toUpperCase());
    const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
    if (!user?.id) {
      // Redirect to login page with referral code
      window.location.href = "index.html?login=true&ref=" + encodeURIComponent(refCode.toUpperCase());
      return;
    }
    showToast("Referral code " + refCode + " applied! You'll get ₹50 off your first order.");
    // Clean URL
    const newUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, newUrl);
  }
}

// Apply referral code on checkout if stored
function applyStoredReferralCode() {
  const storedCode = localStorage.getItem("sriram-store-referral-code");
  if (storedCode) {
    const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
    if (user?.id) {
      fetch(`${API_URL}/referral/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user": JSON.stringify(user) },
        body: JSON.stringify({ referralCode: storedCode })
      }).then(r => r.json()).then(data => {
        if (data.success) {
          localStorage.removeItem("sriram-store-referral-code");
          showToast("Referral applied! You get ₹50 off.");
        }
      }).catch(() => {});
    }
  }
}

async function checkDelivery(pincode, save) {
  const pincodeInput = document.querySelector("#home-pincode");

  if (!/^\d{6}$/.test(pincode)) {
    showToast("Please enter a valid 6-digit pincode", false);
    return;
  }

  pincodeInput.disabled = true;

  try {
    let data;
    let useBackend = true;
    
    try {
      const response = await fetch(`${API_URL}/delivery-check/${pincode}`);
      if (response.ok) {
        data = await response.json();
      } else {
        throw new Error(`Backend returned ${response.status}`);
      }
    } catch (backendError) {
      console.warn("Backend delivery check failed, falling back to postal API:", backendError.message);
      useBackend = false;
      
      // Fallback: direct postal API call
      const postalResponse = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
      const postalData = await postalResponse.json().catch(() => ({}));
      
      if (postalData && postalData[0] && postalData[0].Status === "Success" && postalData[0].PostOffice && postalData[0].PostOffice.length > 0) {
        const postOffice = postalData[0].PostOffice[0];
        const state = postOffice.State || "";
        const district = postOffice.District || "";
        const area = postOffice.Name || district;
        const latitude = Number(postOffice.Latitude);
        const longitude = Number(postOffice.Longitude);
        
        if (!isNaN(latitude) && !isNaN(longitude)) {
          // Simple distance check (approximate - 30km radius from Chennai)
          const storeLat = 13.0827;
          const storeLon = 80.2707;
          const R = 6371;
          const dLat = (latitude - storeLat) * Math.PI / 180;
          const dLon = (longitude - storeLon) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(storeLat * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
          const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          
          data = {
            deliverable: distanceKm <= 30,
            distanceKm: Math.round(distanceKm * 100) / 100,
            area, district, state,
            reason: distanceKm <= 30 ? "Within delivery radius" : `Outside delivery radius (${Math.round(distanceKm)} km away)`
          };
        } else {
          // No coordinates, assume deliverable if valid pincode
          data = { deliverable: true, distanceKm: 0, area, district, state, reason: "Delivery available" };
        }
      } else {
        data = { deliverable: false, reason: "Invalid pincode or pincode not found" };
      }
    }

    if (data.deliverable) {
      const { area, district, state, distanceKm } = data;

      deliveryCheckerPincode = pincode;
      deliveryCheckerState = state;
      deliveryCheckerNotDeliverable = false;

      let charge = 40;
      let days = 3;
      let chargeDesc = "";

      try {
        const chargeResponse = await fetch(`${API_URL}/delivery-charge/${encodeURIComponent(state)}`);
        const chargeData = await chargeResponse.json().catch(() => ({}));
        if (chargeResponse.ok && typeof chargeData.delivery_charge === "number") {
          charge = Number(chargeData.delivery_charge);
          chargeDesc = chargeData.description ? ` (${chargeData.description})` : "";
        }
      } catch (e) {
        charge = 40;
      }

      if (["tamil nadu", "karnataka", "kerala", "andhra pradesh", "telangana", "puducherry"].includes(state.toLowerCase())) {
        days = 2;
      } else if (["maharashtra", "gujarat", "goa", "delhi", "haryana", "punjab", "rajasthan"].includes(state.toLowerCase())) {
        days = 3;
      } else {
        days = 4;
      }

      if (save) {
        localStorage.setItem("sriram-store-delivery-pincode", pincode);
        showToast(`Delivery available to ${area}, ${district}, ${state}`);
        const editBtn = document.querySelector("#edit-delivery-pincode");
        if (editBtn) editBtn.hidden = false;
      } else {
        showToast(`Delivery available to ${area}, ${district}, ${state}`);
      }
      renderProducts();
    } else {
      deliveryCheckerNotDeliverable = true;
      deliveryCheckerState = "";
      pincodeInput.disabled = false;
      showToast(data.reason || "We don't deliver to this pincode yet", false);
      renderProducts();
    }
  } catch (error) {
    pincodeInput.disabled = false;
    showToast("Could not verify pincode. Please try again.", false);
  }
}

const SPIN_SEGMENTS = [
  { name: "5 Points", type: "points", value: "5", color: "#8bc34a" },
  { name: "10 Points", type: "points", value: "10", color: "#2c5f2d" },
  { name: "25 Points", type: "points", value: "25", color: "#4caf50" },
  { name: "50 Points", type: "points", value: "50", color: "#3a7d44" },
  { name: "₹20 Coupon", type: "coupon", value: "SPIN20", color: "#ff9800" },
  { name: "₹50 Coupon", type: "coupon", value: "SPIN50", color: "#f57c00" },
  { name: "₹100 Coupon", type: "coupon", value: "SPIN100", color: "#e65100" },
  { name: "Better Luck Next Time", type: "none", value: "none", color: "#9e9e9e" }
];
let wheelRotation = 0;
let isSpinning = false;
let lastSpinDate = "";

function drawSpinWheel() {
  const canvas = document.querySelector("#spin-wheel");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) - 8;
  const segmentAngle = (2 * Math.PI) / SPIN_SEGMENTS.length;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  SPIN_SEGMENTS.forEach((segment, i) => {
    const startAngle = i * segmentAngle - Math.PI / 2 + wheelRotation;
    const endAngle = startAngle + segmentAngle;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.fillStyle = segment.color;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(startAngle + segmentAngle / 2);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    
    // Calculate font size based on text length
    const text = segment.name;
    const maxWidth = radius * 0.8;
    let fontSize = 11;
    ctx.font = `bold ${fontSize}px 'DM Sans', sans-serif`;
    let textWidth = ctx.measureText(text).width;
    
    // Reduce font size if text is too wide
    while (textWidth > maxWidth && fontSize > 8) {
      fontSize--;
      ctx.font = `bold ${fontSize}px 'DM Sans', sans-serif`;
      textWidth = ctx.measureText(text).width;
    }
    
    // If still too wide, wrap text
    if (textWidth > maxWidth) {
      const words = text.split(' ');
      const lines = [];
      let currentLine = words[0];
      
      for (let j = 1; j < words.length; j++) {
        const testLine = currentLine + ' ' + words[j];
        const testWidth = ctx.measureText(testLine).width;
        if (testWidth > maxWidth) {
          lines.push(currentLine);
          currentLine = words[j];
        } else {
          currentLine = testLine;
        }
      }
      lines.push(currentLine);
      
      const lineHeight = fontSize * 1.2;
      const startY = -((lines.length - 1) * lineHeight) / 2;
      
      lines.forEach((line, lineIndex) => {
        ctx.fillText(line, radius * 0.65, startY + lineIndex * lineHeight + 4);
      });
    } else {
      ctx.fillText(text, radius * 0.65, 4);
    }
    ctx.restore();
  });
  ctx.beginPath();
  ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "#2c5f2d";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = "16px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("▶", centerX, centerY);
}

function spinWheelToPrize(prize) {
  if (isSpinning) return;
  isSpinning = true;
  const spinButton = document.querySelector("#spin-button");
  const statusEl = document.querySelector("#spin-status");
  if (spinButton) { spinButton.disabled = true; spinButton.innerHTML = "<span>Spinning...</span>"; }
  if (statusEl) { statusEl.textContent = "Spinning..."; statusEl.className = "spin-status"; }
  const segmentAngle = (2 * Math.PI) / SPIN_SEGMENTS.length;
  const targetIndex = SPIN_SEGMENTS.findIndex(s => s.value === prize.value && s.type === prize.type);
  const extraSpins = Math.PI * 2 * (5 + Math.random() * 3);
  let targetAngle;
  if (targetIndex >= 0) {
    const centerOfSegment = targetIndex * segmentAngle + segmentAngle / 2;
    targetAngle = -centerOfSegment + extraSpins;
  } else {
    targetAngle = extraSpins + Math.random() * Math.PI * 2;
  }
  const duration = 4000;
  const startTime = Date.now();
  const startRotation = wheelRotation;
  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    wheelRotation = startRotation + targetAngle * easeOut;
    drawSpinWheel();
    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      isSpinning = false;
      if (spinButton) { spinButton.disabled = false; spinButton.innerHTML = "<span>&#127922;</span> Spin the Wheel"; }
      showSpinResult(prize);
      if (statusEl) { statusEl.textContent = `You won: ${prize.name}!`; statusEl.className = "spin-status is-valid"; }
    }
  }
  requestAnimationFrame(animate);
}

async function checkSpinStatus() {
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  const spinButton = document.querySelector("#spin-button");
  const statusEl = document.querySelector("#spin-status");
  const spinsCountEl = document.querySelector("#spins-count");
  if (!user?.id || !spinButton) return;
  try {
    const response = await fetch(`${API_URL}/api/spin/attempts?userId=${user.id}`);
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      const total = data.total || 0;
      if (spinsCountEl) spinsCountEl.textContent = `Spins: ${data.daily?.available || 0} daily + ${data.purchase?.available || 0} earned = ${total} total`;
      if (total <= 0) {
        spinButton.disabled = true;
        spinButton.innerHTML = "<span>🔒</span> No Spins Available";
        if (statusEl) { statusEl.textContent = "Daily spin resets at midnight. Purchase ₹500+ for more spins!"; statusEl.className = "spin-status"; }
      } else {
        resetSpinButton();
      }
    } else {
      resetSpinButton();
    }
  } catch (error) {
    console.error("Spin status check failed:", error);
    resetSpinButton();
  }
}

async function submitSpin() {
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (!user?.id) {
    showToast("Please sign in to spin", false);
    return;
  }
  if (isSpinning) return;
  try {
    const response = await fetch(`${API_URL}/api/spin/wheel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.error && data.error.includes("No spins available")) {
        showToast("No spins available. Daily spin resets at midnight!", false);
        checkSpinStatus();
        return;
      }
      showToast(data.error || "Spin failed", false);
      return;
    }
    spinWheelToPrize(data.prize);
    // Update spins count after successful spin
    const spinsCountEl = document.querySelector("#spins-count");
    if (spinsCountEl && data.remaining) {
      spinsCountEl.textContent = `Spins: ${data.remaining.daily} daily + ${data.remaining.purchase} earned = ${data.remaining.total} total`;
    }
  } catch (error) {
    showToast("Could not connect to server", false);
  }
}

function showSpinResult(prize) {
  const modal = document.querySelector("#spin-modal");
  const iconEl = document.querySelector("#spin-result-icon");
  const titleEl = document.querySelector("#spin-result-title");
  const prizeEl = document.querySelector("#spin-result-prize");
  const messageEl = document.querySelector("#spin-result-message");
  const applyBtn = document.querySelector("#spin-apply-btn");
  if (iconEl) iconEl.textContent = prize.type === "coupon" ? "🎫" : (prize.type === "points" ? "⚡" : "🍀");
  if (titleEl) titleEl.textContent = prize.type === "none" ? "Better Luck Next Time!" : "You Won!";
  if (prizeEl) prizeEl.textContent = prize.name || `${prize.value} ${prize.type}`;
  if (messageEl) {
    if (prize.type === "coupon") {
      messageEl.textContent = `Coupon code ${prize.value} has been added to your account. Apply it at checkout!`;
    } else if (prize.type === "points") {
      messageEl.textContent = `${prize.value} points have been added to your account.`;
    } else {
      messageEl.textContent = "Don't worry, you can earn more spins with your next purchase!";
    }
  }
  if (applyBtn) {
    applyBtn.style.display = prize.type === "coupon" ? "inline-flex" : "none";
    applyBtn.onclick = async () => {
      if (prize.type === "coupon") {
        try {
          const couponRes = await fetch(`${API_URL}/coupons/${encodeURIComponent(prize.value)}`);
          if (couponRes.ok) {
            const couponData = await couponRes.json();
            appliedCoupon = couponData;
            couponApplied = true;
            showToast(`Coupon ${prize.value} applied!`);
            syncCouponUI();
            renderCart();
            const bagInput = document.querySelector("#bag-coupon-code");
            if (bagInput) bagInput.value = prize.value;
          } else {
            showToast(`Coupon ${prize.value} added. Apply it at checkout.`, true);
          }
        } catch (e) {
          showToast(`Coupon ${prize.value} added. Apply it at checkout.`, true);
        }
      } else {
        showToast(`${prize.value} points earned!`, true);
      }
      closeSpinModal();
    };
  }
  if (modal) { modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); }
}

function closeSpinModal() {
  const modal = document.querySelector("#spin-modal");
  if (modal) { modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); }
}

function openSpinWheelModal() {
  const modal = document.querySelector("#spin-wheel-modal");
  if (modal) { modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); drawSpinWheel(); checkSpinStatus(); }
}

function resetSpinButton() {
  const spinButton = document.querySelector("#spin-button");
  const statusEl = document.querySelector("#spin-status");
  const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  if (!user?.id || !spinButton) return;
  if (statusEl) { statusEl.textContent = "Spin to win rewards!"; statusEl.className = "spin-status is-valid"; }
  spinButton.disabled = false;
  spinButton.innerHTML = "<span>&#127922;</span> Spin the Wheel";
}

function closeSpinWheelModal() {
  const modal = document.querySelector("#spin-wheel-modal");
  if (modal) { modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); }
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-spin]")) closeSpinModal();
  if (event.target.closest("[data-close-spin-wheel]")) closeSpinWheelModal();
  if (event.target.closest("#spin-fab")) openSpinWheelModal();
  if (event.target.closest("#spin-button")) submitSpin();
});

// Initialize DOM elements
function initDOMElements() {
  productGrid = document.querySelector("#product-grid");
  categoryFilter = document.querySelector("#category-filter");
  searchInput = document.querySelector("#search-input");
  cartItems = document.querySelector("#cart-items");
  authModal = document.querySelector("#auth-modal");
  profileModal = document.querySelector("#profile-modal");
  detailsModal = document.querySelector("#details-modal");
  checkoutModal = document.querySelector("#checkout-modal");
  orderEditModal = document.querySelector("#order-edit-modal");
  orderDetailsModal = document.querySelector("#order-details-modal");
  ordersList = document.querySelector("#orders-list");
  loginForm = document.querySelector("#login-form");
  registerForm = document.querySelector("#register-form");
  profileLoginForm = document.querySelector("#profile-login-form");
  profileRegisterForm = document.querySelector("#profile-register-form");
  profileLoginTab = document.querySelector("#profile-login-tab");
  profileRegisterTab = document.querySelector("#profile-register-tab");
  authError = document.querySelector("#auth-error");
  profileError = document.querySelector("#profile-error");
}

// Initialize products on page load
function initApp() {
  initDOMElements();
  
  // Check for login parameter (from referral link)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("login") === "true") {
    openProfile();
    // Clean URL
    const newUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, newUrl);
  }
  
  // Check for product parameter to open product details
  const productId = urlParams.get("product");
  if (productId) {
    const id = Number(productId);
    if (Number.isInteger(id) && id > 0) {
      // Wait for products to load then open
      const checkProducts = setInterval(() => {
        if (products.length > 0) {
          clearInterval(checkProducts);
          openDetails(id);
        }
      }, 100);
      // Fallback timeout
      setTimeout(() => clearInterval(checkProducts), 5000);
    }
    // Clean URL
    const newUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, newUrl);
  }
  
  loadProducts();
  
  // Attach checkout form submit handler
  const checkoutForm = document.querySelector("#checkout-form");
  console.log("checkoutForm found:", !!checkoutForm);
  if (checkoutForm) {
    checkoutForm.addEventListener("submit", async (event) => {
      console.log("Checkout form submitted");
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.checkValidity()) {
        console.log("Form invalid");
        return form.reportValidity();
      }
      console.log("Form valid, proceeding...");
      const activeCouponCode = activeOffer?.coupon_code || (couponApplied && appliedCoupon ? appliedCoupon.code : "");
      let serverOrderId = null;
      let emailStatus = "sending";
      let emailErrorMessage = null;
      let confirmationEmail = null;
      let apiError = null;
      const user = JSON.parse(localStorage.getItem(authStorageKey) || "null");
      console.log("User:", user);
      const items = cart.reduce((sum, item) => sum + item.quantity, 0);
      console.log("Items in cart:", items, cart);
      if (items === 0) {
        showToast("Cart is empty", false);
        return;
      }
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

      // Show loading state
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Placing order... <span>⏳</span>";

      // Capture cart items for API call
      const productIds = cart.map((item) => item.id);

      // Call API with a hard timeout so the button can never hang indefinitely.
      if (user && user.id) {
        try {
          console.log("Sending order to API...");
          const response = await fetchWithTimeout(`${API_URL}/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: Number(user.id), items, productIds, address, couponCode: activeCouponCode, deliveryCharge, subtotal: orderSubtotal, discount: orderDiscount, totalAmount: orderTotal }),
          }, ORDER_REQUEST_TIMEOUT_MS);
          console.log("Response status:", response.status);
          const data = await response.json().catch(() => ({ error: "Invalid response" }));
          console.log("Response data:", data);
          if (response.ok) {
            serverOrderId = data.id;
            emailStatus = data.emailStatus || (data.emailSent ? "sent" : "sending");
            emailErrorMessage = data.emailError || null;
            confirmationEmail = data.email || (user && user.email) || null;
            // Update user profile (fire and forget - don't block order confirmation)
            fetch(`${API_URL}/auth/me`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: Number(user.id),
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
            apiError = data.error || "Could not place order";
          }
        } catch (error) {
          console.error("Order error:", error);
          apiError = error && error.name === "TimeoutError"
            ? "The server took too long to respond. Your order was not placed. Please try again."
            : "Could not connect to server";
        }
      }
      if (apiError) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "Confirm and place order <span>&rarr;</span>";
        showToast(apiError, false);
        return;
      }

      // Generate order ID (use server ID if available)
      const finalOrderId = serverOrderId || `SR${Date.now().toString().slice(-6)}`;

      // Save to localStorage
      const localOrders = JSON.parse(localStorage.getItem(ordersStorageKey) || "[]");
      localOrders.unshift({ id: finalOrderId, items, productIds, address, userId: user?.id || null, deliveryCharge, orderTotal, couponCode: activeCouponCode, couponDiscount: orderDiscount });
      localStorage.setItem(ordersStorageKey, JSON.stringify(localOrders));

      // Clear cart and close modal
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

      // Show success modal with CORRECT email status
      try {
        showOrderSuccess({
          orderId: finalOrderId,
          items,
          subtotal: orderSubtotal,
          discount: orderDiscount,
          total: orderGrandTotal,
          delivery: orderGrandTotal - orderTotal,
          couponCode: activeCouponCode,
          emailStatus,
          emailError: emailErrorMessage,
          email: confirmationEmail,
          canPollEmail: Boolean(user && user.id)
        });
      } catch (e) {
        console.error("showOrderSuccess error:", e);
        showToast(`Order ${finalOrderId} placed successfully`, true);
      }
      addNotification(`Order ${finalOrderId} placed successfully · ${items} item${items === 1 ? "" : "s"} · ${formatPrice(orderGrandTotal)}`);
      showToast("Your order has been placed");
    });
  }

  // Attach order edit form submit handler
  const orderEditForm = document.querySelector("#order-edit-form");
  if (orderEditForm) {
    orderEditForm.addEventListener("submit", async (event) => {
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
          const response = await fetch(`${API_URL}/orders/${encodeURIComponent(orderId)}`, {
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
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

drawSpinWheel();
checkSpinStatus();

function generateInvoicePdf(invoice, mode = "download") {
  const jsPDF = window.jspdf?.jsPDF;
  if (typeof jsPDF !== "function") {
    alert("PDF generation unavailable. Please check your connection and try again.");
    return;
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  if (typeof doc.autoTable !== "function") {
    alert("PDF table generation unavailable. Please check your connection and try again.");
    return;
  }

  const formatPrice = (value) => `Rs.${Number(value || 0).toLocaleString("en-IN")}`;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 15;

  doc.setFontSize(24);
  doc.setTextColor(44, 95, 45);
  doc.text("SRIRAM STORE", margin, y);
  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("123 Market Street, Chennai, Tamil Nadu", margin, y);
  doc.text("Phone: +91 98765 43210 | Email: support@sriramstore.com", margin, y + 5);
  y += 15;
  doc.setDrawColor(44, 95, 45);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text("INVOICE", margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(`Invoice #: ${invoice.orderId}`, margin, y);
  doc.text(`Date: ${invoice.orderDate}`, pageWidth - margin - 40, y);
  y += 5;
  doc.text(`Status: ${invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1).replace("_", " ")}`, margin, y);
  y += 10;

  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text("Bill To:", margin, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(50);
  doc.text(invoice.customerName, margin, y);
  y += 5;
  doc.text(invoice.customerEmail, margin, y);
  y += 5;
  const addressLines = splitAddress(invoice.address, 80);
  addressLines.forEach(line => {
    doc.text(line, margin, y);
    y += 4;
  });
  y += 5;

  const tableBody = invoice.productDetails.map((product, index) => {
    const price = Number(product.price || 0);
    const discount = Number(product.discount || 0);
    const finalPrice = price * (1 - discount / 100);
    return [
      index + 1,
      product.name || "Product",
      formatPrice(price),
      discount > 0 ? `${discount}%` : "—",
      formatPrice(finalPrice),
      "1",
      formatPrice(finalPrice)
    ];
  });

  if (invoice.discount > 0) {
    tableBody.push(["", "", "", "Coupon Discount", "", "", `-${formatPrice(invoice.discount)}`]);
  }

  tableBody.push(["", "", "", "Delivery Charge", "", "", formatPrice(invoice.deliveryCharge)]);
  tableBody.push(["", "", "", "Total Amount", "", "", formatPrice(invoice.totalAmount)]);

  doc.autoTable({
    startY: y,
    head: [["#", "Item", "Unit Price", "Discount", "Final Price", "Qty", "Total"]],
    body: tableBody,
    theme: "striped",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [44, 95, 45], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 55 }, 2: { cellWidth: 22 }, 3: { cellWidth: 18 }, 4: { cellWidth: 22 }, 5: { cellWidth: 15 }, 6: { cellWidth: 22 } },
    margin: { left: margin, right: margin }
  });

  y = doc.lastAutoTable.finalY + 10;

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("Thank you for shopping with Sriram Store!", margin, y);
  doc.text("For support, contact us at support@sriramstore.com", margin, y + 5);

  if (mode === "print") {
    doc.autoPrint();
    doc.output("dataurlnewwindow");
  } else {
    doc.save(`invoice-${invoice.orderId}.pdf`);
  }
}

function splitAddress(address, maxChars) {
  if (!address) return ["—"];
  const words = address.split(",");
  const lines = [];
  let currentLine = "";
  words.forEach(word => {
    const trimmed = word.trim();
    if ((currentLine + trimmed).length > maxChars) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = trimmed;
    } else {
      currentLine += (currentLine ? ", " : "") + trimmed;
    }
  });
  if (currentLine) lines.push(currentLine.trim());
  return lines.length ? lines : ["—"];
}


