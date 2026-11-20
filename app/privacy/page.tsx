import type { Metadata } from "next";
import { LegalPage, supportWhatsApp } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy policy | ZDM ChatCart",
  description: "How ZDM ChatCart and ZDMINC collect, use and protect information from businesses and their customers.",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  const wa = supportWhatsApp();
  return (
    <LegalPage title="Privacy policy" updated="19 November 2026">
      <p>
        ZDM ChatCart is run by Zee Digital Marketing Inc (ZDMINC) in Barbados. It gives small businesses a shop page,
        WhatsApp ordering, payment links and a customer list. This policy explains what information we handle, why, and
        the choices you have.
      </p>
      <p>
        There are two kinds of people here. <strong>Businesses</strong> are our clients who use ChatCart.{" "}
        <strong>Customers</strong> are people who shop with those businesses. For customer information, the business
        decides how it is used and ZDMINC handles it on the business&apos;s behalf.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Business accounts:</strong> name, email, phone number, business details, products, prices and settings.</li>
        <li><strong>Orders:</strong> the items ordered, order code, dates for rentals and bookings, pickup or delivery details, and the amount paid.</li>
        <li><strong>WhatsApp messages:</strong> when a customer messages a business on WhatsApp, we receive their phone number, profile name and the message, so the business can reply and the order can be handled.</li>
        <li><strong>Instagram and Facebook:</strong> when a business connects its Page, we store a Page access token and receive comments and direct messages sent to that Page, so the business can reply from ChatCart.</li>
        <li><strong>Payments:</strong> card payments are taken by Fygaro on its own secure pages. We never see or store card numbers. We receive a payment confirmation and the amount.</li>
        <li><strong>Usage:</strong> basic technical logs such as IP address, browser type and pages visited, to keep the service working and secure.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To show shop pages, take orders and send order summaries, payment links, receipts and reminders.</li>
        <li>To let businesses see their orders, customers and messages in one place.</li>
        <li>To answer common customer questions automatically when a business turns this on. These questions may be processed by an AI service (Anthropic) only to write the reply.</li>
        <li>To send marketing messages only to customers who have not opted out. Customers can reply STOP on WhatsApp at any time.</li>
        <li>To bill businesses for their plan, give support and keep the service secure.</li>
      </ul>
      <p>We do not sell personal information, and we do not use customer information for our own advertising.</p>

      <h2>Who we share it with</h2>
      <p>Only the services needed to run ChatCart, each under its own privacy terms:</p>
      <ul>
        <li>Meta (WhatsApp, Instagram and Facebook) to send and receive messages.</li>
        <li>Fygaro to take payments.</li>
        <li>Supabase to store data, and Vercel to host the website.</li>
        <li>Anthropic, when a business uses the AI assistant.</li>
      </ul>
      <p>We may also share information when the law requires it.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep information while the business uses ChatCart. When a business closes its account, we delete or anonymise
        its data within 90 days, except records we must keep for tax or legal reasons.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Ask to see, correct or delete your information.</li>
        <li>Stop marketing messages by replying STOP on WhatsApp.</li>
        <li>Disconnect Instagram or Facebook from ChatCart at any time, in ChatCart settings or in your Facebook settings.</li>
      </ul>
      <p>See <a href="/data-deletion">how to delete your data</a>.</p>

      <h2>Security</h2>
      <p>
        Data is sent over encrypted connections. Access is limited to each business&apos;s own team and to ZDMINC staff who
        need it to give support. Access tokens are stored on the server and never shown in the browser.
      </p>

      <h2>Children</h2>
      <p>ChatCart is for businesses and their adult customers. It is not meant for children under 13.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we will update the date at the top of this page.</p>

      <h2>Contact</h2>
      <p>
        Zee Digital Marketing Inc (ZDMINC), Barbados.{" "}
        {wa ? <>Message us on <a href={wa}>WhatsApp</a>.</> : "Contact us through the business you shop with, or through ZDMINC."}
      </p>
    </LegalPage>
  );
}
