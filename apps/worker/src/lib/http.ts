import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

/**
 * Outbound HTTP for the worker.
 *
 * Every connector and importer talks to third-party portals that can hang,
 * stream without end, or (for URLs that come from the database or from a
 * notice) point somewhere inside our own network. These helpers put a timeout
 * and a byte cap on every request, and `fetchPublicUrl` refuses private
 * destinations in a way DNS rebinding cannot get around.
 */

export const DISCOVERY_USER_AGENT = "TENDYY-TenderDiscovery/1.0";
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 4;

export interface FetchTimeoutOptions {
  timeoutMs?: number;
}

/** The response body is larger than the caller allowed. */
export class ResponseTooLargeError extends Error {
  constructor(message = "Response exceeds the size limit.") {
    super(message);
    this.name = "ResponseTooLargeError";
  }
}

/**
 * A URL that can never be fetched no matter how often it is retried: bad
 * protocol, private destination, a redirect loop. Callers use the type to
 * decide whether to stop retrying.
 */
export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/**
 * `fetch` with a deadline and the discovery user agent.
 *
 * The timeout signal stays attached to the response, so it bounds reading the
 * body as well as waiting for headers.
 */
export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS }: FetchTimeoutOptions = {},
): Promise<Response> {
  const headers = withUserAgent(init.headers);
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(url, { ...init, headers, signal });
}

/**
 * Reads a body into memory, refusing once it passes `maxBytes`.
 *
 * A declared Content-Length over the limit is refused before reading; the
 * running total is still enforced because the header is optional and can lie.
 */
export async function readBytesLimited(
  response: Response,
  maxBytes: number,
  message?: string,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new ResponseTooLargeError(message);
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ResponseTooLargeError(message);
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function readTextLimited(
  response: Response,
  maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<string> {
  return new TextDecoder().decode(await readBytesLimited(response, maxBytes));
}

export async function readJsonLimited<T = unknown>(
  response: Response,
  maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<T> {
  return JSON.parse(await readTextLimited(response, maxBytes)) as T;
}

export interface FetchPublicUrlOptions extends FetchTimeoutOptions {
  headers?: Record<string, string>;
  maxRedirects?: number;
}

/**
 * GET a URL that must resolve to a public address.
 *
 * Checking a hostname and then handing it to `fetch` leaves a gap: `fetch`
 * resolves the name again, and a hostile DNS server can answer with a public
 * address for the check and 127.0.0.1 for the connection. So the name is
 * resolved once, every address is checked, and the connection is made through
 * node:http(s) with a `lookup` that can only return those checked addresses.
 * The URL's hostname is still used for the Host header, SNI and certificate
 * verification. Redirects are followed by hand so each hop is checked the
 * same way.
 */
export async function fetchPublicUrl(
  value: string | URL,
  { headers = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, maxRedirects = DEFAULT_MAX_REDIRECTS }: FetchPublicUrlOptions = {},
): Promise<Response> {
  let url = new URL(value);
  for (let redirects = 0; ; redirects += 1) {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new UnsafeUrlError("URL must use HTTP or HTTPS.");
    }
    const addresses = await assertPublicHostname(url.hostname);
    const response = await requestPinned(url, addresses, headers, timeoutMs);
    if (response.status < 300 || response.status >= 400) return response;

    await response.body?.cancel().catch(() => undefined);
    const location = response.headers.get("location");
    if (!location) throw new UnsafeUrlError("URL redirect did not include a location.");
    if (redirects >= maxRedirects) throw new UnsafeUrlError("URL redirected too many times.");
    url = new URL(location, url);
  }
}

/**
 * Resolves a hostname and returns its addresses, or throws when the name is
 * local or any address is private. Any, not all: a name that resolves to one
 * public and one private address could still be connected to the private one.
 */
export async function assertPublicHostname(hostname: string): Promise<LookupAddress[]> {
  const host = stripBrackets(hostname.toLowerCase()).replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new UnsafeUrlError("URL resolves to a private host.");
  }
  const family = isIP(host);
  const addresses: LookupAddress[] = family
    ? [{ address: host, family }]
    : await dnsLookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new UnsafeUrlError("URL resolves to a private host.");
  }
  return addresses;
}

/**
 * True for any address a public URL must not reach: loopback, private,
 * link-local, carrier-grade NAT, benchmarking, multicast and reserved ranges,
 * including IPv4 addresses wrapped in IPv6 (mapped, compatible, NAT64, 6to4).
 * Anything that does not parse as an IP address is treated as private.
 */
