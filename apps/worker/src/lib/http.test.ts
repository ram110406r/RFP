import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  DISCOVERY_USER_AGENT,
  ResponseTooLargeError,
  UnsafeUrlError,
  assertPublicHostname,
  fetchPublicUrl,
  fetchWithTimeout,
  isPrivateAddress,
  readBytesLimited,
  readJsonLimited,
  readTextLimited,
} from "./http";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("isPrivateAddress", () => {
  const privateAddresses = [
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.8",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "[::1]",
    "0:0:0:0:0:0:0:1",
    "::ffff:127.0.0.1",
    "[::ffff:127.0.0.1]",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "::127.0.0.1",
    "64:ff9b::a9fe:a9fe",
    "2002:7f00:1::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe80::1%eth0",
    "ff02::1",
    "2001:db8::1",
    "not-an-ip",
  ];
  const publicAddresses = [
    "1.1.1.1",
    "8.8.8.8",
    "100.63.255.255",
    "100.128.0.1",
    "172.15.255.255",
    "172.32.0.1",
    "198.17.255.255",
    "198.20.0.1",
    "203.0.114.1",
    "::ffff:8.8.8.8",
    "2606:4700:4700::1111",
    "[2606:4700:4700::1111]",
    "2002:808:808::",
  ];

  test.each(privateAddresses)("%s is private", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  test.each(publicAddresses)("%s is public", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe("assertPublicHostname", () => {
  test.each(["localhost", "LOCALHOST", "api.localhost", "localhost.", "127.0.0.1", "[::1]", "[::ffff:127.0.0.1]"])(
    "rejects %s without resolving it",
    async (hostname) => {
      await expect(assertPublicHostname(hostname)).rejects.toBeInstanceOf(UnsafeUrlError);
    },
  );

  test("accepts a public IP literal", async () => {
    expect(await assertPublicHostname("8.8.8.8")).toEqual([{ address: "8.8.8.8", family: 4 }]);
  });
});

describe("fetchPublicUrl", () => {
  test.each([
    "http://127.0.0.1/file.pdf",
    "http://[::ffff:127.0.0.1]/file.pdf",
    "https://localhost/file.pdf",
    "http://169.254.169.254/latest/meta-data",
    "ftp://example.com/file.pdf",
  ])("refuses %s", async (url) => {
    await expect(fetchPublicUrl(url)).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});

describe("fetchWithTimeout", () => {
  test("adds the discovery user agent and an abort signal", async () => {
    const fetchMock = mock(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(new Headers(init?.headers).get("user-agent")).toBe(DISCOVERY_USER_AGENT);
      expect(new Headers(init?.headers).get("accept")).toBe("text/html");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("ok");
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await fetchWithTimeout("https://portal.example/list", { headers: { accept: "text/html" } });

    expect(await response.text()).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("keeps a caller-provided user agent", async () => {
    globalThis.fetch = mock(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(new Headers(init?.headers).get("user-agent")).toBe("custom/1.0");
      return new Response("ok");
    }) as unknown as typeof fetch;

    await fetchWithTimeout("https://portal.example/list", { headers: { "user-agent": "custom/1.0" } });
  });

  test("aborts a request that outlives the timeout", async () => {
    globalThis.fetch = mock(
      (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    ) as unknown as typeof fetch;

    // AbortSignal.timeout's timer does not hold the event loop open by itself.
    const keepAlive = setTimeout(() => undefined, 1_000);
    const error = await fetchWithTimeout("https://portal.example/slow", {}, { timeoutMs: 20 })
      .catch((caught: unknown) => caught)
      .finally(() => clearTimeout(keepAlive));

    expect((error as Error).name).toBe("TimeoutError");
  });
});

describe("limited reads", () => {
  test("reads text and JSON under the limit", async () => {
    expect(await readTextLimited(new Response("hello"), 10)).toBe("hello");
    expect(await readJsonLimited<{ items: number[] }>(new Response('{"items":[1,2]}'), 100)).toEqual({ items: [1, 2] });
  });

  test("refuses a declared Content-Length over the limit", async () => {
    const response = new Response("x", { headers: { "content-length": "1000" } });

    await expect(readBytesLimited(response, 10, "too big")).rejects.toThrow("too big");
  });

  test("refuses a streamed body that passes the limit without a Content-Length", async () => {
    const chunk = new Uint8Array(8);
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(chunk);
      },
    });

    const error = await readTextLimited(new Response(body), 20).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ResponseTooLargeError);
    expect(pulls).toBeLessThan(10);
  });

  test("returns fetched bodies through the mocked fetch", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ items: [], nextCursor: null }))) as unknown as typeof fetch;

    const response = await fetchWithTimeout("https://portal.example/feed");

    expect(await readJsonLimited<Record<string, unknown>>(response)).toEqual({ items: [], nextCursor: null });
  });
});
