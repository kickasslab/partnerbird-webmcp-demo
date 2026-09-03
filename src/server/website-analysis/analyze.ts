import "server-only";

import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";

import * as cheerio from "cheerio";

import {
  resolvePublicHttpTarget,
  type PublicHttpTarget,
} from "@/server/security/network";

export type WebsiteAnalysis = {
  url: string;
  hostname: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
  relevantLinks: Array<{ text: string; href: string }>;
  digest: string;
};

export async function analyzeWebsite(
  rawUrl: string,
  parentSignal: AbortSignal,
): Promise<WebsiteAnalysis> {
  const maxBytes = Number(process.env.PARTNERBIRD_MAX_FETCH_BYTES ?? 1_048_576);
  const maxChars = Number(process.env.PARTNERBIRD_MAX_EXTRACTED_CHARS ?? 50_000);
  if (!Number.isFinite(maxBytes) || maxBytes < 1 || maxBytes > 5_000_000) {
    throw new Error("INVALID_FETCH_LIMIT");
  }
  if (!Number.isFinite(maxChars) || maxChars < 1 || maxChars > 200_000) {
    throw new Error("INVALID_EXTRACTION_LIMIT");
  }

  let target = await resolvePublicHttpTarget(rawUrl);
  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(8_000)]);

  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await requestPinnedPage(target, maxBytes, signal);

    if (response.status >= 300 && response.status < 400) {
      const location = headerValue(response.headers, "location");
      if (!location || redirect === 3) throw new Error("TOO_MANY_REDIRECTS");
      target = await resolvePublicHttpTarget(new URL(location, target.url).toString());
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error("WEBSITE_UNAVAILABLE");
    }

    const contentType = headerValue(response.headers, "content-type").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error("UNSUPPORTED_CONTENT_TYPE");
    }

    const html = new TextDecoder().decode(response.body);
    return extractWebsiteAnalysis(target.url, html, maxChars);
  }

  throw new Error("WEBSITE_UNAVAILABLE");
}

type PinnedPageResponse = {
  status: number;
  headers: IncomingHttpHeaders;
  body: Uint8Array;
};

function requestPinnedPage(
  target: PublicHttpTarget,
  maxBytes: number,
  signal: AbortSignal,
): Promise<PinnedPageResponse> {
  return new Promise((resolve, reject) => {
    const requestImpl = target.url.protocol === "https:" ? httpsRequest : httpRequest;
    let settled = false;
    const finish = <T>(callback: (value: T) => void, value: T) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      callback(value);
    };
    const fail = (error: unknown) =>
      finish(reject, error instanceof Error ? error : new Error("WEBSITE_UNAVAILABLE"));
    const abort = () => request.destroy(signal.reason);

    const request = requestImpl(
      target.url,
      {
        agent: false,
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
          "User-Agent":
            "PartnerBird/1.0 (+https://www.partnerbird.com)",
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) {
            callback(null, [{ address: target.address, family: target.family }]);
            return;
          }
          callback(null, target.address, target.family);
        },
        servername: target.url.hostname.replace(/^\[|\]$/g, ""),
      },
      (response) => collectPinnedResponse(response, maxBytes, signal).then(
        (body) =>
          finish(resolve, {
            status: response.statusCode ?? 0,
            headers: response.headers,
            body,
          }),
        fail,
      ),
    );

    request.once("error", fail);
    signal.addEventListener("abort", abort, { once: true });
    request.end();
  });
}

function collectPinnedResponse(
  response: IncomingMessage,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(headerValue(response.headers, "content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      response.destroy(new Error("WEBSITE_TOO_LARGE"));
      reject(new Error("WEBSITE_TOO_LARGE"));
      return;
    }

    const chunks: Buffer[] = [];
    let total = 0;
    response.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > maxBytes) {
        response.destroy(new Error("WEBSITE_TOO_LARGE"));
        return;
      }
      chunks.push(chunk);
    });
    response.once("end", () => resolve(Buffer.concat(chunks, total)));
    response.once("error", reject);
    signal.addEventListener(
      "abort",
      () => response.destroy(signal.reason),
      { once: true },
    );
  });
}

function headerValue(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function extractWebsiteAnalysis(url: URL, html: string, maxChars = 50_000) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer, form, iframe, template").remove();

  const title = cleanText(
    $("meta[property='og:title']").attr("content") || $("title").first().text(),
  ).slice(0, 240);
  const description = cleanText(
    $("meta[property='og:description']").attr("content") ||
      $("meta[name='description']").attr("content") ||
      "",
  ).slice(0, 600);
  const headings = $("h1, h2, h3")
    .map((_index, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean)
    .slice(0, 24);
  const main = $("main, article").first();
  const text = cleanText((main.length ? main : $("body")).text()).slice(0, maxChars);
  const relevantLinks = $("a[href]")
    .map((_index, element) => {
      const anchorText = cleanText($(element).text()).slice(0, 120);
      const href = $(element).attr("href");
      if (!anchorText || !href) return null;
      try {
        const resolved = new URL(href, url);
        if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
        return { text: anchorText, href: resolved.toString() };
      } catch {
        return null;
      }
    })
    .get()
    .filter((value): value is { text: string; href: string } => Boolean(value))
    .slice(0, 20);

  return {
    url: url.toString(),
    hostname: url.hostname,
    title,
    description,
    headings,
    text,
    relevantLinks,
    digest: createHash("sha256").update(text).digest("hex"),
  } satisfies WebsiteAnalysis;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
