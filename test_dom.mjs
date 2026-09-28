const checks = ['product-grid', 'category-filter', 'search-input', 'cart-items', 'wishlist-list', 'referral-section', 'referral-code', 'orders-list'];
fetch('http://localhost:5501/')
  .then(r => r.text())
  .then(html => {
    checks.forEach(id => {
      const found = html.indexOf('id="' + id + '"') !== -1;
      console.log((found ? '✅ ' : '❌ ') + id);
    });
  });