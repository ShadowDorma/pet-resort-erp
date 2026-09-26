import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Hotel, Sparkles } from 'lucide-react';
import api from '../api/axios';

const formatMoney = (value) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const nightsBetween = (start, end) => {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};

const toIso = (value) => new Date(value).toISOString();

const isCatSpecies = (species) => {
  const value = String(species || '').toLowerCase();
  return value.includes('gato') || value.includes('cat') || value.includes('felin');
};

const serviceFlow = (service) => {
  if (!service) {
    return null;
  }
  const type = String(service?.category_type || '').toUpperCase();
  const name = String(service?.name || '').toLowerCase();
  if (type === 'HOTEL' || /hotel|hosped|suite/.test(name)) {
    return 'lodging';
  }
  if (type === 'RECREATION' || /guarder|recreac/.test(name)) {
    return 'recreation';
  }
  if (type === 'SPA' || /spa|baño|corte|groom/.test(name)) {
    return 'spa';
  }
  return 'spa';
};

const matchesPetSpecies = (space, petSpecies) => {
  const name = String(space?.name || '').toLowerCase();
  const type = String(space?.space_type || '').toUpperCase();
  if (isCatSpecies(petSpecies)) {
    return type === 'CAT_SUITE' || (type === 'ROOM' && /felin|gat/.test(name));
  }
  return type === 'DOG_SUITE' || (type === 'ROOM' && /canin|perro|dog/.test(name));
};

const SPA_STATION_LABEL = 'Grooming & Spa';

const recreationSlot = (availability, species) => {
  if (!availability?.recreation) {
    return { available: 0, limit: 3, used: 0 };
  }
  const bucket = isCatSpecies(species) ? availability.recreation.cats : availability.recreation.dogs;
  if (bucket && typeof bucket.available === 'number') {
    return bucket;
  }
  return {
    available: Number(availability.recreation.available) || 0,
    limit: Number(availability.recreation.limit) || 3,
    used: Number(availability.recreation.used) || 0,
  };
};

const CapacityBanner = ({ availability, isLodging, isRecreation, petSpecies }) => {
  if (!availability) {
    return null;
  }
  if (isLodging) {
    const dogFull = availability.lodging.dogs.available <= 0;
    const catFull = availability.lodging.cats.available <= 0;
    const petIsCat = isCatSpecies(petSpecies);
    const petFull = petSpecies ? (petIsCat ? catFull : dogFull) : dogFull && catFull;
    return (
      <div className={`rounded-2xl px-4 py-3 text-sm ${petFull ? 'bg-red-50 text-red-700' : 'bg-accent-sage/60 text-primary-dark'}`}>
        Cupos disponibles Perros: {availability.lodging.dogs.available}/5 | Cupos disponibles Gatos: {availability.lodging.cats.available}/5
      </div>
    );
  }
  if (isRecreation) {
    const slot = recreationSlot(availability, petSpecies);
    const full = slot.available <= 0;
    return (
      <div className={`rounded-2xl px-4 py-3 text-sm ${full ? 'bg-red-50 text-red-700' : 'bg-accent-sage/60 text-primary-dark'}`}>
        Cupos en el patio {isCatSpecies(petSpecies) ? 'felino' : 'canino'}: {slot.available}/{slot.limit}
      </div>
    );
  }
  return (
    <div className={`rounded-2xl px-4 py-3 text-sm ${availability.spa.available <= 0 ? 'bg-red-50 text-red-700' : 'bg-accent-sage/60 text-primary-dark'}`}>
      Cupos de estética en este horario: {availability.spa.available}/{availability.spa.limit} (1 por estilista)
    </div>
  );
};

