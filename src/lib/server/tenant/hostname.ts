// Pure, dependency-free hostname parsing so it can run inside middleware
// (edge runtime) and be unit tested without a DB or Next.js request context.

export interface ParsedHost {
  /** The subdomain label if this looks like a platform subdomain, else null. */
  subdomain: string | null;
  /** True if the hostname is exactly the root platform domain (e.g. myplatform.com). */
  isRootDomain: boolean;
  /** The raw hostname, lowercased, with any port stripped. */
  hostname: string;
}

export function parseHost(rawHost: string, rootDomain: string): ParsedHost {
  const hostname = rawHost.toLowerCase().split(":")[0];
  const root = rootDomain.toLowerCase().split(":")[0];

  if (hostname === root) {
    return { subdomain: null, isRootDomain: true, hostname };
  }

  if (hostname.endsWith(`.${root}`)) {
    const label = hostname.slice(0, hostname.length - root.length - 1);
    // A label with a dot in it (e.g. "a.b.myplatform.com") is not a
    // single-level tenant subdomain; treat it as unresolved rather than
    // guessing.
    if (label && !label.includes(".")) {
      return { subdomain: label, isRootDomain: false, hostname };
    }
  }

  return { subdomain: null, isRootDomain: false, hostname };
}

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}
