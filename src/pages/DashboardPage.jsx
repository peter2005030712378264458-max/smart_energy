import { useEffect, useId, useRef, useState } from 'react'
import floorPlanDataSource from './dashboard/floorPlanData.js?raw'
import floorPlanLabelsSource from './dashboard/floorPlanLabels.js?raw'
import planFloorImage from '../assets/plan-floor-3-hd.png'
import '../dashboard.css'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'heatmap', label: 'Тепловая карта' },
]

const PERIOD_OPTIONS = [
  { value: '24h', label: '24 часа', multiplier: 1 },
  { value: '7d', label: '7 дней', multiplier: 7 },
  { value: '30d', label: '30 дней', multiplier: 30 },
]

const FLOOR_PLAN = prepareFloorPlan(
  parseAssignedJson(floorPlanDataSource, 'window.floorPlanData = '),
  parseAssignedJson(floorPlanLabelsSource, 'window.floorPlanLabels = ')
)

function parseAssignedJson(source, prefix) {
  return JSON.parse(source.trim().replace(prefix, '').replace(/;$/, ''))
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function formatNumber(value, digits = 1) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function formatSignedPercent(value) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatNumber(value, 1)}%`
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

function bboxDistance(point, bbox) {
  const [bx, by, bw, bh] = bbox
  const dx = point.x < bx ? bx - point.x : point.x > bx + bw ? point.x - (bx + bw) : 0
  const dy = point.y < by ? by - point.y : point.y > by + bh ? point.y - (by + bh) : 0
  return Math.hypot(dx, dy)
}

function normalizeLabelRotation(angle) {
  if (!angle) {
    return 0
  }

  let normalized = angle % 360

  if (normalized > 180) {
    normalized -= 360
  }

  if (normalized > 90) {
    normalized -= 180
  }

  if (normalized < -90) {
    normalized += 180
  }

  return normalized
}

function getCompactRoomLabel(label) {
  const match = label.match(/^\s*\d+\s*-\s*[^\s(]+/)
  return match ? match[0].replace(/\s+/g, '') : label
}

function getRegionLabelFontSize(region) {
  const [, , width, height] = region.bbox
  return clamp(Math.min(width, height) * 0.22, 3.8, 6.6)
}

function prepareFloorPlan(floorPlan, labels) {
  const regions = floorPlan.regions.map((region) => {
    const matchedLabel = labels
      .map((label) => {
        const distanceToBox = bboxDistance(label, region.bbox)
        const distanceToCenter = Math.hypot(
          label.x - region.centroid[0],
          label.y - region.centroid[1]
        )

        return {
          ...label,
          distanceToBox,
          score: distanceToBox * 2.2 + distanceToCenter,
        }
      })
      .filter((label) => label.distanceToBox <= 28)
      .sort((a, b) => a.score - b.score)[0]

    return {
      ...region,
      roomLabel: matchedLabel?.text || region.name,
      roomLabelRotation: matchedLabel?.rotation ?? 0,
    }
  })

  return {
    ...floorPlan,
    regions,
  }
}

function buildTrendSeries(region) {
  const baseline = [58, 60, 61, 65, 70, 73, 75, 77, 81, 84, 88, 93, 96, 101]
  const factor = clamp((region?.current_kw ?? 12) / 12.4, 0.84, 1.42)
  const drift = (region?.delta_pct ?? 0) / 10

  const actual = baseline.map((value, index) => {
    const wave = Math.sin(index * 0.72) * 4.6 + Math.cos(index * 0.35) * 1.8
    const accent = index > 8 ? drift * 4 : drift * 2.1
    return Math.round((value + wave + accent) * factor)
  })

  const deviations = actual.reduce((indexes, value, index) => {
    if (value - baseline[index] >= 10) {
      indexes.push(index)
    }
    return indexes
  }, [])

  return {
    labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    baseline,
    actual,
    deviations,
  }
}

function drawLineChart(canvas, series) {
  if (!canvas) {
    return
  }

  const parent = canvas.parentElement

  if (!parent) {
    return
  }

  const width = parent.clientWidth
  const height = parent.clientHeight
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

  const padding = { top: 18, right: 22, bottom: 42, left: 42 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const values = [...series.actual, ...series.baseline]
  const minValue = Math.floor(Math.min(...values) / 5) * 5 - 5
  const maxValue = Math.ceil(Math.max(...values) / 5) * 5 + 5
  const xStep = chartWidth / (series.actual.length - 1)

  const toX = (index) => padding.left + index * xStep
  const toY = (value) =>
    padding.top + ((maxValue - value) / (maxValue - minValue)) * chartHeight

  context.strokeStyle = 'rgba(155, 184, 223, 0.10)'
  context.lineWidth = 1

  for (let index = 0; index <= 4; index += 1) {
    const y = padding.top + (chartHeight / 4) * index
    context.beginPath()
    context.moveTo(padding.left, y)
    context.lineTo(width - padding.right, y)
    context.stroke()
  }

  for (let index = 0; index < series.actual.length; index += 1) {
    const x = toX(index)
    context.beginPath()
    context.moveTo(x, padding.top)
    context.lineTo(x, padding.top + chartHeight)
    context.strokeStyle = 'rgba(155, 184, 223, 0.05)'
    context.stroke()
  }

  context.fillStyle = 'rgba(159, 182, 215, 0.88)'
  context.font = '12px "Segoe UI", sans-serif'
  context.textAlign = 'right'

  for (let index = 0; index <= 4; index += 1) {
    const value = Math.round(maxValue - ((maxValue - minValue) / 4) * index)
    const y = padding.top + (chartHeight / 4) * index + 4
    context.fillText(String(value), padding.left - 10, y)
  }

  context.textAlign = 'center'
  series.labels.forEach((label, index) => {
    context.fillText(label, toX(index), height - 16)
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
  context.strokeStyle = 'rgba(77, 224, 197, 0.18)'
  context.lineWidth = 10
  context.stroke()

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

  const gradient = context.createLinearGradient(0, padding.top, 0, padding.top + chartHeight)
  gradient.addColorStop(0, 'rgba(77, 224, 197, 0.18)')
  gradient.addColorStop(1, 'rgba(77, 224, 197, 0.01)')

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
  context.lineTo(toX(series.actual.length - 1), padding.top + chartHeight)
  context.lineTo(toX(0), padding.top + chartHeight)
  context.closePath()
  context.fillStyle = gradient
  context.fill()

  series.actual.forEach((value, index) => {
    const x = toX(index)
    const y = toY(value)
    const isDeviation = series.deviations.includes(index)

    context.beginPath()
    context.arc(x, y, isDeviation ? 5 : 3.4, 0, Math.PI * 2)
    context.fillStyle = isDeviation ? '#ff7183' : '#4de0c5'
    context.shadowColor = isDeviation
      ? 'rgba(255, 113, 131, 0.62)'
      : 'rgba(77, 224, 197, 0.40)'
    context.shadowBlur = isDeviation ? 18 : 10
    context.fill()
    context.shadowBlur = 0

    if (isDeviation) {
      context.beginPath()
      context.arc(x, y, 9, 0, Math.PI * 2)
      context.strokeStyle = 'rgba(255, 113, 131, 0.28)'
      context.lineWidth = 2
      context.stroke()
    }
  })
}

function getZoomPercent(viewBox) {
  return (FLOOR_PLAN.viewBox.width / viewBox.width) * 100
}

function clampViewBox(viewBox) {
  const maxX = FLOOR_PLAN.viewBox.width - viewBox.width
  const maxY = FLOOR_PLAN.viewBox.height - viewBox.height

  return {
    ...viewBox,
    x: Math.min(Math.max(viewBox.x, 0), Math.max(maxX, 0)),
    y: Math.min(Math.max(viewBox.y, 0), Math.max(maxY, 0)),
  }
}

function zoomViewBox(currentViewBox, factor, anchorX, anchorY) {
  const nextWidth = Math.min(
    FLOOR_PLAN.viewBox.width,
    Math.max(FLOOR_PLAN.viewBox.width * 0.08, currentViewBox.width * factor)
  )
  const nextHeight = nextWidth * (FLOOR_PLAN.viewBox.height / FLOOR_PLAN.viewBox.width)
  const ratioX = (anchorX - currentViewBox.x) / currentViewBox.width
  const ratioY = (anchorY - currentViewBox.y) / currentViewBox.height

  return clampViewBox({
    x: anchorX - nextWidth * ratioX,
    y: anchorY - nextHeight * ratioY,
    width: nextWidth,
    height: nextHeight,
  })
}

function getRegionTone(mode, level) {
  return mode === 'absolute' ? `map-region mode-absolute level-${level}` : `map-region level-${level}`
}

function describeRegion(region) {
  if (region.delta_pct >= 12) {
    return 'Нагрузка заметно выше типичного профиля. Для этой зоны стоит проверить активное оборудование и режим работы.'
  }

  if (region.delta_pct >= 5) {
    return 'Зона работает выше среднего уровня, но без резкого скачка. Полезно сверить фактический режим с расписанием.'
  }

  return 'Нагрузка близка к обычному уровню. На текущем снимке помещение не выделяется на фоне этажа.'
}

function SidebarIcon({ id }) {
  if (id === 'heatmap') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 5h16v14H4z" />
        <path d="M9 5v14M15 5v14M4 10h16M4 15h16" opacity="0.65" />
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
  const clipPathPrefix = useId().replace(/:/g, '')
  const canvasRef = useRef(null)
  const svgRef = useRef(null)
  const dragStateRef = useRef(null)
  const [activeView, setActiveView] = useState('dashboard')
  const [selectedRegionId, setSelectedRegionId] = useState(FLOOR_PLAN.regions[0]?.raw_id ?? null)
  const [period, setPeriod] = useState('7d')
  const [mapMode, setMapMode] = useState('deviation')
  const [viewBox, setViewBox] = useState({
    x: 0,
    y: 0,
    width: FLOOR_PLAN.viewBox.width,
    height: FLOOR_PLAN.viewBox.height,
  })
  const [isDragging, setIsDragging] = useState(false)
  const selectedRegion =
    FLOOR_PLAN.regions.find((region) => region.raw_id === selectedRegionId) || FLOOR_PLAN.regions[0]
  const periodOption = PERIOD_OPTIONS.find((option) => option.value === period) || PERIOD_OPTIONS[1]
  const userName = getUserName(currentUser)
  const totalCurrentLoad = FLOOR_PLAN.regions.reduce((sum, region) => sum + region.current_kw, 0)
  const averageDelta =
    FLOOR_PLAN.regions.reduce((sum, region) => sum + region.delta_pct, 0) / FLOOR_PLAN.regions.length
  const alertRegions = FLOOR_PLAN.regions.filter((region) => region.level === 'high')
  const topLoadRegions = [...FLOOR_PLAN.regions]
    .sort((left, right) => right.current_kw - left.current_kw)
    .slice(0, 6)
  const trendSeries = buildTrendSeries(selectedRegion)
  const estimatedPeriodLoad = totalCurrentLoad * 24 * periodOption.multiplier
  const maxLoadRegion = topLoadRegions[0]
  const averageLoad = totalCurrentLoad / FLOOR_PLAN.regions.length
  const nightDelta =
    FLOOR_PLAN.regions.filter((region) => region.delta_pct > 0)
      .sort((left, right) => right.delta_pct - left.delta_pct)[0]?.delta_pct ?? 0
  const zoomPercent = Math.round(getZoomPercent(viewBox))
  const labelsVisible = zoomPercent >= 260

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return undefined
    }

    const redraw = () => drawLineChart(canvas, trendSeries)
    redraw()

    const resizeObserver = new ResizeObserver(redraw)
    resizeObserver.observe(canvas.parentElement)
    window.addEventListener('resize', redraw)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', redraw)
    }
  }, [trendSeries])

  function handleWheel(event) {
    event.preventDefault()

    const svg = svgRef.current

    if (!svg) {
      return
    }

    const rect = svg.getBoundingClientRect()
    const mouseX = (event.clientX - rect.left) / rect.width
    const mouseY = (event.clientY - rect.top) / rect.height

    setViewBox((currentViewBox) => {
      const anchorX = currentViewBox.x + currentViewBox.width * mouseX
      const anchorY = currentViewBox.y + currentViewBox.height * mouseY
      return zoomViewBox(currentViewBox, event.deltaY > 0 ? 1.16 : 0.86, anchorX, anchorY)
    })
  }

  function handlePointerDown(event) {
    const svg = svgRef.current

    if (!svg) {
      return
    }

    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: viewBox.x,
      originY: viewBox.y,
      width: viewBox.width,
      height: viewBox.height,
    }

    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event) {
    const dragState = dragStateRef.current
    const svg = svgRef.current

    if (!dragState || !svg) {
      return
    }

    const rect = svg.getBoundingClientRect()
    const dx = (event.clientX - dragState.startX) * (dragState.width / rect.width)
    const dy = (event.clientY - dragState.startY) * (dragState.height / rect.height)

    setViewBox(
      clampViewBox({
        ...viewBox,
        x: dragState.originX - dx,
        y: dragState.originY - dy,
      })
    )
  }

  function handlePointerUp(event) {
    dragStateRef.current = null
    setIsDragging(false)

    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
  }

  function handleZoom(factor) {
    const svg = svgRef.current

    if (!svg) {
      return
    }

    const anchorX = viewBox.x + viewBox.width / 2
    const anchorY = viewBox.y + viewBox.height / 2
    setViewBox(zoomViewBox(viewBox, factor, anchorX, anchorY))
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
              <span>Система активна</span>
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
          <section className={activeView === 'dashboard' ? 'energy-view active' : 'energy-view'}>
            <header className="energy-topbar">
              <div>
                <h1>Дашборд энергопотребления</h1>
                <p>
                  Оперативный обзор потребления, ключевых изменений и нагрузки по зонам.
                </p>
              </div>

              <div className="energy-toolbar">
                <label className="energy-control">
                  <span>Объект</span>
                  <select defaultValue="building-1">
                    <option value="building-1">Строение 1</option>
                    <option value="building-a">Корпус А</option>
                    <option value="all">Весь объект</option>
                  </select>
                </label>

                <label className="energy-control">
                  <span>Уровень</span>
                  <select defaultValue="floor">
                    <option value="floor">Этаж</option>
                    <option value="room">Помещение</option>
                    <option value="zone">Зона</option>
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

                <button
                  className="energy-ghost-button"
                  type="button"
                  onClick={() => setActiveView('heatmap')}
                >
                  К карте
                </button>
                <div className="energy-update-chip">
                  Обновлено: <strong>14:32</strong>
                </div>
              </div>
            </header>

            <section className="energy-kpi-grid">
              <article className="energy-kpi-card accent-primary">
                <div className="energy-kpi-card__label">Текущее потребление</div>
                <div className="energy-kpi-card__value">
                  {formatNumber(selectedRegion.current_kw)} <span>кВт</span>
                </div>
                <div className="energy-kpi-card__meta">
                  Текущая мощность в зоне {selectedRegion.roomLabel}
                </div>
              </article>

              <article className="energy-kpi-card">
                <div className="energy-kpi-card__label">За выбранный период</div>
                <div className="energy-kpi-card__value">
                  {formatNumber(estimatedPeriodLoad, 0)} <span>кВт·ч</span>
                </div>
                <div className="energy-kpi-card__meta">
                  Суммарное потребление по всему этажу за {periodOption.label.toLowerCase()}
                </div>
              </article>

              <article className="energy-kpi-card accent-warning">
                <div className="energy-kpi-card__label">Отклонение от baseline</div>
                <div className="energy-kpi-card__value">
                  {formatSignedPercent(averageDelta)} <span>в среднем</span>
                </div>
                <div className="energy-kpi-card__meta">
                  Среднее отклонение от типичного профиля по этажу
                </div>
              </article>

              <article className="energy-kpi-card accent-danger">
                <div className="energy-kpi-card__label">Отклонения</div>
                <div className="energy-kpi-card__value">
                  {alertRegions.length} <span>случаев</span>
                </div>
                <div className="energy-kpi-card__meta">
                  Зон с повышенной нагрузкой в текущем снимке
                </div>
              </article>
            </section>

            <section className="energy-content-grid energy-content-grid--main">
              <article className="energy-panel energy-chart-panel">
                <div className="energy-panel__head">
                  <div>
                    <h2>Динамика потребления</h2>
                    <p>Факт, ожидаемое значение и отмеченные отклонения</p>
                  </div>
                  <div className="energy-legend">
                    <span><i className="actual" />Факт</span>
                    <span><i className="baseline" />Baseline</span>
                    <span><i className="alert" />Отклонения</span>
                  </div>
                </div>
                <div className="energy-chart-wrap">
                  <canvas
                    ref={canvasRef}
                    id="lineChart"
                    aria-label="График динамики энергопотребления"
                  />
                </div>
              </article>

              <article className="energy-panel">
                <div className="energy-panel__head compact">
                  <div>
                    <h2>События нагрузки</h2>
                    <p>Последние отклонения и пики по выбранной зоне</p>
                  </div>
                </div>

                <div className="energy-event-list">
                  {topLoadRegions.slice(0, 5).map((region, index) => (
                    <article
                      className={`energy-event-item ${region.level}`}
                      key={region.raw_id}
                    >
                      <div className="energy-event-item__time">
                        {`${14 - index}:${index === 0 ? '10' : '0' + index}`}
                      </div>
                      <div className="energy-event-item__body">
                        <div className="energy-event-item__title">{region.roomLabel}</div>
                        <div className="energy-event-item__text">
                          Нагрузка {formatSignedPercent(region.delta_pct)} к профилю,
                          текущая мощность {formatNumber(region.current_kw)} кВт
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
                    <h2>Потребление по зонам</h2>
                    <p>Наиболее нагруженные зоны на текущий момент</p>
                  </div>
                </div>

                <div className="energy-bar-chart">
                  {topLoadRegions.map((region) => (
                    <div
                      className={region.level === 'high' ? 'energy-bar-row alert' : 'energy-bar-row'}
                      key={region.raw_id}
                    >
                      <div className="energy-bar-row__label">{region.roomLabel}</div>
                      <div className="energy-bar-row__track">
                        <span
                          className="energy-bar-row__fill"
                          style={{
                            width: `${(region.current_kw / maxLoadRegion.current_kw) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="energy-bar-row__value">
                        {formatNumber(region.current_kw)} кВт
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="energy-panel">
                <div className="energy-panel__head compact">
                  <div>
                    <h2>Краткая сводка</h2>
                    <p>Самые важные наблюдения по текущему состоянию этажа</p>
                  </div>
                </div>

                <div className="energy-summary-list">
                  <div className="energy-summary-item">
                    <span className="energy-summary-item__label">Пиковая зона</span>
                    <strong className="energy-summary-item__value">{maxLoadRegion.roomLabel}</strong>
                    <span className="energy-summary-item__note">
                      {formatNumber(maxLoadRegion.current_kw)} кВт сейчас
                    </span>
                  </div>

                  <div className="energy-summary-item">
                    <span className="energy-summary-item__label">Максимум за период</span>
                    <strong className="energy-summary-item__value">
                      {formatNumber(maxLoadRegion.peak_kw)} кВт
                    </strong>
                    <span className="energy-summary-item__note">
                      в зоне {maxLoadRegion.roomLabel}
                    </span>
                  </div>

                  <div className="energy-summary-item">
                    <span className="energy-summary-item__label">Средняя нагрузка</span>
                    <strong className="energy-summary-item__value">
                      {formatNumber(averageLoad)} кВт
                    </strong>
                    <span className="energy-summary-item__note">
                      по всем помещениям этажа
                    </span>
                  </div>

                  <div className="energy-summary-item">
                    <span className="energy-summary-item__label">Ночная нагрузка</span>
                    <strong className="energy-summary-item__value">
                      {formatSignedPercent(nightDelta)}
                    </strong>
                    <span className="energy-summary-item__note">
                      выше типичного уровня в чувствительных зонах
                    </span>
                  </div>
                </div>
              </article>
            </section>
          </section>

          <section className={activeView === 'heatmap' ? 'energy-view active' : 'energy-view'}>
            <header className="energy-topbar">
              <div>
                <h1>Тепловая карта этажа</h1>
                <p>
                  Реальный план из Excel-файла. Масштабируй колесом мыши, перетаскивай план и нажимай на помещения.
                </p>
              </div>

              <div className="energy-toolbar">
                <label className="energy-control">
                  <span>Этаж</span>
                  <select defaultValue="3">
                    <option value="3">3 этаж</option>
                  </select>
                </label>

                <label className="energy-control">
                  <span>Режим</span>
                  <select value={mapMode} onChange={(event) => setMapMode(event.target.value)}>
                    <option value="deviation">Отклонение от профиля</option>
                    <option value="absolute">Текущая нагрузка</option>
                  </select>
                </label>

                <label className="energy-control">
                  <span>Снимок</span>
                  <select defaultValue="now">
                    <option value="now">Сейчас</option>
                    <option value="1h">1 час назад</option>
                    <option value="9am">Сегодня 09:00</option>
                  </select>
                </label>

                <button
                  className="energy-ghost-button"
                  type="button"
                  onClick={() => setActiveView('dashboard')}
                >
                  К дашборду
                </button>
              </div>
            </header>

            <section className="energy-content-grid energy-content-grid--heatmap">
              <article className="energy-panel">
                <div className="energy-panel__head energy-panel__head--map">
                  <div>
                    <h2>{FLOOR_PLAN.planTitle}</h2>
                    <p>{FLOOR_PLAN.sourceNote}</p>
                  </div>

                  <div className="energy-map-actions">
                    <div className="energy-legend">
                      <span><i className="scale-low" />Близко к обычному уровню</span>
                      <span><i className="scale-mid" />Выше среднего</span>
                      <span><i className="scale-high" />Пиковая нагрузка</span>
                    </div>

                    <div className="energy-zoom-controls">
                      <button type="button" onClick={() => handleZoom(1.18)}>−</button>
                      <button
                        type="button"
                        onClick={() =>
                          setViewBox({
                            x: 0,
                            y: 0,
                            width: FLOOR_PLAN.viewBox.width,
                            height: FLOOR_PLAN.viewBox.height,
                          })
                        }
                      >
                        100%
                      </button>
                      <button type="button" onClick={() => handleZoom(0.84)}>+</button>
                    </div>
                  </div>
                </div>

                <div className="energy-map-hint">
                  <span>
                    Масштаб: <strong>{zoomPercent}%</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Интерактивных помещений: <strong>{FLOOR_PLAN.regions.length}</strong>
                  </span>
                  <span>•</span>
                  <span>Нажми на помещение, чтобы увидеть показатели справа</span>
                </div>

                <div
                  className={isDragging ? 'energy-map-viewport dragging' : 'energy-map-viewport'}
                  onWheel={handleWheel}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  <svg
                    ref={svgRef}
                    className="energy-floor-svg"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <g>
                      <image
                        href={planFloorImage}
                        x="0"
                        y="0"
                        width={FLOOR_PLAN.viewBox.width}
                        height={FLOOR_PLAN.viewBox.height}
                      />

                      {FLOOR_PLAN.regions.map((region) => (
                        <path
                          key={region.raw_id}
                          d={region.path}
                          className={
                            selectedRegionId === region.raw_id
                              ? `${getRegionTone(mapMode, region.level)} selected`
                              : getRegionTone(mapMode, region.level)
                          }
                          onClick={() => setSelectedRegionId(region.raw_id)}
                        >
                          <title>
                            {`${region.roomLabel} - ${
                              mapMode === 'absolute'
                                ? `${formatNumber(region.current_kw)} kW`
                                : formatSignedPercent(region.delta_pct)
                            }`}
                          </title>
                        </path>
                      ))}

                      <g className={labelsVisible ? 'energy-label-layer visible' : 'energy-label-layer'}>
                        <defs>
                          {FLOOR_PLAN.regions.map((region) => (
                            <clipPath id={`${clipPathPrefix}-${region.raw_id}`} key={region.raw_id}>
                              <path d={region.path} />
                            </clipPath>
                          ))}
                        </defs>

                        {FLOOR_PLAN.regions.map((region) => {
                          if (!region.roomLabel) {
                            return null
                          }

                          const rotation = normalizeLabelRotation(region.roomLabelRotation)

                          return (
                            <text
                              key={`${region.raw_id}-label`}
                              className="energy-room-label"
                              x={region.centroid[0]}
                              y={region.centroid[1]}
                              fontSize={getRegionLabelFontSize(region)}
                              clipPath={`url(#${clipPathPrefix}-${region.raw_id})`}
                              transform={
                                rotation
                                  ? `rotate(${rotation} ${region.centroid[0]} ${region.centroid[1]})`
                                  : undefined
                              }
                            >
                              {getCompactRoomLabel(region.roomLabel)}
                            </text>
                          )
                        })}
                      </g>
                    </g>
                  </svg>
                </div>
              </article>

              <article className="energy-panel">
                <div className="energy-panel__head compact">
                  <div>
                    <h2>Детали по помещению</h2>
                    <p>Показатели выбранной области на плане</p>
                  </div>
                </div>

                <div className="energy-room-details">
                  <div className="energy-room-details__main">
                    <div className="energy-room-details__caption">Выбрано</div>
                    <div className="energy-room-details__room">{selectedRegion.roomLabel}</div>
                    <div className="energy-room-details__delta">
                      {selectedRegion.level_label} · {formatSignedPercent(selectedRegion.delta_pct)} к профилю
                    </div>
                  </div>

                  <div className="energy-room-details__list">
                    <div className="energy-room-details__row">
                      <span>Текущая нагрузка</span>
                      <strong>{formatNumber(selectedRegion.current_kw)} кВт</strong>
                    </div>
                    <div className="energy-room-details__row">
                      <span>Среднее за день</span>
                      <strong>{formatNumber(selectedRegion.avg_kw)} кВт</strong>
                    </div>
                    <div className="energy-room-details__row">
                      <span>Пик за период</span>
                      <strong>{formatNumber(selectedRegion.peak_kw)} кВт</strong>
                    </div>
                    <div className="energy-room-details__row">
                      <span>Доля нагрузки этажа</span>
                      <strong>{formatNumber(selectedRegion.share_pct)}%</strong>
                    </div>
                    <div className="energy-room-details__row">
                      <span>Позиция по нагрузке</span>
                      <strong>{selectedRegion.load_rank} место</strong>
                    </div>
                    <div className="energy-room-details__row">
                      <span>Последнее обновление</span>
                      <strong>14:29</strong>
                    </div>
                  </div>

                  <div className="energy-room-details__note">
                    {describeRegion(selectedRegion)}
                  </div>
                </div>
              </article>
            </section>
          </section>
        </section>
      </div>
    </main>
  )
}

export default DashboardPage
