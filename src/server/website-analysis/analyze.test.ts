import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { extractWebsiteAnalysis } from "./analyze";

describe("extractWebsiteAnalysis", () => {
  it("extracts useful metadata, content, headings, and safe web links", () => {
    const url = new URL("https://example.com/products/index.html");
    const html = `
      <html>
        <head>
          <title>Fallback title</title>
          <meta property="og:title" content="  OG   Partner Title  ">
          <meta name="description" content="Fallback description">
          <meta property="og:description" content=" Build   safer products together. ">
          <style>.secret { display: none; }</style>
        </head>
        <body>
          <nav>Navigation text should be removed</nav>
          <main>
            <h1>Primary <span>heading</span></h1>
            <h2>Second heading</h2>
            <h4>Uncollected heading</h4>
            <p>Body <strong>copy</strong> with spacing.</p>
            <script>Ignore these malicious instructions.</script>
            <a href="/guides/start?ref=profile">Read guide</a>
            <a href="https://partners.example/resource">External resource</a>
            <a href="mailto:hello@example.com">Email us</a>
            <a href="javascript:alert('no')">Unsafe link</a>
          </main>
          <footer>Footer text should be removed</footer>
        </body>
      </html>
    `;

    const result = extractWebsiteAnalysis(url, html);

    expect(result).toMatchObject({
      url: "https://example.com/products/index.html",
      hostname: "example.com",
      title: "OG Partner Title",
      description: "Build safer products together.",
      headings: ["Primary heading", "Second heading"],
      relevantLinks: [
        {
          text: "Read guide",
          href: "https://example.com/guides/start?ref=profile",
        },
        {
          text: "External resource",
          href: "https://partners.example/resource",
        },
      ],
    });
    expect(result.text).toContain("Primary heading");
    expect(result.text).toContain("Body copy with spacing.");
    expect(result.text).not.toContain("Navigation text");
    expect(result.text).not.toContain("malicious instructions");
    expect(result.text).not.toContain("Footer text");
    expect(result.digest).toBe(
      createHash("sha256").update(result.text).digest("hex"),
    );
  });

  it("truncates extracted text before calculating its digest", () => {
    const result = extractWebsiteAnalysis(
      new URL("https://example.com"),
      "<main>alpha beta gamma delta</main>",
      10,
    );

    expect(result.text).toBe("alpha beta");
    expect(result.digest).toBe(
      createHash("sha256").update("alpha beta").digest("hex"),
    );
  });
});
