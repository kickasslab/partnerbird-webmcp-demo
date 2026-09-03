import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal-document";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Privacy"
      title="Clear data boundaries by design."
      intro="This notice describes the data used by the PartnerBird MVP. It is written for clarity and will evolve with the product."
    >
      <section>
        <h2>Public conversations</h2>
        <p>
          PartnerBird stores an opaque session identifier, conversation messages, fit
          assessments, and generated partnership ideas so the conversation can continue.
          Network addresses are transformed with a secret-keyed hash for abuse prevention;
          the raw value is not stored by the application.
        </p>
      </section>
      <section>
        <h2>Website analysis</h2>
        <p>
          When you submit a public website URL, the server retrieves a limited amount of
          public text for the fit assessment. Private network addresses, unsupported file
          types, unsafe redirects, and oversized responses are blocked.
        </p>
      </section>
      <section>
        <h2>AI processing</h2>
        <p>
          The public demo uses PartnerBird’s deterministic mock agent by default. If the
          owner enables the optional OpenRouter mode, conversation text and the limited
          public website context described above are sent to OpenRouter and the selected
          model provider to generate an assessment. Do not submit confidential, personal,
          or proprietary information in a public conversation.
        </p>
      </section>
      <section>
        <h2>Proposals and accounts</h2>
        <p>
          A submitted proposal stores the name and work email you provide so the profile
          owner can follow up. Owner accounts use Neon Auth, and private agent settings are
          never returned through the public profile API.
        </p>
      </section>
      <section>
        <h2>Your choices</h2>
        <p>
          Do not submit confidential material in a public agent conversation. Data access
          and deletion workflows will be expanded before PartnerBird opens beyond this MVP.
        </p>
      </section>
    </LegalDocument>
  );
}
