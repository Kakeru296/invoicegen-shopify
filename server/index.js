import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import invoiceRouter from './routes/invoice.js';

const app = express();
const API_KEY = process.env.SHOPIFY_API_KEY;
const API_SECRET = process.env.SHOPIFY_API_SECRET;
const HOST = (process.env.HOST || 'https://invoicegen-shopify.vercel.app').replace(/\/$/, '');
const SCOPES = process.env.SHOPIFY_SCOPES || 'read_orders,read_customers,read_products,read_draft_orders,write_draft_orders';
const COOKIE_SECRET = process.env.COOKIE_SECRET || API_SECRET;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser(COOKIE_SECRET));

// Sign session data into a cookie value
function signSession(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64');
  const sig = crypto.createHmac('sha256', COOKIE_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

// Verify and parse session cookie
function parseSession(cookieVal) {
  if (!cookieVal) return null;
  // document.cookie URL-encodes values (e.g. = → %3D); cookie-parser already decodes req.cookies
  const val = cookieVal.includes('%') ? decodeURIComponent(cookieVal) : cookieVal;
  const [payload, sig] = val.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', COOKIE_SECRET).update(payload).digest('hex');
  if (sig !== expected) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')); }
  catch { return null; }
}

// OAuth start
app.get('/auth', (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Missing shop parameter');
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, { httpOnly: true, secure: true, sameSite: 'None', maxAge: 600000 });
  const redirectUri = `${HOST}/auth/callback`;
  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${API_KEY}&scope=${encodeURIComponent(SCOPES)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  res.redirect(authUrl);
});

// OAuth callback
app.get('/auth/callback', async (req, res) => {
  try {
    const { shop, hmac, code, state } = req.query;
    if (!shop || !code) return res.status(400).send('Missing parameters');

    // HMAC validation
    const params = Object.entries(req.query)
      .filter(([k]) => k !== 'hmac')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const digest = crypto.createHmac('sha256', API_SECRET).update(params).digest('hex');
    if (digest !== hmac) return res.status(403).send('Invalid HMAC');

    // Exchange code for access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: API_KEY, client_secret: API_SECRET, code }),
    });
    const tokenData = await tokenRes.json();
    const { access_token } = tokenData;
    if (!access_token) return res.status(500).send('Token exchange failed: ' + JSON.stringify(tokenData));

    // Store session in signed cookie
    const sessionCookie = signSession({ shop, access_token });
    res.cookie('ig_session', sessionCookie, {
      httpOnly: false, // Allow JS to read for passing to API
      secure: true,
      sameSite: 'None',
      maxAge: 86400000,
    });

    const host = req.query.host || Buffer.from(`admin.shopify.com/store/${shop.split('.')[0]}`).toString('base64');
    res.redirect(`/?shop=${shop}&host=${host}`);
  } catch (e) {
    console.error('OAuth callback error:', e);
    res.status(500).send('Auth failed: ' + e.message);
  }
});

// Middleware to extract session from cookie or header
function getSession(req) {
  // Try cookie first
  const fromCookie = parseSession(req.cookies?.ig_session);
  if (fromCookie) return fromCookie;
  // Try Authorization header (for explicit token passing)
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return parseSession(auth.slice(7));
  }
  return null;
}

// GET /api/session - return session info
app.get('/api/session', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated', redirectTo: '/auth' });
  res.json({ shop: session.shop, authenticated: true });
});

// GET /api/orders - proxy Shopify orders
app.get('/api/orders', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const r = await fetch(
      `https://${session.shop}/admin/api/2024-01/orders.json?limit=50&status=any`,
      { headers: { 'X-Shopify-Access-Token': session.access_token } }
    );
    const data = await r.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/health', (_req, res) => res.json({ ok: true, app: 'invoicegen-shopify' }));

// Attach parsed session to every /api/invoice request so the router can read access_token
app.use('/api/invoice', (req, _res, next) => {
  req.shopifySession = getSession(req);
  next();
}, invoiceRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3002;
  app.listen(PORT, () => console.log(`InvoiceGen Shopify server :${PORT}`));
}

export default app;
