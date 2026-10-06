/**
 * Deterministic Mavela Café dataset for the in-browser demo sandbox.
 * Built once per session. Reset clones this again. Nothing here is written to Supabase.
 */

export const DEMO_SANDBOX_TOKEN = "paidly-demo-sandbox";
export const DEMO_USER_ID = "a1000001-0000-4000-8000-000000000001";
export const DEMO_ORG_ID = "a2000001-0000-4000-8000-000000000001";
export const DEMO_MEMBERSHIP_ID = "a3000001-0000-4000-8000-000000000001";
export const DEMO_REGISTER_ID = "a4000001-0000-4000-8000-000000000001";
export const DEMO_SESSION_ID = "a5000001-0000-4000-8000-000000000001";
/** The invoice the reset story restores to unpaid. */
export const DEMO_RESET_INVOICE_ID = "d1000001-0000-4000-8000-000000000001";

const CUSTOMERS = [
  ["Thandi Mokoena", "thandi@moktrading.co.za", "Sandton"],
  ["James Pillay", "james@pillaystudio.co.za", "Rosebank"],
  ["Ayesha Khan", "ayesha@khandesign.co.za", "Parkhurst"],
  ["Pieter van Wyk", "pieter@vwbuilders.co.za", "Centurion"],
  ["Lerato Dlamini", "lerato@dlamini.co.za", "Soweto"],
  ["Michael Botha", "michael@bothalegal.co.za", "Pretoria"],
  ["Nomsa Khumalo", "nomsa@khumalo.co.za", "Midrand"],
  ["David Naidoo", "david@naidooandco.co.za", "Durban North"],
  ["Fatima Essop", "fatima@essopcafe.co.za", "Bo-Kaap"],
  ["Chris Jacobs", "chris@jacobsmedia.co.za", "Cape Town"],
  ["Zanele Ndlovu", "zanele@ndlovu.co.za", "Fourways"],
  ["Owen Smith", "owen@smithandco.co.za", "Stellenbosch"],
  ["Priya Reddy", "priya@reddyarch.co.za", "Umhlanga"],
  ["Johan du Plessis", "johan@duplessis.co.za", "Bloemfontein"],
  ["Amina Yusuf", "amina@yusufgoods.co.za", "Johannesburg"],
];

const PRODUCTS = [
  ["Cappuccino", "Coffee", 38, "CAP-01"],
  ["Flat white", "Coffee", 36, "CAP-02"],
  ["Americano", "Coffee", 32, "CAP-03"],
  ["Chai latte", "Coffee", 42, "CAP-04"],
  ["Croissant", "Food", 35, "FD-01"],
  ["Breakfast roll", "Food", 68, "FD-02"],
  ["Chicken wrap", "Food", 85, "FD-03"],
  ["Cake slice", "Food", 48, "FD-04"],
  ["Still water", "Retail", 22, "RT-01"],
  ["House blend 250g", "Retail", 145, "RT-02"],
];

const STAFF = [
  ["Sipho Nkosi", "Floor", 18500],
  ["Megan Adams", "Kitchen", 17200],
  ["Karabo Molefe", "Barista", 14800],
  ["Elena Rossi", "Manager", 24000],
];

