import type { VercelApiHandler, VercelRequest, VercelResponse } from '@vercel/node'
import { messageLog, MessageLogEntry } from '../../lib/message-log'

// ─── Env var checker ──────────────────────────────────────────────────────────
function checkEnvVars() {
  const vars = [
    { key: 'META_WA_ACCESS_TOKEN', label: 'WA Access Token', sensitive: true },
    { key: 'META_WA_WABA_ID', label: 'WABA ID', sensitive: false },
    { key: 'META_WA_SENDER_PHONE_NUMBER_ID', label: 'Sender Phone ID', sensitive: false },
    { key: 'META_WA_VERIFY_TOKEN', label: 'Verify Token', sensitive: true },
    { key: 'HELA_RPC_URL', label: 'Hela RPC URL', sensitive: false },
    { key: 'CRYPTOX_CONTRACT_ADDRESS', label: 'Contract Address', sensitive: false },
    { key: 'ENCRYPTION_KEY', label: 'Encryption Key', sensitive: true },
    { key: 'OPERATOR_PRIVATE_KEY', label: 'Operator Private Key', sensitive: true },
    { key: 'PROD_URL', label: 'Production URL', sensitive: false },
  ]
  return vars.map((v) => {
    const val = process.env[v.key]
    const set = !!val && val.trim() !== ''
    return {
      ...v,
      set,
      display: set
        ? v.sensitive
          ? val!.slice(0, 6) + '••••••••' + ' ✅'
          : val! + ' ✅'
        : '❌ NOT SET',
    }
  })
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function formatIST(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })
}

