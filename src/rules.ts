export interface Rule {
  name: string;
  reason: string;
  /** Must carry the `g` flag; it is used with String#matchAll. */
  pattern: RegExp;
  /** Return the secret within a match, or null to discard the match. Defaults to the whole match. */
  secret?: (match: RegExpMatchArray) => string | null;
  /** The match is not itself sensitive (e.g. a PEM header), so report it unredacted. */
  public?: boolean;
}

export const MIN_GENERIC_LENGTH = 8;
export const MIN_GENERIC_ENTROPY = 3.5;

const PLACEHOLDERS = [/changeme/i, /example/i, /\$\{/, /process\.env/];

export function isPlaceholder(value: string): boolean {
  return PLACEHOLDERS.some((p) => p.test(value));
}

/** Shannon entropy in bits per character. */
export function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const c of value) counts.set(c, (counts.get(c) ?? 0) + 1);
  let total = 0;
  for (const n of counts.values()) total += n;
  let entropy = 0;
  for (const n of counts.values()) {
    const p = n / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function looksLikeSecretValue(value: string): boolean {
  if (value.length < MIN_GENERIC_LENGTH) return false;
  if (/[\s(]/.test(value)) return false; // prose or a function call
  if (value.startsWith('http') || value.startsWith('/')) return false; // URL or path
  if (/^[A-Za-z_$][\w$]*(\.[\w$]+)+$/.test(value)) return false; // member access, e.g. config.apiKey
  if (isPlaceholder(value)) return false;
  return shannonEntropy(value) >= MIN_GENERIC_ENTROPY;
}

// Order matters: scan() skips matches overlapping an earlier rule's match,
// so specific rules must come before the generic assignment rule.
export const rules: Rule[] = [
  {
    name: 'aws-access-key',
    reason: 'AWS access key ID',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    name: 'github-token',
    reason: 'GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b/g,
  },
  {
    name: 'private-key',
    reason: 'Private key block',
    pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g,
    public: true,
  },
  {
    name: 'slack',
    reason: 'Slack token or webhook URL',
    pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}|https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g,
  },
  {
    name: 'stripe-live-key',
    reason: 'Stripe live secret key',
    pattern: /\b[sr]k_live_[A-Za-z0-9]{24,}\b/g,
  },
  {
    name: 'google-api-key',
    reason: 'Google API key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g,
  },
  {
    name: 'jwt',
    reason: 'JSON Web Token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    name: 'generic-assignment',
    reason: 'High-entropy value assigned to a secret-like name',
    pattern:
      /(?:password|passwd|pwd|secret|token|api[_-]?key)\w{0,40}["']?\s*(?:=>|:=|[:=](?!=))\s*(?:(?<q>["'`])(?<quoted>.*?)\k<q>|(?<bare>[^\s"'`,;)}\]]+))/gi,
    secret: (m) => {
      const value = m.groups?.quoted ?? m.groups?.bare ?? '';
      return looksLikeSecretValue(value) ? value : null;
    },
  },
];