function uid(prefix, n) {
  return `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function isoDays(now, daysAgo) {
  const d = new Date(now.getTime() - daysAgo * 86400000);
  return d.toISOString();
}

function day(now, daysAgo) {
  return isoDays(now, daysAgo).slice(0, 10);
}

function money(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {Date} [now]
 */
export function createDemoDataset(now = new Date()) {
  const created = now.toISOString();
  const expires = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

  const clients = CUSTOMERS.map(([name, email, city], i) => ({
    id: uid("c1000001", i + 1),
    org_id: DEMO_ORG_ID,
    name,
    email,
    phone: `082 ${String(1000000 + i * 137).slice(0, 7)}`,
    address: `${12 + i} ${city}`,
    contact_person: name,
    payment_terms: "14 days",
    payment_terms_days: 14,
    currency: "ZAR",
    created_at: isoDays(now, 40 - i),
    updated_at: created,
    created_by_id: DEMO_USER_ID,
  }));

  const services = PRODUCTS.map(([name, category, price, sku], i) => ({
    id: uid("e1000001", i + 1),
    org_id: DEMO_ORG_ID,
    name,
    description: `${name} — Mavela Café`,
    category,
    sku,
    item_type: "product",
    price,
    default_rate: price,
    unit_price: price,
    rate: price,
    cost_price: Math.round(price * 0.4),
    unit: "each",
    is_active: true,
    stock_quantity: i === 9 ? 3 : 24 - i,
    stock_on_hand: i === 9 ? 3 : 24 - i,
    low_stock_threshold: 8,
    track_stock: true,
    created_at: isoDays(now, 60),
    updated_at: created,
  }));

  const invoiceStatuses = [
    "sent", "paid", "paid", "partial", "overdue", "sent", "paid", "draft", "sent", "paid",
    "overdue", "paid", "sent", "partial", "paid", "sent", "paid", "draft", "sent", "paid",
  ];
  const invoiceTotals = [
    5000, 1850, 920, 2400, 760, 1340, 450, 2100, 680, 3120,
    890, 1560, 430, 2750, 640, 1180, 990, 3400, 520, 1675,
  ];

  const invoices = invoiceStatuses.map((status, i) => {
    const total = invoiceTotals[i];
    const client = clients[i % clients.length];
    const paid = status === "paid" ? total : status === "partial" ? money(total / 2) : 0;
    return {
      id: uid("d1000001", i + 1),
      org_id: DEMO_ORG_ID,
      client_id: client.id,
      invoice_number: `INV-2026-${String(i + 1).padStart(4, "0")}`,
      status,
      project_title: i === 0 ? "Café catering — board lunch" : `Order for ${client.name.split(" ")[0]}`,
      invoice_date: day(now, 30 - i),
      delivery_date: day(now, status === "overdue" ? 4 : -14),
      subtotal: total,
      tax_rate: 0,
      tax_amount: 0,
      total_amount: total,
      amount_paid: paid,
      balance_due: money(total - paid),
      currency: "ZAR",
      created_by: DEMO_USER_ID,
      user_id: DEMO_USER_ID,
      created_at: isoDays(now, 30 - i),
      updated_at: created,
      client_name: client.name,
    };
  });

  const invoiceItems = invoices.map((inv) => ({
    id: uid("d2000001", Number(inv.id.slice(-2))),
    org_id: DEMO_ORG_ID,
    invoice_id: inv.id,
    description: inv.project_title,
    quantity: 1,
    unit_price: inv.total_amount,
    line_total: inv.total_amount,
    sort_order: 0,
    created_at: inv.created_at,
  }));

  const quoteStatuses = ["accepted", "sent", "sent", "draft", "viewed", "accepted", "sent", "draft"];
  const quotes = quoteStatuses.map((status, i) => {
    const client = clients[(i + 3) % clients.length];
    const total = 800 + i * 350;
    return {
      id: uid("f1000001", i + 1),
      org_id: DEMO_ORG_ID,
      client_id: client.id,
      quote_number: `QUO-2026-${String(i + 1).padStart(4, "0")}`,
      status,
      project_title: `Quote for ${client.name.split(" ")[0]}`,
      valid_until: day(now, -21),
      subtotal: total,
      tax_rate: 0,
      tax_amount: 0,
      total_amount: total,
      currency: "ZAR",
      created_by: DEMO_USER_ID,
      user_id: DEMO_USER_ID,
      created_at: isoDays(now, 20 - i),
      updated_at: created,
      items: [
        {
          description: "Catering package",
          quantity: 1,
          unit_price: total,
          line_total: total,
        },
      ],
    };
  });

  const payments = invoices
    .filter((inv) => inv.amount_paid > 0)
    .map((inv, i) => ({
      id: uid("b1000001", i + 1),
      org_id: DEMO_ORG_ID,
      invoice_id: inv.id,
      client_id: inv.client_id,
      amount: inv.amount_paid,
      payment_date: inv.invoice_date,
      payment_method: i % 2 === 0 ? "eft" : "cash",
      reference: `DEMO-${40000 + i}`,
      currency: "ZAR",
      created_at: inv.created_at,
      updated_at: created,
    }));

  const expenseNames = [
    ["Coffee beans", "Cost of sales", 4200],
    ["Milk and dairy", "Cost of sales", 1860],
    ["Rent — Maboneng", "Rent", 18000],
    ["Electricity", "Utilities", 2400],
    ["Staff transport", "Transport", 860],
    ["Packaging", "Cost of sales", 640],
  ];
  const expenses = expenseNames.map(([title, category, amount], i) => ({
    id: uid("91000001", i + 1),
    org_id: DEMO_ORG_ID,
    title,
    category,
    amount,
    expense_date: day(now, 12 - i),
    payment_method: "eft",
    vendor: "Mavela suppliers",
    currency: "ZAR",
    created_at: isoDays(now, 12 - i),
    updated_at: created,
  }));

  const payslips = STAFF.map(([name, role, gross], i) => ({
    id: uid("81000001", i + 1),
    org_id: DEMO_ORG_ID,
    employee_name: name,
    job_title: role,
    pay_period: day(now, 15).slice(0, 7),
    gross_pay: gross,
    net_pay: money(gross * 0.78),
    status: "paid",
    currency: "ZAR",
    created_at: isoDays(now, 15),
    updated_at: created,
  }));

  const suppliers = ["Bean & Leaf", "City Dairy", "PackRight", "Metro Produce"].map((name, i) => ({
    id: uid("71000001", i + 1),
    org_id: DEMO_ORG_ID,
    name,
    email: `${name.split(" ")[0].toLowerCase()}@suppliers.example`,
    phone: `011 555 ${1000 + i}`,
    created_at: isoDays(now, 50),
    updated_at: created,
  }));

  const purchaseOrders = [0, 1, 2].map((i) => ({
    id: uid("61000001", i + 1),
    org_id: DEMO_ORG_ID,
    supplier_id: suppliers[i].id,
    po_number: `PO-2026-${String(i + 1).padStart(4, "0")}`,
    status: i === 2 ? "received" : "sent",
    total_amount: 2400 + i * 800,
    currency: "ZAR",
    order_date: day(now, 8 - i),
    created_at: isoDays(now, 8 - i),
    updated_at: created,
  }));

  const posSales = [0, 1, 2, 3, 4, 5].map((i) => ({
    id: uid("51000001", i + 1),
    org_id: DEMO_ORG_ID,
    receipt_number: `POS-${day(now, i).replace(/-/g, "")}-${(4096 + i).toString(16).toUpperCase()}`,
    external_id: `seed-${i + 1}`,
    status: "completed",
    sale_kind: "sale",
    total_amount: 86 + i * 24,
    currency: "ZAR",
    payment_method: i % 3 === 0 ? "cash" : i % 3 === 1 ? "card" : "digital",
    occurred_at: isoDays(now, i),
    items: [{ name: PRODUCTS[i % PRODUCTS.length][0], quantity: 2, unit_price: PRODUCTS[i % PRODUCTS.length][2] }],
    register_id: DEMO_REGISTER_ID,
    session_id: DEMO_SESSION_ID,
    created_at: isoDays(now, i),
  }));

  const tables = Array.from({ length: 8 }, (_, i) => ({
    id: uid("41000001", i + 1),
    floor_id: uid("42000001", 1),
    name: `Table ${i + 1}`,
    seats: i < 2 ? 2 : 4,
    shape: "rect",
    pos_x: (i % 4) * 2,
    pos_y: Math.floor(i / 4) * 2,
    status: "available",
  }));

  return {
    expires_at: expires,
    tables: {
      organizations: [
        {
          id: DEMO_ORG_ID,
          owner_id: DEMO_USER_ID,
          name: "Mavela Café",
          is_demo: true,
          demo_expires_at: expires,
          business_type: "restaurant",
          created_at: created,
        },
      ],
      memberships: [
        {
          id: DEMO_MEMBERSHIP_ID,
          org_id: DEMO_ORG_ID,
          user_id: DEMO_USER_ID,
          role: "owner",
          job_function: "owner",
          created_at: created,
        },
      ],
      profiles: [
        {
          id: DEMO_USER_ID,
          full_name: "Demo Host",
          email: "demo@paidly.demo",
          company_name: "Mavela Café",
          company_address: "12 Fox Street, Maboneng, Johannesburg",
          currency: "ZAR",
          timezone: "Africa/Johannesburg",
          plan: "growth",
          subscription_plan: "growth",
          subscription_status: "trialing",
          role: "user",
          user_role: "user",
          phone: "010 020 0300",
          created_at: created,
          updated_at: created,
        },
      ],
      clients,
      invoices,
      invoice_items: invoiceItems,
      quotes,
      payments,
      expenses,
      payslips,
      services,
      suppliers,
      purchase_orders: purchaseOrders,
      purchase_order_items: [],
      banking_details: [
        {
          id: uid("31000001", 1),
          org_id: DEMO_ORG_ID,
          bank_name: "Demo Bank",
          account_name: "Mavela Café",
          account_number: "62000000001",
          is_default: true,
          created_at: created,
          updated_at: created,
        },
      ],
      pos_sales_events: posSales,
      employees: STAFF.map(([name, role], i) => ({
        id: uid("21000001", i + 1),
        org_id: DEMO_ORG_ID,
        name,
        job_title: role,
        email: `${name.split(" ")[0].toLowerCase()}@mavela.demo`,
        created_at: created,
      })),
    },
    pos: {
      register: {
        id: DEMO_REGISTER_ID,
        name: "Front counter",
        status: "active",
        org_id: DEMO_ORG_ID,
      },
      session: {
        id: DEMO_SESSION_ID,
        register_id: DEMO_REGISTER_ID,
        status: "open",
        opening_balance: 1500,
        expected_cash: 1500,
        cash_sales: 0,
        opened_at: created,
      },
      floorId: uid("42000001", 1),
      tables,
      tabs: [],
      items: [],
      tickets: [],
      portions: [],
      orderSeq: 40,
    },
  };
}
