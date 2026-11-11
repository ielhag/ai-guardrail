// Runs on AI tool sites. Intercepts paste and send, coaches before risky data leaves the browser.
const { scan, redact, isWorkEmail } = globalThis.SkDetect;
const tool = location.hostname.replace(/^www\./, '');
let bypass = false;
// Values the user already chose to share on this page, so we don't ask twice (paste, then send).
const approved = new Set();
const unapproved = f => f.filter(x => !approved.has(x.match));

const log = ev => chrome.storage.local.get({ events: [] }, ({ events }) => {
  events.push({ t: Date.now(), tool, ...ev });
  chrome.storage.local.set({ events: events.slice(-500) });
});
log({ type: 'visit' }); // inventory: which AI tools are in use

const isComposer = el => el && (el.tagName === 'TEXTAREA' || el.isContentEditable);
const composerOf = el => el?.closest?.('textarea,[contenteditable="true"]') || el;
const textOf = el => el.value ?? el.innerText ?? '';
const summary = f => [...new Set(f.map(x => x.label))].join(', ');
const worst = f => f.some(x => x.sev === 'high') ? 'high' : 'medium';

// 1) Paste: stop it before the text lands in the box.
document.addEventListener('paste', e => {
  const el = composerOf(e.target);
  if (!isComposer(el)) return;
  const text = e.clipboardData?.getData('text/plain');
  const f = unapproved(scan(text));
  if (!f.length) return;
  e.preventDefault(); e.stopImmediatePropagation();
  coach(f, 'You are pasting', choice => {
    log({ type: 'paste', sev: worst(f), found: summary(f), choice });
    if (choice === 'cancel') return;
    if (choice === 'send') f.forEach(x => approved.add(x.match));
    el.focus();
    document.execCommand('insertText', false, choice === 'redact' ? redact(text) : text);
  });
}, true);

// 2) Send: catch text that was typed rather than pasted, whether sent by Enter or the Send button.
// Note: per-site selector list; breaks when a site renames its button (see FINDINGS.md)
const SEND_BTN = 'button[data-testid="send-button"], button[aria-label*="send" i], button.send-button';
// Prefer the Send button nearest the composer, so a page-level "Send feedback" button is never clicked.
function sendButtonFor(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const b = n.querySelector?.(SEND_BTN);
    if (b) return b;
  }
  return null;
}
let lastComposer = null;
document.addEventListener('focusin', e => { const el = composerOf(e.target); if (isComposer(el)) lastComposer = el; }, true);

function guardSend(e, el, resend) {
  const text = textOf(el);
  const f = unapproved(scan(text));
  if (!f.length) return;
  e.preventDefault(); e.stopImmediatePropagation();
  coach(f, 'You are about to send', choice => {
    log({ type: 'send', sev: worst(f), found: summary(f), choice });
    if (choice === 'cancel') return;
    if (choice === 'send') f.forEach(x => approved.add(x.match));
    el.focus();
    if (choice === 'redact') { document.execCommand('selectAll'); document.execCommand('insertText', false, redact(text)); }
    bypass = true;
    // Let the editor apply the redaction before the page reads the box.
    setTimeout(() => { resend(); bypass = false; }, 50);
  });
}

document.addEventListener('keydown', e => {
  if (bypass || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  const el = composerOf(e.target);
  if (!isComposer(el)) return;
  guardSend(e, el, () => {
    const btn = sendButtonFor(el);
    // Clicking the real button is more reliable than a synthetic Enter, which sites checking isTrusted ignore.
    if (btn) btn.click();
    else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  });
}, true);

document.addEventListener('click', e => {
  if (bypass) return;
  const btn = e.target.closest?.(SEND_BTN);
  if (!btn || !lastComposer?.isConnected) return;
  guardSend(e, lastComposer, () => btn.click());
}, true);

// 3) Sign-up / sign-in with a work email: notice only, never blocks.
let warnedEmail = '';
document.addEventListener('focusout', e => {
  const v = e.target?.type === 'email' || /email/i.test(e.target?.name || '') ? e.target.value : '';
  if (!v || v === warnedEmail || !isWorkEmail(v)) return;
  warnedEmail = v;
  log({ type: 'work-identity', found: v.split('@').pop() });
  notice(`You're using your work email (${v.split('@').pop()}) on ${tool}. Check that this AI tool is approved before you connect company data.`);
}, true);

// ---- UI (shadow DOM so the host page's CSS can't touch it) ----
function mount() {
  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;inset:auto 16px 16px auto';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    .card{font:14px/1.45 system-ui,sans-serif;background:#fff;color:#1d2125;border:1px solid #d0d5db;border-left:4px solid var(--c);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.18);padding:14px 16px;max-width:360px}
    h2{font-size:15px;margin:0 0 4px}p{margin:0 0 10px}.row{display:flex;gap:8px;flex-wrap:wrap}
    button{font:inherit;border-radius:7px;border:1px solid #c3c9d0;background:#fff;padding:6px 10px;cursor:pointer}
    button.primary{background:var(--c);border-color:var(--c);color:#fff}button:focus-visible{outline:2px solid #1a73e8;outline-offset:2px}
    @media (prefers-color-scheme:dark){.card{background:#1f2328;color:#e6e9ec;border-color:#3a4048}button{background:#2a3037;color:#e6e9ec;border-color:#4a525c}}
  </style>`;
  document.documentElement.append(host);
  return { host, root };
}

function coach(findings, verb, done) {
  const { host, root } = mount();
  const high = worst(findings) === 'high';
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'alertdialog');
  card.style.setProperty('--c', high ? '#c5221f' : '#b06000');
  card.innerHTML = `<h2></h2><p></p><div class="row">
    <button class="primary" data-c="redact">Redact and continue</button>
    <button data-c="send">Continue anyway</button>
    <button data-c="cancel">Cancel</button></div>`;
  card.querySelector('h2').textContent = high ? 'This looks like a secret' : 'This looks like personal data';
  card.querySelector('p').textContent = `${verb} ${summary(findings)} into ${tool}. ` +
    (high ? 'Anyone with this value may be able to access your systems.' : 'Check that sharing it here is allowed.');
  const finish = c => { host.remove(); done(c); };
  card.addEventListener('click', e => e.target.dataset.c && finish(e.target.dataset.c));
  card.addEventListener('keydown', e => e.key === 'Escape' && finish('cancel'));
  root.append(card);
  card.querySelector('button').focus();
}

function notice(msg) {
  const { host, root } = mount();
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'status');
  card.style.setProperty('--c', '#1a73e8');
  card.innerHTML = '<p></p><div class="row"><button class="primary">Got it</button></div>';
  card.querySelector('p').textContent = msg;
  card.querySelector('button').onclick = () => host.remove();
  root.append(card);
  setTimeout(() => host.remove(), 12000);
}
