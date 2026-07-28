(() => {
  'use strict'

  const RANGE_START = '2026-07'
  const CODE_KEY = 'plandone-code'
  const MONTH_COUNT = 12
  const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
  const EN_MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
  const DEFAULT_THEME = '始'
  const DEFAULT_SETTINGS = { yearProgress: true, todayCountdown: true, streak: true, stamps: true }
  const DEFAULT_STAMPS = [
    { id: 'fit', name: '健身', emoji: '💪' },
    { id: 'read', name: '閱讀', emoji: '📚' }
  ]

  let state = { months: {}, days: {}, meta: {} }
  let selectedDate = null

  /* ---- 工具 ---- */
  const pad = (n) => String(n).padStart(2, '0')

  const monthList = (() => {
    const [startY, startM] = RANGE_START.split('-').map(Number)
    return Array.from({ length: MONTH_COUNT }, (_, i) => {
      const total = startY * 12 + (startM - 1) + i
      return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
    })
  })()

  const todayStr = () => {
    const now = new Date()
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  }

  const ymLabel = (ym) => {
    const [y, m] = ym.split('-')
    return `${y} 年 ${Number(m)} 月`
  }

  const debounce = (fn, ms) => {
    let timer = null
    return (...args) => {
      clearTimeout(timer)
      timer = setTimeout(() => fn(...args), ms)
    }
  }

  const settings = () => ({ ...DEFAULT_SETTINGS, ...((state.meta && state.meta.settings) || {}) })
  const stampDefs = () => (state.meta && state.meta.stampDefs) || DEFAULT_STAMPS
  const dayData = (date) => state.days[date] || {}
  const hasEntry = (date) => {
    const d = dayData(date)
    return Boolean((d.note && d.note.trim()) || (d.stamps && d.stamps.length))
  }

  /* ---- API ---- */
  const api = async (path, options = {}) => {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Plan-Code': localStorage.getItem(CODE_KEY) || '',
        ...(options.headers || {})
      }
    })
    if (res.status === 401) {
      localStorage.removeItem(CODE_KEY)
      showLock(true)
      throw new Error('unauthorized')
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  const flashSaved = () => {
    const bar = document.getElementById('saveBar')
    bar.hidden = false
    clearTimeout(flashSaved.timer)
    flashSaved.timer = setTimeout(() => { bar.hidden = true }, 1200)
  }

  const saveMonth = async (ym, patch) => {
    state = {
      ...state,
      months: { ...state.months, [ym]: { ...(state.months[ym] || {}), ...patch } }
    }
    await api(`/api/month/${ym}`, { method: 'PUT', body: JSON.stringify(patch) })
    flashSaved()
  }

  const saveDay = async (date, patch) => {
    state = {
      ...state,
      days: { ...state.days, [date]: { ...(state.days[date] || {}), ...patch } }
    }
    await api(`/api/day/${date}`, { method: 'PUT', body: JSON.stringify(patch) })
    flashSaved()
    renderStreak()
  }

  const saveMeta = async (patch) => {
    state = { ...state, meta: { ...(state.meta || {}), ...patch } }
    await api('/api/meta', { method: 'PUT', body: JSON.stringify(patch) })
    flashSaved()
  }

  /* ---- 通行碼鎖 ---- */
  const showLock = (isError) => {
    document.getElementById('lockOverlay').hidden = false
    document.getElementById('lockError').hidden = !isError
    document.getElementById('lockInput').focus()
  }

  const initLock = () => {
    document.getElementById('lockForm').addEventListener('submit', async (e) => {
      e.preventDefault()
      const code = document.getElementById('lockInput').value.trim()
      localStorage.setItem(CODE_KEY, code)
      try {
        const result = await api('/api/all')
        state = result.data
        document.getElementById('lockOverlay').hidden = true
        onDataReady()
      } catch (error) {
        /* 401 已由 api() 處理 */
      }
    })
  }

  /* ---- 年進度條 + 倒數 ---- */
  const initProgress = () => {
    const now = new Date()
    const year = now.getFullYear()
    const firstDay = new Date(year, 0, 1)
    const totalDays = Math.round((new Date(year + 1, 0, 1) - firstDay) / 86400000)
    const dayIndex = Math.floor((now - firstDay) / 86400000) + 1
    const percent = Math.round((dayIndex / totalDays) * 1000) / 10
    document.getElementById('ypFill').style.width = `${percent}%`
    document.getElementById('ypStart').textContent = `JAN '${String(year).slice(2)}`
    document.getElementById('ypEnd').textContent = `DEC '${String(year).slice(2)}`
    const caption = document.getElementById('ypCaption')
    caption.innerHTML = ''
    const dayText = document.createElement('em')
    dayText.textContent = `DAY ${dayIndex} / ${totalDays}`
    caption.append(dayText, ` ・ ${percent}% ・ ${totalDays - dayIndex} DAYS LEFT ・ STEP BY STEP`)
  }

  const updateTodayLeft = () => {
    const el = document.getElementById('todayLeft')
    const now = new Date()
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const mins = Math.floor((end - now) / 60000)
    el.textContent = `⏳ 今天剩 ${Math.floor(mins / 60)}h ${pad(mins % 60)}m`
  }

  /* ---- Streak ---- */
  const computeStreak = () => {
    const today = todayStr()
    const start = new Date()
    let cursor = hasEntry(today) ? start : new Date(start - 86400000)
    let count = 0
    while (true) {
      const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`
      if (!hasEntry(key)) break
      count += 1
      cursor = new Date(cursor - 86400000)
    }
    return count
  }

  const renderStreak = () => {
    const chip = document.getElementById('streakChip')
    const streak = computeStreak()
    chip.textContent = `🔥 ${streak}`
    chip.title = `連續 ${streak} 天有紀錄`
    chip.hidden = !settings().streak || streak === 0
  }

  /* ---- 設定套用 ---- */
  const applySettings = () => {
    const s = settings()
    document.querySelector('.year-progress').hidden = !s.yearProgress
    document.getElementById('todayLeft').hidden = !s.todayCountdown
    renderStreak()
  }

  /* ---- 計畫文字 ⇄ 勾選清單 ---- */
  const parsePlan = (text) => (text || '').split('\n').map((line) => {
    const task = line.match(/^-\s*(?:\[([ xX])\]\s*)?(.*)$/)
    if (task && line.trim().startsWith('-')) {
      return { type: 'task', done: (task[1] || '').toLowerCase() === 'x', text: task[2] }
    }
    return { type: 'text', raw: line }
  })

  const serializePlan = (items) => items.map((it) =>
    it.type === 'task' ? `- [${it.done ? 'x' : ' '}] ${it.text}` : it.raw
  ).join('\n')

  const taskStats = (text) => {
    const tasks = parsePlan(text).filter((it) => it.type === 'task')
    return { total: tasks.length, done: tasks.filter((t) => t.done).length }
  }

  /* ---- 年度一字 ---- */
  const renderThemeHero = (view) => {
    const hero = document.createElement('div')
    hero.className = 'theme-hero'

    const word = document.createElement('button')
    word.className = 'theme-word'
    word.title = '點擊修改年度一字'
    word.textContent = (state.meta && state.meta.theme) || DEFAULT_THEME

    word.addEventListener('click', () => {
      const input = document.createElement('input')
      input.className = 'theme-input'
      input.maxLength = 4
      input.value = word.textContent
      const commit = () => {
        const val = input.value.trim()
        if (val && val !== word.textContent) {
          word.textContent = val
          saveMeta({ theme: val })
        }
        input.replaceWith(word)
      }
      input.addEventListener('blur', commit)
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur() })
      word.replaceWith(input)
      input.focus()
      input.select()
    })

    const caption = document.createElement('p')
    caption.className = 'theme-caption'
    caption.textContent = 'ONE YEAR. ONE WORD. — JULY 2026 TO JUNE 2027'

    hero.append(word, caption)
    view.append(hero)
  }

  /* ---- 年視圖 ---- */
  const renderYear = (view) => {
    renderThemeHero(view)
    const grid = document.createElement('div')
    grid.className = 'year-grid'
    const currentYm = todayStr().slice(0, 7)

    monthList.forEach((ym) => {
      const month = state.months[ym] || {}
      const card = document.createElement('a')
      card.className = 'month-card' + (ym === currentYm ? ' is-current' : '')
      card.href = `#/${ym}`

      const head = document.createElement('div')
      head.className = 'month-card-head'
      const title = document.createElement('strong')
      title.textContent = ymLabel(ym)
      const side = document.createElement('span')
      side.textContent = ym === currentYm ? '本月' : ''
      head.append(title, side)

      const monthNum = Number(ym.split('-')[1])
      const sub = document.createElement('div')
      sub.className = 'month-card-wafu'
      sub.textContent = EN_MONTHS[monthNum - 1]
      if (month.label) {
        const tag = document.createElement('i')
        tag.className = 'month-tag'
        tag.textContent = month.label
        sub.append(' ', tag)
      }

      if (month.done) {
        const stamp = document.createElement('span')
        stamp.className = 'card-stamp'
        stamp.textContent = 'DONE'
        card.append(stamp)
      }

      const preview = document.createElement('p')
      const plan = (month.plan || '').trim()
      preview.className = 'month-card-preview' + (plan ? '' : ' is-empty')
      preview.textContent = plan ? plan.replace(/^-\s*\[[ xX]\]\s*/gm, '· ') : '尚未規劃'

      const foot = document.createElement('div')
      foot.className = 'month-card-days'
      const stats = taskStats(month.plan)
      const parts = []
      if (stats.total > 0) parts.push(`☑ ${stats.done}/${stats.total}`)
      const dayCount = Object.keys(state.days).filter((d) => d.startsWith(ym) && hasEntry(d)).length
      if (dayCount > 0) parts.push(`日記 ${dayCount} 天`)
      foot.textContent = parts.join(' ・ ')

      card.append(head, sub, preview, foot)
      grid.append(card)
    })
    view.append(grid)
  }

  /* ---- 月頁:導覽 ---- */
  const renderMonthNav = (ym) => {
    const idx = monthList.indexOf(ym)
    const nav = document.createElement('div')
    nav.className = 'month-nav'

    const prev = document.createElement('a')
    prev.textContent = '← 上個月'
    if (idx > 0) prev.href = `#/${monthList[idx - 1]}`
    else prev.className = 'nav-hidden'

    const title = document.createElement('h2')
    title.textContent = ymLabel(ym)
    const monthNum = Number(ym.split('-')[1])
    const sub = document.createElement('small')
    sub.textContent = EN_MONTHS[monthNum - 1]
    title.append(sub)

    const next = document.createElement('a')
    next.textContent = '下個月 →'
    if (idx < monthList.length - 1) next.href = `#/${monthList[idx + 1]}`
    else next.className = 'nav-hidden'

    nav.append(prev, title, next)
    return nav
  }

  /* ---- 月頁:主題標籤 ---- */
  const renderMonthLabel = (ym) => {
    const wrap = document.createElement('span')
    const current = (state.months[ym] && state.months[ym].label) || ''

    const tag = document.createElement('button')
    tag.className = 'month-tag-btn' + (current ? '' : ' is-empty')
    tag.textContent = current || '+ 月主題'
    tag.title = '這個月的定位,例如:工作月、衝刺月'

    tag.addEventListener('click', () => {
      const input = document.createElement('input')
      input.className = 'month-tag-input'
      input.maxLength = 12
      input.placeholder = '例:工作月'
      input.value = current
      const commit = () => {
        const val = input.value.trim()
        if (val !== current) saveMonth(ym, { label: val })
        tag.textContent = val || '+ 月主題'
        tag.classList.toggle('is-empty', !val)
        input.replaceWith(tag)
      }
      input.addEventListener('blur', commit)
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur() })
      tag.replaceWith(input)
      input.focus()
    })

    wrap.append(tag)
    return wrap
  }

  /* ---- 月頁:計畫(檢視=勾選清單 / 編輯=textarea) ---- */
  const renderPlanSection = (container, ym) => {
    container.innerHTML = ''
    const plan = (state.months[ym] && state.months[ym].plan) || ''

    const startEdit = () => {
      container.innerHTML = ''
      const area = document.createElement('textarea')
      area.className = 'plan-area'
      area.placeholder = '這個月想完成的事…\n用「- 事項」寫的行會變成可勾選的清單'
      area.value = (state.months[ym] && state.months[ym].plan) || ''
      area.addEventListener('blur', () => {
        const val = area.value
        const prev = (state.months[ym] && state.months[ym].plan) || ''
        if (val !== prev) {
          saveMonth(ym, { plan: val }).then(() => renderPlanSection(container, ym))
        } else {
          renderPlanSection(container, ym)
        }
      })
      container.append(area)
      area.focus()
    }

    if (!plan.trim()) {
      const empty = document.createElement('button')
      empty.className = 'plan-empty'
      empty.textContent = '還沒寫計畫 — 點這裡開始(用「- 事項」寫會變成勾選清單)'
      empty.addEventListener('click', startEdit)
      container.append(empty)
      return
    }

    const box = document.createElement('div')
    box.className = 'plan-view'
    const items = parsePlan(plan)

    items.forEach((it, idx) => {
      if (it.type === 'task') {
        const row = document.createElement('label')
        row.className = 'task-row' + (it.done ? ' is-done' : '')
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = it.done
        cb.addEventListener('change', () => {
          const next = items.map((x, i) => (i === idx ? { ...x, done: cb.checked } : x))
          row.classList.toggle('is-done', cb.checked)
          saveMonth(ym, { plan: serializePlan(next) }).then(() => renderPlanSection(container, ym))
        })
        const text = document.createElement('span')
        text.textContent = it.text
        row.append(cb, text)
        box.append(row)
      } else if (it.raw.trim()) {
        const p = document.createElement('p')
        p.className = 'plan-line'
        p.textContent = it.raw
        box.append(p)
      }
    })

    const edit = document.createElement('button')
    edit.className = 'plan-edit-btn'
    edit.textContent = '✎ 編輯'
    edit.addEventListener('click', startEdit)
    box.append(edit)
    container.append(box)
  }

  /* ---- 月頁:印章統計 ---- */
  const renderStampTally = (ym) => {
    const row = document.createElement('div')
    row.className = 'stamp-tally'
    stampDefs().forEach((def) => {
      const count = Object.keys(state.days)
        .filter((d) => d.startsWith(ym) && (dayData(d).stamps || []).includes(def.id)).length
      const chip = document.createElement('span')
      chip.className = 'chip' + (count > 0 ? ' chip-on' : '')
      chip.textContent = `${def.emoji} ${count}`
      chip.title = `${def.name}章:本月 ${count} 天`
      row.append(chip)
    })
    return row
  }

  /* ---- 月頁:日曆 ---- */
  const buildDayCell = (ym, day) => {
    const date = `${ym}-${pad(day)}`
    const data = dayData(date)
    const cell = document.createElement('div')
    cell.className = 'day-cell'
    cell.dataset.date = date
    if (date === todayStr()) cell.classList.add('is-today')
    if (date === selectedDate) cell.classList.add('is-selected')

    const top = document.createElement('div')
    top.className = 'day-top'
    const num = document.createElement('span')
    num.className = 'day-num'
    num.textContent = day
    top.append(num)

    const earned = data.stamps || []
    if (earned.length > 0 && settings().stamps) {
      const icons = document.createElement('span')
      icons.className = 'day-stamps'
      icons.textContent = stampDefs()
        .filter((d) => earned.includes(d.id))
        .map((d) => d.emoji).slice(0, 3).join('')
      top.append(icons)
    }
    cell.append(top)

    const note = (data.note || '').trim()
    if (note) {
      const dot = document.createElement('span')
      dot.className = 'day-dot'
      const preview = document.createElement('div')
      preview.className = 'day-preview'
      preview.textContent = note
      cell.append(dot, preview)
    }
    return cell
  }

  const refreshDayCell = (container, date) => {
    const old = container.querySelector(`.day-cell[data-date="${date}"]`)
    if (!old) return
    const fresh = buildDayCell(date.slice(0, 7), Number(date.slice(8)))
    old.replaceWith(fresh)
  }

  /* ---- 月頁:日記編輯器 ---- */
  const renderDayEditor = (container, date) => {
    const existing = container.querySelector('.day-editor')
    if (existing) existing.remove()
    if (!date) return

    const box = document.createElement('div')
    box.className = 'day-editor'
    const [, m, d] = date.split('-')
    const heading = document.createElement('h3')
    heading.textContent = `${Number(m)} 月 ${Number(d)} 日`
    box.append(heading)

    if (settings().stamps) {
      const stampRow = document.createElement('div')
      stampRow.className = 'day-stamp-row'
      stampDefs().forEach((def) => {
        const earned = (dayData(date).stamps || []).includes(def.id)
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'day-stamp-btn' + (earned ? ' is-on' : '')
        btn.textContent = `${def.emoji} ${def.name}`
        btn.addEventListener('click', () => {
          const current = dayData(date).stamps || []
          const next = current.includes(def.id)
            ? current.filter((id) => id !== def.id)
            : [...current, def.id]
          btn.classList.toggle('is-on', next.includes(def.id))
          saveDay(date, { stamps: next }).then(() => refreshDayCell(container, date))
        })
        stampRow.append(btn)
      })
      box.append(stampRow)
    }

    const area = document.createElement('textarea')
    area.placeholder = '這天發生了什麼、要做什麼…'
    area.value = dayData(date).note || ''
    const commit = () => {
      const val = area.value
      const prev = dayData(date).note || ''
      if (val !== prev) saveDay(date, { note: val }).then(() => refreshDayCell(container, date))
    }
    area.addEventListener('input', debounce(commit, 1500))
    area.addEventListener('blur', commit)
    box.append(area)

    container.append(box)
    area.focus()
  }

  /* ---- 月頁 ---- */
  const renderMonth = (view, ym) => {
    view.append(renderMonthNav(ym))

    const headRow = document.createElement('div')
    headRow.className = 'month-head-row'

    const left = document.createElement('div')
    left.className = 'month-head-left'
    const label = document.createElement('p')
    label.className = 'plan-label'
    label.textContent = '本月計畫'
    const labelEn = document.createElement('span')
    labelEn.textContent = 'PLAN THE MONTH, LIVE THE DAYS'
    label.append(labelEn)
    left.append(label, renderMonthLabel(ym))

    const stamp = document.createElement('button')
    stamp.className = 'stamp-btn' + (state.months[ym] && state.months[ym].done ? ' is-done' : '')
    stamp.textContent = 'DONE'
    stamp.title = '這個月的計畫完成了就蓋章'
    stamp.addEventListener('click', () => {
      const next = !(state.months[ym] && state.months[ym].done)
      stamp.classList.toggle('is-done', next)
      saveMonth(ym, { done: next })
    })

    headRow.append(left, stamp)
    view.append(headRow)

    const planBox = document.createElement('div')
    planBox.className = 'plan-box'
    renderPlanSection(planBox, ym)
    view.append(planBox)

    if (settings().stamps) view.append(renderStampTally(ym))

    const head = document.createElement('div')
    head.className = 'cal-head'
    WEEKDAYS.forEach((w) => {
      const s = document.createElement('span')
      s.textContent = w
      head.append(s)
    })
    view.append(head)

    const grid = document.createElement('div')
    grid.className = 'cal-grid'
    const [y, m] = ym.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7

    Array.from({ length: offset }).forEach(() => {
      const empty = document.createElement('div')
      empty.className = 'day-cell is-empty-slot'
      grid.append(empty)
    })
    Array.from({ length: daysInMonth }, (_, i) => i + 1).forEach((day) => {
      grid.append(buildDayCell(ym, day))
    })

    grid.addEventListener('click', (e) => {
      const cell = e.target.closest('.day-cell')
      if (!cell || !cell.dataset.date) return
      selectedDate = cell.dataset.date
      grid.querySelectorAll('.day-cell.is-selected').forEach((c) => c.classList.remove('is-selected'))
      cell.classList.add('is-selected')
      renderDayEditor(view, selectedDate)
    })

    view.append(grid)
  }

  /* ---- 設定面板 ---- */
  const FEATURES = [
    { key: 'yearProgress', label: '年進度條' },
    { key: 'todayCountdown', label: '今日倒數' },
    { key: 'streak', label: '連續紀錄 🔥' },
    { key: 'stamps', label: '每日印章' }
  ]

  const renderSettings = () => {
    const toggles = document.getElementById('featureToggles')
    toggles.innerHTML = ''
    const s = settings()
    FEATURES.forEach((f) => {
      const row = document.createElement('label')
      row.className = 'set-row'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = s[f.key]
      cb.addEventListener('change', () => {
        saveMeta({ settings: { ...settings(), [f.key]: cb.checked } }).then(() => {
          applySettings()
          render()
        })
      })
      const text = document.createElement('span')
      text.textContent = f.label
      row.append(cb, text)
      toggles.append(row)
    })

    const list = document.getElementById('stampList')
    list.innerHTML = ''
    stampDefs().forEach((def) => {
      const row = document.createElement('div')
      row.className = 'stamp-def-row'
      const name = document.createElement('span')
      name.textContent = `${def.emoji} ${def.name}章`
      const del = document.createElement('button')
      del.type = 'button'
      del.textContent = '刪除'
      del.addEventListener('click', () => {
        saveMeta({ stampDefs: stampDefs().filter((d) => d.id !== def.id) }).then(() => {
          renderSettings()
          render()
        })
      })
      row.append(name, del)
      list.append(row)
    })
  }

  const initSettings = () => {
    const modal = document.getElementById('settingsModal')
    document.getElementById('settingsBtn').addEventListener('click', () => {
      renderSettings()
      modal.hidden = false
    })
    document.getElementById('settingsClose').addEventListener('click', () => { modal.hidden = true })
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true })

    document.getElementById('stampAddForm').addEventListener('submit', (e) => {
      e.preventDefault()
      const emoji = document.getElementById('stampEmoji').value.trim()
      const name = document.getElementById('stampName').value.trim()
      if (!emoji || !name) return
      const def = { id: `s${Date.now()}`, name, emoji }
      saveMeta({ stampDefs: [...stampDefs(), def] }).then(() => {
        document.getElementById('stampEmoji').value = ''
        document.getElementById('stampName').value = ''
        renderSettings()
        render()
      })
    })
  }

  /* ---- 路由 ---- */
  const render = () => {
    const view = document.getElementById('view')
    view.innerHTML = ''
    const hash = location.hash.replace(/^#\//, '')
    if (monthList.includes(hash)) {
      renderMonth(view, hash)
    } else {
      selectedDate = null
      renderYear(view)
    }
  }

  const onDataReady = () => {
    applySettings()
    render()
  }

  /* ---- 啟動 ---- */
  const boot = async () => {
    initLock()
    initSettings()
    initProgress()
    updateTodayLeft()
    setInterval(updateTodayLeft, 30000)
    window.addEventListener('hashchange', render)
    if (!localStorage.getItem(CODE_KEY)) {
      showLock(false)
      return
    }
    try {
      const result = await api('/api/all')
      state = result.data
      onDataReady()
    } catch (error) {
      /* 401 時 api() 已顯示鎖定層 */
    }
  }

  boot()
})()
