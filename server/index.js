import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import invoiceRouter from './routes/invoice.js';

const app = express();
const API_KEY = process.env.SHOPIFY_API_KEY;
const API_SECRET = process.env.SHOPIFY_API_SECRET;
const HOST = process.env.HOST || 'https://invoicegen-shopify.vercel.app';
const SCOPES = process.env.SHOPIFY_SCOPES || 'read_orders,read_customers,read_products';

app.use(cors());
app.use(express.json());

// Simple in-memory session store (use Redis/Supabase for production)
const sessions = new Map();

// OAuth start
app.get('/auth', (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Missing shop');
  const state = crypto.randomBytes(16).toString('hex');
  sessions.set(state, { shop, createdAt: Date.now() });
  const redirectUri = `${HOST}/auth/callback`;
  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${API_KEY}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  res.redirect(authUrl);
});

// OAuth callback
app.get('/auth/callback', async (req, res) => {
  try {
    const { shop, hmac, code, state } = req.query;
    if (!shop || !code) return res.status(400).send('Missing parameters');

    // HMAC validation
    const params = Object.fromEntries(
      Object.entries(req.query)
        .filter(([k]) => k !== 'hmac')
        .sort(([a], [b]) => a.localeCompare(b))
    );
    const message = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
    const digest = crypto.createHmac('sha256', API_SECRET).update(message).digest('hex');
    if (digest !== hmac) return res.status(403).send('Invalid HMAC');

    // Exchange code for access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: API_KEY, client_secret: API_SECRET, code }),
    });
    const { access_token } = await tokenRes.json();
    if (!access_token) return res.status(500).send('Token exchange failed');

    // Store token (in-memory; replace with DB in production)
    sessions.set(shop, { access_token, shop });

    const host = req.query.host || Buffer.from(`admin.shopify.com/store/${shop.split('.')[0]}`).toString('base64');
    res.redirect(`/?shop=${shop}&host=${host}`);
  } catch (e) {
    console.error('OAuth callback error:', e);
    res.status(500).send('Auth failed: ' + e.message);
  }
});

// Session token endpoint for frontend
app.get('/api/session', (req, res) => {
  const { shop } = req.query;
  const session = sessions.get(shop);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ shop: session.shop, authenticated: true });
});

app.get('/health', (_req, res) => res.json({ ok: true, app: 'invoicegen-shopify' }));
app.use('/api/invoice', invoiceRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3002;
  app.listen(PORT, () => console.log(`InvoiceGen Shopify server :${PORT}`));
}

export default app;
