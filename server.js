const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'payvify-secret-key-2025';

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.redirect('/dashboard.html');
});
// Raw body for webhook signature verification
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ─── In-Memory DB (replace with SQLite/Postgres in prod) ─────────────────────
const db = {
  orders: [],
  transactions: [],
  apiKeys: {
    'pk_live_demo123456': { name: 'Demo Business', plan: 'starter' },
    'pk_live_test789012': { name: 'Test Client', plan: 'growth' }
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateId(prefix = '') {
  return prefix + crypto.randomBytes(8).toString('hex');
}

function verifyApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key || !db.apiKeys[key]) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  req.client = db.apiKeys[key];
  req.apiKey = key;
  next();
}

function verifyWebhookSignature(payload, signature) {
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  return signature === `sha256=${expected}`;
}

// ─── API: Create Order ────────────────────────────────────────────────────────
app.post('/api/orders', verifyApiKey, (req, res) => {
  const { amount, currency = 'PKR', customer_name, customer_phone, description } = req.body;

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount is required' });
  }
  if (!customer_phone) {
    return res.status(400).json({ error: 'customer_phone is required' });
  }

  const order = {
    id: generateId('ord_'),
    api_key: req.apiKey,
    client: req.client.name,
    amount: parseFloat(amount),
    currency,
    customer_name: customer_name || 'Unknown',
    customer_phone,
    description: description || '',
    status: 'pending',
    payment_method: null,
    transaction_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  db.orders.push(order);

  res.status(201).json({
    success: true,
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    payment_url: `http://localhost:${PORT}/pay/${order.id}`,
    status: order.status
  });
});

// ─── API: Get Order Status ────────────────────────────────────────────────────
app.get('/api/orders/:orderId', verifyApiKey, (req, res) => {
  const order = db.orders.find(o => o.id === req.params.orderId && o.api_key === req.apiKey);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  res.json({
    success: true,
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    status: order.status,
    payment_method: order.payment_method,
    transaction_id: order.transaction_id,
    created_at: order.created_at,
    updated_at: order.updated_at
  });
});

// ─── API: List Orders ─────────────────────────────────────────────────────────
app.get('/api/orders', verifyApiKey, (req, res) => {
  const orders = db.orders
    .filter(o => o.api_key === req.apiKey)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const stats = {
    total: orders.length,
    paid: orders.filter(o => o.status === 'paid').length,
    pending: orders.filter(o => o.status === 'pending').length,
    failed: orders.filter(o => o.status === 'failed').length,
    revenue: orders.filter(o => o.status === 'paid').reduce((sum, o) => sum + o.amount, 0)
  };

  res.json({ success: true, stats, orders });
});

// ─── Payment Page (for customers) ────────────────────────────────────────────
app.get('/pay/:orderId', (req, res) => {
  const order = db.orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).send('Order not found');
  if (order.status === 'paid') return res.redirect(`/success?id=${order.id}`);

  res.sendFile(path.join(__dirname, 'public', 'pay.html'));
});

// ─── API: Get Order for Payment Page ─────────────────────────────────────────
app.get('/api/pay/:orderId', (req, res) => {
  const order = db.orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  res.json({
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    description: order.description,
    status: order.status
  });
});

// ─── Simulate Payment (sandbox only — replace with real gateway in prod) ──────
app.post('/api/pay/:orderId/simulate', (req, res) => {
  const order = db.orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'paid') return res.status(400).json({ error: 'Already paid' });

  const { method, success = true } = req.body; // method: jazzcash | easypaisa

  const transaction = {
    id: generateId('txn_'),
    order_id: order.id,
    gateway: method || 'jazzcash',
    amount: order.amount,
    status: success ? 'success' : 'failed',
    raw_payload: { simulated: true, method, timestamp: new Date().toISOString() },
    created_at: new Date().toISOString()
  };

  db.transactions.push(transaction);

  if (success) {
    order.status = 'paid';
    order.payment_method = method || 'jazzcash';
    order.transaction_id = transaction.id;
    order.updated_at = new Date().toISOString();
  } else {
    order.status = 'failed';
    order.updated_at = new Date().toISOString();
  }

  // Simulate webhook delivery to client
  console.log(`[WEBHOOK] Would send to client: order ${order.id} is now ${order.status}`);

  res.json({
    success: true,
    transaction_id: transaction.id,
    order_status: order.status,
    message: success ? 'Payment successful' : 'Payment failed'
  });
});

