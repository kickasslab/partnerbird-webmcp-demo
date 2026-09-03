/** @vitest-environment jsdom */

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ refresh: vi.fn() }) }));

import { WebMCPRegistry } from "./webmcp-registry";

describe("WebMCP progressive enhancement", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    Reflect.deleteProperty(document, "modelContext");
  });

  it("does nothing in browsers without document.modelContext", () => {
    const view = render(<WebMCPRegistry />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.__partnerbirdWebMCPDebug).toMatchObject({ supported: false, tools: [] });
    view.unmount();
  });

  it("registers Darren public tools against the native API shape and keeps them until unmount", async () => {
    const native = installNativeModelContext();
    fetchMock.mockResolvedValue(contextResponse());
    const view = render(<WebMCPRegistry publicUsername="darren" initialPublicProfileAvailable />);

    await waitFor(async () => expect((await native.getTools()).map((tool) => tool.name)).toEqual([
      "get_profile",
      "get_partnership_interests",
    ]));
    expect(native.registerTool).toHaveBeenCalledTimes(2);

    view.unmount();
    await waitFor(async () => expect(await native.getTools()).toHaveLength(0));
  });

  it("waits for Chrome to expose modelContext after hydration", async () => {
    fetchMock.mockResolvedValue(contextResponse());
    const view = render(<WebMCPRegistry publicUsername="darren" initialPublicProfileAvailable />);
    const native = installNativeModelContext();

    await waitFor(async () => expect((await native.getTools()).map((tool) => tool.name)).toEqual([
      "get_profile",
      "get_partnership_interests",
    ]), { timeout: 2_000 });
    view.unmount();
  });
});

function contextResponse() {
  return new Response(JSON.stringify({
    authenticated: false,
    authenticatedWebMCPEnabled: false,
    publicProfileAvailable: true,
    permissions: null,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function installNativeModelContext() {
  const registered = new Map<string, WebMCP.RegisteredTool>();
  const registerTool = vi.fn(async (
    tool: WebMCP.ModelContextTool,
    options?: WebMCP.ModelContextRegisterToolOptions,
  ) => {
    registered.set(tool.name, { ...tool, title: tool.title ?? tool.name, window, origin: location.origin });
    options?.signal?.addEventListener("abort", () => registered.delete(tool.name), { once: true });
  });
  const getTools = vi.fn(async () => [...registered.values()]);
  const native = { registerTool, getTools } as unknown as WebMCP.ModelContext & {
    registerTool: typeof registerTool;
    getTools: typeof getTools;
  };
  Object.defineProperty(document, "modelContext", { configurable: true, value: native });
  return native;
}
