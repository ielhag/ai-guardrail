// Pure detection logic, shared by the extension and the Node test (no DOM, no chrome.* here).
(function (g) {
  const RULES = [
    // high: credentials that grant access on their own
    { id: 'aws-key', sev: 'high', label: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
    { id: 'llm-key', sev: 'high', label: 'AI provider API key', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g },
    { id: 'github-token', sev: 'high', label: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g },
    { id: 'slack-token', sev: 'high', label: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
    { id: 'private-key', sev: 'high', label: 'Private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
    { id: 'jwt', sev: 'high', label: 'Session token (JWT)', re: /\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g },
    { id: 'secret-assign', sev: 'high', label: 'Hard-coded secret', re: /(?<![a-z])(?:api[_-]?key|secret|passw(?:or)?d|token)\s*[:=]\s*['"]?[^\s'"]{8,}/gi },
    // medium: personal or regulated data
    { id: 'ssn', sev: 'medium', label: 'US Social Security number', re: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g },
    { id: 'card', sev: 'medium', label: 'Payment card number', re: /\b(?:\d[ -]?){12,18}\d\b/g, check: luhn },
    { id: 'email', sev: 'medium', label: 'List of email addresses', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  ];

  const EMAIL_LIST_MIN = 2;

  function luhn(s) {
    const d = s.replace(/\D/g, '');
    if (d.length < 13 || d.length > 19) return false;
    let sum = 0;
    for (let i = 0; i < d.length; i++) {
      let n = +d[d.length - 1 - i];
      if (i % 2) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
    }
    return sum % 10 === 0;
  }

  // Returns [{id, sev, label, match}] — one entry per hit.
  function scan(text) {
    const out = [];
    if (!text) return out;
    for (const r of RULES) {
      for (const m of text.matchAll(r.re)) {
        if (!r.check || r.check(m[0])) out.push({ id: r.id, sev: r.sev, label: r.label, match: m[0] });
      }
    }
    // A single address ("reply to jane@...") is normal; a list of them looks like exported customer data.
    // Note: count threshold, not context; a real product would weigh approved tool + user's own domain
    const emails = new Set(out.filter(f => f.id === 'email').map(f => f.match.toLowerCase()));
    return emails.size >= EMAIL_LIST_MIN ? out : out.filter(f => f.id !== 'email');
  }

  function redact(text) {
    let t = text;
    for (const r of RULES) t = t.replace(r.re, m => (!r.check || r.check(m)) ? `[REDACTED ${r.label}]` : m);
    return t;
  }

  // Note: short static list; a real deployment would pull a maintained free-mail domain list
  const PERSONAL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com']);
  const isWorkEmail = e => /@/.test(e) && !PERSONAL.has(e.split('@').pop().toLowerCase().trim());

  const api = { scan, redact, isWorkEmail, RULES };
  g.SkDetect = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
