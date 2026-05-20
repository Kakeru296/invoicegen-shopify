import PDFDocument from 'pdfkit';

export function generateInvoicePDF({ template, invoice, lineItems }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const {
      company_name = 'Your Company',
      company_address = '',
      company_email = '',
      company_phone = '',
      tax_rate = 0,
      payment_terms = 'Net 30',
      currency = 'USD',
      invoice_prefix = 'INV-',
      notes = '',
    } = template || {};

    const {
      invoice_number,
      client_name = '',
      client_email = '',
      issued_at,
      due_date,
      subtotal,
      tax_amount,
      total,
    } = invoice;

    const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'JPY' ? '¥' : '$';
    const fmt = (n) => `${currencySymbol}${Number(n).toFixed(currency === 'JPY' ? 0 : 2)}`;
    const dateStr = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '-';

    // ── Header ──────────────────────────────────────────────────
    doc.fontSize(24).font('Helvetica-Bold').fillColor('#1f3c88').text('INVOICE', 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#666').text(`${invoice_prefix}${invoice_number}`, 50, 82);

    // Company info (right side)
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#333').text(company_name, 350, 50, { align: 'right', width: 200 });
    doc.fontSize(9).font('Helvetica').fillColor('#666');
    if (company_address) doc.text(company_address, 350, 68, { align: 'right', width: 200 });
    if (company_email) doc.text(company_email, 350, 82, { align: 'right', width: 200 });
    if (company_phone) doc.text(company_phone, 350, 96, { align: 'right', width: 200 });

    // Divider
    doc.moveTo(50, 120).lineTo(545, 120).strokeColor('#1f3c88').lineWidth(2).stroke();

    // ── Bill To / Dates ─────────────────────────────────────────
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#999').text('BILL TO', 50, 135);
    doc.fontSize(10).font('Helvetica').fillColor('#333').text(client_name || '-', 50, 150);
    if (client_email) doc.fontSize(9).fillColor('#666').text(client_email, 50, 165);

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#999').text('DATE', 380, 135);
    doc.fontSize(10).font('Helvetica').fillColor('#333').text(dateStr(issued_at), 380, 150);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#999').text('DUE DATE', 380, 170);
    doc.fontSize(10).font('Helvetica').fillColor('#333').text(due_date ? dateStr(due_date) : payment_terms, 380, 185);

    // ── Line Items Table ─────────────────────────────────────────
    const tableTop = 230;
    const colDescription = 50;
    const colQty = 320;
    const colRate = 390;
    const colAmount = 470;

    // Table header
    doc.fillColor('#1f3c88').rect(50, tableTop - 8, 495, 24).fill();
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
    doc.text('DESCRIPTION', colDescription, tableTop);
    doc.text('QTY', colQty, tableTop);
    doc.text('RATE', colRate, tableTop);
    doc.text('AMOUNT', colAmount, tableTop);

    // Table rows
    let y = tableTop + 28;
    lineItems.forEach((item, i) => {
      if (i % 2 === 0) {
        doc.fillColor('#f4f6fb').rect(50, y - 6, 495, 22).fill();
      }
      doc.fontSize(9).font('Helvetica').fillColor('#333');
      doc.text(item.description || '-', colDescription, y, { width: 260 });
      doc.text(String(item.quantity || 1), colQty, y);
      doc.text(fmt(item.rate || 0), colRate, y);
      doc.text(fmt((item.quantity || 1) * (item.rate || 0)), colAmount, y);
      y += 24;
    });

    // ── Totals ───────────────────────────────────────────────────
    y += 16;
    doc.moveTo(350, y).lineTo(545, y).strokeColor('#ddd').lineWidth(1).stroke();
    y += 12;

    const addTotalRow = (label, value, bold = false) => {
      doc.fontSize(9);
      if (bold) {
        doc.font('Helvetica-Bold').fillColor('#1f3c88');
      } else {
        doc.font('Helvetica').fillColor('#666');
      }
      doc.text(label, 350, y);
      doc.text(value, colAmount, y);
      y += 18;
    };

    addTotalRow('Subtotal', fmt(subtotal));
    if (tax_rate > 0) addTotalRow(`Tax (${tax_rate}%)`, fmt(tax_amount));
    doc.moveTo(350, y).lineTo(545, y).strokeColor('#1f3c88').lineWidth(1.5).stroke();
    y += 8;
    addTotalRow('TOTAL', fmt(total), true);

    // ── Notes / Payment Terms ────────────────────────────────────
    if (notes || payment_terms) {
      y += 24;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#999').text('NOTES', 50, y);
      y += 14;
      doc.fontSize(9).font('Helvetica').fillColor('#555').text(notes || `Payment terms: ${payment_terms}`, 50, y, { width: 300 });
    }

    // Footer
    doc.fontSize(8).fillColor('#aaa').text('Generated by InvoiceGen for monday.com', 50, 780, { align: 'center', width: 495 });

    doc.end();
  });
}
