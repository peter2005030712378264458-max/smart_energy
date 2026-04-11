import '../dashboard.css'

const navigationItems = [
  { label: 'Обзор', icon: 'grid', active: true },
  { label: 'Источники', icon: 'layers' },
  { label: 'Отчеты', icon: 'report' },
  { label: 'Метрики', icon: 'pulse' },
  { label: 'Аномалии', icon: 'alert' },
  { label: 'Сравнение', icon: 'compare' },
  { label: 'Настройки', icon: 'settings' },
]

const kpis = [
  { label: 'Всего записей', value: '24 816', delta: '+12.4%', trend: 'positive' },
  { label: 'Активные процессы', value: '138', delta: '+8', trend: 'positive' },
  { label: 'Отклонения', value: '17', delta: '-3.1%', trend: 'positive' },
  { label: 'Среднее время', value: '4.8 мин', delta: '+0.6', trend: 'negative' },
]

const alerts = [
  { title: 'Пиковая нагрузка', meta: 'Северный контур', level: 'critical' },
  { title: 'Задержка обновления', meta: 'Источник API-04', level: 'warning' },
  { title: 'Порог в норме', meta: 'Главный ввод', level: 'stable' },
]

const events = [
  ['10:45', 'Обновлен прогноз потребления', 'Модель v2.1'],
  ['10:20', 'Обнаружено отклонение', 'Цех 3'],
  ['09:58', 'Синхронизация источника', 'SCADA-01'],
  ['09:30', 'Сформирован отчет', 'Смена А'],
]

function DashboardIcon({ type }) {
  const icons = {
    grid: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1.5" />
        <rect x="14" y="4" width="6" height="6" rx="1.5" />
        <rect x="4" y="14" width="6" height="6" rx="1.5" />
        <rect x="14" y="14" width="6" height="6" rx="1.5" />
      </>
    ),
    layers: (
      <>
        <path d="m12 4 8 4-8 4-8-4 8-4Z" />
        <path d="m4 12 8 4 8-4" />
        <path d="m4 16 8 4 8-4" />
      </>
    ),
    report: (
      <>
        <path d="M7 4h7l3 3v13H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
        <path d="M14 4v4h4" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </>
    ),
    pulse: (
      <path d="M3 12h4l2-6 4 12 2-6h6" />
    ),
    alert: (
      <>
        <path d="M12 4 3 20h18L12 4Z" />
        <path d="M12 9v5" />
        <path d="M12 17h.01" />
      </>
    ),
    compare: (
      <>
        <path d="M7 6h10" />
        <path d="m14 3 3 3-3 3" />
        <path d="M17 18H7" />
        <path d="m10 15-3 3 3 3" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7.1 7.1 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.1 7.1 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" />
      </>
    ),
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
        <path d="M10 21h4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M19 12a7 7 0 0 0-12-5" />
        <path d="M5 12a7 7 0 0 0 12 5" />
      </>
    ),
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {icons[type]}
    </svg>
  )
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
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function DashboardPage({ currentUser, onLogout }) {
  const userName = getUserName(currentUser)

  return (
    <main className="dashboard-shell">
      <div className="dashboard-glow dashboard-glow-left" aria-hidden="true" />
      <div className="dashboard-glow dashboard-glow-right" aria-hidden="true" />

      <aside className="dashboard-sidebar" aria-label="Навигация">
        <div className="dashboard-brand">
          <span className="dashboard-brand-mark">SE</span>
          <span>Smart Energy</span>
        </div>

        <nav className="dashboard-nav">
          {navigationItems.map((item) => (
            <button
              className={item.active ? 'dashboard-nav-item active' : 'dashboard-nav-item'}
              type="button"
              key={item.label}
            >
              <DashboardIcon type={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="dashboard-workspace">
        <header className="dashboard-topbar">
          <div>
            <p className="dashboard-eyebrow">Аналитика</p>
            <h1>Обзор энергопотребления</h1>
          </div>

          <div className="dashboard-actions">
            <label className="dashboard-search">
              <span>Поиск</span>
              <input type="search" placeholder="Проект, источник, метрика" />
            </label>

            <select aria-label="Период" defaultValue="month">
              <option value="day">Сегодня</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
              <option value="year">Год</option>
            </select>

            <select aria-label="Подразделение" defaultValue="all">
              <option value="all">Все подразделения</option>
              <option value="north">Северный контур</option>
              <option value="factory">Производство</option>
            </select>

            <button className="dashboard-icon-button" type="button" aria-label="Обновить">
              <DashboardIcon type="refresh" />
            </button>
            <button className="dashboard-icon-button" type="button" aria-label="Уведомления">
              <DashboardIcon type="bell" />
            </button>
            <button className="dashboard-user" type="button" onClick={onLogout}>
              <span>{getUserInitials(userName)}</span>
              <strong>Выйти</strong>
            </button>
          </div>
        </header>

        <section className="kpi-grid" aria-label="Ключевые показатели">
          {kpis.map((item) => (
            <article className="dashboard-card kpi-card" key={item.label}>
              <div>
                <p>{item.label}</p>
                <strong>{item.value}</strong>
              </div>
              <span className={`kpi-delta ${item.trend}`}>{item.delta}</span>
              <div className="mini-bars" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </article>
          ))}
        </section>

        <section className="analytics-grid">
          <article className="dashboard-card chart-card">
            <div className="card-heading">
              <div>
                <p>Динамика</p>
                <h2>Потребление по времени</h2>
              </div>
              <span>кВт·ч</span>
            </div>

            <div className="line-chart-placeholder" aria-label="Каркас графика без данных">
              <div className="chart-grid-lines" aria-hidden="true" />
              <div className="chart-line main-line" aria-hidden="true" />
              <div className="chart-line secondary-line" aria-hidden="true" />
              <span className="chart-dot dot-one" aria-hidden="true" />
              <span className="chart-dot dot-two" aria-hidden="true" />
              <div className="chart-axis">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>24:00</span>
              </div>
            </div>
          </article>

          <aside className="side-stack">
            <article className="dashboard-card">
              <div className="card-heading">
                <div>
                  <p>Статусы</p>
                  <h2>Текущие алерты</h2>
                </div>
              </div>

              <div className="alert-list">
                {alerts.map((alert) => (
                  <div className="alert-row" key={alert.title}>
                    <span className={`alert-marker ${alert.level}`} />
                    <div>
                      <strong>{alert.title}</strong>
                      <p>{alert.meta}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="dashboard-card distribution-card">
              <div className="card-heading">
                <div>
                  <p>Распределение</p>
                  <h2>Категории</h2>
                </div>
              </div>
              <div className="donut-placeholder" aria-label="Каркас диаграммы без данных">
                <span>42%</span>
              </div>
              <div className="legend-row">
                <span>Производство</span>
                <strong>Освещение</strong>
              </div>
            </article>
          </aside>
        </section>

        <section className="dashboard-card events-card">
          <div className="card-heading">
            <div>
              <p>Журнал</p>
              <h2>Последние события</h2>
            </div>
            <button className="secondary-button" type="button">Экспорт</button>
          </div>

          <div className="events-table">
            {events.map(([time, event, source]) => (
              <div className="events-row" key={`${time}-${event}`}>
                <span>{time}</span>
                <strong>{event}</strong>
                <p>{source}</p>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}

export default DashboardPage
