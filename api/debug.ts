import type { VercelApiHandler, VercelRequest, VercelResponse } from '@vercel/node'

// ─── In-memory log store (resets on cold start) ────────────────────────────
export const debugLogs: {
  time: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  data?: unknown
}[] = []

export function addDebugLog(
  level: 'info' | 'warn' | 'error' | 'success',
  message: string,
  data?: unknown,
) {
  debugLogs.unshift({
    time: new Date().toISOString(),
    level,
    message,
    data,
  })
  // Keep only last 100 logs
  if (debugLogs.length > 100) debugLogs.pop()
}

// ─── Env variable checker ───────────────────────────────────────────────────
function checkEnvVars() {
  const vars = [
    { key: 'META_WA_ACCESS_TOKEN', label: 'WhatsApp Access Token', sensitive: true },
    { key: 'META_WA_WABA_ID', label: 'WhatsApp Business Account ID', sensitive: false },
    { key: 'META_WA_SENDER_PHONE_NUMBER_ID', label: 'Sender Phone Number ID', sensitive: false },
    { key: 'META_WA_VERIFY_TOKEN', label: 'Webhook Verify Token', sensitive: true },
    { key: 'WA_BUSSINESS_PHONE_NUMBER', label: 'Business Phone Number', sensitive: false },
    { key: 'SUPABASE_URL', label: 'Supabase URL', sensitive: false },
    { key: 'SUPABASE_ANON_KEY', label: 'Supabase Anon Key', sensitive: true },
    { key: 'QUICK_NODE_URL', label: 'QuickNode RPC URL', sensitive: true },
    { key: 'HELA_RPC_URL', label: 'Hela RPC URL', sensitive: false },
    { key: 'PROD_URL', label: 'Production URL', sensitive: false },
    { key: 'PRIVATE_KEY', label: 'Wallet Private Key', sensitive: true },
    { key: 'CRYPTOX_CONTRACT_ADDRESS', label: 'CryptoX Contract Address', sensitive: false },
    { key: 'ENCRYPTION_KEY', label: 'Encryption Key', sensitive: true },
    { key: 'OPERATOR_PRIVATE_KEY', label: 'Operator Private Key', sensitive: true },
    { key: 'ADMIN_PHONE_NUMBER', label: 'Admin Phone Number', sensitive: false },
    { key: 'BRAZIL_MESSAGE', label: 'Brazil Message', sensitive: false },
  ]

  return vars.map((v) => {
    const val = process.env[v.key]
    const set = !!val && val.trim() !== ''
    let display = 'NOT SET ❌'
    if (set) {
      if (v.sensitive) {
        display = `${val!.slice(0, 4)}${'*'.repeat(Math.max(0, val!.length - 4))} ✅`
      } else {
        display = `${val} ✅`
      }
    }
    return { ...v, set, display }
  })
}

