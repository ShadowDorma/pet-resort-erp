import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Menu, UserRound, X } from 'lucide-react';
import { getPrimaryRole, useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

const publicLinks = [
  { to: '/', label: 'Inicio' },
  { to: '/servicios', label: 'Servicios' },
];

const roleLinks = (role) => {
  if (role === 'ADMIN') {
    return [
      { to: '/admin', label: 'Panel Admin' },
      { to: '/recepcion', label: 'Recepción' },
      { to: '/cuidados', label: 'Cuidados' },
      { to: '/estetica', label: 'Estética' },
      { to: '/staff', label: 'Agenda' },
    ];
  }
  if (role === 'RECEPCIONIST') {
    return [{ to: '/recepcion', label: 'Recepción' }];
  }
  if (role === 'CARETAKER') {
    return [{ to: '/cuidados', label: 'Cuidados' }];
  }
  if (role === 'STYLIST') {
    return [{ to: '/estetica', label: 'Estética' }];
  }
  return [
    { to: '/reservar', label: 'Mis Reservas' },
    { to: '/mis-mascotas', label: 'Mis Mascotas' },
  ];
};

const PATH_ALIASES = {
  '/reception': '/recepcion',
  '/caretaker': '/cuidados',
  '/stylist': '/estetica',
};

const normalizePath = (path) => PATH_ALIASES[path] || path;

const isActivePath = (pathname, to) => {
  const current = normalizePath(pathname);
  const target = normalizePath(to);
  if (target === '/') {
    return current === '/';
  }
  return current === target;
};

const linkClass = (active) =>
  [
    'rounded-full px-3 py-2 text-sm font-medium transition-colors',
    active ? 'bg-primary text-white' : 'text-primary-dark hover:bg-primary-light',
  ].join(' ');

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const role = getPrimaryRole(user);
  const visiblePublicLinks = publicLinks.filter(
    (link) => !(role === 'ADMIN' && link.to === '/servicios')
  );
  const privateLinks = roleLinks(role);
  const initials = user
    ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || 'PR'
    : '';

  useEffect(() => {
    const onClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const closeMenus = () => {
    setOpen(false);
    setMenuOpen(false);
  };

  const handleLogout = () => {
    logout();
    closeMenus();
    navigate('/');
  };

  const accountLinks = [{ to: '/perfil', label: 'Mi Perfil', icon: UserRound }];

  return (
    <header className="sticky top-0 z-40 border-b border-secondary-light bg-white/90 backdrop-blur">
      <nav className="pointer-events-auto mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center" onClick={closeMenus}>
          <img src="/logo.jpg" alt="Pet Resort" className="h-12 w-auto object-contain sm:h-16 md:h-20" />
        </Link>

        <div className="flex items-center gap-1 md:hidden">
          {user && role === 'CLIENT' ? <NotificationBell /> : null}
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-md p-2 text-primary-dark"
            onClick={() => setOpen((value) => !value)}
            aria-label="Abrir menú"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {visiblePublicLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={linkClass(isActivePath(location.pathname, link.to))}
            >
              {link.label}
            </Link>
          ))}

          {user
            ? privateLinks.map((link) => (
                <button
                  key={link.to}
                  type="button"
                  className={linkClass(isActivePath(location.pathname, link.to))}
                  onClick={() => {
                    closeMenus();
                    navigate(link.to);
                  }}
                >
                  {link.label}
                </button>
              ))
            : null}

          {user ? (
            <div className="flex items-center gap-1">
              {role === 'CLIENT' ? <NotificationBell /> : null}
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((value) => !value)}
                  className="inline-flex items-center gap-2 rounded-full bg-primary-light px-3 py-1.5 text-sm font-semibold text-primary-dark"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs text-white">
                    {initials}
                  </span>
                  <span className="max-w-[9rem] truncate">{user.first_name}</span>
                  <ChevronDown size={16} />
                </button>
                {menuOpen ? (
                  <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl bg-white py-2 shadow-lg ring-1 ring-secondary-light">
                    {accountLinks.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={closeMenus}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-primary-dark hover:bg-primary-light"
                      >
                        <link.icon size={16} />
                        {link.label}
                      </Link>
                    ))}
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-left text-sm font-medium text-accent-purple hover:bg-primary-light"
                    >
                      Cerrar sesión
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <Link
              to="/auth"
              className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-dark"
            >
              Iniciar Sesión
            </Link>
          )}
        </div>
      </nav>

      {open ? (
        <div className="flex flex-col gap-2 border-t border-secondary-light bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
          {visiblePublicLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={linkClass(isActivePath(location.pathname, link.to))}
              onClick={closeMenus}
            >
              {link.label}
            </Link>
          ))}

          {user
            ? privateLinks.map((link) => (
                <button
                  key={link.to}
                  type="button"
                  className={linkClass(isActivePath(location.pathname, link.to))}
                  onClick={() => {
                    closeMenus();
                    navigate(link.to);
                  }}
                >
                  {link.label}
                </button>
              ))
            : null}

          {user ? (
            <>
              {accountLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={linkClass(isActivePath(location.pathname, link.to))}
                  onClick={closeMenus}
                >
                  {link.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full bg-accent-purple px-4 py-2 text-sm font-medium text-white"
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="rounded-full bg-primary px-5 py-2 text-center text-sm font-medium text-white"
              onClick={closeMenus}
            >
              Iniciar Sesión
            </Link>
          )}
        </div>
      ) : null}
    </header>
  );
}

export default Navbar;
