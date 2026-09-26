import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import api from '../api/axios';

function timeAgo(value) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return date.toLocaleDateString('es-CO');
}

function NotificationBell() {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = async () => {
    try {
      const { data } = await api.get('/notifications');
      setItems(data.notifications || []);
      setUnread(data.unread || 0);
    } catch {
      setItems([]);
      setUnread(0);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markAll = async () => {
    try {
      await api.patch('/notifications/read-all');
      await load();
    } catch {
      /* keep current list */
    }
  };

  const openItem = async (item) => {
    try {
      await api.patch(`/notifications/${item.notification_id}/read`);
    } catch {
      /* navigation still proceeds */
    }
    setOpen(false);
    navigate(item.link || '/notificaciones');
    load();
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) {
            load();
          }
        }}
        className="relative rounded-full p-2 text-primary-dark hover:bg-primary-light"
        aria-label="Notificaciones"
      >
        <Bell size={20} />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-5 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-secondary-light">
          <div className="flex items-center justify-between border-b border-secondary-light px-4 py-3">
            <p className="text-sm font-semibold text-primary-dark">Notificaciones</p>
            <button type="button" onClick={markAll} className="text-xs font-medium text-primary hover:underline">
              Marcar todas como leídas
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.slice(0, 8).length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-primary-dark/60">No tienes notificaciones.</li>
            ) : (
              items.slice(0, 8).map((item) => (
                <li key={item.notification_id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={`w-full px-4 py-3 text-left hover:bg-primary-light/60 ${item.is_read ? '' : 'bg-primary-light/30'}`}
                  >
                    <p className="text-sm font-semibold text-primary-dark">{item.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-primary-dark/70">{item.body}</p>
                    <p className="mt-1 text-[11px] text-secondary">{timeAgo(item.created_at)}</p>
                  </button>
                </li>
              ))
            )}
          </ul>
          <Link
            to="/notificaciones"
            onClick={() => setOpen(false)}
            className="block border-t border-secondary-light px-4 py-2.5 text-center text-sm font-semibold text-primary"
          >
            Ver historial
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export default NotificationBell;
