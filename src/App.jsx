import { useState, useEffect, useCallback } from 'react';
import {
  AppProvider, Page, Card, Text, Button, Select, TextField,
  BlockStack, InlineStack, Banner, Spinner,
} from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import '@shopify/polaris/build/esm/styles.css';

function getParam(key) {
  return new URLSearchParams(window.location.search).get(key) || '';
}

function getSessionFromCookie() {
  const match = document.cookie.split('; ').find(r => r.startsWith('ig_session='));
  return match ? match.split('=')[1] : null;
}

export default function App() {
  const shop = getParam('shop');
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [authed, setAuthed] = useState(false);

  const fetchWithSession = useCallback(async (url, opts = {}) => {
    const session = getSessionFromCookie();
    return fetch(url, {
      ...opts,
      credentials: 'include',
      headers: {
        ...(opts.headers || {}),
        ...(session ? { Authorization: `Bearer ${session}` } : {}),
      },
    });
  }, []);

  const authenticate = useCallback(() => {
    if (!shop) return;
    const host = getParam('host');
    window.location.href = `/auth?shop=${shop}&host=${host}`;
  }, [shop]);

  const loadOrders = useCallback(async () => {
    if (!shop) { setLoading(false); return; }
    try {
      const res = await fetchWithSession(`/api/orders`);
      if (res.status === 401) { authenticate(); return; }
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setAuthed(true);
      }
    } catch (e) {
      setError('Failed to load orders: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [shop, fetchWithSession, authenticate]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const generateInvoice = async () => {
    if (!selectedOrder) return;
    setGenerating(true);
    setError('');
    try {
      const res = await fetchWithSession('/api/invoice/from-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop,
          order_id: selectedOrder,
          company_name: companyName,
          company_address: companyAddress,
          tax_rate: taxRate,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const order = orders.find(o => o.id.toString() === selectedOrder);
      a.download = `invoice-${order?.order_number || Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Failed to generate invoice');
    } finally {
      setGenerating(false);
    }
  };

  const orderOptions = [
    { label: 'Select an order...', value: '' },
    ...orders.map(o => ({
      label: `#${o.order_number} — ${o.billing_address?.name || o.email || 'Customer'} (${o.currency} ${o.total_price})`,
      value: o.id.toString(),
    })),
  ];

  if (!shop) {
    return (
      <AppProvider i18n={enTranslations}>
        <Page title="InvoiceGen">
          <Banner tone="warning"><Text>Please open this app from your Shopify admin.</Text></Banner>
        </Page>
      </AppProvider>
    );
  }

  return (
    <AppProvider i18n={enTranslations}>
      <Page
        title="InvoiceGen"
        subtitle="Generate professional PDF invoices from your Shopify orders"
      >
        <BlockStack gap="400">
          {error && (
            <Banner tone="critical" onDismiss={() => setError('')}>
              <Text>{error}</Text>
            </Banner>
          )}

          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">1. Select Order</Text>
              {loading ? (
                <InlineStack gap="200" align="center"><Spinner size="small" /><Text>Loading orders...</Text></InlineStack>
              ) : (
                <Select
                  label="Order"
                  options={orderOptions}
                  value={selectedOrder}
                  onChange={setSelectedOrder}
                />
              )}
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">2. Your Company Info</Text>
              <TextField label="Company Name" value={companyName} onChange={setCompanyName} autoComplete="organization" />
              <TextField label="Company Address" value={companyAddress} onChange={setCompanyAddress} multiline={2} autoComplete="street-address" />
              <TextField label="Tax Rate (%)" type="number" value={taxRate} onChange={setTaxRate} autoComplete="off" />
            </BlockStack>
          </Card>

          <InlineStack align="end">
            <Button
              variant="primary"
              size="large"
              disabled={!selectedOrder || generating || loading}
              loading={generating}
              onClick={generateInvoice}
            >
              📄 Generate PDF Invoice
            </Button>
          </InlineStack>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
