const express = require('express')
const { z } = require('zod')
const { join } = require('node:path')
const store = require('./src/store')

// PM2 不注入 .env 檔,自帶零依賴 loader(.env.production 優先)
const { existsSync, readFileSync } = require('node:fs')
;['.env.production', '.env'].forEach((file) => {
  const path = join(__dirname, file)
  if (!existsSync(path)) return
  readFileSync(path, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  })
})

const PLAN_CODE = process.env.PLANDONE_CODE
if (!PLAN_CODE) {
  console.error('缺少環境變數 PLANDONE_CODE,拒絕啟動')
  process.exit(1)
}

const PORT = Number(process.env.PORT) || 4330

// 規劃本涵蓋範圍:2026-07 ~ 2027-06
const RANGE_START = '2026-07'
const RANGE_END = '2027-06'

const ymSchema = z.string().regex(/^\d{4}-\d{2}$/)
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const notEmpty = (o) => Object.values(o).some((v) => v !== undefined)
const monthBodySchema = z.object({
  plan: z.string().max(20000).optional(),
  done: z.boolean().optional(),
  label: z.string().max(12).optional(),
  review: z.string().max(10000).optional(),
  cards: z.record(
    z.string().max(24),
    z.array(z.number().int().min(1).max(31)).max(31)
  ).optional()
}).refine(notEmpty, { message: '至少要有一個欄位' })
const dayBodySchema = z.object({
  note: z.string().max(2000).optional(),
  stamps: z.array(z.string().max(24)).max(12).optional(),
  vocab: z.string().max(4000).optional()
}).refine(notEmpty, { message: '至少要有一個欄位' })
const weekBodySchema = z.object({ goals: z.string().max(10000) })
const metaBodySchema = z.object({
  theme: z.string().min(1).max(4).optional(),
  settings: z.object({
    yearProgress: z.boolean().optional(),
    todayCountdown: z.boolean().optional(),
    streak: z.boolean().optional(),
    stamps: z.boolean().optional()
  }).optional(),
  stampDefs: z.array(z.object({
    id: z.string().min(1).max(24),
    name: z.string().min(1).max(12),
    emoji: z.string().min(1).max(8)
  })).max(12).optional()
}).refine(notEmpty, { message: '至少要有一個欄位' })

function ymInRange(ym) {
  return ym >= RANGE_START && ym <= RANGE_END
}

function isValidDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

const app = express()
app.use(express.json({ limit: '256kb' }))
app.use(express.static(join(__dirname, 'public')))

app.use('/api', (req, res, next) => {
  if (req.get('X-Plan-Code') !== PLAN_CODE) {
    return res.status(401).json({ success: false, error: '通行碼錯誤' })
  }
  next()
})

app.get('/api/all', (req, res) => {
  res.json({ success: true, data: store.getAll() })
})

app.put('/api/month/:ym', (req, res) => {
  const ym = ymSchema.safeParse(req.params.ym)
  if (!ym.success || !ymInRange(ym.data)) {
    return res.status(400).json({ success: false, error: '月份格式錯誤或超出範圍' })
  }
  const body = monthBodySchema.safeParse(req.body)
  if (!body.success) {
    return res.status(400).json({ success: false, error: '內容格式錯誤' })
  }
  const saved = store.setMonth(ym.data, body.data)
  res.json({ success: true, data: saved })
})

app.put('/api/week/:monday', (req, res) => {
  const monday = dateSchema.safeParse(req.params.monday)
  const validMonday = monday.success && isValidDate(monday.data)
  if (validMonday) {
    const [y, m, d] = monday.data.split('-').map(Number)
    const isMon = new Date(y, m - 1, d).getDay() === 1
    const sundayYm = new Date(y, m - 1, d + 6)
    const sundayKey = `${sundayYm.getFullYear()}-${String(sundayYm.getMonth() + 1).padStart(2, '0')}`
    if (!isMon || (!ymInRange(monday.data.slice(0, 7)) && !ymInRange(sundayKey))) {
      return res.status(400).json({ success: false, error: '週一日期錯誤或超出範圍' })
    }
  } else {
    return res.status(400).json({ success: false, error: '日期格式錯誤' })
  }
  const body = weekBodySchema.safeParse(req.body)
  if (!body.success) {
    return res.status(400).json({ success: false, error: '內容格式錯誤' })
  }
  const saved = store.setWeek(monday.data, body.data)
  res.json({ success: true, data: saved })
})

app.put('/api/meta', (req, res) => {
  const body = metaBodySchema.safeParse(req.body)
  if (!body.success) {
    return res.status(400).json({ success: false, error: '內容格式錯誤' })
  }
  const saved = store.setMeta(body.data)
  res.json({ success: true, data: saved })
})

app.put('/api/day/:date', (req, res) => {
  const date = dateSchema.safeParse(req.params.date)
  if (!date.success || !isValidDate(date.data) || !ymInRange(date.data.slice(0, 7))) {
    return res.status(400).json({ success: false, error: '日期格式錯誤或超出範圍' })
  }
  const body = dayBodySchema.safeParse(req.body)
  if (!body.success) {
    return res.status(400).json({ success: false, error: '內容格式錯誤' })
  }
  const saved = store.setDay(date.data, body.data)
  res.json({ success: true, data: saved })
})

app.use((error, req, res, next) => {
  console.error('未攔截錯誤:', error.message)
  res.status(500).json({ success: false, error: '伺服器錯誤' })
})

app.listen(PORT, () => {
  console.error(`PlanDone 啟動於 http://localhost:${PORT}`)
})
