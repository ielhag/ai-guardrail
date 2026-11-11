const row = (...cells) => { const tr = document.createElement('tr'); for (const c of cells) tr.insertCell().textContent = c; return tr; };
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`; };

chrome.storage.local.get({ events: [] }, ({ events }) => {
  const tools = {};
  for (const e of events) (tools[e.tool] ??= { n: 0, risky: 0 }), tools[e.tool].n++, e.type !== 'visit' && tools[e.tool].risky++;
  const tt = document.getElementById('tools');
  for (const [k, v] of Object.entries(tools)) tt.append(row(k, `${v.risky} flagged`));
  if (!events.length) tt.append(row('Nothing yet', ''));

  const et = document.getElementById('events');
  for (const e of events.filter(e => e.type !== 'visit').slice(-15).reverse()) {
    const tr = row(`${e.tool}: ${e.found}`, `${e.choice ?? 'notice'} · ${ago(e.t)}`);
    tr.className = e.sev ?? '';
    et.append(tr);
  }
});
document.getElementById('clear').onclick = () => chrome.storage.local.set({ events: [] }, () => location.reload());