function Bookings() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [serviceKind, setServiceKind] = useState('lodging');
  const [pets, setPets] = useState([]);
  const [services, setServices] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [history, setHistory] = useState([]);
  const [petId, setPetId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [appointmentAt, setAppointmentAt] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState(null);
  const prefilled = useRef(false);

  const isLodging = serviceKind === 'lodging';

  useEffect(() => {
    const load = async () => {
      try {
        const [petsRes, servicesRes, spacesRes, bookingsRes] = await Promise.all([
          api.get('/pets'),
          api.get('/services'),
          api.get('/services/spaces/available'),
          api.get('/bookings'),
        ]);
        setPets(petsRes.data.pets || []);
        setServices(servicesRes.data.services || []);
        setSpaces(spacesRes.data.spaces || []);
        setHistory(bookingsRes.data.bookings || []);
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudieron cargar los datos de reserva');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    const preselect = searchParams.get('service');
    if (prefilled.current || !preselect || services.length === 0) {
      return;
    }
    const found = services.find((service) => String(service.service_id) === String(preselect));
    if (!found) {
      return;
    }
    prefilled.current = true;
    setServiceId(String(found.service_id));
    setServiceKind(found.category_type === 'HOTEL' ? 'lodging' : 'appointment');
    if (pets.length === 1) {
      setPetId(String(pets[0].pet_id));
    }
    setStep(2);
  }, [searchParams, services, pets]);

  const selectedPet = pets.find((pet) => String(pet.pet_id) === String(petId));

  const filteredServices = useMemo(() => {
    if (isLodging) {
      const hotel = services.filter((service) => serviceFlow(service) === 'lodging');
      if (!selectedPet) {
        return hotel;
      }
      const petIsCat = isCatSpecies(selectedPet.species);
      const petFiltered = hotel.filter((service) => {
        const target = String(service.target_pet_type || service.name || '').toLowerCase();
        if (petIsCat) {
          return /gat|felin/.test(target) || !/perro|canin/.test(target);
        }
        return /perro|canin/.test(target) || !/gato|felin/.test(target);
      });
      return petFiltered.length > 0 ? petFiltered : hotel;
    }
    return services.filter((service) => serviceFlow(service) !== 'lodging');
  }, [isLodging, selectedPet, services]);

  const selectedService = filteredServices.find((service) => String(service.service_id) === String(serviceId));
  const flow = serviceFlow(selectedService);
  const isRecreation = !isLodging && flow === 'recreation';
  const isSpa = !isLodging && flow === 'spa';
  const spaStation = spaces.find(
    (space) =>
      ['SPA', 'MULTIPURPOSE'].includes(String(space.space_type || '').toUpperCase()) ||
      /spa|groom|cabina/i.test(String(space.name || ''))
  );
  const selectedSpace = spaces.find((space) => String(space.space_id) === String(spaceId));

  const filteredSpaces = useMemo(() => {
    if (isLodging) {
      const rooms = spaces.filter((space) => {
        const type = String(space.space_type || '').toUpperCase();
        const name = String(space.name || '');
        if (isCatSpecies(selectedPet?.species)) {
          return type === 'CAT_SUITE' || (type === 'ROOM' && /^Suite Felina/i.test(name));
        }
        return type === 'DOG_SUITE' || (type === 'ROOM' && /^Suite Canina/i.test(name));
      });
      return rooms.length > 0 ? rooms : spaces.filter((space) => matchesPetSpecies(space, selectedPet?.species));
    }
    if (isRecreation) {
      const patios = spaces.filter((space) => String(space.space_type || '').toUpperCase() === 'RECREATION');
      const bySpecies = patios.filter((space) => matchesPetSpecies(space, selectedPet?.species));
      return bySpecies.length > 0 ? bySpecies : patios;
    }
    return [];
  }, [isLodging, isRecreation, selectedPet, spaces]);

  useEffect(() => {
    setSpaceId((current) => {
      if (isSpa) {
        return spaStation ? String(spaStation.space_id) : '';
      }
      if ((isLodging || isRecreation) && filteredSpaces.length === 1) {
        return String(filteredSpaces[0].space_id);
      }
      if (current && !filteredSpaces.some((space) => String(space.space_id) === String(current))) {
        return '';
      }
      return current;
    });
  }, [filteredSpaces, isLodging, isRecreation, isSpa, spaStation]);

  const schedule = useMemo(() => {
    if (isLodging && checkIn && checkOut) {
      const start = `${checkIn}T14:00:00`;
      const end = `${checkOut}T12:00:00`;
      return { start, end, nights: nightsBetween(checkIn, checkOut) };
    }
    if (!isLodging && appointmentAt && selectedService) {
      const start = appointmentAt;
      const minutes = selectedService.duration_minutes || 60;
      const end = new Date(new Date(appointmentAt).getTime() + minutes * 60 * 1000).toISOString();
      return { start, end, nights: 1 };
    }
    return null;
  }, [appointmentAt, checkIn, checkOut, isLodging, selectedService]);

  useEffect(() => {
    if (!schedule) {
      setAvailability(null);
      return undefined;
    }
    let active = true;
    const loadAvailability = async () => {
      try {
        const { data } = await api.get('/bookings/availability', {
          params: {
            start_at: toIso(schedule.start),
            end_at: toIso(schedule.end),
          },
        });
        if (active) {
          setAvailability(data.availability);
        }
      } catch {
        if (active) {
          setAvailability(null);
        }
      }
    };
    loadAvailability();
    return () => {
      active = false;
    };
  }, [schedule]);

  const estimate = useMemo(() => {
    if (!selectedService || !schedule) {
      return 0;
    }
    const unit = Number(selectedService.current_price) || 0;
    return isLodging ? unit * schedule.nights : unit;
  }, [isLodging, schedule, selectedService]);

  const bookingType = () => {
    if (isLodging) {
      return 'LODGING';
    }
    return selectedService?.category_type === 'RECREATION' ? 'RECREATION' : 'APPOINTMENT';
  };

  const isCapacityFull = () => {
    if (!availability || !schedule) {
      return false;
    }
    if (isLodging) {
      return isCatSpecies(selectedPet?.species)
        ? availability.lodging.cats.available <= 0
        : availability.lodging.dogs.available <= 0;
    }
    if (isRecreation) {
      return recreationSlot(availability, selectedPet?.species).available <= 0;
    }
    return availability.spa.available <= 0;
  };

  const canContinue = () => {
    if (step === 1) {
      return Boolean(serviceKind);
    }
    if (step === 2) {
      return Boolean(petId);
    }
    if (step === 3) {
      if (!serviceId) {
        return false;
      }
      if (isSpa) {
        return true;
      }
      return Boolean(spaceId);
    }
    if (step === 4) {
      return Boolean(schedule) && new Date(schedule.end) > new Date(schedule.start);
    }
    return true;
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const payload = {
        pet_id: petId,
        service_id: serviceId,
        booking_type: bookingType(),
        start_at: toIso(schedule.start),
        end_at: toIso(schedule.end),
        notes: notes || null,
      };

      if (isSpa && spaStation) {
        payload.space_id = spaStation.space_id;
      } else if ((isLodging || isRecreation) && spaceId) {
        payload.space_id = spaceId;
      }

      const { data } = await api.post('/bookings', payload);
      setSuccess(data.message || 'Reserva creada correctamente');
      setHistory((current) => [data.booking, ...current]);
      setStep(1);
      setPetId('');
      setServiceId('');
      setSpaceId('');
      setCheckIn('');
      setCheckOut('');
      setAppointmentAt('');
      setNotes('');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear la reserva');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-secondary-light bg-white px-3 py-2.5 outline-none focus:border-primary';

  if (loading) {
    return <p className="text-primary-dark">Cargando reservas...</p>;
  }

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-secondary">Agenda</p>
        <h1 className="text-3xl font-semibold text-primary-dark">Reservar cita / hospedaje</h1>
        <p className="text-sm text-primary-dark/70">
          Elige el tipo de servicio y completa los datos de tu mascota.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {['Tipo', 'Mascota', 'Servicio', 'Fechas', 'Resumen'].map((label, index) => (
          <span
            key={label}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              step === index + 1
                ? 'bg-primary text-white'
                : step > index + 1
                  ? 'bg-accent-sage text-primary-dark'
                  : 'bg-primary-light text-primary-dark'
            }`}
          >
            {index + 1}. {label}
          </span>
        ))}
      </div>

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-2xl bg-secondary-light px-4 py-3 text-sm text-primary-dark">{success}</p> : null}

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-secondary-light">
        {step === 1 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setServiceKind('lodging');
                setServiceId('');
                setSpaceId('');
              }}
              className={`rounded-2xl border p-6 text-left ${
                isLodging ? 'border-primary bg-primary-light' : 'border-secondary-light'
              }`}
            >
              <Hotel className="mb-3 text-primary-dark" />
              <h2 className="text-xl font-semibold text-primary-dark">Hospedaje</h2>
              <p className="text-sm text-primary-dark/70">Hotel boutique con entrada y salida programadas.</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setServiceKind('appointment');
                setServiceId('');
                setSpaceId('');
              }}
              className={`rounded-2xl border p-6 text-left ${
                !isLodging ? 'border-primary bg-primary-light' : 'border-secondary-light'
              }`}
            >
              <Sparkles className="mb-3 text-primary-dark" />
              <h2 className="text-xl font-semibold text-primary-dark">Cita</h2>
              <p className="text-sm text-primary-dark/70">Spa, grooming o recreación en un horario puntual.</p>
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          pets.length === 0 ? (
            <p className="text-primary-dark/80">
              Primero registra una mascota en{' '}
              <Link to="/mis-mascotas" className="font-semibold text-secondary">
                Mis Mascotas
              </Link>
              .
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {pets.map((pet) => (
                <button
                  key={pet.pet_id}
                  type="button"
                  onClick={() => setPetId(pet.pet_id)}
                  className={`rounded-2xl border p-4 text-left ${
                    String(petId) === String(pet.pet_id)
                      ? 'border-primary bg-primary-light'
                      : 'border-secondary-light'
                  }`}
                >
                  <p className="font-semibold text-primary-dark">{pet.name}</p>
                  <p className="text-sm text-secondary">{pet.species}{pet.breed ? ` · ${pet.breed}` : ''}</p>
                </button>
              ))}
            </div>
          )
        ) : null}

        {step === 3 ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-3 font-semibold text-primary-dark">Servicio</h3>
              <div className="space-y-2">
                {filteredServices.length === 0 ? (
                  <p className="text-sm text-primary-dark/70">No hay servicios disponibles en este momento.</p>
                ) : (
                  filteredServices.map((service) => (
                    <button
                      key={service.service_id}
                      type="button"
                      onClick={() => setServiceId(service.service_id)}
                      className={`w-full rounded-2xl border p-3 text-left ${
                        String(serviceId) === String(service.service_id)
                          ? 'border-primary bg-primary-light'
                          : 'border-secondary-light'
                      }`}
                    >
                      <p className="font-medium text-primary-dark">{service.name}</p>
                      <p className="text-sm text-secondary">Desde {formatMoney(service.current_price)}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
            {isSpa ? (
              <div className="rounded-2xl bg-primary-light/50 p-4 text-sm text-primary-dark">
                <p className="font-semibold">Estación de Spa / Peluquería</p>
                <p className="mt-1 text-primary-dark/75">
                  Este servicio no usa suite ni patio. El cupo se asigna internamente a{' '}
                  <strong>{spaStation?.name || SPA_STATION_LABEL}</strong>, asociado al estilista de turno.
                </p>
              </div>
            ) : isLodging || isRecreation ? (
              <div>
                <h3 className="mb-3 font-semibold text-primary-dark">
                  {isLodging ? 'Suite de hospedaje' : 'Patio de recreación'}
                </h3>
                {isRecreation ? (
                  <label className="mb-3 block text-sm font-medium text-primary-dark">
                    Selecciona el patio
                    <select
                      value={spaceId}
                      onChange={(event) => setSpaceId(event.target.value)}
                      className={`${inputClass} mt-1`}
                    >
                      <option value="">Elige un patio</option>
                      {filteredSpaces.map((space) => (
                        <option key={space.space_id} value={space.space_id}>
                          {space.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {isLodging ? (
                  <div className="space-y-2">
                    {filteredSpaces.map((space) => (
                      <button
                        key={space.space_id}
                        type="button"
                        onClick={() => setSpaceId(space.space_id)}
                        className={`w-full rounded-2xl border p-3 text-left ${
                          String(spaceId) === String(space.space_id)
                            ? 'border-primary bg-secondary-light'
                            : 'border-secondary-light'
                        }`}
                      >
                        <p className="font-medium text-primary-dark">{space.name}</p>
                        <p className="text-sm text-primary-dark/70">Suite · cupo {space.capacity}</p>
                      </button>
                    ))}
                    {filteredSpaces.length === 0 ? (
                      <p className="text-sm text-primary-dark/70">No hay suites disponibles para esta especie.</p>
                    ) : null}
                  </div>
                ) : null}
                {isRecreation && filteredSpaces.length === 1 ? (
                  <p className="text-xs text-primary-dark/60">
                    Se asignó automáticamente {filteredSpaces[0].name} por ser el único patio disponible para esta especie.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-secondary p-4 text-sm text-primary-dark/70">
                Selecciona un servicio para ver la suite, el patio o la estación que corresponde.
              </div>
            )}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="grid max-w-xl gap-4">
            {isLodging ? (
              <>
                <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
                  Fecha de entrada
                  <input type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
                  Fecha de salida
                  <input type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className={inputClass} />
                </label>
                <p className="text-xs text-primary-dark/60">Check-in 14:00 · Check-out 12:00</p>
              </>
            ) : (
              <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
                Fecha y hora de la cita
                <input
                  type="datetime-local"
                  value={appointmentAt}
                  onChange={(event) => setAppointmentAt(event.target.value)}
                  className={inputClass}
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
              Notas
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className={inputClass} />
            </label>
            <CapacityBanner
              availability={availability}
              isLodging={isLodging}
              isRecreation={isRecreation}
              petSpecies={selectedPet?.species}
            />
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-3 text-primary-dark">
            <h3 className="text-xl font-semibold">Resumen de la reserva</h3>
            <p>
              <strong>Servicio:</strong> {selectedService?.name}
            </p>
            <p>
              <strong>Mascota:</strong> {selectedPet?.name} ({selectedPet?.species})
            </p>
            {isLodging ? (
              <p>
                <strong>Suite:</strong> {selectedSpace?.name || 'Pendiente'}
              </p>
            ) : null}
            {isRecreation ? (
              <p>
                <strong>Asignación:</strong> {selectedSpace?.name || 'Patio de recreación'}
              </p>
            ) : null}
            {isSpa ? (
              <p>
                <strong>Estación:</strong> {spaStation?.name || SPA_STATION_LABEL}
              </p>
            ) : null}
            <p>
              <strong>{isLodging ? 'Entrada' : 'Inicio'}:</strong>{' '}
              {schedule ? new Date(schedule.start).toLocaleString('es-CO') : '—'}
            </p>
            <p>
              <strong>{isLodging ? 'Salida' : 'Fin'}:</strong>{' '}
              {schedule ? new Date(schedule.end).toLocaleString('es-CO') : '—'}
            </p>
            {isLodging ? <p><strong>Noches:</strong> {schedule?.nights}</p> : null}
            <div className="rounded-2xl bg-accent-sand px-4 py-3">
              <p className="text-sm">Tarifa unitaria: {formatMoney(selectedService?.current_price)}</p>
              <p className="text-lg font-semibold">Total estimado: {formatMoney(estimate)}</p>
            </div>
            <CapacityBanner
              availability={availability}
              isLodging={isLodging}
              isRecreation={isRecreation}
              petSpecies={selectedPet?.species}
            />
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(1, current - 1))}
            disabled={step === 1}
            className="rounded-full px-4 py-2 text-sm font-medium text-primary-dark disabled:opacity-40"
          >
            Atrás
          </button>
          {step < 5 ? (
            <button
              type="button"
              disabled={!canContinue() || (step === 4 && isCapacityFull())}
              onClick={() => setStep((current) => current + 1)}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {step === 4 && isCapacityFull() ? 'Aforo lleno' : 'Continuar'}
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || !canContinue() || isCapacityFull()}
              onClick={handleSubmit}
              className="rounded-full bg-secondary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {isCapacityFull() ? 'Aforo lleno' : submitting ? 'Confirmando...' : 'Confirmar reserva'}
            </button>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-primary-dark">Mis reservas</h2>
        {history.length === 0 ? (
          <p className="text-sm text-primary-dark/70">Todavía no tienes reservas.</p>
        ) : (
          <div className="grid gap-3">
            {history.map((booking) => (
              <article key={booking.booking_id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-secondary-light">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-primary-dark">
                    {booking.pet_name} · {booking.booking_type}
                  </p>
                  <span className="rounded-full bg-primary-light px-3 py-1 text-xs font-semibold text-primary-dark">
                    {booking.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-primary-dark/70">
                  {new Date(booking.start_at).toLocaleString('es-CO')} — {new Date(booking.end_at).toLocaleString('es-CO')}
                </p>
                <p className="mt-1 text-sm font-medium text-secondary">{formatMoney(booking.total_cost)}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default Bookings;
