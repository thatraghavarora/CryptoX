import type { VercelApiHandler, VercelRequest, VercelResponse } from '@vercel/node'

// ─── No cross-function imports — this page is fully self-contained ─────────────
// Logs are fetched client-side from /api/whatsapp?action=logs (same process)

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function checkEnvVars() {
  return [
    { key: 'META_WA_ACCESS_TOKEN', label: 'WA Access Token', sensitive: true },
    { key: 'META_WA_WABA_ID', label: 'WABA ID', sensitive: false },
    { key: 'META_WA_SENDER_PHONE_NUMBER_ID', label: 'Sender Phone ID', sensitive: false },
    { key: 'META_WA_VERIFY_TOKEN', label: 'Verify Token', sensitive: true },
    { key: 'HELA_RPC_URL', label: 'Hela RPC URL', sensitive: false },
    { key: 'CRYPTOX_CONTRACT_ADDRESS', label: 'Contract Address', sensitive: false },
    { key: 'ENCRYPTION_KEY', label: 'Encryption Key', sensitive: true },
    { key: 'OPERATOR_PRIVATE_KEY', label: 'Operator Key', sensitive: true },
    { key: 'PROD_URL', label: 'Production URL', sensitive: false },
  ].map((v) => {
    const val = process.env[v.key]
    const set = !!val && val.trim() !== ''
    return {
      ...v,
      set,
      display: set
        ? v.sensitive
          ? val!.slice(0, 5) + '••••••' + ' ✅'
          : esc(val!) + ' ✅'
        : '❌ NOT SET',
    }
  })
}

