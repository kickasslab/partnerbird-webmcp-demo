import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const excludedDirectories = new Set([
  ".git",
  ".next",
  ".vercel",
  "node_modules",
  "coverage",
  "playwright-report",
  "test-results",
]);
const skippedExtensions = new Set([
  ".ico",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".woff",
  ".woff2",
]);
const secretPatterns = [
  ["OpenAI/OpenRouter-style key", /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  [
    "credentialed database URL",
    /postgres(?:ql)?:\/\/[^\s:"']+:[^\s@"']+@[^\s"']+/gi,
  ],
  ["bearer token", /\bBearer\s+[A-Za-z0-9._-]{24,}\b/g],
];
const allowedEmailDomains = new Set([
  "company.com",
  "example.com",
  "users.noreply.github.com",
  "your-domain.com",
]);
const findings = [];

for (const file of await walk(root)) {
  const name = relative(root, file).replaceAll("\\", "/");
  if (skippedExtensions.has(extname(file).toLowerCase())) continue;
  if (/^\.env(?:\.|$)/.test(name) && name !== ".env.example") {
    findings.push(`${name}: environment file must not be committed`);
    continue;
  }

  const content = await readFile(file, "utf8");
  const scanContent = content.replaceAll(
    "postgresql://user:password@host.example.com/database",
    "",
  );
  for (const [label, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(scanContent)) findings.push(`${name}: possible ${label}`);
  }

  const emails = scanContent.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi) ?? [];
  for (const email of emails) {
    const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
    if (!allowedEmailDomains.has(domain)) {
      findings.push(`${name}: review non-example email address ${email}`);
    }
  }
}

if (findings.length) {
  console.error("Public repository audit failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log("Public repository audit passed: no environment files, known secret patterns, or non-example email addresses found.");
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
