// Deterministic local OpenAI Chat Completions endpoint for CI's real AR + TS
// Runner integration. It never logs request text, API keys or tool results.
// Tests write match/answer/rules to E2E_MODEL_RULES; optional steps search and
// read real Core materials through the Runner's MCP tools.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const port = Number(process.env.E2E_MODEL_PORT || 9092)
const rulesFile = process.env.E2E_MODEL_RULES
if (!rulesFile) throw new Error('E2E_MODEL_RULES is required')

const textOf = (content) => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => part?.text ?? part?.content ?? '').join('\n')
}
// Match the current turn only; older questions remain in the conversation
// history and must not select their previous answer again.
const userText = (body) => textOf((body.messages ?? []).filter((m) => m.role === 'user').at(-1)?.content)
const ruleFor = (body) => {
  let rules = []
  try { rules = JSON.parse(readFileSync(rulesFile, 'utf8')) } catch { return null }
  const text = userText(body)
  return rules.find((r) => typeof r.match === 'string' && text.includes(r.match)) ?? null
}
const callNames = (body) => {
  const names = new Map()
  for (const message of body.messages ?? []) {
    for (const call of message.tool_calls ?? []) names.set(call.id, call.function?.name)
  }
  return (body.messages ?? []).filter((m) => m.role === 'tool').map((m) => ({ ...m, name: names.get(m.tool_call_id) }))
}
function hitsOf(message) {
  try {
    const out = JSON.parse(textOf(message?.content))
    const hits = out?.result?.hits ?? out?.hits
    return Array.isArray(hits) ? hits : []
  } catch { return [] }
}
function toolCall(name, args) {
  return { id: `call_${randomUUID()}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }
}
function nextTool(body, rule) {
  const called = callNames(body)
  const searches = called.filter((m) => m.name === 'course_materials_search')
  const last = called.at(-1)
  const steps = rule?.steps ?? []
  if (!steps.length) return null
  let index = searches.length
  if (last?.name === 'course_materials_search' && steps[searches.length - 1]?.read) index--
  const step = steps[index]
  if (!step) return null
  if (last?.name !== 'course_materials_search' || index === searches.length) {
    return toolCall('course_materials_search', { query: step.query })
  }
  const hit = hitsOf(last)[step.hit ?? 0]
  const read = hit?.read
  if (!read?.tool || !read.arguments) return null
  return toolCall(read.tool, read.arguments)
}

function send(res, body, rule) {
  const answer = rule?.answer ?? 'E2E answer.'
  const call = nextTool(body, rule)
  const base = { id: 'chatcmpl-e2e', object: 'chat.completion.chunk', created: 1, model: 'e2e-model' }
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' })
  const delta = call
    ? { role: 'assistant', tool_calls: [{ index: 0, ...call }] }
    : { role: 'assistant', content: answer }
  res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
  res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\n`)
  res.write(`data: ${JSON.stringify({ ...base, choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`)
  res.end('data: [DONE]\n\n')
}

const server = createServer((req, res) => {
  if (req.method !== 'POST' || !String(req.url).endsWith('/chat/completions')) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end('{"error":{"message":"not found"}}')
    return
  }
  let raw = ''
  req.setEncoding('utf8')
  req.on('data', (chunk) => {
    raw += chunk
    if (raw.length > 12 * 1024 * 1024) req.destroy()
  })
  req.on('end', () => {
    void (async () => {
      let body
      try { body = JSON.parse(raw) } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end('{"error":{"message":"invalid JSON"}}')
        return
      }
      const rule = ruleFor(body)
      if (rule?.delayMs) await new Promise((resolve) => setTimeout(resolve, rule.delayMs))
      // IncomingMessage.destroyed may be true after a normal request body is
      // consumed. Only a closed response means the answer cannot be sent.
      if (res.destroyed || res.writableEnded) return
      send(res, body, rule)
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
      if (!res.destroyed) res.end('{"error":{"message":"model unavailable"}}')
    })
  })
  req.on('error', () => undefined)
})
server.listen(port, '127.0.0.1', () => {
  // The port is not sensitive; no request or credential is ever printed.
  console.log(`deterministic model listening on ${port}`)
})
for (const signal of ['SIGTERM', 'SIGINT']) signal && process.on(signal, () => server.close(() => process.exit(0)))
