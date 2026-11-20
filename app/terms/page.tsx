import type { Metadata } from "next";
import { LegalPage, supportWhatsApp } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of service | ZDM ChatCart",
  description: "The terms for businesses using ZDM ChatCart and for customers shopping on ChatCart shop pages.",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  const wa = supportWhatsApp();
  return (
    <LegalPage title="Terms of service" updated="19 November 2026">
      <p>
        These terms apply to ZDM ChatCart, a service run by Zee Digital Marketing Inc (ZDMINC) in Barbados. By using
        ChatCart, as a business or as a shopper, you agree to them. If you do not agree, please do not use ChatCart.
      </p>

      <h2>What ChatCart does</h2>
      <p>
        ChatCart gives businesses a shop page, WhatsApp ordering with order codes, payment links, receipts, Instagram
        replies, and a customer list. ZDMINC may also run ads, videos and posts for a business, depending on its plan.
      </p>

      <h2>For businesses</h2>
      <h3>Your account</h3>
      <ul>
        <li>Give correct details and keep them up to date.</li>
        <li>Keep your login safe. You are responsible for what happens in your account, including what your team does.</li>
        <li>You must be allowed to run your business and sell what you list.</li>
      </ul>

      <h3>Plans and payment</h3>
      <ul>
        <li>Your plan, its price and what it includes are shown when you sign up and on your Billing page.</li>
        <li>Plans are paid in advance each month. If a payment fails, we may limit your account until it is paid.</li>
        <li>You can cancel at any time. Your plan stays active until the end of the period you have paid for.</li>
        <li>Fees already paid are not refunded, except where the law requires it.</li>
        <li>We will tell you at least 30 days before we change the price of your plan.</li>
      </ul>

      <h3>Other services you use</h3>
      <ul>
        <li>
          Payments are taken by Fygaro, under your own Fygaro account and Fygaro&apos;s terms. Fygaro pays you directly.
          ZDMINC does not hold your money.
        </li>
        <li>
          WhatsApp, Instagram and Facebook are run by Meta. You must follow Meta&apos;s rules, including the WhatsApp
          Business and Commerce policies. Meta may charge for some messages, and those charges are yours.
        </li>
        <li>If one of these services is down or changes its rules, parts of ChatCart may not work until it is fixed.</li>
      </ul>

      <h3>Your content and your customers</h3>
      <ul>
        <li>
          You own your products, photos, text and customer list. You let us use them only to run ChatCart for you, for
          example to show your shop page or to make your posts and ads.
        </li>
        <li>
          You are responsible for your products, prices, stock, delivery, refunds and service to your customers. Sales are
          between you and your customer.
        </li>
        <li>
          Only send marketing messages to customers who have agreed to hear from you, and stop when they reply STOP.
        </li>
      </ul>

      <h3>Rentals and bookings</h3>
      <p>
        If you rent out equipment or take bookings, you set your own rental agreement, deposits and rules. ChatCart helps
        manage dates and availability, but you should check each booking before it goes out.
      </p>

      <h2>For shoppers</h2>
      <ul>
        <li>When you order from a shop on ChatCart, you are buying from that business, not from ZDMINC.</li>
        <li>Questions about an order, a delivery or a refund go to the business. Its contact details are on its shop page.</li>
        <li>Card payments are handled by Fygaro on its secure pages.</li>
        <li>You can stop marketing messages at any time by replying STOP on WhatsApp.</li>
      </ul>

      <h2>What you may not do</h2>
      <ul>
        <li>Sell anything illegal, or anything Meta or Fygaro do not allow.</li>
        <li>Send spam, mislead customers or pretend to be someone else.</li>
        <li>Try to break into, overload or copy ChatCart, or use it to harm others.</li>
      </ul>
      <p>We may pause or close an account that breaks these terms. Where we can, we will tell you first and give you time to fix it.</p>

      <h2>Our part</h2>
      <ul>
        <li>We work to keep ChatCart running and your data safe, but we cannot promise it will never be down or have errors.</li>
        <li>We may improve or change features. If we remove something important to your plan, we will tell you first.</li>
        <li>
          As far as the law allows, ZDMINC is not responsible for lost sales, lost profit or indirect losses. Our total
          responsibility to a business is limited to the fees it paid us in the 3 months before the problem.
        </li>
      </ul>

      <h2>Privacy</h2>
      <p>How we handle information is explained in our <a href="/privacy">privacy policy</a>.</p>

      <h2>Ending your account</h2>
      <p>
        You can close your account at any time by messaging ZDMINC. You can ask for a copy of your products, orders and
        customer list before you go. We delete your data as set out in the privacy policy.
      </p>

      <h2>Changes to these terms</h2>
      <p>If we change these terms, we will update the date at the top and tell businesses about important changes.</p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of Barbados.</p>

      <h2>Contact</h2>
      <p>
        Zee Digital Marketing Inc (ZDMINC), Barbados.{" "}
        {wa ? <>Message us on <a href={wa}>WhatsApp</a>.</> : "Contact ZDMINC through your account manager."}
      </p>
    </LegalPage>
  );
}
