import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getDashboardFilters,
  getDashboardSummary,
  getDashboardTimeseries,
  getDeviceDetail,
  getRoomLoads,
  getTopDevices,
} from '../features/dashboard/api/dashboardApi.js'
import '../dashboard.css'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'links', label: 'Связи' },
]

const PERIOD_OPTIONS = [
  { value: 'all', label: 'Весь период' },
  { value: '24h', label: '24 часа', hours: 24 },
  { value: '7d', label: '7 дней', hours: 24 * 7 },
]

const DAY_MS = 24 * 60 * 60 * 1000
const CHART_PADDING = { top: 18, right: 22, bottom: 54, left: 56 }

function formatNumber(value, digits = 1) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0

  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(safeValue)
}

function formatPercent(value, digits = 0) {
  return `${formatNumber(value, digits)}%`
}

function formatDateTime(value) {
  if (!value) {
    return 'нет данных'
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getUserName(currentUser) {
  const fullName = [currentUser?.first_name, currentUser?.last_name]
    .filter(Boolean)
    .join(' ')

  return fullName || currentUser?.email || 'Пользователь'
}

function getUserInitials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function toUtcDateKey(date) {
  return date.toISOString().slice(0, 10)
}

function buildAvailableDates(dateRange) {
  if (!dateRange?.date_from || !dateRange?.date_to) {
    return []
  }

  const start = new Date(`${dateRange.date_from.slice(0, 10)}T00:00:00Z`)
  const end = new Date(`${dateRange.date_to.slice(0, 10)}T00:00:00Z`)
  const dates = []

  for (let current = start; current <= end; current = new Date(current.getTime() + 24 * 60 * 60 * 1000)) {
    dates.push(toUtcDateKey(current))
  }

  return dates
}

function formatDateLabel(dateKey) {
  if (!dateKey) {
    return 'Дата'
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${dateKey}T00:00:00Z`))
}

function getPeriodParams(period, dateRange, selectedDate) {
  const periodOption = PERIOD_OPTIONS.find((option) => option.value === period)

  if (!periodOption?.hours || !dateRange?.date_to) {
    return {}
  }

  const availableDates = buildAvailableDates(dateRange)
  const fallbackDate = availableDates.at(-1) ?? dateRange.date_to.slice(0, 10)
  const dateKey = availableDates.includes(selectedDate) ? selectedDate : fallbackDate
  const selectedDayStart = new Date(`${dateKey}T00:00:00Z`)

  if (period === '24h') {
    return {
      from: `${dateKey}T00:00:00Z`,
      to: `${dateKey}T23:59:59Z`,
    }
  }

  const days = Math.max(1, Math.round(periodOption.hours / 24))
  const dateFrom = new Date(selectedDayStart.getTime() - (days - 1) * DAY_MS)
  const minDate = new Date(`${dateRange.date_from.slice(0, 10)}T00:00:00Z`)
  const clampedDateFrom = dateFrom < minDate ? minDate : dateFrom

  return {
    from: `${toUtcDateKey(clampedDateFrom)}T00:00:00Z`,
    to: `${dateKey}T23:59:59Z`,
  }
}

function buildDashboardParams({ selectedDataName, selectedRoom, selectedConsumerClass, period, dateRange, selectedDate }) {
  return {
    data_name: selectedDataName,
    room: selectedRoom,
    consumer_class: selectedConsumerClass,
    ...getPeriodParams(period, dateRange, selectedDate),
  }
}

function normalizeChartValue(point) {
  return Number(point.value ?? 0) / 1000
}

function buildPowerStats(points, summary) {
  const series = points
    .map((point) => ({
      timestamp: point.timestamp,
      kw: normalizeChartValue(point),
    }))
    .filter((point) => Number.isFinite(point.kw))

  if (series.length === 0) {
    const fallbackMax = Number(summary?.max_power_kw ?? 0)
    const fallbackAvg = Number(summary?.avg_power_kw ?? 0)

    return {
      currentKw: Number(summary?.current_power_kw ?? 0),
      maxKw: fallbackMax,
      avgKw: fallbackAvg,
      minKw: 0,
      loadFactor: fallbackMax > 0 ? (fallbackAvg / fallbackMax) * 100 : 0,
      pointsCount: 0,
      lastTimestamp: summary?.date_to ?? null,
      peakTimestamp: summary?.date_to ?? null,
    }
  }

  const current = series.at(-1)
  const peak = series.reduce((best, point) => (point.kw > best.kw ? point : best), series[0])
  const min = series.reduce((best, point) => (point.kw < best.kw ? point : best), series[0])
  const avgKw = series.reduce((sum, point) => sum + point.kw, 0) / series.length

  return {
    currentKw: current.kw,
    maxKw: peak.kw,
    avgKw,
    minKw: min.kw,
    loadFactor: peak.kw > 0 ? (avgKw / peak.kw) * 100 : 0,
    pointsCount: series.length,
    lastTimestamp: current.timestamp,
    peakTimestamp: peak.timestamp,
  }
}

function buildChartSeries(points) {
  const source = points.length > 0 ? points : []
  const maxItems = 32
  const step = Math.max(1, Math.ceil(source.length / maxItems))
  const sampled = source.filter((_, index) => index % step === 0)
  const actual = sampled.map(normalizeChartValue)
  const average =
    actual.length > 0 ? actual.reduce((sum, value) => sum + value, 0) / actual.length : 0
  const threshold = average * 1.25

  return {
    labels: sampled.map((point) =>
      new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(point.timestamp))
    ),
    points: sampled.map((point, index) => ({
      timestamp: point.timestamp,
      value: actual[index],
    })),
    actual,
    baseline: actual.map(() => average),
    deviations: actual.reduce((indexes, value, index) => {
      if (average > 0 && value >= threshold) {
        indexes.push(index)
      }
      return indexes
    }, []),
  }
}

function getChartLayout(canvas, series) {
  if (!canvas) {
    return null
  }

  const parent = canvas.parentElement

  if (!parent) {
    return null
  }

  const width = parent.clientWidth
  const height = parent.clientHeight
  const values = [...series.actual, ...series.baseline].filter((value) => Number.isFinite(value))
  const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right
  const chartHeight = height - CHART_PADDING.top - CHART_PADDING.bottom
  const minValue = values.length > 0 ? Math.max(0, Math.floor(Math.min(...values) * 0.9)) : 0
  const maxValue = values.length > 0 ? Math.max(1, Math.ceil(Math.max(...values) * 1.1)) : 1
  const xStep = chartWidth / Math.max(series.actual.length - 1, 1)

  const toX = (index) => CHART_PADDING.left + index * xStep
  const toY = (value) =>
    CHART_PADDING.top + ((maxValue - value) / (maxValue - minValue || 1)) * chartHeight

  return {
    width,
    height,
    values,
    chartWidth,
    chartHeight,
    minValue,
    maxValue,
    xStep,
    toX,
    toY,
  }
}

function getNearestChartPoint(canvas, series, event) {
  const layout = getChartLayout(canvas, series)

  if (!layout || series.points.length === 0) {
    return null
  }

  const rect = canvas.getBoundingClientRect()
  const pointerX = event.clientX - rect.left
  const nearestIndex = Math.min(
    series.points.length - 1,
    Math.max(0, Math.round((pointerX - CHART_PADDING.left) / layout.xStep))
  )
  const value = series.actual[nearestIndex]
  const pointX = layout.toX(nearestIndex)
  const pointY = layout.toY(value)

  return {
    ...series.points[nearestIndex],
    index: nearestIndex,
    x: Math.min(layout.width - 86, Math.max(86, pointX)),
    y: Math.max(76, pointY),
    label: series.labels[nearestIndex],
  }
}

function drawLineChart(canvas, series, hoverPoint = null) {
  const layout = getChartLayout(canvas, series)

  if (!layout) {
    return
  }

  const { width, height, values, chartHeight, minValue, maxValue, toX, toY } = layout
  const ratio = window.devicePixelRatio || 1

  canvas.width = width * ratio
  canvas.height = height * ratio
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const context = canvas.getContext('2d')

  if (!context) {
    return
  }

  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)

  if (values.length === 0) {
    context.fillStyle = 'rgba(159, 182, 215, 0.88)'
    context.font = '15px "Segoe UI", sans-serif'
    context.textAlign = 'center'
    context.fillText('Нет данных для выбранных фильтров', width / 2, height / 2)
    return
  }

  context.strokeStyle = 'rgba(155, 184, 223, 0.10)'
  context.lineWidth = 1

  for (let index = 0; index <= 4; index += 1) {
    const y = CHART_PADDING.top + (chartHeight / 4) * index
    context.beginPath()
    context.moveTo(CHART_PADDING.left, y)
    context.lineTo(width - CHART_PADDING.right, y)
    context.stroke()
  }

  context.fillStyle = 'rgba(159, 182, 215, 0.88)'
  context.font = '12px "Segoe UI", sans-serif'
  context.textAlign = 'right'

  for (let index = 0; index <= 4; index += 1) {
    const value = maxValue - ((maxValue - minValue) / 4) * index
    const y = CHART_PADDING.top + (chartHeight / 4) * index + 4
    context.fillText(`${formatNumber(value, 0)} кВт`, CHART_PADDING.left - 10, y)
  }

  context.textAlign = 'center'
  const labelStep = Math.max(1, Math.ceil(series.labels.length / 6))
  series.labels.forEach((label, index) => {
    if (index % labelStep === 0) {
      context.fillText(label, toX(index), height - 18)
    }
  })

  context.beginPath()
  series.baseline.forEach((value, index) => {
    const x = toX(index)
    const y = toY(value)
    if (index === 0) {
      context.moveTo(x, y)
      return
    }
    context.lineTo(x, y)
  })
  context.setLineDash([7, 7])
  context.strokeStyle = 'rgba(143, 183, 255, 0.95)'
  context.lineWidth = 2
  context.stroke()
  context.setLineDash([])

  context.beginPath()
  series.actual.forEach((value, index) => {
    const x = toX(index)
    const y = toY(value)
    if (index === 0) {
      context.moveTo(x, y)
      return
    }
    context.lineTo(x, y)
  })
  context.strokeStyle = '#4de0c5'
  context.lineWidth = 3
  context.stroke()

  series.actual.forEach((value, index) => {
    const x = toX(index)
    const y = toY(value)
    const isDeviation = series.deviations.includes(index)

    context.beginPath()
    context.arc(x, y, isDeviation ? 5 : 3.4, 0, Math.PI * 2)
    context.fillStyle = isDeviation ? '#ff7183' : '#4de0c5'
    context.fill()
  })

  if (hoverPoint && series.actual[hoverPoint.index] !== undefined) {
    const x = toX(hoverPoint.index)
    const y = toY(series.actual[hoverPoint.index])

    context.beginPath()
    context.moveTo(x, CHART_PADDING.top)
    context.lineTo(x, height - CHART_PADDING.bottom)
    context.strokeStyle = 'rgba(245, 251, 255, 0.34)'
    context.lineWidth = 1
    context.stroke()

    context.beginPath()
    context.arc(x, y, 6, 0, Math.PI * 2)
    context.fillStyle = '#06162f'
    context.fill()
    context.lineWidth = 3
    context.strokeStyle = '#f5fbff'
    context.stroke()
  }
}

function SidebarIcon({ id }) {
  if (id === 'links') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 12h10M9 7h6M9 17h6" />
        <path d="M5 4h14v16H5z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />
    </svg>
  )
}

function DashboardPage({ currentUser, onLogout }) {
  const canvasRef = useRef(null)
  const [activeView, setActiveView] = useState('dashboard')
  const [filters, setFilters] = useState(null)
  const [summary, setSummary] = useState(null)
  const [timeseries, setTimeseries] = useState([])
  const [topDevices, setTopDevices] = useState([])
  const [roomLoads, setRoomLoads] = useState([])
  const [deviceDetail, setDeviceDetail] = useState(null)
  const [selectedDataName, setSelectedDataName] = useState('all')
  const [selectedRoom, setSelectedRoom] = useState('all')
  const [selectedConsumerClass, setSelectedConsumerClass] = useState('all')
  const [period, setPeriod] = useState('all')
  const [selectedDate, setSelectedDate] = useState('')
  const [hoverPoint, setHoverPoint] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const userName = getUserName(currentUser)
  const availableDates = useMemo(
    () => buildAvailableDates(filters?.date_range),
    [filters?.date_range]
  )

  const queryParams = useMemo(
    () =>
      buildDashboardParams({
        selectedDataName,
        selectedRoom,
        selectedConsumerClass,
        period,
        dateRange: filters?.date_range,
        selectedDate,
      }),
    [filters?.date_range, period, selectedConsumerClass, selectedDataName, selectedDate, selectedRoom]
  )

  const chartSeries = useMemo(() => buildChartSeries(timeseries), [timeseries])
  const powerStats = useMemo(() => buildPowerStats(timeseries, summary), [summary, timeseries])
  const maxRoomEnergy = Math.max(...roomLoads.map((room) => room.energy_kwh || 0), 1)
  const selectedDeviceLabel =
    selectedDataName === 'all'
      ? 'Все счетчики'
      : filters?.devices.find((device) => device.data_name === selectedDataName)?.label ?? selectedDataName

  useEffect(() => {
    let active = true

    async function loadFilters() {
      try {
        const nextFilters = await getDashboardFilters()
        if (active) {
          setFilters(nextFilters)
          setSelectedDate(nextFilters.date_range?.date_to?.slice(0, 10) ?? '')
          setError('')
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message)
        }
      }
    }

    loadFilters()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!filters) {
      return undefined
    }

    let active = true

    async function loadDashboardData() {
      setLoading(true)
      try {
        const [nextSummary, nextTimeseries, nextTopDevices, nextRoomLoads] = await Promise.all([
          getDashboardSummary(queryParams),
          getDashboardTimeseries({ ...queryParams, metric: 'active_power_w_avg' }),
          getTopDevices(queryParams),
          getRoomLoads(queryParams),
        ])
        const nextDeviceDetail =
          selectedDataName !== 'all'
            ? await getDeviceDetail(selectedDataName, queryParams)
            : null

        if (active) {
          setSummary(nextSummary)
          setTimeseries(nextTimeseries.points ?? [])
          setTopDevices(nextTopDevices)
          setRoomLoads(nextRoomLoads)
          setDeviceDetail(nextDeviceDetail)
          setError('')
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadDashboardData()

    return () => {
      active = false
    }
  }, [filters, queryParams, selectedDataName])

  useEffect(() => {
    setHoverPoint(null)
  }, [queryParams])

  useEffect(() => {
    if (period === 'all' || availableDates.length === 0) {
      setHoverPoint(null)
      return
    }

    if (!selectedDate || !availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates.at(-1))
    }
  }, [availableDates, period, selectedDate])

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return undefined
    }

    const redraw = () => drawLineChart(canvas, chartSeries, hoverPoint)
    redraw()

    const resizeObserver = new ResizeObserver(redraw)
    resizeObserver.observe(canvas.parentElement)
    window.addEventListener('resize', redraw)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', redraw)
    }
  }, [chartSeries, hoverPoint])

  function resetDependentFilters(nextDataName) {
    setSelectedDataName(nextDataName)
    if (nextDataName !== 'all') {
      setSelectedRoom('all')
      setSelectedConsumerClass('all')
    }
  }

  function handleChartPointerMove(event) {
    const nextPoint = getNearestChartPoint(canvasRef.current, chartSeries, event)
    setHoverPoint(nextPoint)
  }

  function handleChartPointerLeave() {
    setHoverPoint(null)
  }

  return (
    <main className="energy-dashboard">
      <div className="energy-dashboard__glow energy-dashboard__glow--left" aria-hidden="true" />
      <div className="energy-dashboard__glow energy-dashboard__glow--right" aria-hidden="true" />

      <div className="energy-shell">
        <aside className="energy-sidebar">
          <div className="energy-brand">
            <div className="energy-brand__mark" />
            <div>
              <div className="energy-brand__title">Smart Energy Consumption</div>
              <div className="energy-brand__subtitle">Dashboard</div>
            </div>
          </div>

          <nav className="energy-nav" aria-label="Навигация">
            {NAV_ITEMS.map((item) => (
              <button
                className={activeView === item.id ? 'energy-nav__item active' : 'energy-nav__item'}
                type="button"
                key={item.id}
                onClick={() => setActiveView(item.id)}
              >
                <span className="energy-nav__icon">
                  <SidebarIcon id={item.id} />
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="energy-sidebar__footer">
            <div className="energy-status-pill">
              <span className="energy-status-pill__dot" />
              <span>{loading ? 'Загружаем данные' : 'База подключена'}</span>
            </div>

            <button className="energy-user-card" type="button" onClick={onLogout}>
              <span className="energy-user-card__avatar">{getUserInitials(userName)}</span>
              <span className="energy-user-card__meta">
                <strong>{userName}</strong>
                <span>Выйти</span>
              </span>
            </button>
          </div>
        </aside>

        <section className="energy-main">
          {error ? <div className="energy-alert">{error}</div> : null}

          <section className={activeView === 'dashboard' ? 'energy-view active' : 'energy-view'}>
            <header className="energy-topbar">
              <div>
                <h1>Дашборд энергопотребления</h1>
              </div>

              <div className="energy-toolbar">
                <label className="energy-control energy-control--wide">
                  <span>Счетчик</span>
                  <select
                    value={selectedDataName}
                    onChange={(event) => resetDependentFilters(event.target.value)}
                    disabled={!filters}
                  >
                    <option value="all">Все счетчики</option>
                    {filters?.devices.map((device) => (
                      <option value={device.data_name} key={device.data_name}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="energy-control">
                  <span>Помещение</span>
                  <select
                    value={selectedRoom}
                    onChange={(event) => {
                      setSelectedRoom(event.target.value)
                      setSelectedDataName('all')
                    }}
                    disabled={!filters || selectedDataName !== 'all'}
                  >
                    <option value="all">Все помещения</option>
                    {filters?.rooms.map((room) => (
                      <option value={room.room} key={room.room}>
                        {room.room}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="energy-control">
                  <span>Класс</span>
                  <select
                    value={selectedConsumerClass}
                    onChange={(event) => {
                      setSelectedConsumerClass(event.target.value)
                      setSelectedDataName('all')
                    }}
                    disabled={!filters || selectedDataName !== 'all'}
                  >
                    <option value="all">Все классы</option>
                    {filters?.consumer_classes.map((item) => (
                      <option value={item.consumer_class} key={item.consumer_class}>
                        {item.consumer_class}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="energy-control">
                  <span>Период</span>
                  <select value={period} onChange={(event) => setPeriod(event.target.value)}>
                    {PERIOD_OPTIONS.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="energy-control">
                  <span>Дата</span>
                  <select
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    disabled={!filters || period === 'all'}
                  >
                    {availableDates.map((dateKey) => (
                      <option value={dateKey} key={dateKey}>
                        {formatDateLabel(dateKey)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="energy-update-chip">
                  До: <strong>{formatDateTime(powerStats.lastTimestamp ?? summary?.date_to ?? filters?.date_range?.date_to)}</strong>
                </div>
              </div>
            </header>

            <section className="energy-kpi-grid">
              <article className="energy-kpi-card accent-primary">
                <div className="energy-kpi-card__label">Средняя мощность</div>
                <div className="energy-kpi-card__value">
                  {formatNumber(powerStats.avgKw)} <span>кВт</span>
                </div>
                <div className="energy-kpi-card__meta">
                  {selectedDeviceLabel}
                </div>
              </article>

              <article className="energy-kpi-card">
                <div className="energy-kpi-card__label">Энергия за период</div>
                <div className="energy-kpi-card__value">
                  {formatNumber(summary?.total_energy_kwh, 0)} <span>кВт·ч</span>
                </div>
                <div className="energy-kpi-card__meta">
                  {formatDateTime(summary?.date_from)} - {formatDateTime(summary?.date_to)}
                </div>
              </article>

              <article className="energy-kpi-card accent-warning">
                <div className="energy-kpi-card__label">Максимальная мощность</div>
                <div className="energy-kpi-card__value">
                  {formatNumber(powerStats.maxKw)} <span>кВт</span>
                </div>
                <div className="energy-kpi-card__meta">
                  Пик: {formatDateTime(powerStats.peakTimestamp)}
                </div>
              </article>

              <article className="energy-kpi-card accent-danger">
                <div className="energy-kpi-card__label">Счетчики в выборке</div>
                <div className="energy-kpi-card__value">
                  {formatNumber(summary?.devices_count, 0)} <span>шт.</span>
                </div>
                <div className="energy-kpi-card__meta">
                  Точек периода: {formatNumber(powerStats.pointsCount, 0)}
                </div>
              </article>
            </section>

            <section className="energy-content-grid energy-content-grid--main">
              <article className="energy-panel energy-chart-panel">
                <div className="energy-panel__head">
                  <div>
                    <h2>Динамика активной мощности</h2>
                    <p>Минутные агрегаты `active_power_w_avg`, сумма по выбранной группе</p>
                  </div>
                  <div className="energy-legend">
                    <span><i className="actual" />Факт</span>
                    <span><i className="baseline" />Среднее</span>
                    <span><i className="alert" />Пики</span>
                  </div>
                </div>
                <div className="energy-chart-wrap">
                  <canvas
                    ref={canvasRef}
                    id="lineChart"
                    aria-label="График динамики энергопотребления"
                    onPointerMove={handleChartPointerMove}
                    onPointerLeave={handleChartPointerLeave}
                  />
                  {hoverPoint ? (
                    <div
                      className="energy-chart-tooltip"
                      style={{
                        left: `${hoverPoint.x}px`,
                        top: `${hoverPoint.y}px`,
                      }}
                    >
                      <span>{hoverPoint.label}</span>
                      <strong>{formatNumber(hoverPoint.value, 2)} кВт</strong>
                    </div>
                  ) : null}
                </div>
              </article>

              <article className="energy-panel">
                <div className="energy-panel__head compact">
                  <div>
                    <h2>Топ счетчиков</h2>
                    <p>По суммарной энергии в выбранном периоде</p>
                  </div>
                </div>

                <div className="energy-event-list">
                  {topDevices.slice(0, 6).map((device, index) => (
                    <article className="energy-event-item" key={device.data_name}>
                      <div className="energy-event-item__time">#{index + 1}</div>
                      <div className="energy-event-item__body">
                        <div className="energy-event-item__title">{device.label}</div>
                        <div className="energy-event-item__text">
                          {formatNumber(device.energy_kwh, 0)} кВт·ч · максимум {formatNumber(device.max_power_kw)} кВт
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            </section>

            <section className="energy-content-grid energy-content-grid--secondary">
              <article className="energy-panel">
                <div className="energy-panel__head compact">
                  <div>
                    <h2>Потребление по помещениям</h2>
                    <p>Помещения, связанные со счетчиками через справочники</p>
                  </div>
                </div>

                <div className="energy-bar-chart">
                  {roomLoads.map((room) => (
                    <div className="energy-bar-row" key={room.room}>
                      <div className="energy-bar-row__label">{room.room}</div>
                      <div className="energy-bar-row__track">
                        <span
                          className="energy-bar-row__fill"
                          style={{
                            width: `${((room.energy_kwh || 0) / maxRoomEnergy) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="energy-bar-row__value">
                        {formatNumber(room.energy_kwh, 0)} кВт·ч
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="energy-panel">
                <div className="energy-panel__head compact">
                  <div>
                    <h2>Краткая сводка</h2>
                    <p>Параметры выбранной выборки из базы</p>
                  </div>
                </div>

                <div className="energy-summary-list">
                  <div className="energy-summary-item">
                    <span className="energy-summary-item__label">Средняя мощность периода</span>
                    <strong className="energy-summary-item__value">
                      {formatNumber(powerStats.avgKw)} кВт
                    </strong>
                    <span className="energy-summary-item__note">среднее значение агрегированной линии</span>
                  </div>

                  <div className="energy-summary-item">
                    <span className="energy-summary-item__label">Минимальная мощность</span>
                    <strong className="energy-summary-item__value">
                      {formatNumber(powerStats.minKw)} кВт
                    </strong>
                    <span className="energy-summary-item__note">минимум в выбранном периоде</span>
                  </div>

                  <div className="energy-summary-item">
                    <span className="energy-summary-item__label">Пик нагрузки</span>
                    <strong className="energy-summary-item__value">
                      {formatNumber(powerStats.maxKw)} кВт
                    </strong>
                    <span className="energy-summary-item__note">{formatDateTime(powerStats.peakTimestamp)}</span>
                  </div>

                  <div className="energy-summary-item">
                    <span className="energy-summary-item__label">Коэффициент загрузки</span>
                    <strong className="energy-summary-item__value">
                      {formatPercent(powerStats.loadFactor)}
                    </strong>
                    <span className="energy-summary-item__note">средняя мощность / максимум периода</span>
                  </div>

                  <div className="energy-summary-item">
                    <span className="energy-summary-item__label">Среднее напряжение</span>
                    <strong className="energy-summary-item__value">
                      {formatNumber(summary?.avg_voltage_v)} В
                    </strong>
                    <span className="energy-summary-item__note">по доступным фазам счетчиков</span>
                  </div>

                  <div className="energy-summary-item">
                    <span className="energy-summary-item__label">Средняя частота</span>
                    <strong className="energy-summary-item__value">
                      {formatNumber(summary?.avg_frequency_hz, 2)} Гц
                    </strong>
                    <span className="energy-summary-item__note">из `frequency_hz_avg`</span>
                  </div>

                  <div className="energy-summary-item">
                    <span className="energy-summary-item__label">Самый энергоемкий счетчик</span>
                    <strong className="energy-summary-item__value">
                      {topDevices[0]?.label ?? 'нет данных'}
                    </strong>
                    <span className="energy-summary-item__note">
                      {formatNumber(topDevices[0]?.energy_kwh, 0)} кВт·ч
                    </span>
                  </div>

                  <div className="energy-summary-item">
                    <span className="energy-summary-item__label">Диапазон выборки</span>
                    <strong className="energy-summary-item__value">
                      {formatDateTime(summary?.date_from)}
                    </strong>
                    <span className="energy-summary-item__note">
                      до {formatDateTime(summary?.date_to)}
                    </span>
                  </div>

                  <div className="energy-summary-item">
                    <span className="energy-summary-item__label">Строк измерений</span>
                    <strong className="energy-summary-item__value">
                      {formatNumber(summary?.points, 0)}
                    </strong>
                    <span className="energy-summary-item__note">сырые минутные записи счетчиков в базе</span>
                  </div>
                </div>
              </article>
            </section>
          </section>

          <section className={activeView === 'links' ? 'energy-view active' : 'energy-view'}>
            <header className="energy-topbar">
              <div>
                <h1>Связи счетчика</h1>
                <p>Автоматы, помещения и потребители из справочников базы данных.</p>
              </div>

              <div className="energy-toolbar">
                <label className="energy-control energy-control--wide">
                  <span>Счетчик</span>
                  <select
                    value={selectedDataName}
                    onChange={(event) => resetDependentFilters(event.target.value)}
                    disabled={!filters}
                  >
                    <option value="all">Выберите счетчик</option>
                    {filters?.devices.map((device) => (
                      <option value={device.data_name} key={device.data_name}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </header>

            {selectedDataName === 'all' ? (
              <section className="energy-panel">
                <div className="energy-panel__head compact">
                  <div>
                    <h2>Выберите счетчик</h2>
                    <p>После выбора появятся реальные потребители и автоматы из базы.</p>
                  </div>
                </div>
              </section>
            ) : (
              <section className="energy-content-grid energy-content-grid--secondary">
                <article className="energy-panel">
                  <div className="energy-panel__head compact">
                    <div>
                      <h2>Потребители</h2>
                      <p>{deviceDetail?.consumers?.length ?? 0} записей</p>
                    </div>
                  </div>

                  <div className="energy-table">
                    {(deviceDetail?.consumers ?? []).map((consumer, index) => (
                      <div className="energy-table__row" key={`${consumer.power_consumer}-${index}`}>
                        <span>{consumer.power_consumer}</span>
                        <strong>{consumer.consumer_class}</strong>
                        <em>{consumer.room}</em>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="energy-panel">
                  <div className="energy-panel__head compact">
                    <div>
                      <h2>Автоматы и помещения</h2>
                      <p>{deviceDetail?.breakers?.length ?? 0} записей</p>
                    </div>
                  </div>

                  <div className="energy-table">
                    {(deviceDetail?.breakers ?? []).map((breaker, index) => (
                      <div className="energy-table__row" key={`${breaker.breaker}-${index}`}>
                        <span>{breaker.breaker}</span>
                        <strong>{breaker.room}</strong>
                        <em>{[breaker.floor, breaker.building].filter(Boolean).join(' · ')}</em>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            )}
          </section>
        </section>
      </div>
    </main>
  )
}

export default DashboardPage
