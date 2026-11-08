const express = require("express");
const router = express.Router();

// Health check
router.get("/health", (req, res) => {
  res.json({ success: true, message: "API is healthy" });
});

// Users routes
router.post("/auth/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "Name, email and password required" });
  }
  // Check if user exists
  const existing = stores.users.find((u) => u.email === email);
  if (existing) {
    return res.status(409).json({ success: false, message: "Email already registered" });
  }
  const user = { id: Date.now().toString(), name, email, password, role: "VENDOR", createdAt: new Date() };
  stores.users.push(user);
  res.status(201).json({ success: true, data: user });
});

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = stores.users.find((u) => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  }
  res.json({ success: true, data: user });
});

router.get("/auth/me", (req, res) => {
  const user = stores.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  res.json({ success: true, data: user });
});

// Companies routes
router.get("/companies", (req, res) => {
  res.json({ success: true, data: stores.companies });
});

router.post("/companies", (req, res) => {
  const { name, description, industry } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: "Company name required" });
  }
  const company = { id: Date.now().toString(), name, description, industry, createdAt: new Date() };
  stores.companies.push(company);
  res.status(201).json({ success: true, data: company });
});

router.get("/companies/:id", (req, res) => {
  const company = stores.companies.find((c) => c.id === req.params.id);
  if (!company) return res.status(404).json({ success: false, message: "Company not found" });
  res.json({ success: true, data: company });
});

// Deals routes
router.get("/deals", (req, res) => {
  res.json({ success: true, data: stores.deals });
});

router.post("/deals", (req, res) => {
  const { name, value, companyId } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: "Deal name required" });
  }
  const deal = { id: Date.now().toString(), name, value: value || 0, companyId, stage: "PROSPECTING", createdAt: new Date() };
  stores.deals.push(deal);
  res.status(201).json({ success: true, data: deal });
});

router.get("/deals/:id", (req, res) => {
  const deal = stores.deals.find((d) => d.id === req.params.id);
  if (!deal) return res.status(404).json({ success: false, message: "Deal not found" });
  res.json({ success: true, data: deal });
});

// Invoices routes
router.get("/invoices", (req, res) => {
  res.json({ success: true, data: stores.invoices });
});

router.post("/invoices", (req, res) => {
  const { number, companyId, total } = req.body;
  if (!number || !companyId) {
    return res.status(400).json({ success: false, message: "Invoice number and company required" });
  }
  const invoice = { id: Date.now().toString(), number, companyId, total: total || 0, status: "DRAFT", createdAt: new Date() };
  stores.invoices.push(invoice);
  res.status(201).json({ success: true, data: invoice });
});

// Activities routes
router.get("/activities", (req, res) => {
  res.json({ success: true, data: stores.activities });
});

router.post("/activities", (req, res) => {
  const { type, title, relatedTo } = req.body;
  if (!type || !title) {
    return res.status(400).json({ success: false, message: "Type and title required" });
  }
  const activity = { id: Date.now().toString(), type, title, relatedTo, date: new Date() };
  stores.activities.push(activity);
  res.status(201).json({ success: true, data: activity });
});

module.exports = router;