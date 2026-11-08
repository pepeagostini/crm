/**
 * Invoice PDF rendering.
 *
 * Produces a clean A4 document the customer can read and print: sender header,
 * recipient block, the itemised service lines, the totals and the payment
 * terms. Everything comes from the invoice plus the company settings, so the
 * output matches what the CRM shows on screen.
 */

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");
const INVOICE_DIR = path.join(BACKEND_ROOT, "uploads", "invoices");

const COLORS = {
  text: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  accent: "#1d4ed8",
  zebra: "#f8fafc",
};

const PAGE = { margin: 50 };

/** Formats an amount with thousands separators, matching the UI. */
function money(value, currency = "USD") {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat("es", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Builds the PDF and resolves with the file path.
 *
 * @returns {Promise<{ filePath: string, fileName: string }>}
 */
function renderInvoice({ invoice, company, contact }) {
  return new Promise((resolve, reject) => {
    const dir = INVOICE_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const safeNumber = String(invoice.number || invoice.id).replace(/[^\w.-]/g, "_");
    const fileName = `${safeNumber}.pdf`;
    const filePath = path.join(dir, fileName);

    const doc = new PDFDocument({ size: "A4", margin: PAGE.margin });
    const stream = fs.createWriteStream(filePath);
    stream.on("finish", () => resolve({ filePath, fileName }));
    stream.on("error", reject);
    doc.on("error", reject);
    doc.pipe(stream);

    const left = PAGE.margin;
    const right = doc.page.width - PAGE.margin;
    const contentWidth = right - left;

    // ---- Header: sender + invoice number ----
    doc.fontSize(20).fillColor(COLORS.accent).font("Helvetica-Bold").text(company.name || "CRM", left, PAGE.margin);

    let y = doc.y + 2;
    doc.fontSize(9).font("Helvetica").fillColor(COLORS.muted);
    const senderLines = [company.address, company.phone, company.email, company.taxId && `CUIT/CIF: ${company.taxId}`].filter(Boolean);
    for (const line of senderLines) {
      doc.text(line, left, y, { width: contentWidth / 2 });
      y = doc.y;
    }

    doc.fontSize(22).font("Helvetica-Bold").fillColor(COLORS.text).text("FACTURA", right - 180, PAGE.margin, {
      width: 180,
      align: "right",
    });
    doc.fontSize(11).font("Helvetica").fillColor(COLORS.text).text(invoice.number || "—", right - 180, doc.y, {
      width: 180,
      align: "right",
    });
    doc.fontSize(9).fillColor(COLORS.muted);
    const statusLabels = { DRAFT: "Borrador", SENT: "Enviada", PAID: "Pagada", OVERDUE: "Vencida", CANCELLED: "Anulada" };
    doc.text(statusLabels[invoice.status] || invoice.status || "", right - 180, doc.y + 2, {
      width: 180,
      align: "right",
    });

    // ---- Recipient block ----
    y = Math.max(doc.y, y) + 22;
    const boxTop = y;
    doc.roundedRect(left, boxTop, contentWidth, 66, 6).fill(COLORS.zebra);
    doc.fillColor(COLORS.muted).fontSize(9).text("FACTURAR A", left + 14, boxTop + 12);
    doc.fillColor(COLORS.text).fontSize(12).font("Helvetica-Bold").text(invoice.customerName || "—", left + 14, boxTop + 26);
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted);
    const subLines = [
      invoice.customerTaxId && `CUIT/CIF: ${invoice.customerTaxId}`,
      invoice.customerAddress,
      invoice.customerEmail,
      contact?.phone,
    ].filter(Boolean);
    if (subLines.length) {
      doc.text(subLines.join(" · "), left + 14, boxTop + 43, { width: contentWidth - 28 });
    }

    // ---- Dates row ----
    y = boxTop + 66 + 20;
    doc.fontSize(9).fillColor(COLORS.muted);
    const emit = `Emisión: ${formatDate(invoice.date)}`;
    const due = `Vencimiento: ${formatDate(invoice.dueDate)}`;
    doc.text(emit, left, y);
    doc.text(due, right - 180, y, { width: 180, align: "right" });

    // ---- Items table ----
    y += 26;
    const columns = [
      { label: "Concepto", x: left, w: contentWidth - 180, align: "left" },
      { label: "Cant.", x: left + contentWidth - 180, w: 50, align: "right" },
      { label: "Precio", x: left + contentWidth - 130, w: 70, align: "right" },
      { label: "Importe", x: left + contentWidth - 60, w: 60, align: "right" },
    ];

    // Header row
    doc.rect(left, y, contentWidth, 24).fill(COLORS.text);
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#ffffff");
    for (const col of columns) {
      doc.text(col.label, col.x + 6, y + 8, { width: col.w - 12, align: col.align });
    }
    y += 24;

    // Body rows
    const items = Array.isArray(invoice.items) && invoice.items.length
      ? invoice.items
      : [{ description: "Servicios", quantity: 1, unitPrice: Number(invoice.subtotal) || 0, total: Number(invoice.subtotal) || 0 }];

    doc.font("Helvetica").fontSize(10);
    items.forEach((item, index) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      const total = Number(item.total ?? qty * price) || 0;
      const descHeight = doc.heightOfString(item.description || "—", { width: columns[0].w - 12 });
      const rowHeight = Math.max(24, descHeight + 12);

      if (index % 2 === 1) {
        doc.rect(left, y, contentWidth, rowHeight).fill(COLORS.zebra);
      }

      doc.fillColor(COLORS.text).fontSize(10).text(item.description || "—", columns[0].x + 6, y + 7, {
        width: columns[0].w - 12,
      });
      doc.fillColor(COLORS.muted).fontSize(9).font("Helvetica");
      doc.text(String(qty), columns[1].x + 6, y + 8, { width: columns[1].w - 12, align: "right" });
      doc.text(money(price, invoice.currency).replace(/\s/g, ""), columns[2].x + 6, y + 8, {
        width: columns[2].w - 12,
        align: "right",
      });
      doc.fillColor(COLORS.text).fontSize(9).font("Helvetica-Bold").text(
        money(total, invoice.currency).replace(/\s/g, ""),
        columns[3].x + 6,
        y + 8,
        { width: columns[3].w - 12, align: "right" }
      );

      doc.moveTo(left, y + rowHeight).lineTo(right, y + rowHeight).lineWidth(0.5).strokeColor(COLORS.line).stroke();
      y += rowHeight;
    });

    // ---- Totals ----
    y += 16;
    const totalsX = right - 230;
    const rows = [
      ["Subtotal", money(invoice.subtotal, invoice.currency)],
      [`IVA (${invoice.taxRate ?? 21}%)`, money(invoice.tax, invoice.currency)],
    ];
    doc.fontSize(10);
    for (const [label, value] of rows) {
      doc.fillColor(COLORS.muted).font("Helvetica").text(label, totalsX, y, { width: 130 });
      doc.fillColor(COLORS.text).text(value, totalsX + 130, y, { width: 100, align: "right" });
      y += 16;
    }

    // Grand total with a highlighted bar
    y += 6;
    doc.roundedRect(totalsX, y, 230, 30, 4).fill(COLORS.text);
    doc.fillColor("#ffffff").fontSize(12).font("Helvetica-Bold");
    doc.text("Total", totalsX + 12, y + 9, { width: 118 });
    doc.text(money(invoice.total, invoice.currency), totalsX + 130, y + 9, { width: 88, align: "right" });

    // ---- Footer ----
    const footerY = doc.page.height - PAGE.margin - 26;
    doc.fontSize(8).font("Helvetica").fillColor(COLORS.muted);
    doc.text(
      `Generado por ${company.name || "CRM"} · ${formatDate(new Date())}`,
      left,
      footerY,
      { width: contentWidth, align: "center" }
    );

    doc.end();
  });
}

const INVOICE_DIR_REF = INVOICE_DIR;

module.exports = { renderInvoice, INVOICE_DIR: INVOICE_DIR_REF, money, formatDate };