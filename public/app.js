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

  let state = { months: {}, days: {}, weeks: {}, meta: {} }

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
  const isCjkDominant = (s) => {
    const cjk = (s.match(/[一-鿿]/g) || []).length
    return cjk > 0 && cjk >= s.replace(/\s/g, '').length / 2
  }

  /* 條目 = {word, meaning, example, exampleZh}
     儲存格式: "word = 意思" / "> 例句" / ">> 例句翻譯"
     沒有標記的舊資料用啟發式歸位(英文長句→例句、中文句→例句翻譯) */
  const parseVocab = (text) => {
    const entries = []
    const cur = () => entries[entries.length - 1]
    ;(text || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((line) => {
      if (line.startsWith('>>')) {
        if (cur()) cur().exampleZh = line.slice(2).trim()
        return
      }
      if (line.startsWith('>')) {
        if (cur()) cur().example = line.slice(1).trim()
        return
      }
      const blank = { word: '', meaning: '', example: '', exampleZh: '' }
      const m = line.match(/^(.*?)\s*[=:：]\s*(.*)$/)
      if (m) {
        entries.push({ ...blank, word: m[1], meaning: m[2] })
        return
      }
      const cjkSplit = line.match(/^([A-Za-z][A-Za-z\s'’.,-]*?)\s+([一-鿿].*)$/)
      if (cjkSplit && cjkSplit[1].split(/\s+/).length <= 3) {
        entries.push({ ...blank, word: cjkSplit[1], meaning: cjkSplit[2] })
        return
      }
      const words = line.split(/\s+/).length
      const isLatinSentence = /^[A-Za-z]/.test(line) && (words >= 4 || line.length > 30)
      if (isLatinSentence && cur() && !cur().example) {
        cur().example = line
        return
      }
      if (isCjkDominant(line) && cur() && cur().example && !cur().exampleZh) {
        cur().exampleZh = line
        return
      }
      entries.push({ ...blank, word: line })
    })
    return entries
  }

  const serializeVocab = (entries) => entries
    .filter((e) => (e.word || '').trim() || (e.meaning || '').trim())
    .flatMap((e) => {
      const lines = [(e.meaning || '').trim()
        ? `${e.word.trim()} = ${e.meaning.trim()}`
        : e.word.trim()]
      if ((e.example || '').trim()) lines.push(`> ${e.example.trim()}`)
      if ((e.exampleZh || '').trim()) lines.push(`>> ${e.exampleZh.trim()}`)
      return lines
    })
    .join('\n')
  const vocabCount = (date) => parseVocab(dayData(date).vocab).length

  /* 行程項: "15:00 事項" 或 "09:00-12:00 事項",一行一項 */
  const parseSched = (text) => (text || '').split('\n')
    .map((l) => l.trim()).filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d{1,2}):(\d{2})(?:\s*[-~–]\s*(\d{1,2}):(\d{2}))?\s+(.*)$/)
      if (!m) return { start: '', end: '', text: line, startMin: 1440, endMin: null }
      const sh = Number(m[1])
      const sm = Number(m[2])
      return {
        start: `${pad(sh)}:${pad(sm)}`,
        end: m[3] ? `${pad(Number(m[3]))}:${pad(Number(m[4]))}` : '',
        text: m[5],
        startMin: sh * 60 + sm,
        endMin: m[3] ? Number(m[3]) * 60 + Number(m[4]) : null
      }
    })
    .sort((a, b) => a.startMin - b.startMin)

  const serializeSched = (items) => items
    .filter((i) => (i.text || '').trim() || i.start)
    .map((i) => (i.start ? `${i.start}${i.end ? '-' + i.end : ''} ${i.text.trim()}` : i.text.trim()))
    .join('\n')

  const schedItems = (date) => parseSched(dayData(date).sched)

  const hasEntry = (date) => {
    const d = dayData(date)
    return Boolean((d.note && d.note.trim()) || (d.stamps && d.stamps.length) ||
      vocabCount(date) > 0 || (d.sched && d.sched.trim()))
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
    const h = Math.floor(mins / 60)
    const m = pad(mins % 60)
    el.textContent = window.matchMedia('(max-width: 640px)').matches
      ? `⏳${h}h${m}`
      : `⏳ 今天剩 ${h}h ${m}m`
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

  /* ---- 勾選清單元件(月計畫 / 週目標共用) ---- */
  const renderChecklist = (container, opts) => {
    container.innerHTML = ''
    const text = opts.get()

    const startEdit = () => {
      container.innerHTML = ''
      const area = document.createElement('textarea')
      area.className = 'plan-area'
      area.placeholder = opts.placeholder
      area.value = opts.get()
      area.addEventListener('blur', () => {
        const val = area.value
        if (val !== opts.get()) {
          opts.save(val).then(() => renderChecklist(container, opts))
        } else {
          renderChecklist(container, opts)
        }
      })
      container.append(area)
      area.focus()
    }

    if (!text.trim()) {
      const empty = document.createElement('button')
      empty.className = 'plan-empty'
      empty.textContent = opts.emptyText
      empty.addEventListener('click', startEdit)
      container.append(empty)
      return
    }

    const box = document.createElement('div')
    box.className = 'plan-view'
    const items = parsePlan(text)

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
          opts.save(serializePlan(next)).then(() => renderChecklist(container, opts))
        })
        const text2 = document.createElement('span')
        text2.textContent = it.text
        row.append(cb, text2)
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

  const renderPlanSection = (container, ym) => renderChecklist(container, {
    get: () => (state.months[ym] && state.months[ym].plan) || '',
    save: (val) => saveMonth(ym, { plan: val }),
    placeholder: '這個月想完成的事…\n用「- 事項」寫的行會變成可勾選的清單',
    emptyText: '還沒寫計畫 — 點這裡開始(用「- 事項」寫會變成勾選清單)'
  })

  /* ---- 月頁:打卡卡片 ---- */
  const monthCards = (ym) => (state.months[ym] && state.months[ym].cards) || {}
  const isStamped = (ym, day, defId) => ((dayData(`${ym}-${pad(day)}`).stamps) || []).includes(defId)

  const toggleStamp = (ym, day, defId) => {
    const date = `${ym}-${pad(day)}`
    const current = dayData(date).stamps || []
    const next = current.includes(defId)
      ? current.filter((id) => id !== defId)
      : [...current, defId]
    return saveDay(date, { stamps: next })
  }

  const daysInYm = (ym) => {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m, 0).getDate()
  }

  const weekdayOf = (ym, day) => {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m - 1, day).getDay()
  }

  const renderCardEditor = (box, ym, def, existing) => {
    box.innerHTML = ''
    box.className = 'punch-card is-editing'
    const total = daysInYm(ym)
    let picked = new Set(existing || [])

    const head = document.createElement('div')
    head.className = 'pc-head'
    const title = document.createElement('strong')
    title.textContent = `${def.emoji} ${def.name}卡 — 圈選要${def.name}的日子`
    head.append(title)
    box.append(head)

    const quick = document.createElement('div')
    quick.className = 'pc-quick'
    const quickDefs = [
      { label: '每天', test: () => true },
      { label: '一三五', test: (wd) => [1, 3, 5].includes(wd) },
      { label: '二四', test: (wd) => [2, 4].includes(wd) },
      { label: '週末', test: (wd) => [0, 6].includes(wd) },
      { label: '清空', test: null }
    ]
    const dayBtns = []
    const syncBtns = () => dayBtns.forEach((b) =>
      b.classList.toggle('is-picked', picked.has(Number(b.dataset.day))))
    quickDefs.forEach((q) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = q.label
      btn.addEventListener('click', () => {
        picked = new Set(q.test
          ? Array.from({ length: total }, (_, i) => i + 1).filter((d) => q.test(weekdayOf(ym, d)))
          : [])
        syncBtns()
      })
      quick.append(btn)
    })
    box.append(quick)

    const grid = document.createElement('div')
    grid.className = 'pc-pick-grid'
    Array.from({ length: total }, (_, i) => i + 1).forEach((day) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.dataset.day = day
      btn.textContent = day
      btn.className = picked.has(day) ? 'is-picked' : ''
      btn.addEventListener('click', () => {
        if (picked.has(day)) picked.delete(day)
        else picked.add(day)
        syncBtns()
      })
      dayBtns.push(btn)
      grid.append(btn)
    })
    box.append(grid)

    const actions = document.createElement('div')
    actions.className = 'pc-actions'
    const saveBtn = document.createElement('button')
    saveBtn.type = 'button'
    saveBtn.className = 'pc-save'
    saveBtn.textContent = '存卡'
    saveBtn.addEventListener('click', () => {
      const days = [...picked].sort((a, b) => a - b)
      const cards = { ...monthCards(ym) }
      if (days.length > 0) cards[def.id] = days
      else delete cards[def.id]
      saveMonth(ym, { cards }).then(() => refreshCards(ym))
    })
    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.textContent = '取消'
    cancelBtn.addEventListener('click', () => refreshCards(ym))
    actions.append(saveBtn, cancelBtn)
    box.append(actions)
  }

  const renderPunchCard = (ym, def, targetDays) => {
    const box = document.createElement('div')
    box.className = 'punch-card'
    const stamped = targetDays.filter((d) => isStamped(ym, d, def.id))
    const isFull = stamped.length === targetDays.length && targetDays.length > 0
    if (isFull) box.classList.add('is-full')

    const head = document.createElement('div')
    head.className = 'pc-head'
    const title = document.createElement('strong')
    title.textContent = `${def.emoji} ${def.name}卡`
    const count = document.createElement('span')
    count.className = 'pc-count'
    count.textContent = `${stamped.length}/${targetDays.length}`
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'pc-edit'
    edit.textContent = '✎'
    edit.title = '改日子 / 全部取消圈選可刪卡'
    edit.addEventListener('click', () => renderCardEditor(box, ym, def, targetDays))
    head.append(title, count, edit)
    box.append(head)

    const slots = document.createElement('div')
    slots.className = 'pc-slots'
    targetDays.forEach((day) => {
      const slot = document.createElement('button')
      slot.type = 'button'
      slot.className = 'pc-slot'
      slot.title = `${Number(ym.split('-')[1])}/${day}`
      const num = document.createElement('i')
      num.textContent = day
      slot.append(num)
      if (isStamped(ym, day, def.id)) {
        slot.classList.add('is-stamped')
        const mark = document.createElement('em')
        mark.textContent = def.emoji
        mark.style.transform = `rotate(${((day * 7) % 21) - 10}deg)`
        slot.append(mark)
      }
      slot.addEventListener('click', () => {
        toggleStamp(ym, day, def.id).then(() => {
          refreshCards(ym)
          const monthView = document.getElementById('view')
          refreshDayCell(monthView, `${ym}-${pad(day)}`)
        })
      })
      slots.append(slot)
    })
    box.append(slots)

    if (isFull) {
      const badge = document.createElement('span')
      badge.className = 'pc-full-badge'
      badge.textContent = 'FULL!'
      box.append(badge)
    }
    return box
  }

  const renderCardsInto = (wrap, ym) => {
    wrap.innerHTML = ''
    const cards = monthCards(ym)
    stampDefs().forEach((def) => {
      const targetDays = cards[def.id]
      if (targetDays && targetDays.length > 0) {
        wrap.append(renderPunchCard(ym, def, targetDays))
      } else {
        const ghost = document.createElement('button')
        ghost.type = 'button'
        ghost.className = 'pc-ghost'
        ghost.textContent = `+ ${def.emoji} ${def.name}卡`
        ghost.title = `發一張${def.name}卡,圈好這個月要${def.name}的日子`
        ghost.addEventListener('click', () => {
          const box = document.createElement('div')
          ghost.replaceWith(box)
          renderCardEditor(box, ym, def, [])
        })
        wrap.append(ghost)
      }
    })
  }

  const refreshCards = (ym) => {
    const wrap = document.getElementById('cardsBox')
    if (wrap) renderCardsInto(wrap, ym)
  }

  /* ---- 月頁:日曆 ---- */
  const buildDayCell = (ym, day) => {
    const date = `${ym}-${pad(day)}`
    const data = dayData(date)
    const cell = document.createElement('div')
    cell.className = 'day-cell'
    cell.dataset.date = date
    if (date === todayStr()) cell.classList.add('is-today')

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
    const vc = vocabCount(date)
    if (vc > 0) {
      const vb = document.createElement('span')
      vb.className = 'day-vocab'
      vb.textContent = `🔤${vc}`
      vb.title = `這天記了 ${vc} 個單字`
      top.append(vb)
    }
    cell.append(top)

    const note = (data.note || '').trim()
    const sched = schedItems(date)
    if (note || sched.length > 0) {
      const dot = document.createElement('span')
      dot.className = 'day-dot'
      const preview = document.createElement('div')
      preview.className = 'day-preview'
      if (sched.length > 0) {
        preview.classList.add('is-sched')
        const first = sched[0]
        preview.textContent = `${first.start ? first.start + ' ' : ''}${first.text}`
          + (sched.length > 1 ? ` +${sched.length - 1}` : '')
      } else {
        preview.textContent = note
      }
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

  /* ---- 日編輯彈窗 ---- */
  const WEEKDAY_NAMES = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
  const dateInRange = (date) => monthList.includes(date.slice(0, 7))
  let lastDayTab = null

  /* 行程模式:24h 軸 + 時間列 */
  const renderSchedTab = (container, date, onChanged) => {
    container.innerHTML = ''
    const items = schedItems(date)
    const save = (next) =>
      saveDay(date, { sched: serializeSched(next) }).then(() => {
        onChanged()
        renderSchedTab(container, date, onChanged)
      })

    const strip = document.createElement('div')
    strip.className = 'sched-strip'
    ;[0, 6, 12, 18, 24].forEach((h) => {
      const tick = document.createElement('span')
      tick.className = 'ss-tick'
      tick.style.left = `${(h / 24) * 100}%`
      tick.textContent = h
      strip.append(tick)
    })
    items.filter((i) => i.startMin < 1440).forEach((i) => {
      const block = document.createElement('span')
      block.className = 'ss-block'
      const dur = i.endMin && i.endMin > i.startMin ? i.endMin - i.startMin : 45
      block.style.left = `${(i.startMin / 1440) * 100}%`
      block.style.width = `${Math.min((dur / 1440) * 100, 100 - (i.startMin / 1440) * 100)}%`
      block.title = `${i.start}${i.end ? '-' + i.end : ''} ${i.text}`
      strip.append(block)
    })
    container.append(strip)

    const list = document.createElement('div')
    list.className = 'sched-list'
    items.forEach((item, idx) => {
      const row = document.createElement('div')
      row.className = 'sched-row'

      const startEdit = () => {
        if (row.classList.contains('is-editing')) return
        row.classList.add('is-editing')
        row.innerHTML = ''
        const sIn = document.createElement('input')
        sIn.type = 'time'
        sIn.value = item.start
        const eIn = document.createElement('input')
        eIn.type = 'time'
        eIn.value = item.end
        const tIn = document.createElement('input')
        tIn.className = 'sched-text-in'
        tIn.value = item.text
        const commit = () => {
          const next = items.map((x, i) => (i === idx
            ? { ...x, start: sIn.value, end: eIn.value, text: tIn.value }
            : x))
          save(next.filter((x) => x.text.trim() || x.start))
        }
        let blurTimer = null
        ;[sIn, eIn, tIn].forEach((input) => {
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur() })
          input.addEventListener('blur', () => { blurTimer = setTimeout(commit, 120) })
          input.addEventListener('focus', () => clearTimeout(blurTimer))
        })
        row.append(sIn, eIn, tIn)
        tIn.focus()
      }

      const time = document.createElement('span')
      time.className = 'sched-time'
      time.textContent = item.start ? `${item.start}${item.end ? '–' + item.end : ''}` : '—'
      const text = document.createElement('span')
      text.className = 'sched-text'
      text.textContent = item.text
      const del = document.createElement('button')
      del.type = 'button'
      del.className = 'v-del'
      del.textContent = '×'
      del.addEventListener('click', (e) => {
        e.stopPropagation()
        save(items.filter((_, i) => i !== idx))
      })
      row.append(time, text, del)
      row.addEventListener('click', (e) => { if (e.target !== del) startEdit() })
      list.append(row)
    })
    container.append(list)

    const add = document.createElement('div')
    add.className = 'sched-add'
    const aStart = document.createElement('input')
    aStart.type = 'time'
    const aEnd = document.createElement('input')
    aEnd.type = 'time'
    aEnd.title = '結束時間(可不填)'
    const aText = document.createElement('input')
    aText.className = 'sched-text-in'
    aText.placeholder = '行程…'
    const aBtn = document.createElement('button')
    aBtn.type = 'button'
    aBtn.textContent = '＋'
    const doAdd = () => {
      if (!aText.value.trim() && !aStart.value) return
      const sm = aStart.value
        ? Number(aStart.value.slice(0, 2)) * 60 + Number(aStart.value.slice(3))
        : 1440
      save([...items, {
        start: aStart.value, end: aEnd.value, text: aText.value, startMin: sm, endMin: null
      }])
    }
    aBtn.addEventListener('click', doAdd)
    aText.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd() })
    add.append(aStart, aEnd, aText, aBtn)
    container.append(add)
  }

  /* 日記模式 */
  const renderNoteTab = (container, date, onChanged) => {
    container.innerHTML = ''
    const area = document.createElement('textarea')
    area.className = 'day-modal-area'
    area.placeholder = '這天發生了什麼、想到什麼…'
    area.value = dayData(date).note || ''
    const commit = () => {
      const val = area.value
      const prev = dayData(date).note || ''
      if (val !== prev) saveDay(date, { note: val }).then(onChanged)
    }
    area.addEventListener('input', debounce(commit, 1500))
    area.addEventListener('blur', commit)
    container.append(area)
    if (!window.matchMedia('(max-width: 640px)').matches) area.focus()
  }

  const closeDayModal = () => {
    document.getElementById('dayModal').hidden = true
    render()
  }

  const openDayModal = (date) => {
    if (!dateInRange(date)) return
    const box = document.getElementById('dayModalBox')
    box.innerHTML = ''
    const [y, m, d] = date.split('-').map(Number)
    const wd = WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()]

    const heading = document.createElement('h2')
    heading.textContent = `${m} 月 ${d} 日 ${wd}`
    if (date === todayStr()) {
      const tag = document.createElement('span')
      tag.className = 'chip chip-streak'
      tag.textContent = '今天'
      tag.style.marginLeft = '.5em'
      heading.append(tag)
    }
    box.append(heading)

    if (settings().stamps) {
      const stampRow = document.createElement('div')
      stampRow.className = 'day-stamp-row'
      const ym = date.slice(0, 7)
      const dayNum = d
      stampDefs().forEach((def) => {
        const planned = (monthCards(ym)[def.id] || []).includes(dayNum)
        const earned = (dayData(date).stamps || []).includes(def.id)
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'day-stamp-btn' + (earned ? ' is-on' : '') + (planned && !earned ? ' is-due' : '')
        btn.textContent = `${def.emoji} ${def.name}${planned && !earned ? '(今日目標)' : ''}`
        btn.addEventListener('click', () => {
          const current = dayData(date).stamps || []
          const next = current.includes(def.id)
            ? current.filter((id) => id !== def.id)
            : [...current, def.id]
          btn.classList.toggle('is-on', next.includes(def.id))
          btn.classList.toggle('is-due', planned && !next.includes(def.id))
          btn.textContent = `${def.emoji} ${def.name}${planned && !next.includes(def.id) ? '(今日目標)' : ''}`
          saveDay(date, { stamps: next })
        })
        stampRow.append(btn)
      })
      box.append(stampRow)
    }

    const tabs = document.createElement('div')
    tabs.className = 'day-tabs'
    const schedBtn = document.createElement('button')
    schedBtn.type = 'button'
    const noteBtn = document.createElement('button')
    noteBtn.type = 'button'
    const content = document.createElement('div')
    content.className = 'day-tab-content'

    const refreshTabLabels = () => {
      const sc = schedItems(date).length
      schedBtn.textContent = sc > 0 ? `📅 行程 ${sc}` : '📅 行程'
      noteBtn.textContent = (dayData(date).note || '').trim() ? '✎ 日記 ●' : '✎ 日記'
    }

    const setTab = (tab) => {
      lastDayTab = tab
      schedBtn.classList.toggle('is-active', tab === 'sched')
      noteBtn.classList.toggle('is-active', tab === 'note')
      if (tab === 'sched') renderSchedTab(content, date, refreshTabLabels)
      else renderNoteTab(content, date, refreshTabLabels)
    }
    schedBtn.addEventListener('click', () => setTab('sched'))
    noteBtn.addEventListener('click', () => setTab('note'))
    tabs.append(schedBtn, noteBtn)
    box.append(tabs, content)

    refreshTabLabels()
    const preferred = lastDayTab
      || (schedItems(date).length > 0 || !(dayData(date).note || '').trim() ? 'sched' : 'note')
    setTab(preferred)

    const vocabLink = document.createElement('a')
    vocabLink.className = 'vocab-link'
    vocabLink.href = '#/vocab'
    const vc2 = vocabCount(date)
    vocabLink.textContent = vc2 > 0 ? `🔤 這天記了 ${vc2} 個單字 → 去單字本` : '🔤 記單字 → 去單字本'
    vocabLink.addEventListener('click', () => { document.getElementById('dayModal').hidden = true })
    box.append(vocabLink)

    const close = document.createElement('button')
    close.className = 'modal-close'
    close.textContent = '完成'
    close.addEventListener('click', closeDayModal)
    box.append(close)

    document.getElementById('dayModal').hidden = false
  }

  /* ---- 單字本 ---- */
  let vocabHideMeanings = false

  const renderVocabBook = (view) => {
    const dates = Object.keys(state.days)
      .filter((d) => vocabCount(d) > 0)
      .sort((a, b) => b.localeCompare(a))
    const total = dates.reduce((sum, d) => sum + vocabCount(d), 0)

    const headRow = document.createElement('div')
    headRow.className = 'vb-head'
    const title = document.createElement('h2')
    title.textContent = '單字本'
    const sub = document.createElement('small')
    sub.textContent = `VOCABULARY BOOK ・ ${total} WORDS`
    title.append(sub)
    headRow.append(title)
    view.append(headRow)

    const controls = document.createElement('div')
    controls.className = 'vb-controls'
    const search = document.createElement('input')
    search.className = 'vb-search'
    search.placeholder = '搜尋單字或意思…'
    const hideBtn = document.createElement('button')
    hideBtn.type = 'button'
    hideBtn.className = 'vb-hide' + (vocabHideMeanings ? ' is-on' : '')
    hideBtn.textContent = vocabHideMeanings ? '顯示意思' : '遮住意思(自測)'
    controls.append(search, hideBtn)
    view.append(controls)

    const quick = document.createElement('div')
    quick.className = 'vb-quick-wrap'
    const quickRow = document.createElement('div')
    quickRow.className = 'vb-quick'
    const qWord = document.createElement('input')
    qWord.placeholder = '新單字'
    const qMean = document.createElement('input')
    qMean.placeholder = '意思'
    const qExToggle = document.createElement('button')
    qExToggle.type = 'button'
    qExToggle.className = 'vb-ex-toggle'
    qExToggle.textContent = '+例句'
    const qAdd = document.createElement('button')
    qAdd.type = 'button'
    qAdd.textContent = '+ 記到今天'
    quickRow.append(qWord, qMean, qExToggle, qAdd)

    const quickEx = document.createElement('div')
    quickEx.className = 'vb-quick vb-quick-ex'
    quickEx.hidden = true
    const qEx = document.createElement('input')
    qEx.placeholder = '例句(英文)'
    const qExZh = document.createElement('input')
    qExZh.placeholder = '例句翻譯'
    quickEx.append(qEx, qExZh)
    qExToggle.addEventListener('click', () => {
      quickEx.hidden = !quickEx.hidden
      qExToggle.classList.toggle('is-on', !quickEx.hidden)
      if (!quickEx.hidden) qEx.focus()
    })

    const doQuickAdd = () => {
      if (!qWord.value.trim()) return
      const today = todayStr()
      if (!dateInRange(today)) return
      const entry = { word: qWord.value, meaning: qMean.value, example: qEx.value, exampleZh: qExZh.value }
      const entries = [...parseVocab(dayData(today).vocab), entry]
      saveDay(today, { vocab: serializeVocab(entries) }).then(render)
    }
    qAdd.addEventListener('click', doQuickAdd)
    ;[qMean, qExZh].forEach((el) =>
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') doQuickAdd() }))
    quick.append(quickRow, quickEx)
    view.append(quick)

    const listWrap = document.createElement('div')
    listWrap.className = 'vb-list'
    view.append(listWrap)

    const renderList = () => {
      listWrap.innerHTML = ''
      const q = search.value.trim().toLowerCase()
      dates.forEach((date) => {
        const entries = parseVocab(dayData(date).vocab)
        const shown = entries
          .map((e, idx) => ({ ...e, idx }))
          .filter((e) => !q || e.word.toLowerCase().includes(q) || e.meaning.toLowerCase().includes(q))
        if (shown.length === 0) return

        const [, m, d] = date.split('-').map(Number)
        const group = document.createElement('div')
        group.className = 'vb-group'
        const gh = document.createElement('p')
        gh.className = 'vb-date'
        gh.textContent = `${m}/${d} ${WEEKDAY_NAMES[weekdayOf(date.slice(0, 7), d)]}`
        group.append(gh)

        shown.forEach((entry) => {
          const box = document.createElement('div')
          box.className = 'vb-entry'

          const startEdit = () => {
            if (box.classList.contains('is-editing')) return
            box.classList.add('is-editing')
            box.innerHTML = ''
            const topRow = document.createElement('div')
            topRow.className = 'vb-edit-row'
            const wIn = document.createElement('input')
            wIn.className = 'v-word'
            wIn.placeholder = '單字'
            wIn.value = entry.word
            const mIn = document.createElement('input')
            mIn.className = 'v-meaning'
            mIn.placeholder = '意思'
            mIn.value = entry.meaning
            topRow.append(wIn, mIn)
            const exIn = document.createElement('input')
            exIn.className = 'vb-edit-full'
            exIn.placeholder = '例句(英文)'
            exIn.value = entry.example
            const exZhIn = document.createElement('input')
            exZhIn.className = 'vb-edit-full'
            exZhIn.placeholder = '例句翻譯'
            exZhIn.value = entry.exampleZh
            const commit = () => {
              const all = parseVocab(dayData(date).vocab)
              const next = all.map((x, i) => (i === entry.idx
                ? { word: wIn.value, meaning: mIn.value, example: exIn.value, exampleZh: exZhIn.value }
                : x))
              saveDay(date, { vocab: serializeVocab(next) }).then(renderList)
            }
            const inputs = [wIn, mIn, exIn, exZhIn]
            let blurTimer = null
            inputs.forEach((input) => {
              input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur() })
              input.addEventListener('blur', () => { blurTimer = setTimeout(commit, 120) })
              input.addEventListener('focus', () => clearTimeout(blurTimer))
            })
            box.append(topRow, exIn, exZhIn)
            wIn.focus()
          }

          const row = document.createElement('div')
          row.className = 'vb-row'
          const word = document.createElement('b')
          word.textContent = entry.word
          const meaning = document.createElement('span')
          meaning.className = 'vb-meaning' + (vocabHideMeanings ? ' is-hidden' : '')
          meaning.textContent = entry.meaning || '(點擊補意思)'
          if (!entry.meaning) meaning.classList.add('is-blank')
          meaning.addEventListener('click', (e) => {
            if (vocabHideMeanings && !meaning.classList.contains('is-blank')) {
              e.stopPropagation()
              meaning.classList.toggle('is-hidden')
            }
          })
          const del = document.createElement('button')
          del.type = 'button'
          del.className = 'v-del'
          del.textContent = '×'
          del.title = '刪除這個單字(含例句)'
          del.addEventListener('click', (e) => {
            e.stopPropagation()
            const next = parseVocab(dayData(date).vocab).filter((_, i) => i !== entry.idx)
            saveDay(date, { vocab: serializeVocab(next) }).then(render)
          })
          row.append(word, meaning, del)
          box.append(row)

          if (entry.example) {
            const ex = document.createElement('p')
            ex.className = 'vb-ex'
            ex.textContent = entry.example
            box.append(ex)
          }
          if (entry.exampleZh) {
            const exZh = document.createElement('p')
            exZh.className = 'vb-ex-zh' + (vocabHideMeanings ? ' is-hidden' : '')
            exZh.addEventListener('click', (e) => {
              if (vocabHideMeanings) {
                e.stopPropagation()
                exZh.classList.toggle('is-hidden')
              }
            })
            exZh.textContent = entry.exampleZh
            box.append(exZh)
          }

          box.addEventListener('click', (e) => {
            if (e.target === del) return
            if (vocabHideMeanings && (e.target === meaning || e.target.classList.contains('vb-ex-zh'))) return
            startEdit()
          })
          group.append(box)
        })
        listWrap.append(group)
      })
      if (!listWrap.children.length) {
        const empty = document.createElement('p')
        empty.className = 'vb-empty'
        empty.textContent = q ? '找不到這個字。' : '還沒有單字 — 上面直接記第一個,或點任何一天的單字卡。'
        listWrap.append(empty)
      }
    }

    search.addEventListener('input', debounce(renderList, 200))
    hideBtn.addEventListener('click', () => {
      vocabHideMeanings = !vocabHideMeanings
      hideBtn.classList.toggle('is-on', vocabHideMeanings)
      hideBtn.textContent = vocabHideMeanings ? '顯示意思' : '遮住意思(自測)'
      renderList()
    })
    renderList()
  }

  /* ---- 週檢視 ---- */
  const mondayOf = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
  }

  const shiftDate = (dateStr, days) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(y, m - 1, d + days)
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
  }

  const renderWeek = (view, monday) => {
    const dates = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i))

    const nav = document.createElement('div')
    nav.className = 'month-nav'
    const prev = document.createElement('a')
    prev.textContent = '← 上週'
    prev.href = `#/week/${shiftDate(monday, -7)}`
    const title = document.createElement('h2')
    const [, sm, sd] = dates[0].split('-').map(Number)
    const [, em, ed] = dates[6].split('-').map(Number)
    title.textContent = `${sm}/${sd} – ${em}/${ed}`
    const sub = document.createElement('small')
    sub.textContent = monday === mondayOf(todayStr()) ? 'THIS WEEK' : 'WEEK VIEW'
    title.append(sub)
    const next = document.createElement('a')
    next.textContent = '下週 →'
    next.href = `#/week/${shiftDate(monday, 7)}`
    nav.append(prev, title, next)
    view.append(nav)

    const goalLabel = document.createElement('p')
    goalLabel.className = 'plan-label'
    goalLabel.textContent = '週目標'
    const goalStats = taskStats((state.weeks[monday] && state.weeks[monday].goals) || '')
    const goalEn = document.createElement('span')
    goalEn.textContent = goalStats.total > 0
      ? `${goalStats.done}/${goalStats.total} DONE`
      : 'SMALL WINS, EVERY WEEK'
    goalLabel.append(goalEn)
    view.append(goalLabel)

    const goalBox = document.createElement('div')
    goalBox.className = 'plan-box'
    renderChecklist(goalBox, {
      get: () => (state.weeks[monday] && state.weeks[monday].goals) || '',
      save: async (val) => {
        state = {
          ...state,
          weeks: { ...state.weeks, [monday]: { ...(state.weeks[monday] || {}), goals: val } }
        }
        await api(`/api/week/${monday}`, { method: 'PUT', body: JSON.stringify({ goals: val }) })
        flashSaved()
        render()
      },
      placeholder: '這週要拿下的幾件事…\n用「- 事項」寫的行會變成可勾選的清單',
      emptyText: '這週還沒設目標 — 點這裡寫(建議從月計畫挑 2~3 件下來)'
    })
    view.append(goalBox)

    const list = document.createElement('div')
    list.className = 'week-list'
    dates.forEach((date) => {
      const [, m, d] = date.split('-').map(Number)
      const inRange = dateInRange(date)
      const row = document.createElement('div')
      row.className = 'week-row'
        + (date === todayStr() ? ' is-today' : '')
        + (inRange ? '' : ' is-out')

      const left = document.createElement('div')
      left.className = 'wr-date'
      const num = document.createElement('b')
      num.textContent = d
      const meta = document.createElement('span')
      meta.textContent = `${WEEKDAY_NAMES[weekdayOf(date.slice(0, 7), d)]} ・ ${m} 月`
      left.append(num, meta)

      const stampsEl = document.createElement('div')
      stampsEl.className = 'wr-stamps'
      if (inRange && settings().stamps) {
        const ym = date.slice(0, 7)
        const earned = dayData(date).stamps || []
        stampDefs().forEach((def) => {
          const planned = (monthCards(ym)[def.id] || []).includes(d)
          const has = earned.includes(def.id)
          if (!planned && !has) return
          const mark = document.createElement('span')
          mark.className = 'wr-stamp' + (has ? '' : ' is-due')
          mark.textContent = def.emoji
          mark.title = `${def.name}${has ? ':已蓋' : ':今日目標,還沒蓋'}`
          stampsEl.append(mark)
        })
      }
      const vc = vocabCount(date)
      if (inRange && vc > 0) {
        const vb = document.createElement('span')
        vb.className = 'wr-vocab'
        vb.textContent = `🔤${vc}`
        vb.title = `記了 ${vc} 個單字`
        stampsEl.append(vb)
      }

      const noteEl = document.createElement('div')
      noteEl.className = 'wr-note'
      const note = (dayData(date).note || '').trim()
      const sched = inRange ? schedItems(date) : []
      const lines = [
        ...sched.map((i) => `${i.start ? i.start + ' ' : ''}${i.text}`),
        ...(note ? [note] : [])
      ]
      noteEl.textContent = inRange ? (lines.join('\n') || '—') : '(規劃本範圍外)'
      if (lines.length === 0) noteEl.classList.add('is-empty')

      row.append(left, stampsEl, noteEl)
      if (inRange) row.addEventListener('click', () => openDayModal(date))
      list.append(row)
    })
    view.append(list)
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

    if (settings().stamps) {
      const cardsBox = document.createElement('div')
      cardsBox.className = 'cards-box'
      cardsBox.id = 'cardsBox'
      renderCardsInto(cardsBox, ym)
      view.append(cardsBox)
    }

    const calWrap = document.createElement('div')
    const head = document.createElement('div')
    head.className = 'cal-head'
    WEEKDAYS.forEach((w) => {
      const s = document.createElement('span')
      s.textContent = w
      head.append(s)
    })
    calWrap.append(head)

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
      openDayModal(cell.dataset.date)
    })

    calWrap.append(grid)
    view.append(calWrap)
    renderReview(view, ym)
  }

  /* ---- 月回顧 ---- */
  const renderReview = (view, ym) => {
    const wrap = document.createElement('div')
    wrap.className = 'review-box'

    const label = document.createElement('p')
    label.className = 'plan-label'
    label.textContent = '月回顧'
    const labelEn = document.createElement('span')
    labelEn.textContent = 'REVIEW — FACTS FIRST, FEELINGS SECOND'
    label.append(labelEn)
    wrap.append(label)

    const stats = document.createElement('div')
    stats.className = 'review-stats'
    const month = state.months[ym] || {}
    const ts = taskStats(month.plan)
    if (ts.total > 0) {
      const chip = document.createElement('span')
      chip.className = 'chip' + (ts.done === ts.total ? ' chip-on' : '')
      chip.textContent = `☑ 計畫 ${ts.done}/${ts.total}`
      stats.append(chip)
    }
    Object.entries(monthCards(ym)).forEach(([defId, days]) => {
      const def = stampDefs().find((d) => d.id === defId)
      if (!def) return
      const stamped = days.filter((d) => isStamped(ym, d, defId)).length
      const chip = document.createElement('span')
      chip.className = 'chip' + (stamped === days.length ? ' chip-on' : '')
      chip.textContent = `${def.emoji} ${def.name} ${stamped}/${days.length}`
      stats.append(chip)
    })
    const diaryDays = Object.keys(state.days).filter((d) => d.startsWith(ym) && hasEntry(d)).length
    const diaryChip = document.createElement('span')
    diaryChip.className = 'chip'
    diaryChip.textContent = `✎ 日記 ${diaryDays} 天`
    stats.append(diaryChip)
    const vocabTotal = Object.keys(state.days)
      .filter((d) => d.startsWith(ym))
      .reduce((sum, d) => sum + vocabCount(d), 0)
    if (vocabTotal > 0) {
      const vChip = document.createElement('span')
      vChip.className = 'chip chip-on'
      vChip.textContent = `🔤 單字 ${vocabTotal} 個`
      stats.append(vChip)
    }
    wrap.append(stats)

    const area = document.createElement('textarea')
    area.className = 'review-area'
    area.placeholder = '1. 做成了什麼?(看上面數字說話)\n2. 卡在哪?為什麼?\n3. 下個月要改哪一件事?'
    area.value = month.review || ''
    const commit = () => {
      const val = area.value
      const prev = (state.months[ym] && state.months[ym].review) || ''
      if (val !== prev) saveMonth(ym, { review: val })
    }
    area.addEventListener('input', debounce(commit, 1500))
    area.addEventListener('blur', commit)
    wrap.append(area)

    view.append(wrap)
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
    const isWeek = hash === 'week' || hash.startsWith('week/')
    const isVocab = hash === 'vocab'
    document.getElementById('navYear').classList.toggle('is-active', !isWeek && !isVocab && !monthList.includes(hash))
    document.getElementById('navWeek').classList.toggle('is-active', isWeek)
    document.getElementById('navVocab').classList.toggle('is-active', isVocab)
    if (monthList.includes(hash)) {
      renderMonth(view, hash)
    } else if (isWeek) {
      const dateArg = hash.split('/')[1]
      const valid = dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg)
      renderWeek(view, mondayOf(valid ? dateArg : todayStr()))
    } else if (isVocab) {
      renderVocabBook(view)
    } else {
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
    document.getElementById('dayModal').addEventListener('click', (e) => {
      if (e.target.id === 'dayModal') closeDayModal()
    })
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
