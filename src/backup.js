const { existsSync, mkdirSync, copyFileSync, readdirSync, unlinkSync } = require('node:fs')
const { join } = require('node:path')

const DATA_FILE = join(process.cwd(), 'data', 'plandone.json')
const BACKUP_DIR = join(process.cwd(), 'data', 'backups')
const KEEP = 30

function todayKey() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function snapshot() {
  try {
    if (!existsSync(DATA_FILE)) return
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
    const target = join(BACKUP_DIR, `plandone-${todayKey()}.json`)
    if (existsSync(target)) return
    copyFileSync(DATA_FILE, target)
    prune()
    console.error(`備份完成: plandone-${todayKey()}.json`)
  } catch (error) {
    console.error('備份失敗:', error.message)
  }
}

function prune() {
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => /^plandone-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
  files.slice(0, Math.max(files.length - KEEP, 0))
    .forEach((f) => unlinkSync(join(BACKUP_DIR, f)))
}

function start() {
  snapshot()
  setInterval(snapshot, 60 * 60 * 1000)
}

module.exports = { start, snapshot }
