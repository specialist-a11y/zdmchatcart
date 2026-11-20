import type { Metadata } from "next";
import { LegalPage, supportWhatsApp } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Delete your data | ZDM ChatCart",
  description: "How to ask ZDM ChatCart and ZDMINC to delete your information, including data from Facebook, Instagram and WhatsApp.",
  alternates: { canonical: "/data-deletion" },
};

export default function DataDeletion() {
  const wa = supportWhatsApp();
  return (
    <LegalPage title="Delete your data" updated="19 November 2026">
      <p>You can ask us to delete the information ZDM ChatCart holds about you at any time. It is free.</p>

      <h2>If you are a customer of a shop</h2>
      <ol>
        <li>
          {wa ? <>Message ZDMINC on <a href={wa}>WhatsApp</a></> : "Message ZDMINC on WhatsApp"}, or message the business
          you ordered from, and say &quot;Delete my data&quot;.
        </li>
        <li>Tell us the phone number you used on WhatsApp, or your Instagram username, and the name of the shop.</li>
        <li>We confirm the request and delete your messages, contact details and order history within 30 days.</li>
      </ol>
      <p>
        We may keep a record of paid orders where the law requires it for tax or accounting. That record is not used for
        anything else.
      </p>

      <h2>If you are a business using ChatCart</h2>
      <ol>
        <li>To remove Instagram and Facebook access, disconnect them in ChatCart under Settings.</li>
        <li>
          To close your account and delete all your data, message ZDMINC{wa ? <> on <a href={wa}>WhatsApp</a></> : ""}. We
          delete it within 90 days.
        </li>
      </ol>

      <h2>Removing access through Facebook</h2>
      <ol>
        <li>Open Facebook and go to Settings and privacy, then Settings.</li>
        <li>Open Apps and websites (or Business integrations).</li>
        <li>Find ZDM ChatCart and click Remove.</li>
      </ol>
      <p>
        This stops ChatCart reading or sending anything for you. To delete what we already hold, also send us a request as
        shown above.
      </p>
    </LegalPage>
  );
}
