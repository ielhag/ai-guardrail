# Feasibility findings: coaching users before risky AI use, from the browser

**Question.** Can a browser extension reliably detect a risky moment with an AI tool, and step in before the user acts, without breaking their work?

**Short answer.** Yes for pasted secrets and personal data on the main chat sites. Partly for typed-then-sent text. Weak for sign-up detection. No for anything outside the browser.

Built as a one-week feasibility study. Everything below comes from the demo in this repo.

## What I built
A Manifest V3 Chrome extension (about 250 lines, no dependencies):
1. **Paste check:** intercepts paste on ChatGPT, Claude, Gemini, Perplexity, Copilot, DeepSeek and Poe before the text reaches the page. If it finds a secret or personal data, it offers *Redact and continue*, *Continue anyway* (logged), or *Cancel*.
2. **Send check:** intercepts both Enter and the Send button and scans the composer, catching text that was typed or edited rather than pasted.
3. **Work-identity notice:** when a work email is entered on an AI tool, a non-blocking notice asks the user to check that the tool is approved.
4. **Inventory:** the popup lists which AI tools were used and every intervention, with what the user chose.

Detection runs locally. Prompt text never leaves the browser.

## Evidence
| Measure | Result | Caveat |
|---|---|---|
| Risky samples caught | 20/20 | I wrote these samples myself |
| False alarms on normal prompts | 0/23 | Small, hand-picked set; real prompts will do worse |
| Scan time | ~0.02 ms per prompt | Far below one frame (16 ms); typing isn't affected |
| Live paste interception (ChatGPT, Claude, Gemini) | Works (manual test, Oct 2026) | |
| Live send interception (Enter + Send button) | Enter works; Send button works in manual tests, not retested on every site | Button found by a per-site selector list |

Run `node test.cjs` to reproduce the numbers.

**A false-alarm fix:** the first version flagged every email address, so "reply to jane@acme.com" set it off. Now only a *list* of 2+ distinct addresses (an exported customer list) is flagged. Single addresses are normal in prompts, and a guardrail that cries wolf gets disabled.

**A bug the test found:** `DB_PASSWORD=...` was missed because a regex word boundary doesn't fire after `_`. Pattern rules fail silently in exactly this way, so a labelled corpus that runs in CI is a requirement, not a nice-to-have.

## Where it holds and where it breaks
| Works reliably | Fragile | Can't be done from the browser |
|---|---|---|
| Paste interception (standard `paste` event, captured before the page sees it) | **Send interception.** Depends on each site using Enter or a known button. Replaying Enter after "Continue" is a synthetic event; a site that checks `isTrusted` ignores it. | Desktop apps (ChatGPT desktop, Claude desktop, IDE copilots) |
| Secrets with fixed shapes (AWS, GitHub, Slack, provider API keys, private keys, JWTs) | Personal data. Emails, card numbers and SSNs are easy to match but noisy in context: "email jane@..." may be fine on an approved tool. | AI built into other SaaS (Notion AI, Slack AI, M365 Copilot); the text never touches a page we watch |
| Local logging and inventory | Sign-up detection. Many sign-ups are SSO buttons or multi-step single-page apps, not an email field. | Other browsers, personal devices, mobile |
| Speed | Page structure. Composers are React or ProseMirror editors that change without notice, and `execCommand('insertText')` is deprecated, though still the most reliable way to edit them | File uploads and screenshots (would need upload interception plus OCR) |

### Known gaps (checked, not fixed)
- **Other ways in:** drag-and-drop, file uploads, screenshots, voice input, Ctrl/Cmd+Enter on some sites, and editors inside iframes.
- **Detection:** secrets split across lines or base64-encoded; SSNs without dashes; Stripe (`sk_live_`), Google (`AIza…`) and Azure key formats not covered yet; about 1 in 10 random long numbers passes the card checksum by chance.
- **Coverage:** new AI sites until they're added to the list; incognito; other browsers; desktop apps; AI inside Word or Slack; and a user who disables the extension.
- **Work-email notice:** misses SSO-button sign-ups and fires on tools that are already approved.
- **Logging:** two tabs logging at the same moment can drop one entry (read-modify-write on local storage).

## How it should fail
- **If detection errors:** let the action through and log it. A guardrail that blocks work when it breaks gets uninstalled.
- **If a site changes its structure:** paste checks keep working (they use the event, not the page structure). Send checks degrade quietly. Report the coverage gap to admins, not to users.
- **If the extension is disabled:** that is the real gap, and only device management (forcing the extension on through policy) fixes it.

## What I'd drop, and why
- **Per-site DOM scraping to read conversations:** too fragile to maintain across 7+ sites that ship weekly. Hook events, not page structure.
- **Blocking on medium-severity personal data:** too many false alarms. Coach only, unless the tool isn't approved.
- **Regex for "is this confidential?":** doesn't work for prose (strategy docs, code). That needs a model call, which brings latency and privacy cost; see next steps.

## Why this layer exists, and how it earns trust
**Why not inside ChatGPT, Claude or Gemini?**
- **Only the customer knows what's sensitive.** A vendor can catch API keys, but "Q3 pricing" or "patients from clinic X" are sensitive only under one company's policy.
- **One policy across every tool.** Employees use dozens of AI tools, including unapproved ones that will never enforce a policy they don't know exists.
- **Incentives.** Every warning adds friction to the product, so the AI vendors will build enterprise controls, but stepping in at the moment of use works against their own growth.
- **Server-side is too late.** If the vendor redacts after receiving the text, the data has already left the company. Checking on the device is the only way it never leaves.

The AI vendors don't need to trust this layer. It runs on the employer's managed device, like antivirus or a password manager. The same pattern played out with email (built-in spam filtering, plus email security vendors) and cloud apps (built-in controls, plus a separate layer that sees across all of them).

**Why would a customer trust it with its policy and data?**
- **Keep as little as possible.** Detection runs on the device. Only event metadata goes back ("secret pasted into an unapproved tool, user redacted"), never the secret or the prompt. This demo already works that way.
- **Customer-owned policy.** The security team sets the rules. The vendor provides the system and the defaults.
- **What a company would need before deploying it:** a security review, a data processing agreement, and, for a vendor, SOC 2 or ISO 27001.
- **The honest risk:** an agent next to every user is a valuable target, and if it fails, it fails everywhere (the 2024 CrowdStrike outage). So staged rollouts and the fail-open behaviour described above are requirements, not extras.

## Next steps
The fuller plan is in the [README](README.md#how-it-could-grow-for-b2b-teams). The first four:
1. Make tool approval drive the decision: the same paste is fine on an approved tool and coached on an unknown one.
2. Build a labelled corpus from real (consented) prompts, and gate rule changes on precision and recall in CI.
3. Run a small local classifier for confidential prose, and only on paste over N characters, to keep latency low.
4. Ship a managed-browser deployment through MDM so the extension can't be turned off.