// ─── Build the HTML page ──────────────────────────────────────────────────────
function buildHtml(req: VercelRequest): string {
  const envVars = checkEnvVars()
  const setCount = envVars.filter((v) => v.set).length
  const totalCount = envVars.length
  const health = Math.round((setCount / totalCount) * 100)

  const incoming = messageLog.filter((m) => m.direction === 'INCOMING')
  const outgoing = messageLog.filter((m) => m.direction === 'OUTGOING')
  const failed = messageLog.filter((m) => m.status === 'FAILED')
  const delivered = messageLog.filter((m) => m.direction === 'OUTGOING' && m.status === 'DELIVERED')

  // Unique users
  const users = [...new Set(messageLog.filter(m => m.direction === 'INCOMING').map(m => m.phone))]

  const webhookUrl = `https://${process.env.PROD_URL || req.headers.host}/api/whatsapp`

  function renderMessage(m: MessageLogEntry) {
    const isIn = m.direction === 'INCOMING'
    const statusColor = m.status === 'DELIVERED' ? '#34d399' : m.status === 'FAILED' ? '#f87171' : '#fbbf24'
    const statusIcon = m.status === 'DELIVERED' ? '✅' : m.status === 'FAILED' ? '❌' : '⏳'
    const dirIcon = isIn ? '📩' : '📤'
    const dirLabel = isIn ? 'USER → BOT' : 'BOT → USER'
    const dirColor = isIn ? '#60a5fa' : '#a78bfa'
    const typeColor = m.type === 'system' ? '#fbbf24' : isIn ? '#60a5fa' : '#a78bfa'

    return `
    <div class="msg-row ${isIn ? 'msg-in' : 'msg-out'}" id="${m.id}">
      <div class="msg-meta">
        <span class="dir-badge" style="color:${dirColor};border-color:${dirColor}40;background:${dirColor}10">${dirIcon} ${dirLabel}</span>
        <span class="type-badge" style="color:${typeColor}">${esc(m.type)}</span>
        <span class="status-badge" style="color:${statusColor}">${statusIcon} ${m.status}</span>
        <span class="time-badge" title="${formatIST(m.timestamp)}">${timeAgo(m.timestamp)}</span>
        ${m.durationMs !== undefined ? `<span class="dur-badge">${m.durationMs}ms</span>` : ''}
      </div>
      <div class="msg-body">
        <div class="msg-from">
          <span class="phone">📱 ${esc(m.phone)}</span>
          <span class="name">${esc(m.name)}</span>
          <span class="full-time">${formatIST(m.timestamp)}</span>
        </div>
        <div class="msg-text">${esc(m.text)}</div>
        ${m.error ? `<div class="msg-error">🔴 ${esc(m.error)}</div>` : ''}
      </div>
    </div>`
  }

  const allMessagesHtml = messageLog.length === 0
    ? `<div class="empty">📭 No messages yet. Send a WhatsApp message to the bot to see it here.</div>`
    : messageLog.map(renderMessage).join('')

  const failedHtml = failed.length === 0
    ? `<div class="empty" style="color:#34d399">✅ No failed messages!</div>`
    : failed.map(renderMessage).join('')

  const envHtml = envVars.map(v => `
    <div class="env-row">
      <span class="env-dot" style="background:${v.set ? '#34d399' : '#f87171'}"></span>
      <span class="env-label">${v.label}</span>
      <code class="env-key">${v.key}</code>
      <span class="env-val" style="color:${v.set ? '#94a3b8' : '#f87171'}">${v.display}</span>
    </div>`).join('')

  const usersHtml = users.length === 0
    ? `<div class="empty">No users yet</div>`
    : users.map(phone => {
        const msgs = messageLog.filter(m => m.phone === phone)
        const lastMsg = msgs[0]
        const name = lastMsg?.name || phone
        const inCount = msgs.filter(m => m.direction === 'INCOMING').length
        const outCount = msgs.filter(m => m.direction === 'OUTGOING').length
        const failCount = msgs.filter(m => m.status === 'FAILED').length
        return `
        <div class="user-row">
          <div class="user-avatar">${name.charAt(0).toUpperCase()}</div>
          <div class="user-info">
            <div class="user-name">${esc(name)}</div>
            <div class="user-phone">${esc(phone)}</div>
          </div>
          <div class="user-stats">
            <span title="Received">📩 ${inCount}</span>
            <span title="Sent">📤 ${outCount}</span>
            ${failCount > 0 ? `<span style="color:#f87171" title="Failed">❌ ${failCount}</span>` : ''}
          </div>
          <div class="user-last" title="${lastMsg ? formatIST(lastMsg.timestamp) : ''}">${lastMsg ? timeAgo(lastMsg.timestamp) : '-'}</div>
        </div>`
      }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="refresh" content="15"/>
  <title>CryptoX Debug — Messages</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#08080f;--s1:#0f0f18;--s2:#17172a;--border:#252538;
      --text:#e2e8f0;--muted:#64748b;
      --green:#34d399;--red:#f87171;--blue:#60a5fa;--yellow:#fbbf24;--purple:#a78bfa;--accent:#6366f1;
    }
    body{background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;min-height:100vh}

    /* ── Header ── */
    .header{background:linear-gradient(135deg,#0d0d1f,#111122);border-bottom:1px solid var(--border);
      padding:16px 28px;display:flex;align-items:center;justify-content:space-between;
      position:sticky;top:0;z-index:100}
    .logo{width:38px;height:38px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:10px;
      display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 18px rgba(99,102,241,.4)}
    .h-title{font-size:18px;font-weight:700;margin-left:12px}
    .h-sub{font-size:11px;color:var(--muted);margin-left:12px}
    .live{display:flex;align-items:center;gap:6px;background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);
      color:var(--green);padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600}
    .live-dot{width:7px;height:7px;background:var(--green);border-radius:50%;animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}
    .refresh-btn{background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);color:var(--purple);
      padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;transition:all .2s}
    .refresh-btn:hover{background:rgba(99,102,241,.25)}

    /* ── Layout ── */
    .main{max-width:1400px;margin:0 auto;padding:24px 28px;display:grid;gap:20px}

    /* ── Stat Cards ── */
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px}
    .stat{background:var(--s1);border:1px solid var(--border);border-radius:12px;padding:18px;position:relative;overflow:hidden}
    .stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--c,var(--accent))}
    .stat-icon{font-size:20px;margin-bottom:8px}
    .stat-val{font-size:26px;font-weight:700;font-family:'JetBrains Mono',monospace}
    .stat-lbl{font-size:11px;color:var(--muted);margin-top:3px}

    /* ── Card ── */
    .card{background:var(--s1);border:1px solid var(--border);border-radius:14px;overflow:hidden}
    .card-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;
      border-bottom:1px solid var(--border);background:var(--s2)}
    .card-title{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
    .badge{background:rgba(99,102,241,.15);color:var(--purple);border:1px solid rgba(99,102,241,.3);
      padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600}
    .card-body{padding:18px 20px}

    /* ── Tabs ── */
    .tabs{display:flex;gap:2px;background:var(--s2);border-radius:10px;padding:4px;margin-bottom:18px}
    .tab{flex:1;padding:8px;border:none;background:transparent;color:var(--muted);font-family:'Inter',sans-serif;
      font-size:13px;font-weight:500;cursor:pointer;border-radius:8px;transition:all .2s;text-align:center}
    .tab.active{background:var(--s1);color:var(--text);border:1px solid var(--border)}
    .tab-panel{display:none}.tab-panel.active{display:block}

    /* ── Message rows ── */
    .msg-row{border-radius:10px;padding:12px 14px;margin-bottom:8px;border:1px solid var(--border);transition:border-color .2s}
    .msg-in{background:rgba(96,165,250,.04);border-left:3px solid var(--blue)}
    .msg-out{background:rgba(167,139,250,.04);border-left:3px solid var(--purple)}
    .msg-in:hover{border-color:var(--blue)}
    .msg-out:hover{border-color:var(--purple)}
    .msg-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
    .dir-badge,.type-badge,.status-badge,.time-badge,.dur-badge{
      font-size:10px;font-weight:600;padding:2px 8px;border-radius:12px;
      border:1px solid currentColor;background:transparent;white-space:nowrap}
    .time-badge{color:var(--muted);border-color:var(--border)}
    .dur-badge{color:var(--muted);border-color:var(--border);font-family:'JetBrains Mono',monospace}
    .msg-body{}
    .msg-from{display:flex;align-items:center;gap:10px;margin-bottom:6px}
    .phone{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--blue)}
    .name{font-size:13px;font-weight:600}
    .full-time{font-size:10px;color:var(--muted);margin-left:auto}
    .msg-text{font-size:14px;line-height:1.5;color:var(--text);word-break:break-word;
      background:var(--s2);border-radius:8px;padding:10px 12px}
    .msg-error{margin-top:8px;font-size:12px;color:var(--red);background:rgba(248,113,113,.08);
      border:1px solid rgba(248,113,113,.2);border-radius:6px;padding:8px 10px;
      font-family:'JetBrains Mono',monospace}

    /* ── Env ── */
    .env-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;margin-bottom:4px;background:var(--s2)}
    .env-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .env-label{font-size:13px;font-weight:500;min-width:160px}
    .env-key{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);
      background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px;flex:1}
    .env-val{font-family:'JetBrains Mono',monospace;font-size:11px;text-align:right;white-space:nowrap}

    /* ── Progress ── */
    .prog-wrap{margin-bottom:18px}
    .prog-lbl{display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px}
    .prog-bar{height:7px;background:var(--s2);border-radius:4px;overflow:hidden}
    .prog-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#6366f1,#34d399);transition:width .5s}

    /* ── Users ── */
    .user-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;
      margin-bottom:6px;background:var(--s2);transition:background .2s}
    .user-row:hover{background:var(--border)}
    .user-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);
      display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0}
    .user-info{flex:1;min-width:0}
    .user-name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .user-phone{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted)}
    .user-stats{display:flex;gap:10px;font-size:12px;color:var(--muted);white-space:nowrap}
    .user-last{font-size:11px;color:var(--muted);white-space:nowrap}

    /* ── Webhook URL ── */
    .url-box{background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;
      display:flex;align-items:center;gap:12px;margin-bottom:12px}
    .url-text{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--blue);flex:1;word-break:break-all}
    .copy-btn{background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);color:var(--purple);
      padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;
      white-space:nowrap;font-family:'Inter',sans-serif;transition:all .2s}
    .copy-btn:hover{background:rgba(99,102,241,.25)}

    /* ── Empty state ── */
    .empty{text-align:center;padding:32px;color:var(--muted);font-size:14px}

    /* ── Two col ── */
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px}
    @media(max-width:900px){.two-col{grid-template-columns:1fr}.main{padding:14px}.header{padding:12px 14px}}

    ::-webkit-scrollbar{width:5px;height:5px}
    ::-webkit-scrollbar-track{background:var(--s1)}
    ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
    .auto-badge{font-size:10px;color:var(--muted);border:1px solid var(--border);padding:2px 8px;border-radius:12px}
  </style>
