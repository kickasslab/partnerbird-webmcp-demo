import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal-document";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Terms"
      title="Use PartnerBird thoughtfully."
      intro="These lightweight MVP terms set expectations for using public profiles, agent conversations, and proposal handoffs."
    >
      <section>
        <h2>Appropriate use</h2>
        <ul>
          <li>Share only information you are authorized to provide.</li>
          <li>Do not attempt to bypass security, rate limits, or private-data boundaries.</li>
          <li>Do not use PartnerBird for unlawful, deceptive, or abusive outreach.</li>
        </ul>
      </section>
      <section>
        <h2>AI-generated assessments</h2>
        <p>
          Fit assessments and ideas are decision support, not commitments or guarantees.
          A proposal becomes a partnership only after the people involved review and agree
          to it directly.
        </p>
      </section>
      <section>
        <h2>MVP availability</h2>
        <p>
          This is an early production version. Features may change, and the service may be
          limited or temporarily unavailable while it is improved.
        </p>
      </section>
    </LegalDocument>
  );
}
