import { test } from "node:test";
import assert from "node:assert/strict";
import { invoicePdf } from "../lib/invoice-pdf.ts";

test("invoice PDF renders, even with curly quotes and emoji", async () => {
  const bytes = await invoicePdf({
    number: "ZDM-2611-0012", description: "Growth plan, November — “all in” 🎉", amount: 300, currency: "BBD", status: "sent",
    created_at: "2026-11-01T12:00:00Z", due_date: "2026-11-08", payment_url: "https://fygaro.example/pay?x=1",
    billTo: { name: "Island Crumb", email: "owner@example.com", address: "Queen Street\nSpeightstown" },
  });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  assert.ok(bytes.length > 1000);
});
