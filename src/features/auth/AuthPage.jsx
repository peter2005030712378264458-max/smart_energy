import { useEffect, useState } from 'react'
import { login, register } from './authApi.js'
import { apiRequest, refreshAccessToken } from './authClient.js'
import LoginForm from './LoginForm.jsx'
import ProfilePanel from './ProfilePanel.jsx'
import RegisterForm from './RegisterForm.jsx'
import { clearAccessToken, setAccessToken } from './tokenStore.js'
import './auth.css'

const initialLogin = {
  email: '',
  password: '',
  remember: false,
}

const initialRegister = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  acceptTerms: false,
}

function getRegisterErrorMessage(response, data) {
  if (response.status === 400 && Array.isArray(data.email) && data.email.length > 0) {
    return 'Пользователь с таким email уже существует'
  }

  const firstError = Object.values(data)[0]

  return Array.isArray(firstError)
    ? firstError[0]
    : firstError ?? 'Не удалось зарегистрироваться'
}

function AuthPage() {
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
        clearAccessToken()
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
      const response = await login({
        email: loginForm.email.trim(),
        password: loginForm.password,
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.detail ?? 'Не удалось войти')
      }

      setAccessToken(data.access)
      await loadCurrentUser('Вы вошли в систему')
      setLoginForm(initialLogin)
    } catch (requestError) {
      clearAccessToken()
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
      const response = await register({
        email: registerForm.email.trim(),
        password: registerForm.password,
        first_name: registerForm.firstName.trim(),
        last_name: registerForm.lastName.trim(),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(getRegisterErrorMessage(response, data))
      }

      const loginResponse = await login({
        email: registerForm.email.trim(),
        password: registerForm.password,
      })
      const loginData = await loginResponse.json().catch(() => ({}))

      if (!loginResponse.ok) {
        throw new Error(loginData.detail ?? 'Регистрация прошла, но вход не выполнен')
      }

      setAccessToken(loginData.access)
      await loadCurrentUser('Аккаунт создан')
      setRegisterForm(initialRegister)
    } catch (requestError) {
      clearAccessToken()
      setCurrentUser(null)
      setError(requestError.message)
      setStatus('Ошибка регистрации')
    } finally {
      setBusy(false)
    }
  }

  function handleLogout() {
    clearAccessToken()
    setCurrentUser(null)
    setStatus('Вы вышли из системы')
    setError('')
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
    setStatus('Войдите, чтобы продолжить')
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

            {mode === 'login' ? (
              <LoginForm
                busy={busy}
                email={loginForm.email}
                password={loginForm.password}
                remember={loginForm.remember}
                passwordVisible={loginPasswordVisible}
                onEmailChange={(event) => updateLoginField('email', event.target.value)}
                onPasswordChange={(event) => updateLoginField('password', event.target.value)}
                onRememberChange={(event) =>
                  updateLoginField('remember', event.target.checked)
                }
                onTogglePassword={() =>
                  setLoginPasswordVisible((current) => !current)
                }
                onSubmit={handleLogin}
                onSwitchMode={() => switchMode('register')}
              />
            ) : (
              <RegisterForm
                busy={busy}
                firstName={registerForm.firstName}
                lastName={registerForm.lastName}
                email={registerForm.email}
                password={registerForm.password}
                confirmPassword={registerForm.confirmPassword}
                acceptTerms={registerForm.acceptTerms}
                passwordVisible={registerPasswordVisible}
                confirmVisible={registerConfirmVisible}
                onFirstNameChange={(event) =>
                  updateRegisterField('firstName', event.target.value)
                }
                onLastNameChange={(event) =>
                  updateRegisterField('lastName', event.target.value)
                }
                onEmailChange={(event) => updateRegisterField('email', event.target.value)}
                onPasswordChange={(event) =>
                  updateRegisterField('password', event.target.value)
                }
                onConfirmPasswordChange={(event) =>
                  updateRegisterField('confirmPassword', event.target.value)
                }
                onAcceptTermsChange={(event) =>
                  updateRegisterField('acceptTerms', event.target.checked)
                }
                onTogglePassword={() =>
                  setRegisterPasswordVisible((current) => !current)
                }
                onToggleConfirmPassword={() =>
                  setRegisterConfirmVisible((current) => !current)
                }
                onSubmit={handleRegister}
                onSwitchMode={() => switchMode('login')}
              />
            )}
          </>
        ) : (
          <ProfilePanel currentUser={currentUser} onLogout={handleLogout} />
        )}

        <footer className="auth-footer">
          <p>{status}</p>
          {error ? <p className="auth-error">{error}</p> : null}
        </footer>
      </section>
    </main>
  )
}

export default AuthPage
