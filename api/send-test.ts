import type { VercelApiHandler, VercelRequest, VercelResponse } from '@vercel/node'
import { sendMessageToPhoneNumber, sendSimpleButtonsMessage } from '../lib/whatsapp'

// ─── HTML Form Page ──────────────────────────────────────────────────────────
function buildFormHtml(result?: {
  success: boolean
  message: string
  phone?: string
  text?: string
  detail?: string
}) {
  const resultHtml = result
    ? `<div class="result ${result.success ? 'result-ok' : 'result-err'}">
        <div class="result-icon">${result.success ? '✅' : '❌'}</div>
        <div>
          <div class="result-title">${result.success ? 'Message Sent!' : 'Failed to Send'}</div>
          <div class="result-body">${result.message}</div>
          ${result.detail ? `<pre class="result-detail">${escapeHtml(result.detail)}</pre>` : ''}
          ${result.success ? `<div class="result-meta">📱 To: <b>${result.phone}</b> &nbsp;|&nbsp; 💬 "${escapeHtml(result.text || '')}"</div>` : ''}
        </div>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>CryptoX · Send Test Message</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
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
      --purple: #a78bfa;
      --accent: #6366f1;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 40px 16px;
    }

    /* ── Card ── */
    .card {
      width: 100%;
      max-width: 560px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(0,0,0,0.5);
    }

    /* ── Header ── */
    .card-header {
      background: linear-gradient(135deg, #1a1a2e, #0f0f1a);
      border-bottom: 1px solid var(--border);
      padding: 28px 32px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }

    .card-header::before {
      content: '';
      position: absolute;
      top: -40px; left: 50%; transform: translateX(-50%);
      width: 200px; height: 200px;
      background: radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%);
    }

    .wa-icon {
      width: 64px; height: 64px;
      background: linear-gradient(135deg, #25d366, #128c7e);
      border-radius: 16px;
      display: flex; align-items: center; justify-content: center;
      font-size: 32px;
      margin: 0 auto 16px;
      box-shadow: 0 0 30px rgba(37,211,102,0.3);
    }

    .card-title { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .card-sub { font-size: 13px; color: var(--muted); margin-top: 6px; }

    /* ── Body ── */
    .card-body { padding: 28px 32px; }

    /* ── Form ── */
    .form-group { margin-bottom: 20px; }

    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .hint {
      font-size: 11px;
      color: var(--muted);
      margin-top: 6px;
      opacity: 0.7;
    }

    input, textarea, select {
      width: 100%;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 13px 16px;
      color: var(--text);
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    input:focus, textarea:focus, select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
    }

    input::placeholder, textarea::placeholder { color: var(--muted); opacity: 0.6; }

    textarea { resize: vertical; min-height: 100px; }

    select { cursor: pointer; }
    select option { background: var(--surface2); }

    /* ── Button ── */
    .btn-send {
      width: 100%;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: none;
      border-radius: 12px;
      padding: 15px;
      color: #fff;
      font-family: 'Inter', sans-serif;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 20px rgba(99,102,241,0.35);
      letter-spacing: 0.3px;
    }

    .btn-send:hover { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(99,102,241,0.45); }
    .btn-send:active { transform: translateY(0); }
    .btn-send:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

    /* ── Result ── */
    .result {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      border-radius: 12px;
      padding: 16px 18px;
      margin-bottom: 20px;
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .result-ok { background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.25); }
    .result-err { background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.25); }

    .result-icon { font-size: 22px; flex-shrink: 0; }
    .result-title { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
    .result-body { font-size: 13px; color: var(--muted); }
    .result-meta { font-size: 12px; color: var(--muted); margin-top: 8px; }

    .result-detail {
      margin-top: 10px;
      background: rgba(0,0,0,0.3);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--red);
      overflow-x: auto;
      white-space: pre-wrap;
      max-height: 150px;
      overflow-y: auto;
    }

    /* ── Divider ── */
    .divider {
      border: none;
      border-top: 1px solid var(--border);
      margin: 24px 0;
    }

    /* ── Quick Presets ── */
    .presets-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }

    .presets-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .preset-btn {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      color: var(--text);
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .preset-btn:hover {
      border-color: var(--accent);
      background: rgba(99,102,241,0.08);
      color: var(--purple);
    }

    /* ── Nav ── */
    .nav {
      display: flex;
      justify-content: center;
      gap: 16px;
      margin-top: 24px;
    }

    .nav a {
      color: var(--muted);
      font-size: 13px;
      text-decoration: none;
      padding: 6px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      transition: all 0.2s;
    }

    .nav a:hover { color: var(--purple); border-color: var(--accent); }

    /* ── Env warning ── */
    .env-warn {
      background: rgba(251,191,36,0.08);
      border: 1px solid rgba(251,191,36,0.25);
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 13px;
      color: #fbbf24;
      margin-bottom: 20px;
      display: flex;
      gap: 8px;
    }

    .type-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
    }

    .type-tab {
      flex: 1;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      color: var(--muted);
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
    }

    .type-tab.active, .type-tab:hover {
      border-color: var(--accent);
      background: rgba(99,102,241,0.1);
      color: var(--purple);
    }
  </style>
</head>
<body>

<div class="card">
  <div class="card-header">
    <div class="wa-icon">💬</div>
    <div class="card-title">Send Test WhatsApp Message</div>
    <div class="card-sub">CryptoX Debug Tool · Direct API Message Sender</div>
  </div>

  <div class="card-body">

    ${
      !process.env.META_WA_ACCESS_TOKEN
        ? `<div class="env-warn">⚠️ <span><b>META_WA_ACCESS_TOKEN</b> is not set. Message sending will fail. Add it to your .env.local and redeploy.</span></div>`
        : ''
    }

    ${resultHtml}

    <form method="POST" action="/api/send-test" onsubmit="handleSubmit(this)">

      <div class="form-group">
        <label>📱 Phone Number</label>
        <input
          type="text"
          name="phone"
          placeholder="919876543210  (with country code, no +)"
          required
          pattern="[0-9]{10,15}"
          title="Enter phone number with country code, no + or spaces"
        />
        <div class="hint">Include country code. India: 91XXXXXXXXXX | No +, no spaces</div>
      </div>

      <div class="form-group">
        <label>📝 Message Type</label>
        <div class="type-tabs">
          <button type="button" class="type-tab active" onclick="setType('text', this)">💬 Text</button>
          <button type="button" class="type-tab" onclick="setType('menu', this)">🔘 Menu Buttons</button>
          <button type="button" class="type-tab" onclick="setType('wallet', this)">💸 Wallet Info</button>
        </div>
        <input type="hidden" name="type" id="msg-type" value="text"/>
      </div>

      <div class="form-group" id="group-message">
        <label>💬 Message</label>
        <textarea name="message" id="msg-text" placeholder="Type your test message here..." required></textarea>
        <div class="hint">Markdown supported: *bold*, _italic_</div>
      </div>

      <hr class="divider"/>

      <div class="presets-title">⚡ Quick Presets</div>
      <div class="presets-grid">
        <button type="button" class="preset-btn" onclick="setPreset('Hello! 👋 This is a test message from *CryptoX* debug panel.')">👋 Hello Test</button>
        <button type="button" class="preset-btn" onclick="setPreset('Your *CryptoX* wallet on *Hela Chain* is active! ⚡\\nSend money with WhatsApp.')">💰 Wallet Info</button>
        <button type="button" class="preset-btn" onclick="setPreset('🔴 Debug Alert: This is a test error notification from CryptoX server.')">🔴 Error Alert</button>
        <button type="button" class="preset-btn" onclick="setPreset('✅ Payment of 10 HLUSD received successfully! 🎉')">✅ Payment OK</button>
      </div>

      <hr class="divider"/>

      <button type="submit" class="btn-send" id="send-btn">
        <span id="btn-icon">🚀</span>
        <span id="btn-text">Send Message</span>
      </button>

    </form>
  </div>
</div>

<nav class="nav">
  <a href="/api/debug">📊 Debug Dashboard</a>
  <a href="/api/whatsapp?hub.mode=subscribe&hub.verify_token=${process.env.META_WA_VERIFY_TOKEN || 'TOKEN'}&hub.challenge=test" target="_blank">🔗 Test Webhook</a>
  <a href="/api/debug?format=json" target="_blank">📄 JSON Logs</a>
</nav>

<script>
  function setType(type, btn) {
    document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('msg-type').value = type;

    const msgGroup = document.getElementById('group-message');
    const msgArea = document.getElementById('msg-text');

    if (type === 'menu') {
      msgArea.value = 'What would you like to do?';
      msgArea.placeholder = 'Menu header message...';
    } else if (type === 'wallet') {
      msgArea.value = 'Your CryptoX wallet balance and info:';
    } else {
      msgArea.placeholder = 'Type your test message here...';
    }
  }

  function setPreset(text) {
    document.getElementById('msg-text').value = text;
    document.getElementById('msg-type').value = 'text';
    document.querySelectorAll('.type-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  }

  function handleSubmit(form) {
    const btn = document.getElementById('send-btn');
    const icon = document.getElementById('btn-icon');
    const text = document.getElementById('btn-text');
    btn.disabled = true;
    icon.textContent = '⏳';
    text.textContent = 'Sending...';
  }
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
const handler: VercelApiHandler = async (req: VercelRequest, res: VercelResponse) => {

  // ── GET: Show the form ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).send(buildFormHtml())
    return
  }

  // ── POST: Send the message ──────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body as { phone?: string; message?: string; type?: string }
    const phone = (body.phone || '').trim().replace(/\D/g, '')
    const message = (body.message || '').trim()
    const type = body.type || 'text'

    // Validate
    if (!phone || phone.length < 10 || phone.length > 15) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.status(400).send(buildFormHtml({
        success: false,
        message: 'Invalid phone number. Must be 10-15 digits with country code.',
      }))
      return
    }

    if (!message) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.status(400).send(buildFormHtml({
        success: false,
        message: 'Message cannot be empty.',
      }))
      return
    }

    try {
      if (type === 'menu') {
        // Send with action buttons
        await sendSimpleButtonsMessage(phone, message, [
          { title: 'Deposit funds', id: 'check_address' },
          { title: 'Send money 💸', id: 'send_money' },
          { title: 'Check balance 🔎', id: 'check_balance' },
        ])
      } else {
        // Plain text
        await sendMessageToPhoneNumber(phone, message)
      }

      // If Accept: application/json, return JSON
      if (req.headers.accept?.includes('application/json')) {
        res.status(200).json({ ok: true, phone, message, type })
        return
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.status(200).send(buildFormHtml({
        success: true,
        message: 'WhatsApp message delivered successfully via Meta Cloud API.',
        phone,
        text: message,
      }))
    } catch (error: unknown) {
      const errMsg = error instanceof Error
        ? error.message
        : JSON.stringify(error, null, 2)

      if (req.headers.accept?.includes('application/json')) {
        res.status(500).json({ ok: false, error: errMsg })
        return
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.status(500).send(buildFormHtml({
        success: false,
        message: 'Failed to send message. Check your API credentials.',
        detail: errMsg,
      }))
    }
    return
  }

  res.status(405).json({ message: 'Method not allowed' })
}

export default handler
