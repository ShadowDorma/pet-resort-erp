import { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  CalendarClock,
  CheckCircle2,
  DoorOpen,
  LogIn,
  LogOut,
  MapPinned,
  PawPrint,
  Pencil,
  Plus,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import api from '../api/axios';
import { overlayLodgingOccupancy, splitLiveSpaces, SuiteMapDrawer, LODGING_CAPACITY, RECREATION_CAP, SPA_CAP } from '../components/LiveAvailability';
import BookingModal from '../components/BookingModal';
import { PetPhoto } from '../components/PetPhoto';
import PanelSkeleton from '../components/PanelSkeleton';
import { asArray, asObject, requestErrorMessage } from '../lib/safeData';

const inputClass = 'w-full rounded-xl border border-secondary-light px-3 py-2 text-sm text-primary-dark outline-none focus:border-primary';
const IN_HOUSE = ['IN_HOUSE', 'CHECKED_IN', 'IN_PROGRESS'];
const BOOKING_FILTERS = ['ALL', 'PENDING', 'CONFIRMED', 'IN_HOUSE', 'CANCELLED'];

const statusLabel = (status) => {
  const map = {
    PENDING: 'Pendiente',
    CONFIRMED: 'Confirmada',
    IN_HOUSE: 'En sitio',
    CHECKED_IN: 'En sitio',
    IN_PROGRESS: 'En proceso',
    COMPLETED: 'Finalizado',
    CANCELLED: 'Cancelada',
  };
  return map[status] || status;
};

const statusTone = (status) => {
  if (IN_HOUSE.includes(status)) {
    return 'bg-accent-sage text-primary-dark';
  }
  if (status === 'CONFIRMED') {
    return 'bg-primary-light text-primary-dark';
  }
  if (status === 'PENDING') {
    return 'bg-accent-sand text-primary-dark';
  }
  if (status === 'CANCELLED') {
    return 'bg-red-50 text-red-700';
  }
  return 'bg-secondary/20 text-primary-dark';
};

const isSameDay = (value) => {
  if (!value) {
    return false;
  }
  return new Date(value).toDateString() === new Date().toDateString();
};

const formatDateTime = (value) => {
  if (!value) {
    return 'Sin horario';
  }
  return new Date(value).toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

const toLocalInput = (value) => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const emptyClient = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  password: '',
};

const emptyPet = {
  name: '',
  species: 'Perro',
  breed: '',
  age_years: '',
  notes: '',
  special_care: '',
  medications: '',
};

const staffRoleLabel = (roles = []) => {
  const upper = roles.map((role) => String(role).toUpperCase());
  if (upper.includes('STYLIST') || upper.includes('GROOMER')) {
    return 'Estilista';
  }
  if (upper.includes('CARETAKER') || upper.includes('CAREGIVER')) {
    return 'Cuidador';
  }
  return 'Personal';
};

const isCatSpecies = (species) => {
  const value = String(species || '').toLowerCase();
  return value.includes('gato') || value.includes('cat') || value.includes('felin');
};

const staffInCharge = (booking) => {
  if (booking.assigned_staff_first_name) {
    const name = `${booking.assigned_staff_first_name} ${booking.assigned_staff_last_name || ''}`.trim();
    const title = booking.assigned_staff_job_title ? ` (${booking.assigned_staff_job_title})` : '';
    return `${name}${title}`;
  }
  return 'Sin asignar';
};

const destinationLabel = (booking) => {
  if (booking.space_name) {
    return booking.space_name;
  }
  if (booking.destination_kind) {
    return booking.destination_kind;
  }
  const type = String(booking.booking_type || '').toUpperCase();
  if (type === 'LODGING') {
    return 'Suite';
  }
  if (type === 'RECREATION') {
    return 'Patio';
  }
  if (type === 'APPOINTMENT') {
    return 'Estación de Spa';
  }
  return booking.service_name || 'Destino por confirmar';
};

const ageLabel = (item) => {
  const years = item?.age_years;
  if (years === null || years === undefined || years === '') {
    return 'Edad N/D';
  }
  return `${years} ${Number(years) === 1 ? 'año' : 'años'}`;
};

const careNotes = (item) =>
  item?.special_care || item?.temperament || item?.medications || item?.pet_allergies || item?.notes || 'Sin notas de cuidado';

const petFromBooking = (booking) => ({
  name: booking.pet_name,
  species: booking.species || booking.pet_species,
  photo_url: booking.pet_photo_url,
});

function ReceptionPetCard({ booking, badge, onOpen, children }) {
  if (!booking) {
    return null;
  }
  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-secondary-light">
      <button type="button" onClick={() => onOpen?.(booking)} className="flex w-full items-start gap-4 text-left">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
          <PetPhoto pet={petFromBooking(booking)} className="h-20" rounded="rounded-2xl" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-secondary">{badge}</p>
              <h2 className="text-lg font-semibold text-primary-dark">{booking?.pet_name || 'Mascota'}</h2>
              <p className="text-sm text-secondary">
                {booking?.species || booking?.pet_species || 'Especie N/D'} · {booking?.breed || 'Raza N/D'} · {ageLabel(booking)}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(booking?.status)}`}>
              {statusLabel(booking?.status)}
            </span>
          </div>
          <p className="mt-1 text-xs text-primary-dark/70 line-clamp-2">{careNotes(booking)}</p>
          <p className="mt-1 text-xs text-primary-dark/60">
            Destino: {destinationLabel(booking)} · A cargo: {staffInCharge(booking)}
          </p>
        </div>
      </button>
      <div className="mt-4 flex flex-wrap gap-2">{children}</div>
    </article>
  );
}

function ReceptionDashboard() {
  const [tab, setTab] = useState('checkin');
  const [bookings, setBookings] = useState([]);
  const [occupancy, setOccupancy] = useState({ occupied: 0, available: 0, total: 0, spaces: [] });
  const [staff, setStaff] = useState([]);
  const [clients, setClients] = useState([]);
  const [query, setQuery] = useState('');
  const [bookingFilter, setBookingFilter] = useState('ALL');
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checkInTarget, setCheckInTarget] = useState(null);
  const [checkInNotes, setCheckInNotes] = useState('');
  const [checkInSpace, setCheckInSpace] = useState('');
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({ start_at: '', end_at: '' });
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientForm, setClientForm] = useState(emptyClient);
  const [editClient, setEditClient] = useState(null);
  const [petOwner, setPetOwner] = useState(null);
  const [petForm, setPetForm] = useState(emptyPet);
  const [capacityStart, setCapacityStart] = useState('');
  const [capacityEnd, setCapacityEnd] = useState('');
  const [availability, setAvailability] = useState(null);
  const [scheduleAvailability, setScheduleAvailability] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [petSheet, setPetSheet] = useState(null);
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [suiteDrawerOpen, setSuiteDrawerOpen] = useState(false);

  const loadAll = async () => {
    try {
      const settled = await Promise.allSettled([
        api.get('/bookings/admin/all'),
        api.get('/staff/occupancy'),
        api.get('/reception/staff'),
        api.get('/reception/directory'),
      ]);

      const value = (index) => (settled[index].status === 'fulfilled' ? settled[index].value?.data : null);
      const bookingsData = value(0);
      const occupancyData = asObject(value(1), { occupied: 0, available: 0, total: 0, spaces: [] });
      const staffData = value(2);
      const directoryData = value(3);

      const nextBookings = asArray(bookingsData?.bookings).sort(
        (a, b) => new Date(a?.start_at || 0) - new Date(b?.start_at || 0)
      );
      setBookings(nextBookings);
      setOccupancy({
        occupied: Number(occupancyData?.occupied) || 0,
        available: Number(occupancyData?.available) || 0,
        total: Number(occupancyData?.total) || 0,
        spaces: asArray(occupancyData?.spaces),
      });
      setStaff(asArray(staffData?.staff));
      setClients(asArray(directoryData?.clients));

      const failed = settled.find((item) => item.status === 'rejected');
      if (failed) {
        setError(requestErrorMessage(failed.reason, 'Algunos datos de recepción no se pudieron cargar'));
      } else {
        setError('');
      }
    } catch (err) {
      setBookings([]);
      setOccupancy({ occupied: 0, available: 0, total: 0, spaces: [] });
      setStaff([]);
      setClients([]);
      setError(requestErrorMessage(err, 'No se pudo cargar el panel de recepción'));
    }
  };

  useEffect(() => {
    document.body.style.overflow = '';
    let cancelled = false;
    loadAll()
      .catch((err) => {
        if (!cancelled) {
          setError(requestErrorMessage(err, 'No se pudo cargar el panel de recepción'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    if (!capacityStart || !capacityEnd) {
      return undefined;
    }
    const start = new Date(`${capacityStart}T14:00:00`);
    let end = new Date(`${capacityEnd}T12:00:00`);
    if (!(end > start)) {
      end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    }
    let active = true;
    const load = async () => {
      try {
        const { data } = await api.get('/bookings/availability', {
          params: {
            start_at: start.toISOString(),
            end_at: end.toISOString(),
          },
        });
        if (active) {
          setAvailability(data?.availability || null);
        }
      } catch {
        if (active) {
          setAvailability(null);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [capacityStart, capacityEnd]);

  useEffect(() => {
    if (!scheduleTarget || !scheduleForm.start_at || !scheduleForm.end_at) {
      return undefined;
    }
    const start = new Date(scheduleForm.start_at);
    const end = new Date(scheduleForm.end_at);
    if (!(end > start)) {
      return undefined;
    }
    let active = true;
    const load = async () => {
      try {
        const { data } = await api.get('/bookings/availability', {
          params: {
            start_at: start.toISOString(),
            end_at: end.toISOString(),
            exclude_booking_id: scheduleTarget.booking_id,
            stylist_id: scheduleTarget.assigned_staff_id || undefined,
          },
        });
        if (active) {
          setScheduleAvailability(data?.availability || null);
        }
      } catch {
        if (active) {
          setScheduleAvailability(null);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [scheduleForm.end_at, scheduleForm.start_at, scheduleTarget]);

  const expectedToday = useMemo(
    () =>
      asArray(bookings).filter(
        (booking) =>
          (isSameDay(booking?.start_at) || isSameDay(booking?.end_at)) &&
          !IN_HOUSE.includes(booking?.status) &&
          !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(booking?.status)
      ),
    [bookings]
  );

  const inHouse = useMemo(
    () => asArray(bookings).filter((booking) => IN_HOUSE.includes(booking?.status)),
    [bookings]
  );

  const departuresToday = useMemo(
    () =>
      asArray(bookings).filter(
        (booking) =>
          isSameDay(booking?.end_at) &&
          !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(booking?.status)
      ),
    [bookings]
  );

  const filteredCheckins = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = [...expectedToday, ...inHouse];
    if (!term) {
      return list;
    }
    return list.filter((booking) =>
      [
        booking.pet_name,
        booking.owner_first_name,
        booking.owner_last_name,
        booking.owner_phone,
        booking.space_name,
        booking.destination_kind,
        booking.assigned_staff_first_name,
        booking.assigned_staff_last_name,
        booking.service_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [expectedToday, inHouse, query]);

  const filteredBookings = useMemo(() => {
    return asArray(bookings).filter((booking) => {
      if (bookingFilter === 'ALL') {
        return true;
      }
      if (bookingFilter === 'IN_HOUSE') {
        return IN_HOUSE.includes(booking?.status);
      }
      return booking?.status === bookingFilter;
    }).filter((booking) => {
      if (historyFrom) {
        const start = new Date(`${historyFrom}T00:00:00`);
        if (new Date(booking?.start_at) < start) {
          return false;
        }
      }
      if (historyTo) {
        const end = new Date(`${historyTo}T23:59:59`);
        if (new Date(booking?.start_at) > end) {
          return false;
        }
      }
      const term = historyQuery.trim().toLowerCase();
      if (!term) {
        return true;
      }
      return [
        booking?.pet_name,
        booking?.owner_first_name,
        booking?.owner_last_name,
        booking?.service_name,
        booking?.space_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [bookingFilter, bookings, historyFrom, historyQuery, historyTo]);

  const filteredClients = useMemo(() => {
    const term = directoryQuery.trim().toLowerCase();
    const list = asArray(clients);
    if (!term) {
      return list;
    }
    return list.filter((client) => {
      const petNames = asArray(client?.pets).map((pet) => pet?.name).join(' ');
      return [client?.first_name, client?.last_name, client?.phone, client?.email, petNames]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [clients, directoryQuery]);

  const occupiedSpaces = useMemo(() => {
    try {
      return overlayLodgingOccupancy(asArray(occupancy?.spaces), asArray(inHouse));
    } catch {
      return [];
    }
  }, [occupancy, inHouse]);
  const liveSpaces = useMemo(() => {
    try {
      return splitLiveSpaces(occupiedSpaces);
    } catch {
      return {
        occupiedLodging: 0,
        occupancyPercentage: 0,
        freeLodging: LODGING_CAPACITY,
        recreation: null,
        recreationCat: null,
        spa: null,
      };
    }
  }, [occupiedSpaces]);
  const recreationUsed = Number(liveSpaces.recreation?.occupied_count || 0);
  const recreationCatUsed = Number(liveSpaces.recreationCat?.occupied_count || 0);
  const spaUsed = Number(liveSpaces.spa?.occupied_count || 0);
  const recreationPets = Array.isArray(liveSpaces.recreation?.current_pets)
    ? liveSpaces.recreation.current_pets.filter(Boolean)
    : liveSpaces.recreation?.current_pet
      ? [liveSpaces.recreation.current_pet]
      : [];
  const spaPets = Array.isArray(liveSpaces.spa?.current_pets)
    ? liveSpaces.spa.current_pets.filter(Boolean)
    : liveSpaces.spa?.current_pet
      ? [liveSpaces.spa.current_pet]
      : [];
  const availableSpaces = occupiedSpaces.filter((space) => {
    if (space.occupied && String(space.space_id) !== String(checkInTarget?.space_id)) {
      return false;
    }
    if (space.status !== 'AVAILABLE' && String(space.space_id) !== String(checkInTarget?.space_id)) {
      return false;
    }
    if (!checkInTarget) {
      return true;
    }
    const type = String(checkInTarget.booking_type || '').toUpperCase();
    if (type === 'RECREATION') {
      return space.space_type === 'RECREATION';
    }
    if (type === 'APPOINTMENT') {
      return ['SPA', 'MULTIPURPOSE'].includes(space.space_type) || /spa|groom|cabina/i.test(space.name || '');
    }
    const cat = isCatSpecies(checkInTarget.species || checkInTarget.pet_species);
    const name = String(space.name || '');
    if (cat) {
      return space.space_type === 'CAT_SUITE' || (space.space_type === 'ROOM' && /^Suite Felina/i.test(name));
    }
    return space.space_type === 'DOG_SUITE' || (space.space_type === 'ROOM' && /^Suite Canina/i.test(name));
  });

  const flash = (text) => {
    setMessage(text);
    setError('');
  };

  const handleCheckIn = async (event) => {
    event.preventDefault();
    if (!checkInTarget) {
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/reception/check-in', {
        booking_id: checkInTarget.booking_id,
        notes: checkInNotes,
        space_id: checkInSpace || undefined,
      });
      flash('Check-in registrado');
      setCheckInTarget(null);
      setCheckInNotes('');
      setCheckInSpace('');
      await loadAll();
    } catch (err) {
      setError(requestErrorMessage(err, 'No se pudo registrar el check-in'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async (bookingId) => {
    setSubmitting(true);
    try {
      await api.post('/reception/check-out', { booking_id: bookingId });
      flash('Check-out registrado. Estado: COMPLETED');
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo registrar el check-out');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async (bookingId) => {
    setSubmitting(true);
    try {
      await api.put(`/bookings/${bookingId}/approve`);
      flash('Reserva confirmada');
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo confirmar la reserva');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (bookingId) => {
    setSubmitting(true);
    try {
      await api.put(`/bookings/${bookingId}/cancel`);
      flash('Reserva cancelada');
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cancelar la reserva');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssign = async (bookingId, assignedStaffId) => {
    setSubmitting(true);
    try {
      await api.put(`/bookings/${bookingId}/assign`, {
        assigned_staff_id: assignedStaffId || null,
      });
      flash('Personal asignado');
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo asignar el personal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReschedule = async (event) => {
    event.preventDefault();
    if (!scheduleTarget) {
      return;
    }
    setSubmitting(true);
    try {
      await api.put(`/bookings/${scheduleTarget.booking_id}/reschedule`, {
        start_at: new Date(scheduleForm.start_at).toISOString(),
        end_at: new Date(scheduleForm.end_at).toISOString(),
      });
      flash('Fecha y hora actualizadas');
      setScheduleTarget(null);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo modificar la reserva');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterClient = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/reception/clients', clientForm);
      flash('Cliente registrado');
      setClientForm(emptyClient);
      setShowClientForm(false);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo registrar el cliente');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateClient = async (event) => {
    event.preventDefault();
    if (!editClient) {
      return;
    }
    setSubmitting(true);
    try {
      await api.put(`/reception/clients/${editClient.user_id}`, editClient);
      flash('Datos del cliente actualizados');
      setEditClient(null);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo editar el cliente');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePet = async (event) => {
    event.preventDefault();
    if (!petOwner) {
      return;
    }
    setSubmitting(true);
    try {
      const birthDate = petForm.age_years
        ? `${new Date().getFullYear() - Number(petForm.age_years)}-01-01`
        : null;
      const { data } = await api.post('/pets', {
        owner_id: petOwner.user_id,
        name: petForm.name,
        species: petForm.species,
        breed: petForm.breed || null,
        birth_date: birthDate,
        notes: petForm.notes || petForm.medications || null,
      });
      if (petForm.special_care || petForm.medications) {
        await api.post(`/pets/${data.pet.pet_id}/instructions`, {
          special_care: petForm.special_care || null,
          medications: petForm.medications || null,
        });
      }
      flash(`Mascota ${petForm.name} agregada`);
      setPetOwner(null);
      setPetForm(emptyPet);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo registrar la mascota');
    } finally {
      setSubmitting(false);
    }
  };

  const openCheckIn = (booking) => {
    setCheckInTarget(booking);
    setCheckInNotes(booking.reception_notes || '');
    setCheckInSpace(booking.space_id || '');
  };

  const tabs = [
    { id: 'checkin', label: 'Llegadas / Salidas de hoy', icon: DoorOpen },
    { id: 'house', label: 'Mascotas en sitio', icon: PawPrint },
    { id: 'bookings', label: 'Historial de reservas', icon: CalendarClock },
    { id: 'directory', label: 'Clientes y mascotas', icon: Users },
  ];

  if (loading) {
    return (
      <section className="min-w-0">
        <h1 className="mb-4 text-3xl font-semibold text-primary-dark">Recepción</h1>
        <PanelSkeleton label="Cargando recepción..." />
      </section>
    );
  }

  return (
    <section className="min-w-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-secondary">Operación</p>
          <h1 className="text-3xl font-semibold text-primary-dark">Recepción</h1>
          <p className="text-sm text-primary-dark/70">Llegadas, huéspedes en sitio y gestión de citas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSuiteDrawerOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary-dark ring-1 ring-secondary-light hover:bg-primary-light"
          >
            <MapPinned size={16} className="text-primary" />
            Ver disponibilidad de suites (10)
            <span className="rounded-full bg-accent-sand px-2.5 py-0.5 text-[11px] font-bold text-primary-dark">
              {liveSpaces.occupiedLodging} ocupada{liveSpaces.occupiedLodging === 1 ? '' : 's'} / {liveSpaces.freeLodging} libre{liveSpaces.freeLodging === 1 ? '' : 's'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowClientForm(true)}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-primary-dark ring-1 ring-secondary-light"
          >
            <UserPlus size={16} />
            Registro rápido
          </button>
          <button
            type="button"
            onClick={() => setShowBookingModal(true)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-primary-dark"
          >
            <CalendarPlus size={16} />
            + Crear nueva reserva / cita
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-3">
        <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-secondary-light">
          <p className="text-xs uppercase tracking-wide text-secondary">Ocupación hotel</p>
          <p className="text-2xl font-semibold text-primary-dark">{liveSpaces.occupancyPercentage}%</p>
          <p className="text-xs text-primary-dark/60">
            {liveSpaces.freeLodging}/{LODGING_CAPACITY} disponibles · {liveSpaces.occupiedLodging} ocupadas
          </p>
        </article>
        <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-secondary-light">
          <p className="text-xs uppercase tracking-wide text-secondary">Patios de Recreación</p>
          <p className="text-2xl font-semibold text-primary-dark">
            {Math.min(recreationUsed, RECREATION_CAP) + Math.min(recreationCatUsed, RECREATION_CAP)}/{RECREATION_CAP * 2}
          </p>
          <p className="text-xs text-primary-dark/60">
            Canino {Math.min(recreationUsed, RECREATION_CAP)}/{RECREATION_CAP} · Felino{' '}
            {Math.min(recreationCatUsed, RECREATION_CAP)}/{RECREATION_CAP}
            {recreationPets.length > 0 ? ` · ${recreationPets.join(', ')}` : ''}
          </p>
        </article>
        <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-secondary-light">
          <p className="text-xs uppercase tracking-wide text-secondary">Cabina de Spa & Estética</p>
          <p className="text-2xl font-semibold text-primary-dark">
            {Math.min(spaUsed, SPA_CAP)}/{SPA_CAP}
          </p>
          <p className="text-xs text-primary-dark/60">
            {SPA_CAP > 0 ? Math.round((Math.min(spaUsed, SPA_CAP) / SPA_CAP) * 100) : 0}% ocupación
            {spaPets.length > 0 ? ` · ${spaPets.join(', ')}` : ''}
          </p>
        </article>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-secondary-light">
          <p className="text-xs uppercase tracking-wide text-secondary">Llegadas hoy</p>
          <p className="text-2xl font-semibold text-primary-dark">{expectedToday.length}</p>
        </article>
        <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-secondary-light">
          <p className="text-xs uppercase tracking-wide text-secondary">Mascotas en sitio</p>
          <p className="text-2xl font-semibold text-primary-dark">{inHouse.length}</p>
        </article>
        <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-secondary-light">
          <p className="text-xs uppercase tracking-wide text-secondary">Salidas programadas</p>
          <p className="text-2xl font-semibold text-primary-dark">{departuresToday.length}</p>
        </article>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                active ? 'bg-primary text-white' : 'bg-white text-primary-dark ring-1 ring-secondary-light'
              }`}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </div>

      {error ? <p className="mb-4 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mb-4 rounded-2xl bg-accent-sage/60 px-3 py-2 text-sm text-primary-dark">{message}</p> : null}

      {tab === 'checkin' ? (
        <>
          <label className="mb-5 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-secondary-light">
            <Search size={18} className="text-secondary" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por cliente, mascota o habitación"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>

          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-secondary">Llegadas de hoy</h2>
          {expectedToday.filter((booking) => filteredCheckins.includes(booking)).length === 0 ? (
            <p className="mb-6 rounded-2xl border border-dashed border-secondary bg-white p-6 text-sm text-primary-dark/70">
              No hay llegadas pendientes para hoy.
            </p>
          ) : (
            <div className="mb-8 grid gap-4">
              {expectedToday
                .filter((booking) => filteredCheckins.some((item) => item.booking_id === booking.booking_id))
                .map((booking) => (
                  <ReceptionPetCard key={booking.booking_id} booking={booking} badge="Llegada" onOpen={setPetSheet}>
                    <button
                      type="button"
                      onClick={() => openCheckIn(booking)}
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-medium text-white"
                    >
                      <LogIn size={15} />
                      Check-In
                    </button>
                  </ReceptionPetCard>
                ))}
            </div>
          )}

          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-secondary">Salidas de hoy</h2>
          {departuresToday.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-secondary bg-white p-6 text-sm text-primary-dark/70">
              No hay salidas programadas para hoy.
            </p>
          ) : (
            <div className="grid gap-4">
              {departuresToday.map((booking) => (
                <ReceptionPetCard key={`out-${booking.booking_id}`} booking={booking} badge="Salida" onOpen={setPetSheet}>
                  {IN_HOUSE.includes(booking.status) ? (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleCheckOut(booking.booking_id)}
                      className="inline-flex items-center gap-2 rounded-full bg-accent-purple px-3 py-2 text-sm font-medium text-white disabled:opacity-70"
                    >
                      <LogOut size={15} />
                      Check-Out
                    </button>
                  ) : null}
                </ReceptionPetCard>
              ))}
            </div>
          )}
        </>
      ) : null}

      {tab === 'house' ? (
        inHouse.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-secondary bg-white p-10 text-center">
            <PawPrint className="mx-auto mb-2 text-primary" />
            <p className="text-primary-dark/70">No hay mascotas en sitio en este momento.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {inHouse.map((booking) => (
              <ReceptionPetCard key={booking.booking_id} booking={booking} badge="En sitio" onOpen={setPetSheet}>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleCheckOut(booking.booking_id)}
                  className="inline-flex items-center gap-2 rounded-full bg-accent-purple px-3 py-2 text-sm font-medium text-white disabled:opacity-70"
                >
                  <LogOut size={15} />
                  Check-Out
                </button>
              </ReceptionPetCard>
            ))}
          </div>
        )
      ) : null}

      {tab === 'bookings' ? (
        <>
          <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-secondary-light">
            <p className="mb-3 text-sm font-semibold text-primary-dark">Filtros del historial</p>
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                Desde
                <input type="date" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} className={`${inputClass} mt-1`} />
              </label>
              <label className="text-sm">
                Hasta
                <input type="date" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} className={`${inputClass} mt-1`} />
              </label>
              <label className="text-sm">
                Búsqueda rápida
                <input
                  value={historyQuery}
                  onChange={(event) => setHistoryQuery(event.target.value)}
                  placeholder="Mascota, cliente o servicio"
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
            <div className="mb-2 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Aforo desde
                <input type="date" value={capacityStart} onChange={(event) => setCapacityStart(event.target.value)} className={`${inputClass} mt-1`} />
              </label>
              <label className="text-sm">
                Aforo hasta
                <input type="date" value={capacityEnd} onChange={(event) => setCapacityEnd(event.target.value)} className={`${inputClass} mt-1`} />
              </label>
            </div>
            {availability ? (
              <p className="text-sm text-primary-dark/70">
                Perros {availability?.lodging?.dogs?.available ?? 0}/5 · Gatos {availability?.lodging?.cats?.available ?? 0}/5 · Patio canino{' '}
                {availability?.recreation?.dogs?.available ?? availability?.recreation?.available ?? 0}/{availability?.recreation?.dogs?.limit ?? 3} · Patio felino{' '}
                {availability?.recreation?.cats?.available ?? 0}/{availability?.recreation?.cats?.limit ?? 3} · Spa {availability?.spa?.available ?? 0}/{availability?.spa?.limit ?? 1}
              </p>
            ) : null}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {BOOKING_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setBookingFilter(filter)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  bookingFilter === filter ? 'bg-primary text-white' : 'bg-white ring-1 ring-secondary-light'
                }`}
              >
                {filter === 'ALL' ? 'Todas' : statusLabel(filter)}
              </button>
            ))}
          </div>

          {filteredBookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-secondary bg-white p-10 text-center">
              <CalendarClock className="mx-auto mb-2 text-primary" />
              <p className="text-primary-dark/70">No hay reservas con ese filtro.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredBookings.map((booking) => (
                <ReceptionPetCard
                  key={booking.booking_id}
                  booking={booking}
                  badge={`${formatDateTime(booking.start_at)} → ${formatDateTime(booking.end_at)}`}
                  onOpen={setPetSheet}
                >
                  {booking.status === 'PENDING' ? (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleConfirm(booking.booking_id)}
                      className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      <CheckCircle2 size={15} />
                      Confirmar
                    </button>
                  ) : null}
                  {!['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(booking.status) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleTarget(booking);
                        setScheduleForm({
                          start_at: toLocalInput(booking.start_at),
                          end_at: toLocalInput(booking.end_at),
                        });
                      }}
                      className="rounded-full bg-secondary px-3 py-2 text-sm font-medium text-white"
                    >
                      Modificar fecha
                    </button>
                  ) : null}
                  {!['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(booking.status) ? (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleCancel(booking.booking_id)}
                      className="rounded-full bg-accent-purple px-3 py-2 text-sm font-medium text-white"
                    >
                      Cancelar
                    </button>
                  ) : null}
                  <select
                    disabled={submitting || ['COMPLETED', 'CANCELLED'].includes(booking.status)}
                    value={booking.assigned_staff_id || ''}
                    onChange={(event) => handleAssign(booking.booking_id, event.target.value)}
                    className="min-w-[180px] rounded-full border border-secondary-light px-3 py-2 text-sm"
                  >
                    <option value="">Asignar personal</option>
                    {staff.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.first_name} {member.last_name} · {staffRoleLabel(member.roles)}
                      </option>
                    ))}
                  </select>
                </ReceptionPetCard>
              ))}
            </div>
          )}
        </>
      ) : null}

      {tab === 'directory' ? (
        <>
          <label className="mb-5 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-secondary-light">
            <Search size={18} className="text-secondary" />
            <input
              value={directoryQuery}
              onChange={(event) => setDirectoryQuery(event.target.value)}
              placeholder="Buscar por cliente, teléfono o mascota"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>

          {filteredClients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-secondary bg-white p-10 text-center">
              <Users className="mx-auto mb-2 text-primary" />
              <p className="text-primary-dark/70">No hay coincidencias en el directorio.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredClients.map((client) => (
                <article key={client.user_id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-secondary-light">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold text-primary-dark">
                        {client.first_name} {client.last_name}
                      </h2>
                      <p className="text-sm text-secondary">{client.phone || 'Sin teléfono'}</p>
                      <p className="text-xs text-primary-dark/60">{client.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditClient({ ...client })}
                      className="inline-flex items-center gap-1 rounded-full bg-primary-light px-3 py-1.5 text-xs font-semibold"
                    >
                      <Pencil size={13} />
                      Editar
                    </button>
                  </div>
                  <ul className="mb-3 space-y-1">
                    {(client.pets || []).length === 0 ? (
                      <li className="text-sm text-primary-dark/60">Sin mascotas registradas.</li>
                    ) : (
                      client.pets.map((pet) => (
                        <li key={pet.pet_id}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-xl px-2 py-1 text-left text-sm text-primary-dark hover:bg-primary-light/50"
                            onClick={() =>
                              setPetSheet({
                                pet_name: pet.name,
                                species: pet.species,
                                breed: pet.breed,
                                age_years: pet.age_years,
                                pet_photo_url: pet.photo_url,
                                temperament: pet.notes,
                                pet_allergies: pet.allergies,
                                owner_first_name: client.first_name,
                                owner_last_name: client.last_name,
                                owner_phone: client.phone,
                                owner_email: client.email,
                                status: 'CONFIRMED',
                              })
                            }
                          >
                            <div className="h-10 w-10 overflow-hidden rounded-lg">
                              <PetPhoto pet={pet} className="h-10" rounded="rounded-lg" />
                            </div>
                            {pet.name} · {pet.species}
                            {pet.breed ? ` · ${pet.breed}` : ''}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                  <button
                    type="button"
                    onClick={() => {
                      setPetOwner(client);
                      setPetForm(emptyPet);
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-2 text-sm font-medium text-white"
                  >
                    <Plus size={15} />
                    Nueva mascota
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}

      {checkInTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 p-4">
          <form onSubmit={handleCheckIn} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-primary-dark">Check-in de {checkInTarget.pet_name}</h2>
            <p className="mb-4 text-xs text-primary-dark/60">Notas de recepción y asignación de habitación.</p>
            <label className="mb-3 block text-sm font-medium">
              Habitación / espacio
              <select
                value={checkInSpace}
                onChange={(event) => setCheckInSpace(event.target.value)}
                className={`${inputClass} mt-1`}
              >
                <option value="">Sin cambio de espacio</option>
                {availableSpaces.map((space) => (
                  <option key={space.space_id} value={space.space_id}>
                    {space.name} · {space.space_type}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Notas de recepción
              <textarea
                value={checkInNotes}
                onChange={(event) => setCheckInNotes(event.target.value)}
                rows={4}
                className={`${inputClass} mt-1`}
                placeholder="Objetos personales, alimentos traídos, observaciones"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setCheckInTarget(null)} className="flex-1 rounded-full border py-2 text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="flex-1 rounded-full bg-primary py-2 text-sm font-medium text-white">
                Confirmar ingreso
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {scheduleTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 p-4">
          <form onSubmit={handleReschedule} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-primary-dark">Modificar {scheduleTarget.pet_name}</h2>
            <label className="mb-3 block text-sm font-medium">
              Inicio
              <input
                required
                type="datetime-local"
                value={scheduleForm.start_at}
                onChange={(event) => setScheduleForm((current) => ({ ...current, start_at: event.target.value }))}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="block text-sm font-medium">
              Fin
              <input
                required
                type="datetime-local"
                value={scheduleForm.end_at}
                onChange={(event) => setScheduleForm((current) => ({ ...current, end_at: event.target.value }))}
                className={`${inputClass} mt-1`}
              />
            </label>
            {scheduleAvailability ? (
              <p className="mt-3 rounded-xl bg-accent-sage/60 px-3 py-2 text-xs">
                {scheduleTarget?.booking_type === 'RECREATION'
                  ? `Cupos en el patio: ${
                      (isCatSpecies(scheduleTarget?.pet_species || scheduleTarget?.species)
                        ? scheduleAvailability?.recreation?.cats?.available
                        : scheduleAvailability?.recreation?.dogs?.available) ?? scheduleAvailability?.recreation?.available ?? 0
                    }/${
                      (isCatSpecies(scheduleTarget?.pet_species || scheduleTarget?.species)
                        ? scheduleAvailability?.recreation?.cats?.limit
                        : scheduleAvailability?.recreation?.dogs?.limit) ?? 3
                    }`
                  : scheduleTarget?.booking_type === 'LODGING'
                    ? `Cupos disponibles Perros: ${scheduleAvailability?.lodging?.dogs?.available ?? 0}/5 | Cupos disponibles Gatos: ${scheduleAvailability?.lodging?.cats?.available ?? 0}/5`
                    : `Estética: ${scheduleAvailability?.spa?.available ?? 0}/${scheduleAvailability?.spa?.limit ?? 1}`}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setScheduleTarget(null)} className="flex-1 rounded-full border py-2 text-sm">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  submitting
                  || (
                    scheduleAvailability
                    && (
                      (scheduleTarget?.booking_type === 'LODGING'
                        && (isCatSpecies(scheduleTarget?.pet_species || scheduleTarget?.species)
                          ? (scheduleAvailability?.lodging?.cats?.available ?? 1) <= 0
                          : (scheduleAvailability?.lodging?.dogs?.available ?? 1) <= 0))
                      || (scheduleTarget?.booking_type === 'RECREATION'
                        && ((isCatSpecies(scheduleTarget?.pet_species || scheduleTarget?.species)
                          ? scheduleAvailability?.recreation?.cats?.available
                          : scheduleAvailability?.recreation?.dogs?.available) ?? scheduleAvailability?.recreation?.available ?? 1) <= 0)
                      || (scheduleTarget?.booking_type === 'APPOINTMENT' && (scheduleAvailability?.spa?.available ?? 1) <= 0)
                    )
                  )
                }
                className="flex-1 rounded-full bg-primary py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Guardar horario
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {showClientForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 p-4">
          <form onSubmit={handleRegisterClient} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-primary-dark">Nuevo cliente</h2>
            <div className="grid gap-3">
              <input required placeholder="Nombre" className={inputClass} value={clientForm.first_name} onChange={(event) => setClientForm((current) => ({ ...current, first_name: event.target.value }))} />
              <input required placeholder="Apellido" className={inputClass} value={clientForm.last_name} onChange={(event) => setClientForm((current) => ({ ...current, last_name: event.target.value }))} />
              <input required type="email" placeholder="Correo" className={inputClass} value={clientForm.email} onChange={(event) => setClientForm((current) => ({ ...current, email: event.target.value }))} />
              <input placeholder="Teléfono" className={inputClass} value={clientForm.phone} onChange={(event) => setClientForm((current) => ({ ...current, phone: event.target.value }))} />
              <input required type="password" placeholder="Contraseña temporal" className={inputClass} value={clientForm.password} onChange={(event) => setClientForm((current) => ({ ...current, password: event.target.value }))} />
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setShowClientForm(false)} className="flex-1 rounded-full border py-2 text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="flex-1 rounded-full bg-primary py-2 text-sm font-medium text-white">
                Registrar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editClient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 p-4">
          <form onSubmit={handleUpdateClient} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-primary-dark">Editar cliente</h2>
            <div className="grid gap-3">
              <input required className={inputClass} value={editClient.first_name} onChange={(event) => setEditClient((current) => ({ ...current, first_name: event.target.value }))} />
              <input required className={inputClass} value={editClient.last_name} onChange={(event) => setEditClient((current) => ({ ...current, last_name: event.target.value }))} />
              <input required type="email" className={inputClass} value={editClient.email} onChange={(event) => setEditClient((current) => ({ ...current, email: event.target.value }))} />
              <input className={inputClass} value={editClient.phone || ''} onChange={(event) => setEditClient((current) => ({ ...current, phone: event.target.value }))} />
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setEditClient(null)} className="flex-1 rounded-full border py-2 text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="flex-1 rounded-full bg-primary py-2 text-sm font-medium text-white">
                Guardar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {petOwner ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 p-4">
          <form onSubmit={handleCreatePet} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-primary-dark">Nueva mascota</h2>
            <p className="mb-4 text-xs text-primary-dark/60">
              Para {petOwner.first_name} {petOwner.last_name}
            </p>
            <div className="grid gap-3">
              <input required placeholder="Nombre" className={inputClass} value={petForm.name} onChange={(event) => setPetForm((current) => ({ ...current, name: event.target.value }))} />
              <select className={inputClass} value={petForm.species} onChange={(event) => setPetForm((current) => ({ ...current, species: event.target.value }))}>
                <option>Perro</option>
                <option>Gato</option>
              </select>
              <input placeholder="Raza" className={inputClass} value={petForm.breed} onChange={(event) => setPetForm((current) => ({ ...current, breed: event.target.value }))} />
              <input type="number" min="0" placeholder="Edad (años)" className={inputClass} value={petForm.age_years} onChange={(event) => setPetForm((current) => ({ ...current, age_years: event.target.value }))} />
              <textarea placeholder="Condición médica" rows={2} className={inputClass} value={petForm.medications} onChange={(event) => setPetForm((current) => ({ ...current, medications: event.target.value }))} />
              <textarea placeholder="Preferencias de cuidado" rows={2} className={inputClass} value={petForm.special_care} onChange={(event) => setPetForm((current) => ({ ...current, special_care: event.target.value }))} />
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setPetOwner(null)} className="flex-1 rounded-full border py-2 text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="flex-1 rounded-full bg-primary py-2 text-sm font-medium text-white">
                Registrar mascota
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <SuiteMapDrawer open={suiteDrawerOpen} onClose={() => setSuiteDrawerOpen(false)} spaces={occupiedSpaces} />

      <BookingModal
        open={showBookingModal}
        clients={clients}
        occupancySpaces={occupiedSpaces}
        onClose={() => setShowBookingModal(false)}
        onCreated={async (text) => {
          flash(text);
          await loadAll();
        }}
      />

      {petSheet ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-primary-dark/45 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <PetPhoto pet={petFromBooking(petSheet)} className="h-48" />
            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Ficha técnica</p>
              <h2 className="text-2xl font-semibold text-primary-dark">{petSheet.pet_name}</h2>
              <p className="text-sm text-secondary">
                {petSheet.species || petSheet.pet_species || 'Especie N/D'} · {petSheet.breed || 'Raza N/D'} · {ageLabel(petSheet)}
              </p>
              <div className="mt-4 rounded-2xl bg-accent-sand/70 p-3 text-sm text-primary-dark">
                <p className="font-semibold">Notas de cuidado</p>
                <p>{careNotes(petSheet)}</p>
                {petSheet.medications ? <p className="mt-1 text-xs">Medicación: {petSheet.medications}</p> : null}
                {petSheet.feeding_instructions ? <p className="mt-1 text-xs">Alimentación: {petSheet.feeding_instructions}</p> : null}
              </div>
              <div className="mt-4 rounded-2xl bg-primary-light/50 p-3 text-sm text-primary-dark">
                <p className="font-semibold">Propietario</p>
                <p>
                  {petSheet.owner_first_name} {petSheet.owner_last_name}
                </p>
                <p className="text-xs text-primary-dark/70">{petSheet.owner_phone || 'Sin teléfono'}</p>
                <p className="text-xs text-primary-dark/70">{petSheet.owner_email || 'Sin correo'}</p>
              </div>
              {petSheet.service_name || petSheet.space_name ? (
                <p className="mt-3 text-xs text-primary-dark/60">
                  {petSheet.service_name || petSheet.booking_type} · {destinationLabel(petSheet)} · {staffInCharge(petSheet)}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setPetSheet(null)}
                className="mt-5 w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-white"
              >
                Cerrar ficha
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default ReceptionDashboard;
