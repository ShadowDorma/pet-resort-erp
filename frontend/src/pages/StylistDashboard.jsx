import { useEffect, useState } from 'react';
import { Scissors, Sparkles } from 'lucide-react';
import api from '../api/axios';

const inputClass = 'w-full rounded-xl border border-secondary-light px-3 py-2 text-sm text-primary-dark';

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
  return map[status] || status;
};

function StylistDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [notes, setNotes] = useState('');
  const [nextStatus, setNextStatus] = useState('COMPLETED');
  const [submitting, setSubmitting] = useState(false);

  const loadAppointments = async () => {
    const { data } = await api.get('/stylist/pets');
    const spaServices = /baño|spa|corte/i;
    setAppointments(
      (data.appointments || data.pets || []).filter((item) => {
        const type = String(item.booking_type || 'APPOINTMENT').toUpperCase();
        if (type !== 'APPOINTMENT') {
          return false;
        }
        return spaServices.test(item.service_name || '') || !item.service_name;
      })
    );
  };

  useEffect(() => {
    const run = async () => {
      try {
        await loadAppointments();
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudieron cargar las citas de estética');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const updateStatus = async (appointment, status, extraNotes = null) => {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await api.put(`/stylist/appointments/${appointment.appointment_id}`, {
        status,
        notes: extraNotes,
      });
      setMessage('Estado del servicio actualizado');
      setActive(null);
      setNotes('');
      await loadAppointments();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo actualizar el servicio');
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
    return <p className="text-primary-dark">Cargando estética...</p>;
  }

  return (
    <section>
      <div className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wide text-secondary">Operación</p>
        <h1 className="text-3xl font-semibold text-primary-dark">Agenda de estética</h1>
        <p className="text-sm text-primary-dark/70">Citas de spa y corte, preferencias del cliente y estado del servicio.</p>
      </div>

      {error ? <p className="mb-4 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mb-4 rounded-2xl bg-accent-sage/60 px-3 py-2 text-sm text-primary-dark">{message}</p> : null}

      {appointments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-secondary bg-white p-12 text-center">
          <Scissors className="mx-auto mb-3 text-primary" />
          <p className="text-primary-dark/70">No hay citas activas de baño, corte o spa.</p>
        </div>
      ) : (
        <div className="grid gap-5">
          {appointments.map((item) => (
            <article key={item.appointment_id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-secondary-light">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-primary-dark">{item.pet_name}</h2>
                  <p className="text-sm text-secondary">{item.service_name || 'Servicio de estética'}</p>
                  <p className="text-xs text-primary-dark/60">
                    {item.owner_first_name} {item.owner_last_name} · {new Date(item.start_at).toLocaleString('es-CO')}
                    {item.space_name ? ` · ${item.space_name}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-primary-light px-3 py-1 text-xs font-semibold">
                  {statusLabel(item.appointment_status || item.booking_status)}
                </span>
              </div>
              <div className="mt-4 rounded-2xl bg-accent-sand/70 p-3 text-sm text-primary-dark">
                <p className="mb-1 inline-flex items-center gap-2 font-semibold">
                  <Sparkles size={16} />
                  Preferencias y notas de cuidado
                </p>
                <p>{item.owner_preferences || item.special_care || item.allergies || 'Sin preferencias registradas.'}</p>
                {item.medications ? <p className="mt-1 text-xs">Medicamentos: {item.medications}</p> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => updateStatus(item, 'IN_PROGRESS')}
                  className="rounded-full bg-secondary px-3 py-2 text-sm font-medium text-white disabled:opacity-70"
                >
                  En proceso
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
                Confirmar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export default StylistDashboard;