</head>
<body>

<header class="header">
  <div style="display:flex;align-items:center">
    <div class="logo">₿</div>
    <div>
      <div class="h-title">CryptoX Debug Console</div>
      <div class="h-sub">WhatsApp Message Monitor · Live View</div>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:10px">
    <span class="auto-badge">↻ auto-refresh 15s</span>
    <div class="live"><div class="live-dot"></div>LIVE</div>
    <button class="refresh-btn" onclick="location.reload()">↻ Refresh Now</button>
  </div>
</header>

<main class="main">

  <!-- ── Stats ── -->
  <div class="stats">
    <div class="stat" style="--c:#60a5fa">
      <div class="stat-icon">📩</div>
      <div class="stat-val" style="color:var(--blue)">${incoming.length}</div>
      <div class="stat-lbl">Messages Received</div>
    </div>
    <div class="stat" style="--c:#a78bfa">
      <div class="stat-icon">📤</div>
      <div class="stat-val" style="color:var(--purple)">${outgoing.length}</div>
      <div class="stat-lbl">Bot Replies Sent</div>
    </div>
    <div class="stat" style="--c:#34d399">
      <div class="stat-icon">✅</div>
      <div class="stat-val" style="color:var(--green)">${delivered.length}</div>
      <div class="stat-lbl">Delivered</div>
    </div>
    <div class="stat" style="--c:#f87171">
      <div class="stat-icon">❌</div>
      <div class="stat-val" style="color:var(--red)">${failed.length}</div>
      <div class="stat-lbl">Failed</div>
    </div>
    <div class="stat" style="--c:#fbbf24">
      <div class="stat-icon">👤</div>
      <div class="stat-val" style="color:var(--yellow)">${users.length}</div>
      <div class="stat-lbl">Unique Users</div>
    </div>
    <div class="stat" style="--c:#34d399">
      <div class="stat-icon">⚙️</div>
      <div class="stat-val" style="color:${health === 100 ? 'var(--green)' : health > 60 ? 'var(--yellow)' : 'var(--red)'}">${setCount}/${totalCount}</div>
      <div class="stat-lbl">Env Vars Set</div>
    </div>
  </div>

  <!-- ── Webhook URL ── -->
  <div class="card">
    <div class="card-hd"><div class="card-title">🔗 Webhook Info</div></div>
    <div class="card-body">
      <div class="url-box">
        <div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Callback URL → paste in Meta Developer Console</div>
          <div class="url-text">${esc(webhookUrl)}</div>
        </div>
        <button class="copy-btn" onclick="copyText('${esc(webhookUrl)}',this)">📋 Copy</button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a href="/api/send-test" style="text-decoration:none">
          <button class="copy-btn">💬 Send Test Message</button>
        </a>
        <a href="/api/debug?format=json" target="_blank" style="text-decoration:none">
          <button class="copy-btn">📄 Export JSON</button>
        </a>
        <button class="copy-btn" onclick="clearLogs()">🗑️ Clear Logs</button>
      </div>
    </div>
  </div>

  <!-- ── Messages + Users ── -->
  <div class="two-col">

    <!-- Messages Log -->
    <div class="card">
      <div class="card-hd">
        <div class="card-title">💬 Message Log <span class="badge">${messageLog.length} total</span></div>
      </div>
      <div class="card-body" style="padding:14px">
        <div class="tabs">
          <button class="tab active" onclick="switchTab('all',this)">All (${messageLog.length})</button>
          <button class="tab" onclick="switchTab('in',this)">📩 In (${incoming.length})</button>
          <button class="tab" onclick="switchTab('out',this)">📤 Out (${outgoing.length})</button>
          <button class="tab" onclick="switchTab('fail',this)" style="${failed.length > 0 ? 'color:var(--red)' : ''}">❌ Failed (${failed.length})</button>
        </div>
        <div style="max-height:600px;overflow-y:auto">
          <div class="tab-panel active" id="tab-all">${allMessagesHtml}</div>
          <div class="tab-panel" id="tab-in">${incoming.length === 0 ? '<div class="empty">No incoming messages yet</div>' : incoming.map(renderMessage).join('')}</div>
          <div class="tab-panel" id="tab-out">${outgoing.length === 0 ? '<div class="empty">No outgoing messages yet</div>' : outgoing.map(renderMessage).join('')}</div>
          <div class="tab-panel" id="tab-fail">${failedHtml}</div>
        </div>
      </div>
    </div>

    <!-- Right col: Users + Env -->
    <div style="display:flex;flex-direction:column;gap:20px">

      <!-- Users -->
      <div class="card">
        <div class="card-hd">
          <div class="card-title">👤 Active Users <span class="badge">${users.length}</span></div>
        </div>
        <div class="card-body" style="padding:14px;max-height:320px;overflow-y:auto">
          ${usersHtml}
        </div>
      </div>

      <!-- Env Vars -->
      <div class="card">
        <div class="card-hd">
          <div class="card-title">🔐 Env Config <span class="badge">${setCount}/${totalCount}</span></div>
        </div>
        <div class="card-body" style="padding:14px">
          <div class="prog-wrap">
            <div class="prog-lbl">
              <span>Config Health</span>
              <span style="color:${health===100?'var(--green)':health>60?'var(--yellow)':'var(--red)'}">${health}%</span>
            </div>
            <div class="prog-bar"><div class="prog-fill" style="width:${health}%"></div></div>
          </div>
          ${envHtml}
        </div>
      </div>

    </div>
  </div>

</main>

<script>
  function switchTab(name, btn) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + name).classList.add('active');
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => btn.textContent = orig, 2000);
    });
  }

  async function clearLogs() {
    await fetch('/api/debug?action=clear');
    location.reload();
  }
</script>
</body>
</html>`
}

// ─── Handler ──────────────────────────────────────────────────────────────────
const handler: VercelApiHandler = (req: VercelRequest, res: VercelResponse) => {

  // Clear logs action
  if (req.query.action === 'clear') {
    messageLog.splice(0, messageLog.length)
    res.status(200).json({ ok: true, message: 'Logs cleared' })
    return
  }

  // JSON export
  if (req.query.format === 'json') {
    res.status(200).json({
      serverTime: new Date().toISOString(),
      totalMessages: messageLog.length,
      messages: messageLog,
      env: checkEnvVars().map(v => ({ key: v.key, set: v.set })),
    })
    return
  }

  // HTML dashboard
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(buildHtml(req))
}

export default handler
