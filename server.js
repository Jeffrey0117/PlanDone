const express = require('express')
const { z } = require('zod')
const { join } = require('node:path')
const store = require('./src/store')

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
const monthBodySchema = z.object({ plan: z.string().max(20000) })
const dayBodySchema = z.object({ note: z.string().max(2000) })

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
  const saved = store.setMonthPlan(ym.data, body.data.plan)
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
  const saved = store.setDayNote(date.data, body.data.note)
  res.json({ success: true, data: saved })
})

app.use((error, req, res, next) => {
  console.error('未攔截錯誤:', error.message)
  res.status(500).json({ success: false, error: '伺服器錯誤' })
})

app.listen(PORT, () => {
  console.error(`PlanDone 啟動於 http://localhost:${PORT}`)
})
