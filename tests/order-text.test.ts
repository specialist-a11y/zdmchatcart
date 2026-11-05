import { test } from "node:test";
import assert from "node:assert/strict";
import { extractOrderCode, money, orderSummary, priceCart, waLink } from "../lib/order-text.ts";

test("order codes are found and normalised", () => {
  assert.equal(extractOrderCode("Hi! I'd like to place order ic-1048"), "IC-1048");
  assert.equal(extractOrderCode("ORDER CC-1001 please"), "CC-1001");
  assert.equal(extractOrderCode("call me at 246-555"), null);
  assert.equal(extractOrderCode("hello"), null);
});

const catalog = [
  { id: "a", name: "Coconut sweetbread", price: "25.00", stock: null, active: true },
  { id: "b", name: "Black cake", price: "40.00", stock: 2, active: true },
  { id: "c", name: "Old item", price: "5.00", stock: null, active: false },
];

test("cart is priced from the catalog, not the browser, and merges duplicates", () => {
  const r = priceCart([{ productId: "a", quantity: 1 }, { productId: "b", quantity: 1 }, { productId: "a", quantity: 1 }], catalog);
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.subtotal, 90);
  assert.deepEqual(r.items.map((i) => [i.name, i.quantity]), [["Coconut sweetbread", 2], ["Black cake", 1]]);
});

test("cart rejects out-of-stock, inactive and unknown products", () => {
  assert.deepEqual(priceCart([{ productId: "b", quantity: 3 }], catalog), { error: "Only 2 left of Black cake." });
  assert.ok("error" in priceCart([{ productId: "c", quantity: 1 }], catalog));
  assert.ok("error" in priceCart([{ productId: "zzz", quantity: 1 }], catalog));
  assert.ok("error" in priceCart([], catalog));
});

test("cents-safe totals", () => {
  const r = priceCart([{ productId: "x", quantity: 3 }], [{ id: "x", name: "Tea", price: "0.10", stock: null, active: true }]);
  assert.ok(!("error" in r) && r.subtotal === 0.3);
});

test("summary and links", () => {
  assert.equal(money(90, "BBD"), "BBD $90.00");
  const s = orderSummary("IC-1048", [{ name: "Black cake", unit_price: "40.00", quantity: 2 }], "80.00", "BBD");
  assert.equal(s, "Order IC-1048\n• 2 x Black cake: BBD $80.00\nTotal: BBD $80.00");
  assert.equal(waLink("+1 (246) 555-1234", "Hi order IC-1"), "https://wa.me/12465551234?text=Hi%20order%20IC-1");
});

// Receipt image data and its signed link
process.env.RECEIPT_SECRET = "receipt-test";
const { receiptModel, receiptToken, checkReceiptToken } = await import("../lib/receipt.ts");

test("receipt model", () => {
  const m = receiptModel({
    business: { name: "Island Crumb Bakery" },
    order: { code: "IC-1048", total: "90.00", currency: "BBD", fulfillment: "pickup", created_at: "2026-11-03T13:41:00Z", paid_at: "2026-11-03T13:43:00Z", fygaro_transaction_id: "7f3a9b02e1c21" },
    items: [{ name: "Coconut sweetbread", unit_price: "25.00", quantity: 2 }, { name: "Black cake", unit_price: "40.00", quantity: 1 }],
    customerName: "Tara Best", vatRate: 0.175,
  });
  assert.equal(m.initials, "IC");
  assert.equal(m.date, "03/11/2026 09:41"); // Barbados time
  assert.equal(m.customer, "Tara B.");
  assert.equal(m.count, 3);
  assert.equal(m.subtotal, "90.00");
  assert.deepEqual(m.vat, { rate: "17.5%", amount: "13.40" });
  assert.equal(m.ref, "7f3a...c21");
  assert.equal(m.thanks, "Thank you, Tara!");
  const cash = receiptModel({ business: { name: "Shop" }, order: { code: "S-1", total: 5, currency: "BBD", created_at: "2026-11-03T13:41:00Z", fygaro_transaction_id: "manual" }, items: [] });
  assert.equal(cash.payment, "Cash / in person");
  assert.equal(cash.ref, null);
  assert.equal(cash.vat, null);
});

test("receipt links are signed per order", () => {
  const id = "3f0c2a1e-1111-4222-8333-444455556666";
  assert.ok(checkReceiptToken(id, receiptToken(id)));
  assert.equal(checkReceiptToken("3f0c2a1e-1111-4222-8333-444455556667", receiptToken(id)), false);
  assert.equal(checkReceiptToken(id, ""), false);
});

import { needsPrice, orderReply } from "../lib/order-text.ts";

const quoteItems = [{ name: "Leak repair (Call-out)", unit_price: 0, quantity: 1 }];
const mixed = [{ name: "Black cake (8 inch)", unit_price: 65, quantity: 1 }, { name: "Wedding cake", unit_price: 0, quantity: 1 }];

test("price-on-request items show as to confirm", () => {
  assert.ok(needsPrice(quoteItems));
  assert.equal(needsPrice([{ unit_price: "12.50" }]), false);
  assert.equal(orderSummary("TR-1", quoteItems, 0, "BBD"), "Order TR-1\n• 1 x Leak repair (Call-out): price to confirm\nTotal: to confirm");
  assert.match(orderSummary("CC-2", mixed, 65, "BBD"), /Total so far: BBD \$65\.00, plus the items to confirm$/);
});

test("WhatsApp reply: no payment link while prices are to confirm", () => {
  const r = orderReply({ code: "TR-1", items: quoteItems, total: 0, currency: "BBD", paymentUrl: "https://pay", hasProducts: false, anyServices: true });
  assert.doesNotMatch(r, /https:\/\/pay|PICKUP/);
  assert.match(r, /confirm the price/);
});

test("WhatsApp reply: pickup question only for products", () => {
  const items = [{ name: "Gel nails", unit_price: 60, quantity: 1 }];
  const booking = orderReply({ code: "BK-1", items, total: 60, currency: "BBD", paymentUrl: "https://pay", hasProducts: false, anyServices: true });
  assert.match(booking, /your booking/);
  assert.doesNotMatch(booking, /PICKUP/);
  const order = orderReply({ code: "CC-1", items, total: 60, currency: "BBD", paymentUrl: null, hasProducts: true, anyServices: false });
  assert.match(order, /your order[\s\S]*payment link shortly[\s\S]*PICKUP/);
});