function buildHtml(req: VercelRequest): string {
  const envVars = checkEnvVars()
  const setCount = envVars.filter((v) => v.set).length
  const totalCount = envVars.length
  const health = Math.round((setCount / totalCount) * 100)
  const host = process.env.PROD_URL
    ? `https://${process.env.PROD_URL}`
    : `https://${req.headers.host}`
  const webhookUrl = `${host}/api/whatsapp`
  const logsUrl = `/api/whatsapp?action=logs`

  const envRows = envVars
    .map(
      (v) => `
    <div class="env-row ${v.set ? 'env-ok' : 'env-bad'}">
      <span class="env-dot" style="background:${v.set ? '#34d399' : '#f87171'}"></span>
      <span class="env-label">${v.label}</span>
      <code class="env-key">${v.key}</code>
      <span class="env-val" style="color:${v.set ? '#94a3b8' : '#f87171'}">${v.display}</span>
    </div>`,
    )
    .join('')

  const nodeVer = process.version
  const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
  const uptime = process.uptime()
  const uptimeStr = `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>CryptoX Debug Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#08080f;--s1:#0f0f18;--s2:#17172a;--border:#252538;
      --text:#e2e8f0;--muted:#64748b;
      --green:#34d399;--red:#f87171;--blue:#60a5fa;--yellow:#fbbf24;--purple:#a78bfa;--accent:#6366f1
    }
    body{background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;min-height:100vh}

    .header{background:linear-gradient(135deg,#0d0d1f,#111122);border-bottom:1px solid var(--border);
      padding:16px 28px;display:flex;align-items:center;justify-content:space-between;
      position:sticky;top:0;z-index:100;backdrop-filter:blur(10px)}
    .logo{width:40px;height:40px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:10px;
      display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 0 20px rgba(99,102,241,.4)}
    .h-left{display:flex;align-items:center;gap:14px}
    .h-title{font-size:18px;font-weight:700}
    .h-sub{font-size:11px;color:var(--muted);margin-top:2px}
    .live-badge{display:flex;align-items:center;gap:6px;background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);
      color:var(--green);padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600}
    .live-dot{width:7px;height:7px;background:var(--green);border-radius:50%;animation:blink 2s infinite}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
    .btn{background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);color:var(--purple);
      padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;
      font-family:'Inter',sans-serif;transition:all .2s}
    .btn:hover{background:rgba(99,102,241,.3)}
    .btn-danger{background:rgba(248,113,113,.15);border-color:rgba(248,113,113,.3);color:var(--red)}
    .btn-danger:hover{background:rgba(248,113,113,.25)}
    .btn-green{background:rgba(52,211,153,.15);border-color:rgba(52,211,153,.3);color:var(--green)}

    .main{max-width:1400px;margin:0 auto;padding:24px 28px;display:flex;flex-direction:column;gap:20px}

    .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px}
    .stat{background:var(--s1);border:1px solid var(--border);border-radius:12px;padding:18px;position:relative;overflow:hidden}
    .stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--c,var(--accent))}
    .stat-icon{font-size:20px;margin-bottom:8px}
    .stat-val{font-size:26px;font-weight:700;font-family:'JetBrains Mono',monospace}
    .stat-lbl{font-size:11px;color:var(--muted);margin-top:3px}

    .card{background:var(--s1);border:1px solid var(--border);border-radius:14px;overflow:hidden}
    .card-hd{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;
      border-bottom:1px solid var(--border);background:var(--s2)}
    .card-title{font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px}
    .badge{background:rgba(99,102,241,.15);color:var(--purple);border:1px solid rgba(99,102,241,.25);
      padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600}
    .card-body{padding:18px 20px}

    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px}

    /* ── Message Log ── */
    .tabs{display:flex;gap:4px;margin-bottom:14px}
    .tab{padding:7px 14px;border:1px solid var(--border);background:var(--s2);color:var(--muted);
      border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;font-family:'Inter',sans-serif;transition:all .2s}
    .tab.active,.tab:hover{border-color:var(--accent);background:rgba(99,102,241,.1);color:var(--purple)}
    .tab-panel{display:none}.tab-panel.active{display:block}
    .msg-list{max-height:520px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}

    .msg{border-radius:10px;padding:12px 14px;border:1px solid var(--border);position:relative}
    .msg-in{background:rgba(96,165,250,.04);border-left:3px solid #60a5fa}
    .msg-out{background:rgba(167,139,250,.04);border-left:3px solid #a78bfa}
    .msg-system{background:rgba(251,191,36,.04);border-left:3px solid #fbbf24}
    .msg-failed{background:rgba(248,113,113,.06);border-left:3px solid #f87171}
    .msg-header{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
    .tag{font-size:10px;font-weight:600;padding:2px 8px;border-radius:12px;border:1px solid;white-space:nowrap}
    .msg-text{font-size:13px;line-height:1.5;background:var(--s2);border-radius:8px;padding:10px 12px;word-break:break-word}
    .msg-error{margin-top:8px;font-size:11px;color:var(--red);background:rgba(248,113,113,.08);
      border:1px solid rgba(248,113,113,.2);border-radius:6px;padding:8px 10px;font-family:'JetBrains Mono',monospace}
    .msg-phone{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--blue)}
    .msg-name{font-size:12px;font-weight:600}
    .msg-time{font-size:10px;color:var(--muted);margin-left:auto;white-space:nowrap}

    /* ── Env ── */
    .env-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;margin-bottom:4px;background:var(--s2)}
    .env-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .env-label{font-size:12px;font-weight:500;min-width:140px}
    .env-key{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);
      background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px;flex:1}
    .env-val{font-family:'JetBrains Mono',monospace;font-size:11px;text-align:right;white-space:nowrap}

    .prog-wrap{margin-bottom:16px}
    .prog-lbl{display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px}
    .prog-bar{height:7px;background:var(--s2);border-radius:4px;overflow:hidden}
    .prog-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#6366f1,#34d399)}

    .url-box{background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;
      display:flex;align-items:center;gap:10px;margin-bottom:10px}
    .url-text{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--blue);flex:1;word-break:break-all}

    .sys-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
    .sys-item{background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:12px}
    .sys-key{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
    .sys-val{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:600;color:var(--blue)}

    .empty{text-align:center;padding:40px;color:var(--muted);font-size:14px}
    .spinner{display:inline-block;width:16px;height:16px;border:2px solid var(--border);
      border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle}
    @keyframes spin{to{transform:rotate(360deg)}}

    .hdr-btns{display:flex;align-items:center;gap:8px}
    @media(max-width:900px){.two-col{grid-template-columns:1fr}.main{padding:14px}.header{padding:12px 14px}}
    ::-webkit-scrollbar{width:5px;height:5px}
    ::-webkit-scrollbar-track{background:var(--s1)}
    ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
  </style>
</head>
<body>

<header class="header">
  <div class="h-left">
    <div class="logo">₿</div>
    <div>
      <div class="h-title">CryptoX Debug Dashboard</div>
      <div class="h-sub">WhatsApp Message Monitor · Live View</div>
    </div>
  </div>
  <div class="hdr-btns">
    <div class="live-badge"><div class="live-dot"></div>LIVE</div>
    <button class="btn" onclick="loadLogs()">↻ Refresh Logs</button>
    <button class="btn btn-danger" onclick="clearLogs()">🗑️ Clear</button>
  </div>
</header>

<main class="main">

  <!-- Stats -->
  <div class="stats-grid" id="stats">
    <div class="stat" style="--c:#60a5fa"><div class="stat-icon">📩</div><div class="stat-val" id="s-in" style="color:var(--blue)">–</div><div class="stat-lbl">Received</div></div>
    <div class="stat" style="--c:#a78bfa"><div class="stat-icon">📤</div><div class="stat-val" id="s-out" style="color:var(--purple)">–</div><div class="stat-lbl">Bot Replies</div></div>
    <div class="stat" style="--c:#34d399"><div class="stat-icon">✅</div><div class="stat-val" id="s-ok" style="color:var(--green)">–</div><div class="stat-lbl">Delivered</div></div>
    <div class="stat" style="--c:#f87171"><div class="stat-icon">❌</div><div class="stat-val" id="s-fail" style="color:var(--red)">–</div><div class="stat-lbl">Failed</div></div>
    <div class="stat" style="--c:#fbbf24"><div class="stat-icon">👤</div><div class="stat-val" id="s-users" style="color:var(--yellow)">–</div><div class="stat-lbl">Users</div></div>
    <div class="stat" style="--c:#34d399"><div class="stat-icon">⚙️</div><div class="stat-val" style="color:${health === 100 ? 'var(--green)' : health > 60 ? 'var(--yellow)' : 'var(--red)'}">${setCount}/${totalCount}</div><div class="stat-lbl">Env Vars</div></div>
  </div>

  <!-- Webhook URL -->
  <div class="card">
    <div class="card-hd"><div class="card-title">🔗 Webhook</div></div>
    <div class="card-body">
      <div class="url-box">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Callback URL → Meta Developer Console</div>
          <div class="url-text">${esc(webhookUrl)}</div>
        </div>
        <button class="btn" onclick="copyText('${esc(webhookUrl)}',this)">📋 Copy</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a href="/api/send-test" style="text-decoration:none"><button class="btn btn-green">💬 Send Test Message</button></a>
        <a href="/api/whatsapp?action=logs" target="_blank" style="text-decoration:none"><button class="btn">📄 Raw JSON Logs</button></a>
        <button class="btn btn-danger" onclick="clearLogs()">🗑️ Clear Logs</button>
      </div>
    </div>
  </div>

  <!-- Messages + Env -->
  <div class="two-col">

    <!-- Message Log -->
    <div class="card">
      <div class="card-hd">
        <div class="card-title">💬 Message Log <span class="badge" id="total-badge">loading…</span></div>
        <span id="loading-spinner" class="spinner"></span>
      </div>
      <div class="card-body" style="padding:14px">
        <div class="tabs">
          <button class="tab active" data-tab="all" onclick="switchTab('all',this)">All</button>
          <button class="tab" data-tab="in" onclick="switchTab('in',this)">📩 In</button>
          <button class="tab" data-tab="out" onclick="switchTab('out',this)">📤 Out</button>
          <button class="tab" data-tab="fail" onclick="switchTab('fail',this)">❌ Failed</button>
        </div>
        <div class="tab-panel active" id="tab-all"><div class="empty">⏳ Loading logs…</div></div>
        <div class="tab-panel" id="tab-in"><div class="empty">⏳ Loading…</div></div>
        <div class="tab-panel" id="tab-out"><div class="empty">⏳ Loading…</div></div>
        <div class="tab-panel" id="tab-fail"><div class="empty">⏳ Loading…</div></div>
      </div>
    </div>

    <!-- Right: Env + System -->
    <div style="display:flex;flex-direction:column;gap:20px">

      <div class="card">
        <div class="card-hd"><div class="card-title">🔐 Environment Config <span class="badge">${setCount}/${totalCount}</span></div></div>
        <div class="card-body" style="padding:14px">
          <div class="prog-wrap">
            <div class="prog-lbl">
              <span>Config Health</span>
              <span style="color:${health===100?'var(--green)':health>60?'var(--yellow)':'var(--red)'}">${health}%</span>
            </div>
            <div class="prog-bar"><div class="prog-fill" style="width:${health}%"></div></div>
          </div>
          ${envRows}
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><div class="card-title">🖥️ System Info</div></div>
        <div class="card-body" style="padding:14px">
          <div class="sys-grid">
            <div class="sys-item"><div class="sys-key">Node.js</div><div class="sys-val">${esc(nodeVer)}</div></div>
            <div class="sys-item"><div class="sys-key">Heap Used</div><div class="sys-val">${memMB} MB</div></div>
            <div class="sys-item"><div class="sys-key">Uptime</div><div class="sys-val">${esc(uptimeStr)}</div></div>
            <div class="sys-item"><div class="sys-key">Host</div><div class="sys-val" style="font-size:10px">${esc(req.headers.host || 'unknown')}</div></div>
          </div>
        </div>
      </div>

    </div>
  </div>

</main>

<script>
const LOGS_URL = '${logsUrl}';
let allLogs = [];
let currentTab = 'all';

function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => { p.classList.remove('active'); p.style.display='none'; });
  btn.classList.add('active');
  currentTab = name;
  const panel = document.getElementById('tab-' + name);
  panel.classList.add('active');
  panel.style.display = 'block';
  renderTab(name);
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  return Math.floor(s/3600) + 'h ago';
}

function formatIST(iso) {
  return new Date(iso).toLocaleString('en-IN', {timeZone:'Asia/Kolkata',hour12:true});
}

function renderMsg(m) {
  const isIn = m.direction === 'INCOMING';
  const isSys = m.type === 'system';
  const isFail = m.status === 'FAILED';
  const cls = isFail ? 'msg-failed' : isSys ? 'msg-system' : isIn ? 'msg-in' : 'msg-out';
  const dirLabel = isIn ? '📩 USER' : isSys ? '⚙️ SYSTEM' : '📤 BOT';
  const dirColor = isIn ? '#60a5fa' : isSys ? '#fbbf24' : '#a78bfa';
  const statusColor = m.status === 'DELIVERED' ? '#34d399' : m.status === 'FAILED' ? '#f87171' : '#fbbf24';
  const statusIcon = m.status === 'DELIVERED' ? '✅' : m.status === 'FAILED' ? '❌' : '⏳';
  const dur = m.durationMs !== undefined ? '<span class="tag" style="color:var(--muted);border-color:var(--border)">' + m.durationMs + 'ms</span>' : '';
  return \`
    <div class="msg \${cls}">
      <div class="msg-header">
        <span class="tag" style="color:\${dirColor};border-color:\${dirColor}40;background:\${dirColor}10">\${dirLabel}</span>
        <span class="tag" style="color:\${statusColor};border-color:\${statusColor}40">\${statusIcon} \${m.status}</span>
        <span class="tag" style="color:var(--muted);border-color:var(--border)">\${m.type}</span>
        \${dur}
        <span class="msg-time" title="\${formatIST(m.timestamp)}">\${timeAgo(m.timestamp)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span class="msg-phone">\${m.phone}</span>
        <span class="msg-name">\${m.name}</span>
        <span style="font-size:10px;color:var(--muted);margin-left:auto">\${formatIST(m.timestamp)}</span>
      </div>
      <div class="msg-text">\${m.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      \${m.error ? '<div class="msg-error">🔴 ' + m.error + '</div>' : ''}
    </div>\`;
}

function renderTab(name) {
  let list;
  if (name === 'in') list = allLogs.filter(m => m.direction === 'INCOMING');
  else if (name === 'out') list = allLogs.filter(m => m.direction === 'OUTGOING');
  else if (name === 'fail') list = allLogs.filter(m => m.status === 'FAILED');
  else list = allLogs;
  const panel = document.getElementById('tab-' + name);
  panel.innerHTML = list.length === 0
    ? '<div class="empty">📭 No messages in this category</div>'
    : '<div class="msg-list">' + list.map(renderMsg).join('') + '</div>';
}

function updateStats(logs) {
  const inc = logs.filter(m => m.direction === 'INCOMING').length;
  const out = logs.filter(m => m.direction === 'OUTGOING').length;
  const ok = logs.filter(m => m.direction === 'OUTGOING' && m.status === 'DELIVERED').length;
  const fail = logs.filter(m => m.status === 'FAILED').length;
  const users = [...new Set(logs.filter(m => m.direction === 'INCOMING').map(m => m.phone))].length;
  document.getElementById('s-in').textContent = inc;
  document.getElementById('s-out').textContent = out;
  document.getElementById('s-ok').textContent = ok;
  document.getElementById('s-fail').textContent = fail;
  document.getElementById('s-users').textContent = users;
  document.getElementById('total-badge').textContent = logs.length + ' total';
  // Update tab labels
  document.querySelectorAll('.tab').forEach(btn => {
    const t = btn.dataset.tab;
    const counts = {all:logs.length, in:inc, out:out, fail:fail};
    btn.textContent = {all:'All ('+counts.all+')', in:'📩 In ('+inc+')', out:'📤 Out ('+out+')', fail:'❌ Failed ('+fail+')'}[t] || btn.textContent;
  });
}

async function loadLogs() {
  document.getElementById('loading-spinner').style.display = 'inline-block';
  try {
    const res = await fetch(LOGS_URL);
    const data = await res.json();
    allLogs = data.logs || [];
    updateStats(allLogs);
    renderTab(currentTab);
  } catch (e) {
    document.getElementById('tab-all').innerHTML = '<div class="empty" style="color:var(--red)">❌ Could not load logs: ' + e.message + '<br><br>Note: Logs live inside the webhook function process. They reset on cold starts.</div>';
  }
  document.getElementById('loading-spinner').style.display = 'none';
}

async function clearLogs() {
  await fetch('/api/whatsapp?action=clear');
  allLogs = [];
  updateStats([]);
  renderTab(currentTab);
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = orig, 2000);
  });
}

// Init
loadLogs();
// Auto-refresh every 10 seconds
setInterval(loadLogs, 10000);
</script>
</body>
</html>`
}

const handler: VercelApiHandler = (req: VercelRequest, res: VercelResponse) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(buildHtml(req))
}

export default handler