export function isPrivateAddress(address: string): boolean {
  let value = stripBrackets(address.trim().toLowerCase());
  const zone = value.indexOf("%");
  if (zone >= 0) value = value.slice(0, zone);
  const version = isIP(value);
  if (version === 4) return isPrivateIpv4(value.split(".").map(Number));
  if (version === 6) return isPrivateIpv6(value);
  return true;
}

function isPrivateIpv4([a = 0, b = 0, c = 0]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(value: string): boolean {
  const hextets = parseIpv6(value);
  if (!hextets) return true;
  const [h0, h1, h2, h3, h4, h5, h6, h7] = hextets as [number, number, number, number, number, number, number, number];
  const embedded = [h6 >> 8, h6 & 0xff, h7 >> 8, h7 & 0xff];

  // :: and ::1, plus the deprecated IPv4-compatible ::a.b.c.d form.
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) return isPrivateIpv4(embedded);
  // IPv4-mapped ::ffff:a.b.c.d.
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0xffff) return isPrivateIpv4(embedded);
  // NAT64 64:ff9b::/96.
  if (h0 === 0x64 && h1 === 0xff9b && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) return isPrivateIpv4(embedded);
  // 6to4 2002::/16 carries an IPv4 address in its next 32 bits.
  if (h0 === 0x2002) return isPrivateIpv4([h1 >> 8, h1 & 0xff, h2 >> 8, h2 & 0xff]);
  // Teredo 2001::/32 and documentation 2001:db8::/32.
  if (h0 === 0x2001 && (h1 === 0 || h1 === 0xdb8)) return true;
  return (
    (h0 & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (h0 & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (h0 & 0xffc0) === 0xfec0 || // site-local fec0::/10
    (h0 & 0xff00) === 0xff00 // multicast ff00::/8
  );
}

/** Expands an address `isIP` has already accepted into eight hextets. */
function parseIpv6(value: string): number[] | null {
  const text = value.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/, (_match, a: string, b: string, c: string, d: string) =>
    `${((Number(a) << 8) | Number(b)).toString(16)}:${((Number(c) << 8) | Number(d)).toString(16)}`,
  );
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(":").map((hex) => Number.parseInt(hex, 16)) : []);
  const head = parse(halves[0] ?? "");
  const rest = halves.length === 2 ? parse(halves[1] ?? "") : [];
  const missing = 8 - head.length - rest.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const hextets = [...head, ...new Array<number>(missing).fill(0), ...rest];
  return hextets.every((hextet) => Number.isInteger(hextet) && hextet >= 0 && hextet <= 0xffff) ? hextets : null;
}

function requestPinned(
  url: URL,
  addresses: LookupAddress[],
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<Response> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = client.request(
      {
        protocol: url.protocol,
        hostname: stripBrackets(url.hostname),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: Object.fromEntries(withUserAgent(headers).entries()),
        // Only ever hand back the addresses that were checked above.
        lookup: (_hostname, options, callback) => {
          if (options.all) {
            callback(null, addresses);
            return;
          }
          const [first] = addresses;
          if (!first) {
            callback(new UnsafeUrlError("URL resolves to a private host."), "", 4);
            return;
          }
          callback(null, first.address, first.family);
        },
      },
      (incoming) => {
        const responseHeaders = new Headers();
        for (const [name, headerValue] of Object.entries(incoming.headers)) {
          if (Array.isArray(headerValue)) for (const item of headerValue) responseHeaders.append(name, item);
          else if (headerValue !== undefined) responseHeaders.set(name, headerValue);
        }
        const status = incoming.statusCode ?? 502;
        incoming.on("close", () => clearTimeout(timer));
        const nullBody = status === 204 || status === 205 || status === 304;
        if (nullBody) incoming.resume();
        settled = true;
        resolve(
          new Response(nullBody ? null : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>), {
            status,
            statusText: incoming.statusMessage,
            headers: responseHeaders,
          }),
        );
      },
    );
    // Bounds the whole exchange, body included; destroying the request also
    // errors the body stream a caller may still be reading.
    const timeoutError = new Error(`Request to ${url.hostname} timed out after ${timeoutMs} ms.`);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      request.destroy(timeoutError);
    }, timeoutMs);
    request.on("error", (error) => {
      clearTimeout(timer);
      // Bun can report the destroyed socket's own error instead of ours.
      fail(timedOut ? timeoutError : error);
    });
    request.end();
  });
}

function withUserAgent(init: ConstructorParameters<typeof Headers>[0]): Headers {
  const headers = new Headers(init);
  if (!headers.has("user-agent")) headers.set("user-agent", DISCOVERY_USER_AGENT);
  return headers;
}

function stripBrackets(value: string): string {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}
