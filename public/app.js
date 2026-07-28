(() => {
  'use strict'

  const RANGE_START = '2026-07'
  const CODE_KEY = 'plandone-code'
  const MONTH_COUNT = 12
  const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
  const WAFU = {
    1: '睦月', 2: '如月', 3: '彌生', 4: '卯月', 5: '皐月', 6: '水無月',
    7: '文月', 8: '葉月', 9: '長月', 10: '神無月', 11: '霜月', 12: '師走'
  }
  const EN_MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
  const YEAR_FIRST_DAY = new Date(2026, 6, 1)
  const YEAR_TOTAL_DAYS = 365
  const DEFAULT_THEME = '始'

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

  const saveDay = async (date, note) => {
    state = { ...state, days: { ...state.days, [date]: { note } } }
    await api(`/api/day/${date}`, { method: 'PUT', body: JSON.stringify({ note }) })
    flashSaved()
  }

  const saveMeta = async (patch) => {
    state = { ...state, meta: { ...(state.meta || {}), ...patch } }
    await api('/api/meta', { method: 'PUT', body: JSON.stringify(patch) })
    flashSaved()
  }

  /* ---- 年進度條 ---- */
  const initProgress = () => {
    const now = new Date()
    const dayIndex = Math.min(
      Math.max(Math.floor((now - YEAR_FIRST_DAY) / 86400000) + 1, 1),
      YEAR_TOTAL_DAYS
    )
    const percent = Math.round((dayIndex / YEAR_TOTAL_DAYS) * 1000) / 10
    document.getElementById('ypFill').style.width = `${percent}%`
    const caption = document.getElementById('ypCaption')
    caption.innerHTML = ''
    const dayText = document.createElement('em')
    dayText.textContent = `DAY ${dayIndex} / ${YEAR_TOTAL_DAYS}`
    caption.append(dayText, ` ・ ${percent}% ・ 一歩ずつ`)
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
          saveMeta({ theme: val }).then(() => { word.textContent = val })
          word.textContent = val
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

      const monthNum = Number(ym.split('-')[1])
      const wafu = document.createElement('div')
      wafu.className = 'month-card-wafu'
      const wafuName = document.createElement('b')
      wafuName.textContent = WAFU[monthNum]
      wafu.append(wafuName, ` ・ ${EN_MONTHS[monthNum - 1]}`)

      if (state.months[ym] && state.months[ym].done) {
        const stamp = document.createElement('span')
        stamp.className = 'card-stamp'
        stamp.textContent = '済'
        card.append(stamp)
      }

      const preview = document.createElement('p')
      const plan = (state.months[ym] && state.months[ym].plan || '').trim()
      preview.className = 'month-card-preview' + (plan ? '' : ' is-empty')
      preview.textContent = plan || '尚未規劃'

      const dayCount = Object.keys(state.days)
        .filter((d) => d.startsWith(ym) && state.days[d].note.trim()).length
      const days = document.createElement('div')
      days.className = 'month-card-days'
      days.textContent = dayCount > 0 ? `日記 ${dayCount} 天` : ''

      card.append(head, wafu, preview, days)
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
    const monthNum = Number(ym.split('-')[1])
    const sub = document.createElement('small')
    sub.textContent = `${WAFU[monthNum]} ・ ${EN_MONTHS[monthNum - 1]}`
    title.append(sub)

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

    const headRow = document.createElement('div')
    headRow.className = 'month-head-row'
    const label = document.createElement('p')
    label.className = 'plan-label'
    label.textContent = '本月計畫'
    const labelEn = document.createElement('span')
    labelEn.textContent = 'PLAN THE MONTH, LIVE THE DAYS'
    label.append(labelEn)

    const stamp = document.createElement('button')
    stamp.className = 'stamp-btn' + (state.months[ym] && state.months[ym].done ? ' is-done' : '')
    stamp.textContent = '済'
    stamp.title = '這個月的計畫完成了就蓋章'
    stamp.addEventListener('click', () => {
      const next = !(state.months[ym] && state.months[ym].done)
      stamp.classList.toggle('is-done', next)
      saveMonth(ym, { done: next })
    })

    headRow.append(label, stamp)
    view.append(headRow)

    const area = document.createElement('textarea')
    area.className = 'plan-area'
    area.placeholder = '這個月想完成的事…'
    area.value = (state.months[ym] && state.months[ym].plan) || ''
    const commitPlan = () => {
      const val = area.value
      const prev = (state.months[ym] && state.months[ym].plan) || ''
      if (val !== prev) saveMonth(ym, { plan: val })
    }
    area.addEventListener('input', debounce(commitPlan, 1500))
    area.addEventListener('blur', commitPlan)
    view.append(area)

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
    initProgress()
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
