const { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } = require('node:fs')
const { join, dirname } = require('node:path')

const DATA_FILE = join(process.cwd(), 'data', 'plandone.json')
const EMPTY = { months: {}, days: {}, weeks: {}, meta: {} }

function load() {
  if (!existsSync(DATA_FILE)) return { ...EMPTY }
  try {
    const parsed = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
    return {
      months: parsed.months || {},
      days: parsed.days || {},
      weeks: parsed.weeks || {},
      meta: parsed.meta || {}
    }
  } catch (error) {
    console.error('讀取資料檔失敗,以空資料啟動:', error.message)
    return { ...EMPTY }
  }
}

function save(data) {
  const dir = dirname(DATA_FILE)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = `${DATA_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, DATA_FILE)
}

function getAll() {
  return load()
}

function setMonth(ym, patch) {
  const data = load()
  const next = {
    ...data,
    months: { ...data.months, [ym]: { ...(data.months[ym] || {}), ...patch } }
  }
  save(next)
  return next.months[ym]
}

function setDay(date, patch) {
  const data = load()
  const next = {
    ...data,
    days: { ...data.days, [date]: { ...(data.days[date] || {}), ...patch } }
  }
  save(next)
  return next.days[date]
}

function setWeek(monday, patch) {
  const data = load()
  const next = {
    ...data,
    weeks: { ...data.weeks, [monday]: { ...(data.weeks[monday] || {}), ...patch } }
  }
  save(next)
  return next.weeks[monday]
}

function setMeta(patch) {
  const data = load()
  const next = { ...data, meta: { ...data.meta, ...patch } }
  save(next)
  return next.meta
}

module.exports = { getAll, setMonth, setDay, setWeek, setMeta }