// ─── HTML Builder ───────────────────────────────────────────────────────────
function buildHtml(req: VercelRequest): string {
  const envVars = checkEnvVars()
  const setCount = envVars.filter((v) => v.set).length
  const totalCount = envVars.length
  const configHealth = Math.round((setCount / totalCount) * 100)

  const logColors: Record<string, string> = {
    info: '#60a5fa',
    warn: '#fbbf24',
    error: '#f87171',
    success: '#34d399',
  }

  const logBg: Record<string, string> = {
    info: 'rgba(96,165,250,0.08)',
    warn: 'rgba(251,191,36,0.08)',
    error: 'rgba(248,113,113,0.1)',
    success: 'rgba(52,211,153,0.08)',
  }

  const logIcons: Record<string, string> = {
    info: 'ℹ️',
    warn: '⚠️',
    error: '🔴',
    success: '✅',
  }

  const logsHtml =
    debugLogs.length === 0
      ? `<div class="empty-state">
          <div class="empty-icon">📭</div>
          <p>No logs yet. Logs appear here when WhatsApp webhooks are triggered.</p>
        </div>`
      : debugLogs
          .map(
            (log) => `
        <div class="log-entry" style="border-left: 3px solid ${logColors[log.level]}; background: ${logBg[log.level]}">
          <div class="log-header">
            <span class="log-icon">${logIcons[log.level]}</span>
            <span class="log-level" style="color: ${logColors[log.level]}">${log.level.toUpperCase()}</span>
            <span class="log-time">${new Date(log.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
          </div>
          <div class="log-message">${escapeHtml(log.message)}</div>
          ${log.data ? `<pre class="log-data">${escapeHtml(JSON.stringify(log.data, null, 2))}</pre>` : ''}
        </div>`,
          )
          .join('')

  const envHtml = envVars
    .map(
      (v) => `
    <div class="env-row ${v.set ? 'env-set' : 'env-missing'}">
      <div class="env-label">
        <span class="env-dot" style="background: ${v.set ? '#34d399' : '#f87171'}"></span>
        <span>${v.label}</span>
        <span class="env-key">${v.key}</span>
      </div>
      <div class="env-value">${v.display}</div>
    </div>`,
    )
    .join('')

  const uptime = process.uptime()
  const uptimeStr = `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`
  const nodeVersion = process.version
  const platform = process.platform
  const memUsage = process.memoryUsage()
  const memMB = Math.round(memUsage.heapUsed / 1024 / 1024)
  const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024)

  const webhookUrl = `https://${process.env.PROD_URL || req.headers.host}/api/whatsapp`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CryptoX Debug Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0a0a0f;
      --surface: #111118;
      --surface2: #1a1a24;
      --border: #2a2a3a;
      --text: #e2e8f0;
      --muted: #64748b;
      --green: #34d399;
      --red: #f87171;
      --blue: #60a5fa;
      --yellow: #fbbf24;
      --purple: #a78bfa;
      --accent: #6366f1;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      padding: 0;
    }

    /* ── Header ── */
    .header {
      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0f0f1a 100%);
      border-bottom: 1px solid var(--border);
      padding: 20px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(12px);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .logo {
      width: 42px;
      height: 42px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 0 20px rgba(99,102,241,0.4);
    }

    .header-title { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
    .header-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }

    .live-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(52, 211, 153, 0.1);
      border: 1px solid rgba(52, 211, 153, 0.3);
      color: var(--green);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }

    .live-dot {
      width: 7px;
      height: 7px;
      background: var(--green);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.8); }
    }

    /* ── Main Layout ── */
    .main {
      max-width: 1400px;
      margin: 0 auto;
      padding: 28px 32px;
      display: grid;
      gap: 24px;
    }

    /* ── Stat Cards ── */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px;
      position: relative;
      overflow: hidden;
      transition: border-color 0.2s;
    }

    .stat-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: var(--card-accent, var(--accent));
    }

    .stat-card:hover { border-color: var(--accent); }

    .stat-icon { font-size: 22px; margin-bottom: 10px; }
    .stat-value { font-size: 28px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
    .stat-label { font-size: 12px; color: var(--muted); margin-top: 4px; }

    /* ── Section Cards ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 22px;
      border-bottom: 1px solid var(--border);
      background: var(--surface2);
    }

    .card-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 15px;
      font-weight: 600;
    }

    .card-badge {
      background: rgba(99,102,241,0.15);
      color: var(--purple);
      border: 1px solid rgba(99,102,241,0.3);
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
    }

    .card-body { padding: 20px 22px; }

    /* ── Webhook URL Box ── */
    .url-box {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }

    .url-label { font-size: 11px; color: var(--muted); margin-bottom: 4px; }

    .url-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: var(--blue);
      word-break: break-all;
    }

    .copy-btn {
      background: rgba(99,102,241,0.15);
      border: 1px solid rgba(99,102,241,0.3);
      color: var(--purple);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
    }

    .copy-btn:hover { background: rgba(99,102,241,0.25); }

    /* ── Env Variables ── */
    .env-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 11px 16px;
      border-radius: 8px;
      margin-bottom: 6px;
      gap: 12px;
      transition: background 0.2s;
    }

    .env-set { background: rgba(52,211,153,0.04); }
    .env-missing { background: rgba(248,113,113,0.06); }

    .env-label {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }

    .env-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .env-key {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--muted);
      background: var(--surface2);
      padding: 2px 7px;
      border-radius: 4px;
    }

    .env-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--muted);
      text-align: right;
      flex-shrink: 0;
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ── Progress Bar ── */
    .progress-wrap { margin-bottom: 20px; }

    .progress-label {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      margin-bottom: 8px;
    }

    .progress-bar {
      height: 8px;
      background: var(--surface2);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      border-radius: 4px;
      background: linear-gradient(90deg, #6366f1, #8b5cf6, #34d399);
      transition: width 0.5s ease;
    }

    /* ── Log Entries ── */
    .log-entry {
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 8px;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .log-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .log-icon { font-size: 14px; }

    .log-level {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .log-time {
      font-size: 11px;
      color: var(--muted);
      margin-left: auto;
      font-family: 'JetBrains Mono', monospace;
    }

    .log-message {
      font-size: 13px;
      color: var(--text);
      line-height: 1.5;
    }

    .log-data {
      margin-top: 8px;
      background: rgba(0,0,0,0.3);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--muted);
      overflow-x: auto;
      max-height: 200px;
      overflow-y: auto;
    }

    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--muted);
    }

    .empty-icon { font-size: 40px; margin-bottom: 12px; }

    /* ── System Info ── */
    .sys-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }

    .sys-item {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
    }

    .sys-key {
      font-size: 11px;
      color: var(--muted);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .sys-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 600;
      color: var(--blue);
    }

    /* ── Test Panel ── */
    .test-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }

    .test-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 18px;
      text-decoration: none;
      color: var(--text);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: 'Inter', sans-serif;
      width: 100%;
      text-align: left;
    }

    .test-btn:hover {
      border-color: var(--accent);
      background: rgba(99,102,241,0.08);
      color: var(--purple);
    }

    .test-btn-icon { font-size: 18px; }

    /* ── Error Alert ── */
    .error-alert {
      background: rgba(248,113,113,0.08);
      border: 1px solid rgba(248,113,113,0.3);
      border-radius: 10px;
      padding: 14px 18px;
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .refresh-btn {
      background: rgba(99,102,241,0.15);
      border: 1px solid rgba(99,102,241,0.3);
      color: var(--purple);
      padding: 8px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      font-family: 'Inter', sans-serif;
    }

    .refresh-btn:hover { background: rgba(99,102,241,0.25); }

    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    @media (max-width: 900px) {
      .two-col { grid-template-columns: 1fr; }
      .main { padding: 16px; }
      .header { padding: 14px 16px; }
    }

    .timestamp {
      font-size: 12px;
      color: var(--muted);
      font-family: 'JetBrains Mono', monospace;
    }

    /* scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--surface); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--muted); }
  </style>
</head>
<body>

<!-- ── Header ── -->
<header class="header">
  <div class="header-left">
    <div class="logo">₿</div>
    <div>
      <div class="header-title">CryptoX Debug Dashboard</div>
      <div class="header-sub">WhatsApp Wallet · Real-time Debug Console</div>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:12px;">
    <span class="timestamp">IST: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
    <div class="live-badge">
      <div class="live-dot"></div>
      LIVE
    </div>
    <button class="refresh-btn" onclick="location.reload()">↻ Refresh</button>
  </div>
</header>

<main class="main">

  <!-- ── Stats ── -->
  <div class="stats-grid">
    <div class="stat-card" style="--card-accent: #34d399">
      <div class="stat-icon">⚙️</div>
      <div class="stat-value" style="color: ${configHealth === 100 ? 'var(--green)' : configHealth > 60 ? 'var(--yellow)' : 'var(--red)'}">
        ${setCount}/${totalCount}
      </div>
      <div class="stat-label">Env Variables Set</div>
    </div>
    <div class="stat-card" style="--card-accent: #60a5fa">
      <div class="stat-icon">📝</div>
      <div class="stat-value" style="color: var(--blue)">${debugLogs.length}</div>
      <div class="stat-label">Logs Captured</div>
    </div>
    <div class="stat-card" style="--card-accent: #f87171">
      <div class="stat-icon">🔴</div>
      <div class="stat-value" style="color: var(--red)">${debugLogs.filter((l) => l.level === 'error').length}</div>
      <div class="stat-label">Errors</div>
    </div>
    <div class="stat-card" style="--card-accent: #a78bfa">
      <div class="stat-icon">⏱️</div>
      <div class="stat-value" style="color: var(--purple); font-size: 20px;">${uptimeStr}</div>
      <div class="stat-label">Function Uptime</div>
    </div>
    <div class="stat-card" style="--card-accent: #fbbf24">
      <div class="stat-icon">💾</div>
      <div class="stat-value" style="color: var(--yellow); font-size: 20px;">${memMB}/${memTotalMB} MB</div>
      <div class="stat-label">Heap Memory Used</div>
    </div>
  </div>

  <!-- ── Webhook URL ── -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">🔗 Webhook Configuration</div>
    </div>
    <div class="card-body">
      <div class="url-box">
        <div>
          <div class="url-label">Callback URL (paste this in Meta Developer Console)</div>
          <div class="url-value" id="webhook-url">${webhookUrl}</div>
        </div>
        <button class="copy-btn" onclick="copyText('${webhookUrl}', this)">📋 Copy</button>
      </div>
      <div class="url-box">
        <div>
          <div class="url-label">Verify Token (META_WA_VERIFY_TOKEN)</div>
          <div class="url-value">${process.env.META_WA_VERIFY_TOKEN ? '✅ Token is SET — use it in Meta Console' : '❌ NOT SET — add META_WA_VERIFY_TOKEN to your env vars'}</div>
        </div>
      </div>
      <div class="url-box">
        <div>
          <div class="url-label">Test Webhook Verification (GET /api/whatsapp)</div>
          <div class="url-value">${webhookUrl}?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123</div>
        </div>
        <a class="copy-btn" href="/api/whatsapp?hub.mode=subscribe&hub.verify_token=${process.env.META_WA_VERIFY_TOKEN || 'SET_YOUR_TOKEN'}&hub.challenge=debug123" target="_blank">🧪 Test</a>
      </div>
    </div>
  </div>

  <div class="two-col">

    <!-- ── Env Config ── -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">🔐 Environment Variables
          <span class="card-badge">${setCount}/${totalCount} SET</span>
        </div>
      </div>
      <div class="card-body">
        <div class="progress-wrap">
          <div class="progress-label">
            <span>Configuration Health</span>
            <span style="color: ${configHealth === 100 ? 'var(--green)' : configHealth > 60 ? 'var(--yellow)' : 'var(--red)'}">${configHealth}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${configHealth}%"></div>
          </div>
        </div>
        ${envHtml}
      </div>
    </div>

    <!-- ── System Info + Tests ── -->
    <div style="display:flex;flex-direction:column;gap:24px;">

      <div class="card">
        <div class="card-header">
          <div class="card-title">🖥️ System Info</div>
        </div>
        <div class="card-body">
          <div class="sys-grid">
            <div class="sys-item">
              <div class="sys-key">Node.js</div>
              <div class="sys-val">${nodeVersion}</div>
            </div>
            <div class="sys-item">
              <div class="sys-key">Platform</div>
              <div class="sys-val">${platform}</div>
            </div>
            <div class="sys-item">
              <div class="sys-key">Uptime</div>
              <div class="sys-val">${uptimeStr}</div>
            </div>
            <div class="sys-item">
              <div class="sys-key">Heap Used</div>
              <div class="sys-val">${memMB} MB</div>
            </div>
            <div class="sys-item">
              <div class="sys-key">Heap Total</div>
              <div class="sys-val">${memTotalMB} MB</div>
            </div>
            <div class="sys-item">
              <div class="sys-key">External</div>
              <div class="sys-val">${Math.round(memUsage.external / 1024 / 1024)} MB</div>
            </div>
            <div class="sys-item">
              <div class="sys-key">Host</div>
              <div class="sys-val" style="font-size:11px">${req.headers.host || 'unknown'}</div>
            </div>
            <div class="sys-item">
              <div class="sys-key">Region</div>
              <div class="sys-val" style="font-size:11px">${req.headers['x-vercel-deployment-url'] ? 'Vercel' : 'Local'}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">🧪 Quick Tests</div>
        </div>
        <div class="card-body">
          <div class="test-grid">
            <button class="test-btn" onclick="testEndpoint('/api/whatsapp?hub.mode=subscribe&hub.verify_token=${process.env.META_WA_VERIFY_TOKEN || 'TOKEN'}&hub.challenge=debug_test_123')">
              <span class="test-btn-icon">🔗</span>
              <div>
                <div>Webhook Verify</div>
                <div style="font-size:11px;color:var(--muted)">GET /api/whatsapp</div>
              </div>
            </button>
            <button class="test-btn" onclick="testEndpoint('/api/debug?action=add_test_log')">
              <span class="test-btn-icon">📝</span>
              <div>
                <div>Add Test Log</div>
                <div style="font-size:11px;color:var(--muted)">POST test entry</div>
              </div>
            </button>
            <button class="test-btn" onclick="testEndpoint('/api/debug?action=clear_logs')">
              <span class="test-btn-icon">🗑️</span>
              <div>
                <div>Clear Logs</div>
                <div style="font-size:11px;color:var(--muted)">Reset log store</div>
              </div>
            </button>
            <button class="test-btn" onclick="testEndpoint('/api/debug?format=json')">
              <span class="test-btn-icon">📊</span>
              <div>
                <div>Export JSON</div>
                <div style="font-size:11px;color:var(--muted)">Raw debug data</div>
              </div>
            </button>
          </div>
          <div id="test-result" style="margin-top:12px;display:none;" class="log-data"></div>
        </div>
      </div>

    </div>
  </div>

  <!-- ── Live Logs ── -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">📋 Live Logs
        <span class="card-badge">${debugLogs.length} entries</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span style="font-size:12px;color:var(--muted)">Auto-refreshes on page reload</span>
        <button class="refresh-btn" style="padding:6px 14px;font-size:12px" onclick="location.reload()">↻</button>
      </div>
    </div>
    <div class="card-body" style="max-height: 600px; overflow-y: auto;">
      ${logsHtml}
    </div>
  </div>

</main>

<script>
  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const original = btn.textContent;
      btn.textContent = '✅ Copied!';
      btn.style.color = '#34d399';
      setTimeout(() => { btn.textContent = original; btn.style.color = ''; }, 2000);
    });
  }

  async function testEndpoint(url) {
    const el = document.getElementById('test-result');
    el.style.display = 'block';
    el.textContent = '⏳ Loading...';
    try {
      const res = await fetch(url);
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {}
      el.textContent = 'Status: ' + res.status + '\\n\\n' + pretty;
    } catch (e) {
      el.textContent = '❌ Error: ' + e.message;
    }
  }

  // Auto refresh every 30 seconds
  setTimeout(() => location.reload(), 30000);
</script>

</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ─── Handler ────────────────────────────────────────────────────────────────
const handler: VercelApiHandler = (req: VercelRequest, res: VercelResponse) => {
  // Action: add test log
  if (req.query.action === 'add_test_log') {
    addDebugLog('info', '🧪 Test log entry added from Debug Dashboard', {
      time: new Date().toISOString(),
      source: 'debug_panel',
    })
    addDebugLog('success', '✅ WhatsApp webhook handler is reachable')
    addDebugLog('warn', '⚠️ Example warning: verify your env tokens are correct')
    res.status(200).json({ ok: true, message: 'Test logs added', count: debugLogs.length })
    return
  }

  // Action: clear logs
  if (req.query.action === 'clear_logs') {
    debugLogs.splice(0, debugLogs.length)
    res.status(200).json({ ok: true, message: 'Logs cleared' })
    return
  }

  // Format: JSON
  if (req.query.format === 'json') {
    res.status(200).json({
      serverTime: new Date().toISOString(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      logs: debugLogs,
      envStatus: checkEnvVars().map((v) => ({ key: v.key, set: v.set })),
    })
    return
  }

  // Default: render HTML dashboard
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(buildHtml(req))
}

export default handler