// ─── Webhook Receiver (from gateway like Safepay) ────────────────────────────
app.post('/webhook/payment', (req, res) => {
  const signature = req.headers['x-payvify-signature'];

  if (signature && !verifyWebhookSignature(req.body, signature)) {
    console.warn('[WEBHOOK] Invalid signature — rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { order_id, transaction_id, status, amount, method } = payload;

  // Idempotency check
  const existing = db.transactions.find(t => t.id === transaction_id);
  if (existing) {
    return res.status(200).json({ message: 'Already processed' });
  }

  const order = db.orders.find(o => o.id === order_id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Amount validation
  if (parseFloat(amount) !== order.amount) {
    console.error(`[WEBHOOK] Amount mismatch for ${order_id}: expected ${order.amount}, got ${amount}`);
    return res.status(200).json({ message: 'Amount mismatch logged' });
  }

  db.transactions.push({
    id: transaction_id,
    order_id,
    gateway: method || 'unknown',
    amount: parseFloat(amount),
    status,
    raw_payload: payload,
    created_at: new Date().toISOString()
  });

  if (status === 'success') {
    order.status = 'paid';
    order.payment_method = method;
    order.transaction_id = transaction_id;
    order.updated_at = new Date().toISOString();
  } else {
    order.status = 'failed';
    order.updated_at = new Date().toISOString();
  }

  res.status(200).json({ message: 'OK' });
});

// ─── Dashboard Stats API ──────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const total = db.orders.length;
  const paid = db.orders.filter(o => o.status === 'paid').length;
  const pending = db.orders.filter(o => o.status === 'pending').length;
  const failed = db.orders.filter(o => o.status === 'failed').length;
  const revenue = db.orders.filter(o => o.status === 'paid').reduce((sum, o) => sum + o.amount, 0);

  const recentOrders = db.orders
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10);

  res.json({ total, paid, pending, failed, revenue, recentOrders });
});

// ─── Seed Demo Data ───────────────────────────────────────────────────────────
function seedDemoData() {
  const methods = ['jazzcash', 'easypaisa'];
  const names = ['Ahmed Khan', 'Sara Ali', 'Bilal Hussain', 'Fatima Sheikh', 'Usman Malik'];
  const phones = ['03001234567', '03121234567', '03331234567', '03451234567'];

  for (let i = 0; i < 12; i++) {
    const amount = [500, 1000, 1500, 2500, 5000][Math.floor(Math.random() * 5)];
    const status = ['paid', 'paid', 'paid', 'pending', 'failed'][Math.floor(Math.random() * 5)];
    const method = methods[Math.floor(Math.random() * 2)];
    const txnId = generateId('txn_');

    const order = {
      id: generateId('ord_'),
      api_key: 'pk_live_demo123456',
      client: 'Demo Business',
      amount,
      currency: 'PKR',
      customer_name: names[Math.floor(Math.random() * names.length)],
      customer_phone: phones[Math.floor(Math.random() * phones.length)],
      description: 'Product purchase',
      status,
      payment_method: status === 'paid' ? method : null,
      transaction_id: status === 'paid' ? txnId : null,
      created_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    };

    db.orders.push(order);

    if (status === 'paid') {
      db.transactions.push({
        id: txnId,
        order_id: order.id,
        gateway: method,
        amount,
        status: 'success',
        raw_payload: { simulated: true },
        created_at: order.created_at
      });
    }
  }
}

seedDemoData();

app.listen(PORT, () => {
  console.log(`\n✅ Payvify running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard.html`);
  console.log(`🔑 Demo API Key: pk_live_demo123456\n`);
});
