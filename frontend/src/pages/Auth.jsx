import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth, getHomePath } from '../context/AuthContext';

const registerInitial = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  password: '',
  terms_accepted: true,
};

function Auth() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const initialTab = location.pathname === '/register' ? 'register' : 'login';

  const [tab, setTab] = useState(initialTab);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState(registerInitial);

  useEffect(() => {
    setTab(location.pathname === '/register' ? 'register' : 'login');
  }, [location.pathname]);

  const title = useMemo(
    () => (tab === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'),
    [tab]
  );

  const switchTab = (nextTab) => {
    setTab(nextTab);
    setError('');
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const { data } = await api.post('/auth/login', loginForm);
      login(data.token, data.user);
      const from = location.state?.from;
      navigate(typeof from === 'string' && from.startsWith('/') ? from : getHomePath(data.user));
    } catch (err) {
      setError(err.response?.data?.message || 'Credenciales inválidas');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await api.post('/auth/register', {
        ...registerForm,
        phone: registerForm.phone || null,
        terms_accepted: true,
      });
      const { data } = await api.post('/auth/login', {
        email: registerForm.email,
        password: registerForm.password,
      });
      login(data.token, data.user);
      navigate(getHomePath(data.user));
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo completar el registro');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-secondary-light bg-background px-3 py-2.5 text-base outline-none focus:border-primary';

  return (
    <section className="relative flex min-h-[calc(100dvh-5rem)] items-center justify-center overflow-hidden px-4 py-8 sm:py-12">
      <div className="absolute inset-0 bg-gradient-to-br from-primary-light via-background to-secondary-light" />
      <div className="absolute -left-16 top-20 h-48 w-48 rounded-full bg-accent-sage/40 blur-2xl" />
      <div className="absolute -right-10 bottom-10 h-56 w-56 rounded-full bg-accent-sand/70 blur-2xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/70 bg-white/95 p-6 shadow-xl backdrop-blur sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/logo.jpg" alt="Pet Resort" className="mx-auto mb-4 h-24 w-auto object-contain sm:h-36" />
          <h1 className="text-2xl font-semibold text-primary-dark">{title}</h1>
          <p className="mt-1 text-sm text-primary-dark/70">
            Accede para cuidar, reservar y acompañar a tu mascota.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-secondary-light/60 p-1">
          <button
            type="button"
            onClick={() => switchTab('login')}
            aria-pressed={tab === 'login'}
            className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
              tab === 'login'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-transparent text-primary-dark/70 hover:text-primary-dark'
            }`}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => switchTab('register')}
            aria-pressed={tab === 'register'}
            className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
              tab === 'register'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-transparent text-primary-dark/70 hover:text-primary-dark'
            }`}
          >
            Crear Cuenta
          </button>
        </div>

        {tab === 'login' ? (
          <form className="flex flex-col gap-4" onSubmit={handleLogin}>
            <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, email: event.target.value }))
                }
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
              Contraseña
              <input
                type="password"
                required
                autoComplete="current-password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, password: event.target.value }))
                }
                className={inputClass}
              />
            </label>
            {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-primary py-2.5 font-medium text-white hover:bg-primary-dark disabled:opacity-70"
            >
              {submitting ? 'Ingresando...' : 'Acceder'}
            </button>
          </form>
        ) : (
          <form className="grid gap-4" onSubmit={handleRegister}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
                Nombre
                <input
                  required
                  value={registerForm.first_name}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, first_name: event.target.value }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
                Apellido
                <input
                  required
                  value={registerForm.last_name}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, last_name: event.target.value }))
                  }
                  className={inputClass}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={registerForm.email}
                onChange={(event) =>
                  setRegisterForm((current) => ({ ...current, email: event.target.value }))
                }
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
              Teléfono
              <input
                value={registerForm.phone}
                onChange={(event) =>
                  setRegisterForm((current) => ({ ...current, phone: event.target.value }))
                }
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
              Contraseña
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={registerForm.password}
                onChange={(event) =>
                  setRegisterForm((current) => ({ ...current, password: event.target.value }))
                }
                className={inputClass}
              />
            </label>
            {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-secondary py-2.5 font-medium text-white hover:bg-primary-dark disabled:opacity-70"
            >
              {submitting ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

export default Auth;
