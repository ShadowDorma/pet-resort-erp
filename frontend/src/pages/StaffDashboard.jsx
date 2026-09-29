import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, DoorOpen, LogIn, LogOut } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import PanelSkeleton from '../components/PanelSkeleton';
import { asArray, asObject, requestErrorMessage } from '../lib/safeData';

const inputClass = 'w-full rounded-xl border border-secondary-light px-3 py-2 text-sm text-primary-dark';
const IN_HOUSE = ['IN_HOUSE', 'CHECKED_IN', 'IN_PROGRESS'];

const statusLabel = (status) => {
  const map = {
    PENDING: 'Pendiente',
    CONFIRMED: 'Confirmada',
    IN_HOUSE: 'En sitio',
    CHECKED_IN: 'En sitio',
    IN_PROGRESS: 'En sitio',
    COMPLETED: 'Finalizado',
    CANCELLED: 'Cancelada',
  };
  return map[status] || status;
};

function StaffDashboard() {
  const { user } = useAuth();
  const roles = (user?.roles || []).map((role) => String(role).toUpperCase());
  const isFieldStaff = roles.some((role) => ['CARETAKER', 'CAREGIVER', 'STYLIST', 'GROOMER', 'TRAINER', 'VETERINARIAN'].includes(role));
  const [tab, setTab] = useState(isFieldStaff ? 'care' : 'reception');
  const [agenda, setAgenda] = useState([]);
  const [board, setBoard] = useState([]);
  const [occupancy, setOccupancy] = useState({ occupied: 0, available: 0, total: 0, spaces: [] });
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [showAllActive, setShowAllActive] = useState(true);
  const [checkInId, setCheckInId] = useState(null);
  const [checkInNotes, setCheckInNotes] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const loadReception = async () => {
    const [agendaRes, occupancyRes, bookingsRes] = await Promise.allSettled([
      api.get('/staff/today', { params: { all: 'true' } }),
      api.get('/staff/occupancy'),
      api.get('/bookings/admin/all'),
    ]);
    const dataOf = (result) => (result.status === 'fulfilled' ? result.value?.data : null);

    const fromAgenda = asArray(dataOf(agendaRes)?.agenda);
    const fromBookings = asArray(dataOf(bookingsRes)?.bookings)
      .filter((booking) => !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(booking?.status))
      .map((booking) => ({
        ...booking,
        species: booking?.pet_species || booking?.species,
        service_name: booking?.service_name,
        space_name: booking?.space_name,
      }));

    const merged = [...fromAgenda, ...fromBookings].reduce((acc, item) => {
      if (item?.booking_id != null) {
        acc.set(String(item.booking_id), item);
      }
      return acc;
    }, new Map());

    setAgenda([...merged.values()].sort((a, b) => new Date(a?.start_at || 0) - new Date(b?.start_at || 0)));
    const occupancyData = asObject(dataOf(occupancyRes), { occupied: 0, available: 0, total: 0, spaces: [] });
    setOccupancy({
      occupied: Number(occupancyData?.occupied) || 0,
      available: Number(occupancyData?.available) || 0,
      total: Number(occupancyData?.total) || 0,
      spaces: asArray(occupancyData?.spaces),
    });
  };

  const loadCare = async () => {
    try {
      const { data } = await api.get('/staff/care', {
        params: {
          assigned: assignedOnly ? 'true' : 'false',
          all: showAllActive ? 'true' : 'false',
        },
      });
      setBoard(asArray(data?.board));
    } catch (error) {
      setBoard([]);
      throw error;
    }
  };

  const loadAll = async () => {
    setError('');
    setLoading(true);
    try {
      const results = await Promise.allSettled([loadReception(), loadCare()]);
      const failed = results.find((item) => item.status === 'rejected');
      if (failed) {
        setError(requestErrorMessage(failed.reason, 'No se pudo cargar el panel operativo'));
      }
    } catch (err) {
      setAgenda([]);
      setBoard([]);
      setError(requestErrorMessage(err, 'No se pudo cargar el panel operativo'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [assignedOnly, showAllActive]);

  const handleCheckIn = async (event) => {
    event.preventDefault();
    try {
      const { data } = await api.put(`/bookings/${checkInId}/check-in`, {
        notes: checkInNotes.trim() || undefined,
      });
      setMessage(data.message);
      setCheckInId(null);
      setCheckInNotes('');
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo hacer check-in');
    }
  };

  const handleCheckOut = async (bookingId) => {
    try {
      const { data } = await api.put(`/bookings/${bookingId}/check-out`);
      setMessage(data.message);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo hacer check-out');
    }
  };

  const handleTask = async (task, isDone) => {
    try {
      const { data } = await api.put(`/staff/tasks/${task.care_task_id}`, { is_done: isDone });
      setMessage(data.message);
      await loadCare();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo actualizar la tarea');
    }
  };

  const occupancyRate = occupancy.total
    ? Math.round((occupancy.occupied / occupancy.total) * 100)
    : 0;

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }),
    []
  );

  if (loading) {
    return (
      <section>
        <h1 className="mb-4 text-3xl font-semibold text-primary-dark">Agenda Staff</h1>
        <PanelSkeleton label="Cargando panel operativo..." />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-secondary">Operación</p>
        <h1 className="text-3xl font-semibold text-primary-dark">Agenda Staff</h1>
        <p className="text-sm capitalize text-primary-dark/70">{todayLabel}</p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => setTab('reception')}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === 'reception' ? 'bg-primary text-white' : 'text-primary-dark hover:bg-primary-light'}`}
        >
          Recepción
        </button>
        <button
          type="button"
          onClick={() => setTab('care')}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === 'care' ? 'bg-primary text-white' : 'text-primary-dark hover:bg-primary-light'}`}
        >
          Cuidadores / Groomers
        </button>
      </div>

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-2xl bg-secondary-light px-4 py-3 text-sm text-primary-dark">{message}</p> : null}

      {tab === 'reception' ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-primary-dark/70">Espacios ocupados</p>
              <p className="mt-1 text-3xl font-semibold text-primary-dark">{occupancy.occupied}</p>
            </article>
            <article className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-primary-dark/70">Espacios disponibles</p>
              <p className="mt-1 text-3xl font-semibold text-secondary">{occupancy.available}</p>
            </article>
            <article className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-primary-dark/70">Ocupación</p>
              <p className="mt-1 text-3xl font-semibold text-primary-dark">{occupancyRate}%</p>
            </article>
          </div>

          <article className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-semibold text-primary-dark">
              <DoorOpen size={18} /> Disponibilidad en tiempo real
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(occupancy.spaces || []).map((space) => (
                <div
                  key={space.space_id}
                  className={`rounded-2xl px-4 py-3 ${space.occupied ? 'bg-accent-sand' : 'bg-secondary-light'}`}
                >
                  <p className="font-medium text-primary-dark">{space.name}</p>
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    {space.occupied ? `Ocupado${space.current_pet ? ` · ${space.current_pet}` : ''}` : 'Disponible'}
                  </p>
                </div>
              ))}
            </div>
          </article>

          {agenda.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center text-primary-dark/70 shadow-sm">
              No hay reservas para hoy.
            </div>
          ) : (
            <div className="grid gap-4">
              {agenda.map((item) => (
                <article key={item.booking_id} className="rounded-2xl bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-secondary">{item.booking_type}</p>
                      <h2 className="text-xl font-semibold text-primary-dark">{item.pet_name}</h2>
                      <p className="text-sm text-primary-dark/70">
                        {item.species}{item.breed ? ` · ${item.breed}` : ''} · {item.owner_first_name} {item.owner_last_name}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${IN_HOUSE.includes(item.status) ? 'bg-secondary-light text-primary-dark' : 'bg-primary-light text-primary-dark'}`}>
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-primary-dark/80 md:grid-cols-2">
                    <p><strong>Espacio:</strong> {item.space_name || '—'}</p>
                    <p><strong>Servicio:</strong> {item.service_name || '—'}</p>
                    <p><strong>Ingreso:</strong> {item.check_in_at ? new Date(item.check_in_at).toLocaleString('es-CO') : 'Pendiente'}</p>
                    <p><strong>Salida planificada:</strong> {new Date(item.end_at).toLocaleString('es-CO')}</p>
                  </div>
                  {item.reception_notes ? (
                    <p className="mt-3 rounded-2xl bg-background px-4 py-3 text-sm text-primary-dark">
                      <strong>Notas de recepción:</strong> {item.reception_notes}
                    </p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {['PENDING', 'CONFIRMED'].includes(item.status) ? (
                      <button
                        type="button"
                        onClick={() => { setCheckInId(item.booking_id); setCheckInNotes(''); }}
                        className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-white"
                      >
                        <LogIn size={16} /> Check-in manual
                      </button>
                    ) : null}
                    {IN_HOUSE.includes(item.status) ? (
                      <button
                        type="button"
                        onClick={() => handleCheckOut(item.booking_id)}
                        className="inline-flex items-center gap-2 rounded-full bg-primary-dark px-4 py-2 text-sm font-semibold text-white"
                      >
                        <LogOut size={16} /> Marcar salida (Check-out)
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-primary-dark shadow-sm">
              <input type="checkbox" checked={assignedOnly} onChange={(event) => setAssignedOnly(event.target.checked)} />
              Solo mascotas asignadas a mí
            </label>
            <label className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-primary-dark shadow-sm">
              <input type="checkbox" checked={showAllActive} onChange={(event) => setShowAllActive(event.target.checked)} />
              Ver todas las reservas activas
            </label>
          </div>

          {board.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center text-primary-dark/70 shadow-sm">
              No hay mascotas para mostrar. Activa “Ver todas las reservas activas” para consultar el listado completo y sus instrucciones de cuidado.
            </div>
          ) : (
            <div className="grid gap-4">
              {board.map((item) => (
                <article key={item.booking_id} className="rounded-2xl bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-primary-dark">{item.pet_name}</h2>
                      <p className="text-sm text-primary-dark/70">
                        {item.species}{item.breed ? ` · ${item.breed}` : ''} · {item.space_name || 'Sin espacio'}
                      </p>
                    </div>
                    <span className="rounded-full bg-secondary-light px-3 py-1 text-xs font-semibold">{statusLabel(item.status)}</span>
                  </div>

                  <div className="mt-4 rounded-2xl bg-accent-sand/80 p-4 text-sm text-primary-dark">
                    <p className="mb-2 inline-flex items-center gap-2 font-semibold">
                      <ClipboardList size={16} /> Instrucciones de cuidado
                    </p>
                    <p><strong>Alimentación:</strong> {item.feeding_instructions || 'Según rutina'}</p>
                    <p><strong>Medicamentos:</strong> {item.medications || 'Ninguno'}</p>
                    <p><strong>Temperamento:</strong> {item.temperament || item.special_care || 'Sin observaciones'}</p>
                    <p><strong>Alergias:</strong> {item.allergies || 'Ninguna'}</p>
                    <p><strong>Emergencia:</strong> {item.emergency_notes || '—'}</p>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {(item.tasks || []).map((task) => (
                      <button
                        key={task.care_task_id}
                        type="button"
                        onClick={() => handleTask(task, !task.is_done)}
                        className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium ${
                          task.is_done ? 'bg-secondary-light text-primary-dark' : 'bg-background text-primary-dark'
                        }`}
                      >
                        <span>{task.label}</span>
                        <CheckCircle2 size={18} className={task.is_done ? 'text-secondary' : 'text-primary-dark/30'} />
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {checkInId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 px-4">
          <form onSubmit={handleCheckIn} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-primary-dark">Marcar entrada</h3>
            <p className="text-sm text-primary-dark/70">El estado pasará a EN SITIO y se registrará la hora exacta de ingreso.</p>
            <textarea
              className={inputClass}
              rows={4}
              placeholder='Notas de recepción, ej: "Llegó con su cobija y juguete"'
              value={checkInNotes}
              onChange={(event) => setCheckInNotes(event.target.value)}
            />
            <div className="flex gap-2">
              <button type="submit" className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-white">Confirmar check-in</button>
              <button type="button" className="rounded-full bg-background px-4 py-2 text-sm font-semibold" onClick={() => setCheckInId(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export default StaffDashboard;
