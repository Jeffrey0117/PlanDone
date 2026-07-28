(() => {
  'use strict'

  const RANGE_START = '2026-07'
  const CODE_KEY = 'plandone-code'
  const MONTH_COUNT = 12
  const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

  let state = { months: {}, days: {} }
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

  const saveMonth = async (ym, plan) => {
    state = { ...state, months: { ...state.months, [ym]: { plan } } }
    await api(`/api/month/${ym}`, { method: 'PUT', body: JSON.stringify({ plan }) })
    flashSaved()
  }

  const saveDay = async (date, note) => {
    state = { ...state, days: { ...state.days, [date]: { note } } }
    await api(`/api/day/${date}`, { method: 'PUT', body: JSON.stringify({ note }) })
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
        render()
      } catch (error) {
        /* 401 已由 api() 處理成重新顯示錯誤 */
      }
    })
  }

  /* ---- 年視圖 ---- */
  const renderYear = (view) => {
    const grid = document.createElement('div')
    grid.className = 'year-grid'
    const currentYm = todayStr().slice(0, 7)

    monthList.forEach((ym) => {
      const card = document.createElement('a')
      card.className = 'month-card' + (ym === currentYm ? ' is-current' : '')
      card.href = `#/${ym}`

      const head = document.createElement('div')
      head.className = 'month-card-head'
      const title = document.createElement('strong')
      title.textContent = ymLabel(ym)
      const year = document.createElement('span')
      year.textContent = ym === currentYm ? '本月' : ''
      head.append(title, year)

      const preview = document.createElement('p')
      const plan = (state.months[ym] && state.months[ym].plan || '').trim()
      preview.className = 'month-card-preview' + (plan ? '' : ' is-empty')
      preview.textContent = plan || '尚未規劃'

      const dayCount = Object.keys(state.days)
        .filter((d) => d.startsWith(ym) && state.days[d].note.trim()).length
      const days = document.createElement('div')
      days.className = 'month-card-days'
      days.textContent = dayCount > 0 ? `日記 ${dayCount} 天` : ''

      card.append(head, preview, days)
      grid.append(card)
    })
    view.append(grid)
  }

  /* ---- 月頁 ---- */
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

    const next = document.createElement('a')
    next.textContent = '下個月 →'
    if (idx < monthList.length - 1) next.href = `#/${monthList[idx + 1]}`
    else next.className = 'nav-hidden'

    nav.append(prev, title, next)
    return nav
  }

  const renderDayEditor = (container, date) => {
    const existing = container.querySelector('.day-editor')
    if (existing) existing.remove()
    if (!date) return

    const box = document.createElement('div')
    box.className = 'day-editor'
    const [, m, d] = date.split('-')
    const heading = document.createElement('h3')
    heading.textContent = `${Number(m)} 月 ${Number(d)} 日的記事`
    const area = document.createElement('textarea')
    area.placeholder = '這天發生了什麼、要做什麼…'
    area.value = (state.days[date] && state.days[date].note) || ''

    const commit = () => {
      const val = area.value
      const prev = (state.days[date] && state.days[date].note) || ''
      if (val !== prev) saveDay(date, val).then(() => refreshDayCell(container, date))
    }
    area.addEventListener('input', debounce(commit, 1500))
    area.addEventListener('blur', commit)

    box.append(heading, area)
    container.append(box)
    area.focus()
  }

  const buildDayCell = (ym, day) => {
    const date = `${ym}-${pad(day)}`
    const cell = document.createElement('div')
    cell.className = 'day-cell'
    cell.dataset.date = date
    if (date === todayStr()) cell.classList.add('is-today')
    if (date === selectedDate) cell.classList.add('is-selected')

    const num = document.createElement('div')
    num.className = 'day-num'
    num.textContent = day
    cell.append(num)

    const note = (state.days[date] && state.days[date].note || '').trim()
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

  const renderMonth = (view, ym) => {
    view.append(renderMonthNav(ym))

    const label = document.createElement('p')
    label.className = 'plan-label'
    label.textContent = '本月計畫'
    const area = document.createElement('textarea')
    area.className = 'plan-area'
    area.placeholder = '這個月想完成的事…'
    area.value = (state.months[ym] && state.months[ym].plan) || ''
    const commitPlan = () => {
      const val = area.value
      const prev = (state.months[ym] && state.months[ym].plan) || ''
      if (val !== prev) saveMonth(ym, val)
    }
    area.addEventListener('input', debounce(commitPlan, 1500))
    area.addEventListener('blur', commitPlan)
    view.append(label, area)

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

  /* ---- 啟動 ---- */
  const boot = async () => {
    initLock()
    window.addEventListener('hashchange', render)
    if (!localStorage.getItem(CODE_KEY)) {
      showLock(false)
      return
    }
    try {
      const result = await api('/api/all')
      state = result.data
      render()
    } catch (error) {
      /* 401 時 api() 已顯示鎖定層 */
    }
  }

  boot()
})()
