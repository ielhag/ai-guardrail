# AI Guardrail

A small Chrome extension that coaches people **before** they paste or send secrets or personal data to an AI chat tool, and keeps a local inventory of which AI tools are being used.

About 250 lines, no dependencies, and nothing leaves the browser.

## Why I built it
Companies want their people using AI tools, but the riskiest moment is only a few seconds long: someone pastes an API key, a customer list, or patient details into a chat box to get help faster. Banning AI pushes that work to personal devices. Filtering on the server sees the data only after it has left the company.

I wanted to answer one question in a week: **can a browser extension catch that moment reliably, and coach the person instead of blocking them, without breaking their work?**

The short answer is yes for pasted secrets and personal data on the main chat sites, partly for typed-then-sent text, and no for anything outside the browser. **[MEMO.md](MEMO.md)** has the evidence, what's fragile, and what I'd drop.

## What it does
- **Paste check:** catches a risky paste on ChatGPT, Claude, Gemini, Perplexity, Copilot, DeepSeek and Poe before the page sees it, and offers *Redact and continue*, *Continue anyway* (logged), or *Cancel*.
- **Send check:** scans the message on Enter or the Send button, for text that was typed or edited rather than pasted.
- **Work-identity notice:** a gentle reminder when a work email is entered on an AI tool.
- **Inventory:** the popup lists which AI tools were used and every intervention, with what the person chose.

## Try it
1. `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick this folder.
2. Open chatgpt.com or claude.ai and paste `AKIA` followed by 16 capital letters or digits (a fake AWS key shape).
3. Choose **Redact and continue**, then open the extension popup to see the log.

## Test
```
node test.cjs   # detection accuracy, false alarms, and scan time
```
Current result: 20/20 risky samples caught, 0/23 false alarms, about 0.03 ms per scan. The samples are hand-written, so treat these as a floor for the test suite, not a claim about real-world accuracy.

## Files
| File | What it does |
|---|---|
| `detect.js` | Detection rules and redaction (pure, no browser APIs) |
| `content.js` | Paste, send and work-email interception, plus the coaching card |
| `popup.html/js` | AI tool inventory and intervention log |
| `test.cjs` | Risky and normal prompts, with accuracy and timing checks |

## Status
A feasibility demo, not a product. Rules are regular expressions, and the known gaps are listed in [MEMO.md](MEMO.md#known-gaps-checked-not-fixed).

## Use cases
| Team | The risky moment | What the guardrail does |
|---|---|---|
| **Engineering** | Pasting a stack trace with an API key, a `.env` file, or a private key to debug faster | Catches fixed-shape secrets (AWS, GitHub, Slack, provider keys, JWTs, private keys) and offers to redact them before sending |
| **Healthcare** | Asking an AI to summarize notes that include patient identifiers | Flags SSNs and other identifiers, and reminds the person to use the approved, compliant tool |
| **Support and sales** | Pasting a customer export or a list of emails to draft outreach | Flags lists of email addresses and card numbers, while leaving a single address in a normal prompt alone |
| **Finance and legal** | Drafting with deal names, pricing, or contract terms | With company-defined keywords and code names (see the roadmap), coaches before confidential terms leave |
| **Regulated industries** | Pasting text that carries company-defined markings, like a "Proprietary" or controlled-document legend, into an unapproved tool | With markings configured by the company, coaches before that text is sent and points to the approved tool |
| **Security and IT** | Not knowing which AI tools people actually use | The inventory shows every AI tool used and every intervention, which is the starting point for an approved-tools list |
| **Policy rollout** | People don't remember the AI policy they signed | The coaching card explains the rule at the moment it matters, which teaches better than annual training |

## Using it with local models
Local models fit this tool in three ways, and none of them needs data to leave the device or the company network.

**1. A local model as the detector.** Regular expressions catch secrets with a fixed shape, but not "this paragraph is our unreleased roadmap". A small model running locally can judge that without sending the text anywhere:
- **Ollama, llama.cpp or LM Studio on the laptop:** the extension calls `http://localhost:11434` (Ollama's default). Add it to `host_permissions` in `manifest.json`, and allow the extension's origin in Ollama with `OLLAMA_ORIGINS=chrome-extension://*`.
- **In the extension itself:** a small classifier through Transformers.js or ONNX Runtime Web (WebGPU or WASM), or Chrome's built-in Prompt API where it's available. No separate install for users.
- **Keep it fast:** run the model only on long pastes, after the regex rules, with a short timeout. If the model is slow or missing, fail open and fall back to the rules.

**2. A local model as the safe alternative.** Instead of only *Redact* or *Cancel*, offer **"Send to our internal model"**: open the same prompt in a company-hosted model (Ollama, vLLM or Open WebUI on the internal network). People keep working, and the sensitive text stays inside.

**3. Local tools in the inventory.** Add internal AI front ends (for example an Open WebUI address) to the approved list, so the inventory shows how much work has moved to approved, private tools over time.

A starting point for option 1:
```js
// Ask a local model whether a long paste looks confidential. Fail open on any error.
async function looksConfidential(text) {
  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      signal: AbortSignal.timeout(1500),
      body: JSON.stringify({
        model: 'llama3.2:1b',
        stream: false,
        prompt: 'Answer only YES or NO. Does this text contain confidential business information?\n\n' + text.slice(0, 4000),
      }),
    });
    return /^\s*yes/i.test((await res.json()).response);
  } catch {
    return false;
  }
}
```

## How it could grow for B2B teams
The demo proves the moment can be caught. Turning it into something a company can roll out takes five steps, roughly in this order:

1. **Policy the company owns.** Admins define what's sensitive for *them*: customer identifiers, project code names, internal hostnames, custom patterns. Tool approval drives the decision, so the same paste is fine on an approved tool and coached on an unknown one.
2. **Deploy and manage centrally.** Force-install through Chrome Enterprise or MDM so it can't be switched off, push policy from one place, and port to Edge and Firefox.
3. **Visibility for security teams, without the content.** Send event metadata only ("secret pasted into an unapproved tool, user redacted"), never the prompt, to a SIEM or webhook. A dashboard shows which AI tools are in use, including unapproved ones.
4. **Better detection.** A labelled test corpus in CI that gates every rule change on precision and recall, a small on-device classifier for confidential prose, and coverage for file uploads and drag-and-drop.
5. **Beyond the browser.** The same coaching in IDEs, Office and Outlook add-ins, and chat tools, plus a way for people to request approval for a new tool or a quick review, instead of guessing.

Principles to keep through all of it:
- **Coach before blocking.** A guardrail that cries wolf gets disabled.
- **Fail open.** If detection breaks, let the work through and log it.
- **Keep as little as possible.** Detection runs on the device; content never leaves it.
- **The customer owns the policy.** The tool provides the system and sensible defaults.

## Contributing
Issues and pull requests are welcome. If you add or change a rule, add risky and normal examples to `test.cjs` so the numbers stay honest.

## License
[MIT](LICENSE)
