import { useEffect, useState } from 'react';
import { Scissors, Sparkles } from 'lucide-react';
import api from '../api/axios';
import DateNavigator from '../components/DateNavigator';
import PanelSkeleton from '../components/PanelSkeleton';
import { asArray, requestErrorMessage, toDateInputValue } from '../lib/safeData';

const DONE_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'FAILED', 'NO_SHOW']);

const inputClass =
  'w-full rounded-xl border border-secondary-light px-3 py-2 text-sm text-primary-dark';

const appointmentKey = (item) =>
  String(item?.appointment_id || item?.id || item?.booking_id || '');

const isActiveAppointment = (item) => {
  if (!item) {
    return false;
  }
  const status = String(item?.appointment_status || item?.booking_status || item?.status || '').toUpperCase();
  return !DONE_STATUSES.has(status);
};

const petName = (item) => item?.pet_name || item?.pet?.name || 'Mascota';
const serviceName = (item) => item?.service_name || item?.service?.name || 'Servicio de estética';
const ownerName = (item) =>
  [item?.owner_first_name || item?.owner?.first_name, item?.owner_last_name || item?.owner?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
const formatWhen = (value) => {
  if (!value) {
    return 'Sin horario';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin horario';
  }
  return date.toLocaleString('es-CO');
};

const statusLabel = (status) => {
  const map = {
    PENDING: 'Pendiente',
    CONFIRMED: 'Confirmada',
    IN_PROGRESS: 'En proceso',
    IN_HOUSE: 'En sitio',
    COMPLETED: 'Completado',
    CANCELLED: 'Cancelado',
    FAILED: 'Incidencia',
  };
  return map[status] || status || 'Sin estado';
};

function StylistDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(toDateInputValue());
  const [active, setActive] = useState(null);
  const [notes, setNotes] = useState('');
  const [nextStatus, setNextStatus] = useState('COMPLETED');
  const [submitting, setSubmitting] = useState(false);

  const loadAppointments = async (date = selectedDate) => {
    try {
      const { data } = await api.get('/stylist/pets', { params: { date } });
      const spaServices = /baño|spa|corte/i;
      setAppointments(
        asArray(data?.appointments || data?.pets).filter((item) => {
          const type = String(item?.booking_type || item?.service?.booking_type || 'APPOINTMENT').toUpperCase();
          if (type !== 'APPOINTMENT' || !isActiveAppointment(item)) {
            return false;
          }
          const label = item?.service_name || item?.service?.name || '';
          return spaServices.test(label) || !label;
        })
      );
    } catch (err) {
      setAppointments([]);
      throw err;
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        await loadAppointments(selectedDate);
      } catch (err) {
        if (!cancelled) {
          setError(requestErrorMessage(err, 'No se pudieron cargar las citas de estética'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const handleStatusChange = async (appointment, status, extraNotes = null) => {
    const appointmentId = appointment?.appointment_id || appointment?.id;
    if (!appointmentId) {
      setError('No se pudo identificar la cita');
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await api.put(`/stylist/appointments/${appointmentId}`, {
        status,
        notes: extraNotes,
      });
      const done = DONE_STATUSES.has(String(status || '').toUpperCase());
      if (done) {
        const id = String(appointmentId);
        setAppointments((prev) =>
          (prev || []).filter((item) => appointmentKey(item) !== id && String(item?.id || '') !== id)
        );
      } else {
        await loadAppointments(selectedDate);
      }
      setMessage(
        String(status).toUpperCase() === 'COMPLETED'
          ? 'Servicio marcado como completado'
          : String(status).toUpperCase() === 'IN_PROGRESS'
            ? 'Servicio en proceso'
            : 'Cita cancelada / incidencia registrada'
      );
      setActive(null);
      setNotes('');
    } catch (err) {
      setError(requestErrorMessage(err, 'No se pudo actualizar el servicio. Intenta de nuevo.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async (event) => {
    event?.preventDefault?.();
    if (!active) {
      return;
    }
    await handleStatusChange(active, nextStatus, notes);
  };

  if (loading) {
    return (
      <section>
        <h1 className="mb-4 text-3xl font-semibold text-primary-dark">Agenda de estética</h1>
        <PanelSkeleton label="Cargando estética..." />
      </section>
    );
  }

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-secondary">Operación</p>
          <h1 className="text-3xl font-semibold text-primary-dark">Agenda de estética</h1>
          <p className="text-sm text-primary-dark/70">Citas de spa y corte. Elige una fecha para ver otros días.</p>
        </div>
        <DateNavigator value={selectedDate} onChange={setSelectedDate} label="Ver agenda" />
      </div>

      {error ? <p className="mb-4 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mb-4 rounded-2xl bg-accent-sage/60 px-3 py-2 text-sm text-primary-dark">{message}</p> : null}

      {asArray(appointments).filter(isActiveAppointment).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-secondary bg-white p-12 text-center">
          <Scissors className="mx-auto mb-3 text-primary" />
          <p className="text-primary-dark/70">No hay citas de baño, corte o spa para esta fecha.</p>
        </div>
      ) : (
        <div className="grid gap-5">
          {asArray(appointments).filter(isActiveAppointment).map((item) => (
            <article key={appointmentKey(item) || `cita-${item?.start_at}`} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-secondary-light">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-primary-dark">{petName(item)}</h2>
                  <p className="text-sm text-secondary">{serviceName(item)}</p>
                  <p className="text-xs text-primary-dark/60">
                    {ownerName(item)}
                    {ownerName(item) ? ' · ' : ''}
                    {formatWhen(item?.start_at)}
                    {item?.space_name || item?.space?.name ? ` · ${item?.space_name || item?.space?.name}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-primary-light px-3 py-1 text-xs font-semibold">
                  {statusLabel(item?.appointment_status || item?.booking_status || item?.status)}
                </span>
              </div>
              <div className="mt-4 rounded-2xl bg-accent-sand/70 p-3 text-sm text-primary-dark">
                <p className="mb-1 inline-flex items-center gap-2 font-semibold">
                  <Sparkles size={16} />
                  Preferencias y notas de cuidado
                </p>
                <p>
                  {item?.owner_preferences ||
                    item?.special_care ||
                    item?.allergies ||
                    item?.pet?.allergies ||
                    'Sin preferencias registradas.'}
                </p>
                {item?.medications || item?.pet?.medications ? (
                  <p className="mt-1 text-xs">Medicamentos: {item?.medications || item?.pet?.medications}</p>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleStatusChange(item, 'IN_PROGRESS')}
                  className="rounded-full bg-secondary px-3 py-2 text-sm font-medium text-white disabled:opacity-70"
                >
                  {submitting ? 'Actualizando...' : 'En proceso'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActive(item || null);
                    setNextStatus('COMPLETED');
                    setNotes('');
                  }}
                  className="rounded-full bg-primary px-3 py-2 text-sm font-medium text-white"
                >
                  Completado
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActive(item || null);
                    setNextStatus('FAILED');
                    setNotes('');
                  }}
                  className="rounded-full bg-accent-purple px-3 py-2 text-sm font-medium text-white"
                >
                  Cancelado / Incidencia
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {active ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 p-4">
          <form onSubmit={handleConfirm} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-3 text-lg font-semibold text-primary-dark">
              {nextStatus === 'COMPLETED' ? 'Notas finales' : 'Incidencia o cancelación'}
            </h2>
            <textarea
              required
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              className={inputClass}
              placeholder={nextStatus === 'COMPLETED' ? 'Resumen del servicio' : 'Describe la incidencia'}
            />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setActive(null)} className="flex-1 rounded-full border py-2 text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="flex-1 rounded-full bg-primary py-2 text-sm font-medium text-white">
                {submitting ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export default StylistDashboard;
