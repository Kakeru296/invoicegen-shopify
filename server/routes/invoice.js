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
    const { shop, order_id, company_name, company_address, tax_rate } = req.body;
    const access_token = req.headers['x-shopify-access-token'] || req.body.access_token;

    if (!shop || !order_id) return res.status(400).json({ error: 'shop and order_id required' });

    // Fetch order from Shopify Admin API
    const orderRes = await fetch(
      `https://${shop}/admin/api/2024-01/orders/${order_id}.json`,
      { headers: { 'X-Shopify-Access-Token': access_token } }
    );
    if (!orderRes.ok) throw new Error(`Shopify API error: ${orderRes.status}`);
    const { order } = await orderRes.json();

    const lineItems = order.line_items.map(item => ({
      item_id: item.id.toString(),
      description: item.title + (item.variant_title ? ` (${item.variant_title})` : ''),
      quantity: item.quantity,
      rate: parseFloat(item.price),
      amount: item.quantity * parseFloat(item.price),
    }));

    const args = buildPdfArgs({
      orderNumber: order.order_number,
      createdAt: order.created_at,
      email: order.email,
      billingAddress: order.billing_address,
      lineItems,
      companyName: company_name,
      companyAddress: company_address,
      taxRate: tax_rate,
      currency: order.currency,
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
