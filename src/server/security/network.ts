import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

export type PublicHttpTarget = {
  url: URL;
  address: string;
  family: 4 | 6;
};

export async function resolvePublicHttpTarget(input: string): Promise<PublicHttpTarget> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("INVALID_URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("UNSUPPORTED_PROTOCOL");
  }
  if (url.username || url.password) {
    throw new Error("URL_CREDENTIALS_NOT_ALLOWED");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("PORT_NOT_ALLOWED");
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  if (
    blockedHostnames.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".example")
  ) {
    throw new Error("PRIVATE_HOST_NOT_ALLOWED");
  }

  const literalVersion = isIP(hostname);
  const addresses: Array<{ address: string; family: number }> = literalVersion
    ? [{ address: hostname, family: literalVersion }]
    : await lookup(hostname, { all: true, verbatim: true });

  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("PRIVATE_ADDRESS_NOT_ALLOWED");
  }

  const selected = addresses[0];
  if (selected.family !== 4 && selected.family !== 6) {
    throw new Error("UNSUPPORTED_ADDRESS_FAMILY");
  }

  return { url, address: selected.address, family: selected.family };
}

export async function assertPublicHttpUrl(input: string): Promise<URL> {
  return (await resolvePublicHttpTarget(input)).url;
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];

  if (normalized.includes(":")) {
    const mappedIpv4 = extractMappedIpv4(normalized);
    if (mappedIpv4) return isPrivateAddress(mappedIpv4);

    if (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("::") ||
      normalized.startsWith("64:ff9b:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("fec") ||
      normalized.startsWith("fed") ||
      normalized.startsWith("fee") ||
      normalized.startsWith("fef") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("100:") ||
      normalized.startsWith("2001:2:") ||
      normalized.startsWith("2001:10:") ||
      normalized.startsWith("2001:db8:")
    ) {
      return true;
    }

    return false;
  }

  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) {
    return true;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 88) ||
    (a === 192 && b === 0 && octets[2] === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && octets[2] === 100) ||
    (a === 203 && b === 0 && octets[2] === 113) ||
    a >= 224
  );
}

function extractMappedIpv4(address: string) {
  const compressedPrefix = "::ffff:";
  const expandedMatch = address.match(/^(?:0+:){5}ffff:(.+)$/);
  const suffix = address.startsWith(compressedPrefix)
    ? address.slice(compressedPrefix.length)
    : expandedMatch?.[1];
  if (!suffix) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(suffix)) return suffix;

  const parts = suffix.split(":");
  if (parts.length !== 2 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    return null;
  }
  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}
