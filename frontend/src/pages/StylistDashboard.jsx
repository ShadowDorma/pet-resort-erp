import { useEffect, useState } from 'react';
import { Scissors, Sparkles } from 'lucide-react';
import api from '../api/axios';
import DateNavigator from '../components/DateNavigator';
import PanelSkeleton from '../components/PanelSkeleton';
import { asArray, requestErrorMessage, toDateInputValue } from '../lib/safeData';

const DONE_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'FAILED', 'NO_SHOW']);

const appointmentKey = (item) => String(item?.appointment_id || item?.booking_id || '');

const isActiveAppointment = (item) => {
  const status = String(item?.appointment_status || item?.booking_status || '').toUpperCase();
  return !DONE_STATUSES.has(status);
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
          const type = String(item?.booking_type || 'APPOINTMENT').toUpperCase();
          if (type !== 'APPOINTMENT' || !isActiveAppointment(item)) {
            return false;
          }
          return spaServices.test(item?.service_name || '') || !item?.service_name;
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

  const updateStatus = async (appointment, status, extraNotes = null) => {
    if (!appointment?.appointment_id) {
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await api.put(`/stylist/appointments/${appointment.appointment_id}`, {
        status,
        notes: extraNotes,
      });
      if (DONE_STATUSES.has(String(status).toUpperCase())) {
        const id = appointmentKey(appointment);
        setAppointments((current) => asArray(current).filter((item) => appointmentKey(item) !== id));
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
      if (!DONE_STATUSES.has(String(status).toUpperCase())) {
        await loadAppointments(selectedDate);
      }
    } catch (err) {
      setError(requestErrorMessage(err, 'No se pudo actualizar el servicio'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async (event) => {
    event.preventDefault();
    if (!active) {
      return;
    }
    await updateStatus(active, nextStatus, notes);
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

      {appointments.filter(isActiveAppointment).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-secondary bg-white p-12 text-center">
          <Scissors className="mx-auto mb-3 text-primary" />
          <p className="text-primary-dark/70">No hay citas de baño, corte o spa para esta fecha.</p>
        </div>
      ) : (
        <div className="grid gap-5">
          {appointments.filter(isActiveAppointment).map((item) => (
            <article key={appointmentKey(item)} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-secondary-light">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-primary-dark">{item?.pet_name || 'Mascota'}</h2>
                  <p className="text-sm text-secondary">{item?.service_name || 'Servicio de estética'}</p>
                  <p className="text-xs text-primary-dark/60">
                    {item?.owner_first_name} {item?.owner_last_name} ·{' '}
                    {item?.start_at ? new Date(item.start_at).toLocaleString('es-CO') : 'Sin horario'}
                    {item?.space_name ? ` · ${item.space_name}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-primary-light px-3 py-1 text-xs font-semibold">
                  {statusLabel(item?.appointment_status || item?.booking_status)}
                </span>
              </div>
              <div className="mt-4 rounded-2xl bg-accent-sand/70 p-3 text-sm text-primary-dark">
                <p className="mb-1 inline-flex items-center gap-2 font-semibold">
                  <Sparkles size={16} />
                  Preferencias y notas de cuidado
                </p>
                <p>{item?.owner_preferences || item?.special_care || item?.allergies || 'Sin preferencias registradas.'}</p>
                {item?.medications ? <p className="mt-1 text-xs">Medicamentos: {item.medications}</p> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => updateStatus(item, 'IN_PROGRESS')}
                  className="rounded-full bg-secondary px-3 py-2 text-sm font-medium text-white disabled:opacity-70"
                >
                  {submitting ? 'Actualizando...' : 'En proceso'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActive(item);
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
                    setActive(item);
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
