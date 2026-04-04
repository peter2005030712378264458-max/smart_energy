import { useEffect, useState } from 'react'
import './App.css'

const API_BASE = '/api/auth'

let accessToken = null
let refreshPromise = null

function setAccessToken(token) {
  accessToken = token ?? null
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/refresh/`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Не удалось обновить сессию')
        }

        const data = await response.json()
        setAccessToken(data.access)
        return data.access
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

async function apiRequest(path, options = {}, retry = true) {
  const headers = new Headers(options.headers ?? {})

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (response.status !== 401 || !retry || path === '/refresh/') {
    return response
  }

  try {
    await refreshAccessToken()
  } catch {
    setAccessToken(null)
    return response
  }

  const nextHeaders = new Headers(options.headers ?? {})
  if (accessToken) {
    nextHeaders.set('Authorization', `Bearer ${accessToken}`)
  }

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: nextHeaders,
    credentials: 'include',
  })
}

function splitName(value) {
  const [firstName = '', ...rest] = value.trim().split(/\s+/)

  return {
    first_name: firstName,
    last_name: rest.join(' '),
  }
}

function FieldIcon({ type }) {
  if (type === 'email') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
        <path d="m5.5 7 6.5 5 6.5-5" />
      </svg>
    )
  }

  if (type === 'user') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M5 19a7 7 0 0 1 14 0" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 10V8a4 4 0 1 1 8 0v2" />
      <rect x="5" y="10" width="14" height="10" rx="2.5" />
    </svg>
  )
}

function PasswordToggle({ visible, onClick }) {
  return (
    <button
      className="field-action"
      type="button"
      onClick={onClick}
      aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  )
}

function AuthField({
  label,
  type,
  placeholder,
  value,
  onChange,
  autoComplete,
  action,
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-control">
        <span className="field-icon">
          <FieldIcon type={type} />
        </span>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required
        />
        {action}
      </span>
    </label>
  )
}

const initialLogin = {
  email: '',
  password: '',
  remember: false,
}

const initialRegister = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  acceptTerms: false,
}

function App() {
  const [mode, setMode] = useState('login')
  const [loginForm, setLoginForm] = useState(initialLogin)
  const [registerForm, setRegisterForm] = useState(initialRegister)
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false)
  const [registerPasswordVisible, setRegisterPasswordVisible] = useState(false)
  const [registerConfirmVisible, setRegisterConfirmVisible] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [status, setStatus] = useState('Проверяем сохраненную сессию...')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    let active = true

    async function bootstrapSession() {
      try {
        await refreshAccessToken()
        const response = await apiRequest('/me/')

        if (!response.ok) {
          throw new Error('Сессия не найдена')
        }

        const user = await response.json()

        if (active) {
          setCurrentUser(user)
          setStatus('Сессия восстановлена')
        }
      } catch {
        setAccessToken(null)
        if (active) {
          setStatus('Войдите, чтобы продолжить')
        }
      } finally {
        if (active) {
          setBusy(false)
        }
      }
    }

    bootstrapSession()

    return () => {
      active = false
    }
  }, [])

  function updateLoginField(field, value) {
    setLoginForm((current) => ({ ...current, [field]: value }))
  }

  function updateRegisterField(field, value) {
    setRegisterForm((current) => ({ ...current, [field]: value }))
  }

  async function loadCurrentUser(nextStatus = 'Успешный вход') {
    const response = await apiRequest('/me/')

    if (!response.ok) {
      throw new Error('Не удалось получить профиль')
    }

    const user = await response.json()
    setCurrentUser(user)
    setStatus(nextStatus)
  }

  async function handleLogin(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setStatus('Выполняем вход...')

    try {
      const response = await fetch(`${API_BASE}/login/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginForm.email.trim(),
          password: loginForm.password,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.detail ?? 'Не удалось войти')
      }

      setAccessToken(data.access)
      await loadCurrentUser('Вы вошли в систему')
      setLoginForm(initialLogin)
    } catch (requestError) {
      setAccessToken(null)
      setCurrentUser(null)
      setError(requestError.message)
      setStatus('Ошибка входа')
    } finally {
      setBusy(false)
    }
  }

  async function handleRegister(event) {
    event.preventDefault()

    if (registerForm.password !== registerForm.confirmPassword) {
      setError('Пароли не совпадают')
      return
    }

    if (!registerForm.acceptTerms) {
      setError('Нужно принять условия использования')
      return
    }

    setBusy(true)
    setError('')
    setStatus('Создаем аккаунт...')

    try {
      const name = splitName(registerForm.name)
      const response = await fetch(`${API_BASE}/register/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: registerForm.email.trim(),
          password: registerForm.password,
          first_name: name.first_name,
          last_name: name.last_name,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const firstError = Object.values(data)[0]
        throw new Error(
          Array.isArray(firstError) ? firstError[0] : firstError ?? 'Не удалось зарегистрироваться',
        )
      }

      const loginResponse = await fetch(`${API_BASE}/login/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: registerForm.email.trim(),
          password: registerForm.password,
        }),
      })

      const loginData = await loginResponse.json().catch(() => ({}))

      if (!loginResponse.ok) {
        throw new Error(loginData.detail ?? 'Регистрация прошла, но вход не выполнен')
      }

      setAccessToken(loginData.access)
      await loadCurrentUser('Аккаунт создан')
      setRegisterForm(initialRegister)
    } catch (requestError) {
      setAccessToken(null)
      setCurrentUser(null)
      setError(requestError.message)
      setStatus('Ошибка регистрации')
    } finally {
      setBusy(false)
    }
  }

  function handleLogout() {
    setAccessToken(null)
    setCurrentUser(null)
    setStatus('Вы вышли из системы')
    setError('')
  }

  const isAuthenticated = currentUser !== null

  return (
    <main className="auth-shell">
      <div className="auth-background auth-background-left" aria-hidden="true" />
      <div className="auth-background auth-background-right" aria-hidden="true" />

      <section className="auth-card">
        {!isAuthenticated ? (
          <>
            <header className="auth-header">
              <h1>{mode === 'login' ? 'Вход в систему' : 'Регистрация'}</h1>
              <p>
                {mode === 'login'
                  ? 'Введите свои данные для входа'
                  : 'Создайте новый аккаунт'}
              </p>
            </header>

            <form
              className="auth-form"
              onSubmit={mode === 'login' ? handleLogin : handleRegister}
            >
              {mode === 'register' ? (
                <AuthField
                  label="Имя пользователя"
                  type="user"
                  placeholder="Иван Иванов"
                  value={registerForm.name}
                  onChange={(event) => updateRegisterField('name', event.target.value)}
                  autoComplete="name"
                />
              ) : null}

              <AuthField
                label="Электронная почта"
                type="email"
                placeholder="name@example.com"
                value={mode === 'login' ? loginForm.email : registerForm.email}
                onChange={(event) =>
                  mode === 'login'
                    ? updateLoginField('email', event.target.value)
                    : updateRegisterField('email', event.target.value)
                }
                autoComplete="email"
              />

              <AuthField
                label="Пароль"
                type={
                  mode === 'login'
                    ? loginPasswordVisible
                      ? 'text'
                      : 'password'
                    : registerPasswordVisible
                      ? 'text'
                      : 'password'
                }
                placeholder="••••••••"
                value={mode === 'login' ? loginForm.password : registerForm.password}
                onChange={(event) =>
                  mode === 'login'
                    ? updateLoginField('password', event.target.value)
                    : updateRegisterField('password', event.target.value)
                }
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                action={
                  <PasswordToggle
                    visible={
                      mode === 'login'
                        ? loginPasswordVisible
                        : registerPasswordVisible
                    }
                    onClick={() =>
                      mode === 'login'
                        ? setLoginPasswordVisible((value) => !value)
                        : setRegisterPasswordVisible((value) => !value)
                    }
                  />
                }
              />

              {mode === 'register' ? (
                <AuthField
                  label="Подтвердите пароль"
                  type={registerConfirmVisible ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={registerForm.confirmPassword}
                  onChange={(event) =>
                    updateRegisterField('confirmPassword', event.target.value)
                  }
                  autoComplete="new-password"
                  action={
                    <PasswordToggle
                      visible={registerConfirmVisible}
                      onClick={() => setRegisterConfirmVisible((value) => !value)}
                    />
                  }
                />
              ) : null}

              {mode === 'login' ? (
                <div className="auth-row">
                  <label className="check-control">
                    <input
                      type="checkbox"
                      checked={loginForm.remember}
                      onChange={(event) =>
                        updateLoginField('remember', event.target.checked)
                      }
                    />
                    <span>Запомнить меня</span>
                  </label>
                  <button type="button" className="text-link muted-link">
                    Забыли пароль?
                  </button>
                </div>
              ) : (
                <label className="check-control">
                  <input
                    type="checkbox"
                    checked={registerForm.acceptTerms}
                    onChange={(event) =>
                      updateRegisterField('acceptTerms', event.target.checked)
                    }
                  />
                  <span>
                    Я принимаю <button type="button" className="text-link">условия использования</button>{' '}
                    и <button type="button" className="text-link">политику конфиденциальности</button>
                  </span>
                </label>
              )}

              <button className="primary-button" type="submit" disabled={busy}>
                {busy
                  ? 'Подождите...'
                  : mode === 'login'
                    ? 'Войти'
                    : 'Зарегистрироваться'}
              </button>

              <div className="divider" aria-hidden="true">
                <span>или</span>
              </div>

              <p className="switch-copy">
                {mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}{' '}
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setMode((current) => (current === 'login' ? 'register' : 'login'))
                    setError('')
                    setStatus('Войдите, чтобы продолжить')
                  }}
                >
                  {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
                </button>
              </p>
            </form>
          </>
        ) : (
          <section className="profile-panel">
            <header className="auth-header">
              <h1>Сессия активна</h1>
              <p>Авторизация работает через `access` в памяти и `refresh` в HttpOnly cookie.</p>
            </header>

            <div className="profile-grid">
              <div className="profile-item">
                <span>Имя</span>
                <strong>{currentUser.first_name || 'Не указано'}</strong>
              </div>
              <div className="profile-item">
                <span>Email</span>
                <strong>{currentUser.email}</strong>
              </div>
              <div className="profile-item">
                <span>Дата регистрации</span>
                <strong>
                  {new Date(currentUser.registered_at).toLocaleString('ru-RU')}
                </strong>
              </div>
            </div>

            <button className="primary-button" type="button" onClick={handleLogout}>
              Выйти
            </button>
          </section>
        )}

        <footer className="auth-footer">
          <p>{status}</p>
          {error ? <p className="auth-error">{error}</p> : null}
        </footer>
      </section>
    </main>
  )
}

export default App
