# Payvify — JazzCash / Easypaisa Payment Detection MVP

A payment detection service that lets businesses accept JazzCash and Easypaisa payments via a simple API.

---

## Setup (3 commands)

```bash
npm install
node server.js
# Open: http://localhost:3000
```

---

## Demo Credentials

| Field | Value |
|-------|-------|
| Dashboard | http://localhost:3000/dashboard.html |
| API Key | `pk_live_demo123456` |
| Second Key | `pk_live_test789012` |

---

## API Reference

### 1. Create Order

```http
POST /api/orders
x-api-key: pk_live_demo123456
Content-Type: application/json

{
  "amount": 1500,
  "currency": "PKR",
  "customer_name": "Ahmed Khan",
  "customer_phone": "03001234567",
  "description": "Product purchase"
}
```

**Response:**
```json
{
  "success": true,
  "order_id": "ord_abc123",
  "payment_url": "http://localhost:3000/pay/ord_abc123",
  "status": "pending"
}
```

---

### 2. Check Order Status

```http
GET /api/orders/:orderId
x-api-key: pk_live_demo123456
```

**Response:**
```json
{
  "success": true,
  "order_id": "ord_abc123",
  "amount": 1500,
  "status": "paid",
  "payment_method": "jazzcash",
  "transaction_id": "txn_xyz789"
}
```

---

### 3. List All Orders

```http
GET /api/orders
x-api-key: pk_live_demo123456
```

---

### 4. Webhook (Gateway → Your Server)

Gateway calls this when payment is confirmed:

```http
POST /webhook/payment
x-payvify-signature: sha256=<hmac>
Content-Type: application/json

{
  "order_id": "ord_abc123",
  "transaction_id": "txn_xyz789",
  "status": "success",
  "amount": 1500,
  "method": "jazzcash"
}
```

**Security included:**
- HMAC-SHA256 signature verification
- Idempotency (duplicate transaction blocking)
- Amount mismatch detection

---

## Security Features

| Feature | Status |
|---------|--------|
| API Key auth | ✅ |
| Webhook HMAC-SHA256 | ✅ |
| Idempotency check | ✅ |
| Amount validation | ✅ |
| Duplicate block | ✅ |

---

## Going Live

1. Apply at **Safepay.pk** or **Teller.pk** (they support JazzCash + Easypaisa)
2. Get your real API credentials from them
3. Replace the `/api/pay/:orderId/simulate` endpoint with real gateway redirect
4. Set `WEBHOOK_SECRET` env variable to your gateway's secret
5. Deploy to any Node.js host (Railway, Render, DigitalOcean)

---

## Value Proposition

> **Problem:** Businesses in Pakistan can't easily integrate JazzCash/Easypaisa. Direct APIs require months of approval. Developers struggle with webhook security.

> **Solution:** Payvify gives you a single API to accept both JazzCash and Easypaisa — with webhooks, security, and a dashboard included.

---

## GTM Notes (for class)

- **Channel 1:** Developer communities (LinkedIn Pakistan, dev.to, GitHub)
- **Channel 2:** Direct outreach to small e-commerce stores
- **Why:** Pain is real and well-documented. Direct sales + word of mouth for MVP stage.
- **Experiment:** 10 businesses in 30 days, measure conversion on payment page
