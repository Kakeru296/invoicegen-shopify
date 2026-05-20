import { useState, useEffect, useCallback } from 'react';
import {
  AppProvider, Page, Card, Text, Button, Select, TextField,
  BlockStack, InlineStack, Banner, Spinner, DataTable,
} from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import '@shopify/polaris/build/esm/styles.css';

function getShopFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('shop') || '';
}

export default function App() {
  const [shop] = useState(getShopFromUrl);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async () => {
    if (!shop) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/invoice/orders?shop=${shop}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch (e) {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const generateInvoice = async () => {
    if (!selectedOrder) return;
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/invoice/from-order', {
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
      a.download = `invoice-${selectedOrder}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Failed to generate invoice');
    } finally {
      setGenerating(false);
    }
  };

  if (!shop) {
    return (
      <AppProvider i18n={enTranslations}>
        <Page title="InvoiceGen">
          <Banner tone="warning">
            <Text>Please open this app from your Shopify admin.</Text>
          </Banner>
        </Page>
      </AppProvider>
    );
  }

  const orderOptions = [
    { label: 'Select an order...', value: '' },
    ...orders.map(o => ({
      label: `#${o.order_number} — ${o.billing_address?.name || o.email} ($${o.total_price})`,
      value: o.id.toString(),
    })),
  ];

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="InvoiceGen" subtitle="Generate professional PDF invoices from your Shopify orders">
        <BlockStack gap="400">
          {error && <Banner tone="critical"><Text>{error}</Text></Banner>}

          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd">1. Select Order</Text>
              {loading ? <Spinner size="small" /> : (
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
              <Text variant="headingMd">2. Your Company Info</Text>
              <TextField label="Company Name" value={companyName} onChange={setCompanyName} autoComplete="off" />
              <TextField label="Company Address" value={companyAddress} onChange={setCompanyAddress} multiline={2} autoComplete="off" />
              <TextField label="Tax Rate (%)" type="number" value={taxRate} onChange={setTaxRate} autoComplete="off" />
            </BlockStack>
          </Card>

          <InlineStack align="end">
            <Button
              variant="primary"
              size="large"
              disabled={!selectedOrder || generating}
              loading={generating}
              onClick={generateInvoice}
            >
              {generating ? 'Generating...' : '📄 Generate PDF Invoice'}
            </Button>
          </InlineStack>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
