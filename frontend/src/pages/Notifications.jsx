import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import api from '../api/axios';

function Notifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const { data } = await api.get('/notifications');
      setItems(data.notifications || []);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudieron cargar las notificaciones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markAll = async () => {
    await api.patch('/notifications/read-all');
    await load();
  };

  const openItem = async (item) => {
    await api.patch(`/notifications/${item.notification_id}/read`);
    await load();
  };

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-secondary">Cliente</p>
          <h1 className="inline-flex items-center gap-2 text-3xl font-semibold text-primary-dark">
            <Bell size={26} />
            Notificaciones
          </h1>
        </div>
        <button
          type="button"
          onClick={markAll}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary-dark ring-1 ring-secondary-light"
        >
          Marcar todas como leídas
        </button>
      </div>

      {error ? <p className="mb-4 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-primary-dark">Cargando notificaciones...</p> : null}

      {!loading && items.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-primary-dark/70 shadow-sm">
          Aún no hay avisos de reservas, bitácora o spa.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.notification_id}>
              <Link
                to={item.link || '/reservar'}
                onClick={() => openItem(item)}
                className={`block rounded-2xl p-4 shadow-sm ring-1 ring-secondary-light ${
                  item.is_read ? 'bg-white' : 'bg-primary-light/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-primary-dark">{item.title}</p>
                    <p className="mt-1 text-sm text-primary-dark/75">{item.body}</p>
                  </div>
                  {!item.is_read ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" /> : null}
                </div>
                <p className="mt-2 text-xs text-secondary">
                  {new Date(item.created_at).toLocaleString('es-CO')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default Notifications;
