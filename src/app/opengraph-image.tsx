/* eslint-disable @next/next/no-img-element -- ImageResponse requires a native image element for embedded local assets. */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "PartnerBird WebMCP Demo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const logoData = await readFile(
  join(process.cwd(), "public", "assets", "partnerbird-logo.png"),
  "base64",
);
const logoSrc = `data:image/png;base64,${logoData}`;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 18% 12%, #dff3e4 0, transparent 38%), #f9fcf9",
          color: "#101713",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 1060,
            alignItems: "center",
            justifyContent: "space-between",
            border: "2px solid #dce8df",
            borderRadius: 36,
            background: "rgba(255,255,255,.9)",
            padding: "62px 68px",
            boxShadow: "0 28px 80px rgba(19,71,39,.1)",
          }}
        >
          <div style={{ display: "flex", width: 730, flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <BirdMark />
              <span style={{ fontSize: 32, fontWeight: 750, letterSpacing: -1 }}>
                PartnerBird
              </span>
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 42,
                fontSize: 65,
                fontWeight: 760,
                lineHeight: 1.04,
                letterSpacing: -3.8,
              }}
            >
              WebMCP partnership discovery, safely handed off.
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 24,
                color: "#5f6b64",
                fontSize: 25,
                lineHeight: 1.4,
              }}
            >
              External agents read safe public context. PartnerBird verifies,
              evaluates, and waits for human approval.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              width: 190,
              height: 190,
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #b8dec4",
              borderRadius: 999,
              background: "linear-gradient(145deg, #edf9ef, #d9efdf)",
            }}
          >
            <BirdMark large />
          </div>
        </div>
      </div>
    ),
    size,
  );
}

function BirdMark({ large = false }: { large?: boolean }) {
  const markSize = large ? 108 : 52;
  return (
    <img
      src={logoSrc}
      alt=""
      width={markSize}
      height={markSize}
      style={{ objectFit: "contain" }}
    />
  );
}
