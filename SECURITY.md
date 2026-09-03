# Security

Please do not open a public issue for a suspected vulnerability or exposed
credential. Use GitHub's private vulnerability reporting feature for this
repository.

This repository contains demo code and fictional/demo fixtures only. It must be
connected to a dedicated non-production database, authentication branch, email
configuration, and provider credentials. Never reuse PartnerBird production
secrets or production user data.

Before publishing a change, run:

```bash
npm run audit:public
npm run check
```

The automated audit is a guardrail, not a replacement for reviewing the staged
diff and repository history.
