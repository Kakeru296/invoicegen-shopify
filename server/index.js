import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { shopifyApi, LATEST_API_VERSION, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import invoiceRouter from './routes/invoice.js';

const app = express();

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: (process.env.SHOPIFY_SCOPES || 'read_orders,read_customers,read_products').split(','),
  hostName: (process.env.HOST || '').replace(/https?:\/\//, ''),
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: true,
});

app.use(cors());
app.use(express.json());

// OAuth start
app.get('/auth', async (req, res) => {
  await shopify.auth.begin({
    shop: shopify.utils.sanitizeShop(req.query.shop, true),
    callbackPath: '/auth/callback',
    isOnline: false,
    rawRequest: req,
    rawResponse: res,
  });
});

// OAuth callback
app.get('/auth/callback', async (req, res) => {
  try {
    const { session } = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });
    const host = req.query.host;
    res.redirect(`/?shop=${session.shop}&host=${host}`);
  } catch (e) {
    console.error('OAuth callback error:', e);
    res.status(500).send('Auth failed');
  }
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
