import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, X } from 'lucide-react';
import api from '../api/axios';

const inputClass =
  'w-full rounded-xl border border-secondary-light px-3 py-2 text-sm text-primary-dark outline-none focus:border-primary';

const isCatSpecies = (species) => {
  const value = String(species || '').toLowerCase();
  return value.includes('gato') || value.includes('cat') || value.includes('felin');
};

const serviceFlow = (service) => {
  const type = String(service?.category_type || '').toUpperCase();
  const name = String(service?.name || '').toLowerCase();
  if (type === 'HOTEL' || /hotel|hosped|suite/.test(name)) {
    return 'lodging';
  }
  if (type === 'RECREATION' || /guarder|recreac/.test(name)) {
    return 'recreation';
  }
  return 'spa';
};

const emptyForm = {
  owner_id: '',
  pet_id: '',
  service_id: '',
  space_id: '',
  check_in: '',
  check_out: '',
  appointment_at: '',
  notes: '',
};

function BookingModal({ open, clients = [], occupancySpaces = [], onClose, onCreated }) {
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    setForm(emptyForm);
    setError('');
    let active = true;
    const load = async () => {
      try {
        const { data } = await api.get('/services');
        if (active) {
          setServices(data.services || []);
        }
      } catch {
        if (active) {
          setError('No se pudieron cargar los servicios');
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [open]);

  const client = clients.find((item) => String(item.user_id) === String(form.owner_id));
  const pets = client?.pets || [];
  const pet = pets.find((item) => String(item.pet_id) === String(form.pet_id));
  const selectedService = services.find((item) => String(item.service_id) === String(form.service_id));
  const flow = serviceFlow(selectedService);

  const spaces = useMemo(
    () => occupancySpaces.filter((space) => String(space.status || 'AVAILABLE') !== 'INACTIVE'),
    [occupancySpaces]
  );
  const spaStation = useMemo(
    () =>
      spaces.find(
        (space) =>
          ['SPA', 'MULTIPURPOSE'].includes(String(space.space_type || '').toUpperCase()) ||
          /spa|groom|est[eé]tica|cabina/i.test(space.name || '')
      ),
    [spaces]
  );
  const petSpecies = pet?.species || '';
  const spaStationId = spaStation?.space_id != null ? String(spaStation.space_id) : '';

  const filteredSpaces = useMemo(() => {
    if (flow === 'lodging') {
      const cat = isCatSpecies(petSpecies);
      const suites = spaces.filter((space) => {
        const type = String(space.space_type || '').toUpperCase();
        const name = String(space.name || '');
        if (cat) {
          return type === 'CAT_SUITE' || (type === 'ROOM' && /^Suite Felina/i.test(name));
        }
        return type === 'DOG_SUITE' || (type === 'ROOM' && /^Suite Canina/i.test(name));
      });
      return suites.filter((space) => !space.occupied);
    }
    if (flow === 'recreation') {
      const patios = spaces.filter((space) => String(space.space_type || '').toUpperCase() === 'RECREATION');
      const bySpecies = patios.filter((space) => {
        const name = String(space.name || '').toLowerCase();
        return isCatSpecies(petSpecies) ? /felin|gat/.test(name) : /canin|perro|dog/.test(name) || !/felin|gat/.test(name);
      });
      return (bySpecies.length ? bySpecies : patios).filter((space) => Number(space.occupied_count || 0) < Number(space.capacity || 3));
    }
    return spaStation ? [spaStation] : [];
  }, [flow, petSpecies, spaStation, spaces]);

  const autoSpaceId = flow === 'spa' && spaStationId
    ? spaStationId
    : filteredSpaces.length === 1
      ? String(filteredSpaces[0].space_id)
      : '';

  useEffect(() => {
    if (!open || !autoSpaceId) {
      return;
    }
    setForm((current) =>
      String(current.space_id) === autoSpaceId ? current : { ...current, space_id: autoSpaceId }
    );
  }, [open, autoSpaceId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!pet || !selectedService) {
      setError('Selecciona cliente, mascota y servicio');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      let startAt;
      let endAt;
      let bookingType = 'APPOINTMENT';
      if (flow === 'lodging') {
        bookingType = 'LODGING';
        startAt = new Date(`${form.check_in}T14:00:00`).toISOString();
        endAt = new Date(`${form.check_out}T12:00:00`).toISOString();
      } else {
        bookingType = flow === 'recreation' ? 'RECREATION' : 'APPOINTMENT';
        startAt = new Date(form.appointment_at).toISOString();
        const minutes = selectedService.duration_minutes || (flow === 'recreation' ? 480 : 60);
        endAt = new Date(new Date(form.appointment_at).getTime() + minutes * 60 * 1000).toISOString();
      }
      if (!(new Date(endAt) > new Date(startAt))) {
        throw new Error('La fecha de salida debe ser posterior a la de ingreso');
      }

      await api.post('/bookings', {
        owner_id: form.owner_id,
        pet_id: form.pet_id,
        service_id: form.service_id,
        booking_type: bookingType,
        start_at: startAt,
        end_at: endAt,
        space_id: form.space_id || spaStation?.space_id || null,
        notes: form.notes || null,
      });
      onCreated?.('Reserva creada y sincronizada con ocupación');
      onClose?.();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'No se pudo crear la reserva');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-primary-dark/45 p-4">
      <form onSubmit={handleSubmit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Recepción</p>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-primary-dark">
              <CalendarPlus size={20} />
              Crear nueva reserva / cita
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-primary-light" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {error ? <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">
            Cliente
            <select
              required
              className={`${inputClass} mt-1`}
              value={form.owner_id}
              onChange={(event) => setForm((current) => ({ ...current, owner_id: event.target.value, pet_id: '' }))}
            >
              <option value="">Selecciona un cliente</option>
              {clients.map((item) => (
                <option key={item.user_id} value={item.user_id}>
                  {item.first_name} {item.last_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Mascota
            <select
              required
              className={`${inputClass} mt-1`}
              value={form.pet_id}
              onChange={(event) => setForm((current) => ({ ...current, pet_id: event.target.value }))}
            >
              <option value="">Selecciona la mascota</option>
              {pets.map((item) => (
                <option key={item.pet_id} value={item.pet_id}>
                  {item.name} · {item.species}
                  {item.breed ? ` · ${item.breed}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Servicio
            <select
              required
              className={`${inputClass} mt-1`}
              value={form.service_id}
              onChange={(event) => setForm((current) => ({ ...current, service_id: event.target.value, space_id: '' }))}
            >
              <option value="">Hospedaje, guardería o spa</option>
              {services.map((item) => (
                <option key={item.service_id} value={item.service_id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {flow === 'lodging' ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">
              Suite {isCatSpecies(pet?.species) ? 'felina' : 'canina'}
              <select
                required
                className={`${inputClass} mt-1`}
                value={form.space_id}
                onChange={(event) => setForm((current) => ({ ...current, space_id: event.target.value }))}
              >
                <option value="">Selecciona una suite disponible</option>
                {filteredSpaces.map((space) => (
                  <option key={space.space_id} value={space.space_id}>
                    {space.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Check-in
              <input
                required
                type="date"
                className={`${inputClass} mt-1`}
                value={form.check_in}
                onChange={(event) => setForm((current) => ({ ...current, check_in: event.target.value }))}
              />
            </label>
            <label className="text-sm font-medium">
              Check-out
              <input
                required
                type="date"
                className={`${inputClass} mt-1`}
                value={form.check_out}
                onChange={(event) => setForm((current) => ({ ...current, check_out: event.target.value }))}
              />
            </label>
          </div>
        ) : null}

        {flow === 'recreation' ? (
          <div className="mt-4 grid gap-3">
            <label className="text-sm font-medium">
              Patio de recreación
              <select
                required
                className={`${inputClass} mt-1`}
                value={form.space_id}
                onChange={(event) => setForm((current) => ({ ...current, space_id: event.target.value }))}
              >
                <option value="">Selecciona un patio</option>
                {filteredSpaces.map((space) => (
                  <option key={space.space_id} value={space.space_id}>
                    {space.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Horario
              <input
                required
                type="datetime-local"
                className={`${inputClass} mt-1`}
                value={form.appointment_at}
                onChange={(event) => setForm((current) => ({ ...current, appointment_at: event.target.value }))}
              />
            </label>
          </div>
        ) : null}

        {flow === 'spa' && selectedService ? (
          <div className="mt-4 grid gap-3">
            <p className="rounded-2xl bg-accent-sand/70 px-3 py-2 text-sm text-primary-dark">
              Estación asignada: {spaStation?.name || 'Cabina de Spa & Estética 01'}
            </p>
            <label className="text-sm font-medium">
              Fecha y hora de la cita
              <input
                required
                type="datetime-local"
                className={`${inputClass} mt-1`}
                value={form.appointment_at}
                onChange={(event) => setForm((current) => ({ ...current, appointment_at: event.target.value }))}
              />
            </label>
          </div>
        ) : null}

        <label className="mt-4 block text-sm font-medium">
          Notas
          <textarea
            rows={3}
            className={`${inputClass} mt-1`}
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Indicaciones de recepción, pertenencias o preferencias"
          />
        </label>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-full border py-2.5 text-sm">
            Cancelar
          </button>
          <button type="submit" disabled={submitting} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            Confirmar reserva
          </button>
        </div>
      </form>
    </div>
  );
}

export default BookingModal;
