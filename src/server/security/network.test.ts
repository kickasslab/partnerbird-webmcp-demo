import { describe, expect, it } from "vitest";

import { isPrivateAddress } from "./network";

describe("isPrivateAddress", () => {
  it.each([
    ["unspecified", "0.0.0.0"],
    ["RFC 1918 /8", "10.42.0.1"],
    ["loopback", "127.0.0.1"],
    ["carrier-grade NAT", "100.64.0.1"],
    ["link-local", "169.254.10.20"],
    ["RFC 1918 /12 lower boundary", "172.16.0.1"],
    ["RFC 1918 /12 upper boundary", "172.31.255.254"],
    ["RFC 1918 /16", "192.168.1.1"],
    ["benchmarking", "198.18.0.1"],
    ["multicast", "224.0.0.1"],
    ["reserved", "255.255.255.255"],
  ])("classifies private IPv4 address %s (%s)", (_label, address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    "1.1.1.1",
    "8.8.8.8",
    "93.184.216.34",
    "100.63.255.255",
    "100.128.0.1",
    "172.15.255.255",
    "172.32.0.1",
  ])("classifies public IPv4 address %s", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it.each([
    ["unspecified", "::"],
    ["loopback", "::1"],
    ["unique-local fc00::/7", "fc00::1234"],
    ["unique-local fd00::/8", "fd12:3456::1"],
    ["link-local", "fe80::1"],
    ["site-local fec0::/10", "fec0::1"],
    ["site-local upper range", "fef0::1"],
    ["multicast", "ff02::1"],
    ["discard-only", "100::1"],
    ["documentation", "2001:db8::1"],
  ])("classifies non-public IPv6 address %s (%s)", (_label, address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    "2001:4860:4860::8888",
    "2606:4700:4700::1111",
    "2a00:1450:4001:81b::200e",
  ])("classifies public IPv6 address %s", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it.each([
    ["dotted loopback", "::ffff:127.0.0.1"],
    ["dotted RFC 1918", "::ffff:192.168.1.1"],
    ["canonical hex loopback", "::ffff:7f00:1"],
    ["canonical hex RFC 1918", "::ffff:c0a8:101"],
  ])("classifies private IPv4-mapped IPv6 address %s (%s)", (_label, address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["::ffff:8.8.8.8", "::ffff:808:808"])(
    "classifies public IPv4-mapped IPv6 address %s",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});
