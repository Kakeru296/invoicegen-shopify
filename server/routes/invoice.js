import { Router } from 'express';
import { generateInvoicePDF } from '../services/pdf.js';

const router = Router();

function buildPdfArgs({ orderNumber, createdAt, dueDate, email, billingAddress, lineItems, companyName, companyAddress, taxRate, currency }) {
  const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.rate, 0);
  const taxRateNum = parseFloat(taxRate || 0);
  const taxAmount = subtotal * (taxRateNum / 100);
  const total = subtotal + taxAmount;

  const template = {
    company_name: companyName || 'Your Company',
    company_address: companyAddress || '',
    tax_rate: taxRateNum,
    currency: currency || 'USD',
  };
  const invoice = {
    invoice_number: orderNumber?.toString() || Date.now().toString(),
    client_name: billingAddress?.name || email || 'Customer',
    client_email: email || '',
    client_address: billingAddress ? `${billingAddress.address1 || ''}, ${billingAddress.city || ''}, ${billingAddress.country || ''}` : '',
    issued_at: (createdAt || new Date().toISOString()).split('T')[0],
    due_date: dueDate || null,
    subtotal,
    tax_amount: taxAmount,
    total,
  };
  return { template, invoice, lineItems };
}

// POST /api/invoice/from-order — fetch Shopify order and generate invoice
router.post('/from-order', async (req, res) => {
  try {
    const { order_id, company_name, company_address, tax_rate } = req.body;
    const session = req.shopifySession;
    const shop = req.body.shop || session?.shop;
    const access_token = session?.access_token || req.headers['x-shopify-access-token'] || req.body.access_token;

    if (!shop || !order_id) return res.status(400).json({ error: 'shop and order_id required' });

    // Fetch order via GraphQL (REST orders endpoint requires PCD approval)
    const gid = `gid://shopify/Order/${order_id}`;
    const query = `{
      order(id: "${gid}") {
        id name email currencyCode orderNumber createdAt
        totalPriceSet { shopMoney { amount } }
        billingAddress { firstName lastName address1 city country }
        lineItems(first: 50) {
          edges { node { id title quantity variantTitle originalUnitPriceSet { shopMoney { amount } } } }
        }
      }
    }`;
    const orderRes = await fetch(
      `https://${shop}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      }
    );
    const gql = await orderRes.json();
    if (gql.errors) throw new Error(gql.errors[0]?.message);
    const order = gql.data.order;
    if (!order) throw new Error('Order not found');
    const ba = order.billingAddress;

    const lineItems = order.lineItems.edges.map(({ node: item }) => ({
      item_id: item.id.split('/').pop(),
      description: item.title + (item.variantTitle ? ` (${item.variantTitle})` : ''),
      quantity: item.quantity,
      rate: parseFloat(item.originalUnitPriceSet.shopMoney.amount),
      amount: item.quantity * parseFloat(item.originalUnitPriceSet.shopMoney.amount),
    }));

    const args = buildPdfArgs({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      email: order.email,
      billingAddress: ba ? { name: `${ba.firstName || ''} ${ba.lastName || ''}`.trim(), address1: ba.address1, city: ba.city, country: ba.country } : null,
      lineItems,
      companyName: company_name,
      companyAddress: company_address,
      taxRate: tax_rate,
      currency: order.currencyCode,
    });

    const pdfBuffer = await generateInvoicePDF(args);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.order_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/invoice/orders — proxy Shopify orders list
router.get('/orders', async (req, res) => {
  try {
    const { shop } = req.query;
    const access_token = req.headers['x-shopify-access-token'];
    if (!shop || !access_token) return res.status(400).json({ error: 'shop and access token required' });

    const r = await fetch(
      `https://${shop}/admin/api/2024-01/orders.json?limit=50&status=any`,
      { headers: { 'X-Shopify-Access-Token': access_token } }
    );
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
