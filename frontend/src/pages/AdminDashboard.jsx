import { useEffect, useState } from 'react';
import { CalendarRange, CircleDollarSign, PawPrint, Pencil, Plus, Users } from 'lucide-react';
import api from '../api/axios';
import LiveAvailability, {
  LODGING_CAPACITY,
  overlayLodgingOccupancy,
  splitLiveSpaces,
} from '../components/LiveAvailability';
import PanelSkeleton from '../components/PanelSkeleton';
import { asArray, requestErrorMessage } from '../lib/safeData';
import { spacesMatchingService } from '../data/spacesData';

const tabs = [
  { id: 'metrics', label: 'Reportes' },
  { id: 'bookings', label: 'Reservas' },
  { id: 'people', label: 'Personal y clientes' },
  { id: 'catalog', label: 'Servicios y espacios' },
];

const STAFF_POSITIONS = [
  { name: 'RECEPCIONIST', description: 'Recepcionista' },
  { name: 'CARETAKER', description: 'Cuidador' },
  { name: 'STYLIST', description: 'Estilista / Groomer' },
];

const SPACE_TYPES = ['ROOM', 'KENNEL', 'RECREATION', 'MULTIPURPOSE', 'DOG_SUITE', 'CAT_SUITE', 'SPA'];
const SPACE_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'INACTIVE'];

const inputClass = 'rounded-xl border border-secondary-light px-3 py-2 text-sm text-primary-dark';

const formatMoney = (value) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const emptyStaffForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  password: '',
  staff_role: 'RECEPCIONIST',
  status: 'ACTIVE',
};

const emptyServiceForm = {
  name: '',
  category_id: '',
  current_price: '',
  description: '',
  duration_label: '',
  duration_minutes: '',
};

const emptySpaceForm = {
  name: '',
  space_type: 'ROOM',
  capacity: 1,
  status: 'AVAILABLE',
  description: '',
};

const currentPosition = (roles = []) => {
  const upper = roles.map((role) => String(role).toUpperCase());
  return STAFF_POSITIONS.find((position) => upper.includes(position.name))?.name || 'RECEPCIONIST';
};

const spaceTypeLabel = (type) =>
  ({
    DOG_SUITE: 'Suite canina',
    CAT_SUITE: 'Suite felina',
    RECREATION: 'Patio de recreación',
    MULTIPURPOSE: 'Cabina de spa',
    SPA: 'Cabina de spa',
    ROOM: 'Habitación',
    KENNEL: 'Canil',
  }[String(type || '').toUpperCase()] || type);

const defaultSpaceFormForService = (service) => {
  const hay = `${service?.name || ''} ${service?.target_pet_type || ''} ${service?.category_name || ''} ${service?.category_type || ''}`.toLowerCase();
  if (/guarder|recreac/.test(hay)) {
    return { ...emptySpaceForm, space_type: 'RECREATION', capacity: 3 };
  }
  if (/spa|baño|corte|groom|est[eé]tica|peluqu/.test(hay)) {
    return { ...emptySpaceForm, space_type: 'SPA', capacity: 1 };
  }
  if (/felin|gato/.test(hay) && !/perro|canin/.test(hay)) {
    return { ...emptySpaceForm, space_type: 'ROOM', capacity: 1 };
  }
  if (/hotel|hosped|suite|canin|perro/.test(hay)) {
    return { ...emptySpaceForm, space_type: 'ROOM', capacity: 1 };
  }
  return emptySpaceForm;
};

const pickDefaultServiceId = (list = []) => {
  const hotel = list.find((service) => /hotel canino suite/i.test(service.name || ''));
  return hotel?.service_id || list[0]?.service_id || null;
};

function AdminDashboard() {
  const [tab, setTab] = useState('metrics');
  const [metrics, setMetrics] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [staff, setStaff] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [categories, setCategories] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [staffForm, setStaffForm] = useState(emptyStaffForm);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState(emptyStaffForm);
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [editingService, setEditingService] = useState(null);
  const [spaceForm, setSpaceForm] = useState(emptySpaceForm);
  const [editingSpace, setEditingSpace] = useState(null);
  const [catalogModal, setCatalogModal] = useState(null);
  const [liveSpaces, setLiveSpaces] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState(null);

  const loadAll = async () => {
    setError('');
    try {
      const params = {};
      if (status) params.status = status;
      if (from) params.from = from;
      if (to) params.to = to;

      const [metricsRes, bookingsRes, occupancyRes, staffRes, clientsRes, servicesRes, spacesRes, categoriesRes] = await Promise.allSettled([
        api.get('/admin/metrics'),
        api.get('/bookings/admin/all', { params }),
        api.get('/staff/occupancy'),
        api.get('/admin/users', { params: { role: 'STAFF' } }),
        api.get('/admin/users', { params: { role: 'CLIENT' } }),
        api.get('/services', { params: { includeUnavailable: 'true' } }),
        api.get('/spaces'),
        api.get('/services/categories'),
      ]);

      const valueOf = (result) => (result.status === 'fulfilled' ? result.value.data : null);
      const failed = [metricsRes, bookingsRes, occupancyRes, staffRes, clientsRes, servicesRes, spacesRes, categoriesRes]
        .find((result) => result.status === 'rejected');

      const nextBookings = asArray(valueOf(bookingsRes)?.bookings);
      const nextServices = asArray(valueOf(servicesRes)?.services);
      setMetrics(valueOf(metricsRes));
      setBookings(nextBookings);
      setLiveSpaces(asArray(valueOf(occupancyRes)?.spaces || valueOf(spacesRes)?.spaces));
      setStaff(asArray(valueOf(staffRes)?.users));
      setClients(asArray(valueOf(clientsRes)?.users));
      setServices(nextServices);
      setSpaces(asArray(valueOf(spacesRes)?.spaces));
      setCategories(asArray(valueOf(categoriesRes)?.categories));
      setSelectedServiceId((current) => {
        if (current && nextServices.some((service) => String(service.service_id) === String(current))) {
          return current;
        }
        return pickDefaultServiceId(nextServices);
      });
      setAssignments(
        Object.fromEntries(
          nextBookings.map((booking) => [booking.booking_id, booking.assigned_staff_id || ''])
        )
      );
      if (failed) {
        setError(requestErrorMessage(failed.reason, 'Algunos datos del panel no se pudieron cargar'));
      }
    } catch (err) {
      setError(requestErrorMessage(err, 'No se pudo cargar el panel de administración'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [status, from, to]);

  const runAction = async (action, successMessage) => {
    setError('');
    setMessage('');
    try {
      await action();
      if (successMessage) setMessage(successMessage);
      await loadAll();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo completar la acción');
      return false;
    }
  };

  const handleApprove = (bookingId) =>
    runAction(
      () => api.put(`/bookings/${bookingId}/approve`, {
        assigned_staff_id: assignments[bookingId] || null,
      }),
      'Reserva aprobada'
    );

  const handleAssign = (bookingId) =>
    runAction(
      () => api.put(`/bookings/${bookingId}/assign`, {
        assigned_staff_id: assignments[bookingId] || null,
      }),
      'Empleado asignado'
    );

  const handleCancel = (bookingId) =>
    runAction(
      () => api.put(`/bookings/${bookingId}/cancel`, { reason: 'Cancelada por administración' }),
      'Reserva cancelada'
    );

  const handleCreateStaff = (event) => {
    event.preventDefault();
    runAction(
      () => api.post('/users', { ...staffForm, role: staffForm.staff_role }),
      'Personal registrado'
    ).then((ok) => {
      if (ok) setStaffForm(emptyStaffForm);
    });
  };

  const openEditUser = (person, isStaffMember) => {
    setEditingUser({ ...person, isStaffMember });
    setUserForm({
      first_name: person.first_name,
      last_name: person.last_name,
      email: person.email,
      phone: person.phone || '',
      staff_role: currentPosition(person.roles),
      status: person.status,
      password: '',
    });
  };

  const handleUpdateUser = (event) => {
    event.preventDefault();
    if (!editingUser) return;
    const payload = {
      first_name: userForm.first_name,
      last_name: userForm.last_name,
      email: userForm.email,
      phone: userForm.phone,
      status: userForm.status,
    };
    if (editingUser.isStaffMember) {
      payload.staff_role = userForm.staff_role;
    }
    runAction(
      () => api.put(`/users/${editingUser.user_id}`, payload),
      'Usuario actualizado'
    ).then((ok) => {
      if (ok) setEditingUser(null);
    });
  };

  const toggleUserStatus = (person) => {
    const nextStatus = person.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    runAction(
      () => api.put(`/users/${person.user_id}`, { status: nextStatus }),
      `Usuario marcado como ${nextStatus}`
    );
  };

  const handleSaveService = (event) => {
    event.preventDefault();
    const payload = {
      ...serviceForm,
      current_price: Number(serviceForm.current_price),
      duration_minutes: serviceForm.duration_minutes ? Number(serviceForm.duration_minutes) : undefined,
    };
    if (editingService) {
      runAction(
        () => api.put(`/services/${editingService.service_id}`, payload),
        'Servicio actualizado'
      ).then((ok) => {
        if (ok) {
          setEditingService(null);
          setServiceForm(emptyServiceForm);
          setCatalogModal(null);
        }
      });
      return;
    }
    runAction(
      () => api.post('/services', payload),
      'Servicio creado'
    ).then((ok) => {
      if (ok) {
        setServiceForm(emptyServiceForm);
        setCatalogModal(null);
      }
    });
  };

  const handleSaveSpace = (event) => {
    event.preventDefault();
    const payload = {
      ...spaceForm,
      capacity: Number(spaceForm.capacity),
    };
    if (editingSpace) {
      runAction(
        () => api.put(`/spaces/${editingSpace.space_id}`, payload),
        'Espacio actualizado'
      ).then((ok) => {
        if (ok) {
          setEditingSpace(null);
          setSpaceForm(emptySpaceForm);
          setCatalogModal(null);
        }
      });
      return;
    }
    runAction(
      () => api.post('/spaces', payload),
      'Espacio creado'
    ).then((ok) => {
      if (ok) {
        setSpaceForm(emptySpaceForm);
        setCatalogModal(null);
      }
    });
  };

  if (loading) {
    return (
      <section>
        <h1 className="mb-4 text-3xl font-semibold text-primary-dark">Panel Admin</h1>
        <PanelSkeleton label="Cargando panel de administración..." />
      </section>
    );
  }

  const occupiedSpaces = overlayLodgingOccupancy(
    asArray(liveSpaces),
    asArray(bookings).filter((booking) => ['IN_HOUSE', 'CHECKED_IN', 'IN_PROGRESS'].includes(booking?.status))
  );
  const live = splitLiveSpaces(occupiedSpaces);
  const occupancyPercentage = Math.round((live.occupiedLodging / LODGING_CAPACITY) * 100);
  const selectedService =
    services.find((service) => String(service.service_id) === String(selectedServiceId)) || services[0] || null;
  const catalogSpaces = selectedService ? spacesMatchingService(selectedService, spaces) : [];

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-secondary">Administración</p>
        <h1 className="text-3xl font-semibold text-primary-dark">Panel Admin</h1>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === item.id ? 'bg-primary text-white' : 'text-primary-dark hover:bg-primary-light'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-2xl bg-secondary-light px-4 py-3 text-sm text-primary-dark">{message}</p> : null}

      {tab === 'metrics' && metrics ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total de reservas', value: metrics.total_bookings, icon: CalendarRange, tone: 'bg-primary-light' },
            { label: 'Ingresos estimados', value: formatMoney(metrics.estimated_revenue), icon: CircleDollarSign, tone: 'bg-accent-sand' },
            { label: 'Ocupación de espacios', value: `${occupancyPercentage}%`, icon: PawPrint, tone: 'bg-secondary-light' },
            { label: 'Clientes activos', value: metrics.active_clients, icon: Users, tone: 'bg-accent-sage' },
          ].map((card) => (
            <article key={card.label} className="rounded-2xl bg-white p-5 shadow-sm">
              <span className={`mb-3 inline-flex rounded-2xl p-3 ${card.tone}`}>
                <card.icon className="text-primary-dark" size={22} />
              </span>
              <p className="text-sm text-primary-dark/70">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold text-primary-dark">{card.value}</p>
            </article>
          ))}
        </div>
      ) : null}

      {tab === 'metrics' ? (
        <LiveAvailability spaces={occupiedSpaces} title="Disponibilidad en tiempo real" />
      ) : null}

      {tab === 'bookings' ? (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap gap-3">
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}>
              <option value="">Todos los estados</option>
              {['PENDING', 'CONFIRMED', 'IN_HOUSE', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} aria-label="Desde" />
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} aria-label="Hasta" />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-primary-dark/70">
                <tr>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Mascota</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Inicio</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Responsable</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.booking_id} className="border-t border-secondary-light">
                    <td className="px-3 py-3">{booking.owner_first_name} {booking.owner_last_name}</td>
                    <td className="px-3 py-3">{booking.pet_name}</td>
                    <td className="px-3 py-3">{booking.booking_type}</td>
                    <td className="px-3 py-3">{new Date(booking.start_at).toLocaleString('es-CO')}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-primary-light px-2 py-1 text-xs font-semibold">{booking.status}</span>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={String(assignments[booking.booking_id] || '')}
                        onChange={(event) => setAssignments((current) => ({
                          ...current,
                          [booking.booking_id]: event.target.value,
                        }))}
                        className={`${inputClass} min-w-44`}
                      >
                        <option value="">Sin asignar</option>
                        {staff.filter((person) => person.status === 'ACTIVE').map((person) => (
                          <option key={person.user_id} value={String(person.user_id)}>
                            {person.first_name} {person.last_name}
                            {person.job_title ? ` · ${person.job_title}` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">{formatMoney(booking.total_cost)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {booking.status === 'PENDING' ? (
                          <button type="button" onClick={() => handleApprove(booking.booking_id)} className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-white">
                            Aprobar
                          </button>
                        ) : null}
                        <button type="button" onClick={() => handleAssign(booking.booking_id)} className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                          Asignar
                        </button>
                        {!['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(booking.status) ? (
                          <button type="button" onClick={() => handleCancel(booking.booking_id)} className="rounded-full bg-accent-purple px-3 py-1 text-xs font-semibold text-white">
                            Cancelar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'people' ? (
        <div className="space-y-6">
          <article className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-semibold text-primary-dark">
              <Plus size={18} /> Registrar personal
            </h2>
            <form onSubmit={handleCreateStaff} className="grid gap-3 md:grid-cols-3">
              <input required placeholder="Nombre" className={inputClass} value={staffForm.first_name} onChange={(event) => setStaffForm((current) => ({ ...current, first_name: event.target.value }))} />
              <input required placeholder="Apellido" className={inputClass} value={staffForm.last_name} onChange={(event) => setStaffForm((current) => ({ ...current, last_name: event.target.value }))} />
              <input required type="email" placeholder="Correo" className={inputClass} value={staffForm.email} onChange={(event) => setStaffForm((current) => ({ ...current, email: event.target.value }))} />
              <input placeholder="Teléfono" className={inputClass} value={staffForm.phone} onChange={(event) => setStaffForm((current) => ({ ...current, phone: event.target.value }))} />
              <input required minLength={8} type="password" placeholder="Contraseña" className={inputClass} value={staffForm.password} onChange={(event) => setStaffForm((current) => ({ ...current, password: event.target.value }))} />
              <select className={inputClass} value={staffForm.staff_role} onChange={(event) => setStaffForm((current) => ({ ...current, staff_role: event.target.value }))}>
                {STAFF_POSITIONS.map((position) => (
                  <option key={position.name} value={position.name}>{position.description}</option>
                ))}
              </select>
              <button type="submit" className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-white md:col-span-3">
                Crear empleado
              </button>
            </form>
          </article>

          {editingUser ? (
            <article className="rounded-2xl bg-primary-light/60 p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-primary-dark">Editar usuario</h2>
              <form onSubmit={handleUpdateUser} className="grid gap-3 md:grid-cols-3">
                <input required className={inputClass} value={userForm.first_name} onChange={(event) => setUserForm((current) => ({ ...current, first_name: event.target.value }))} />
                <input required className={inputClass} value={userForm.last_name} onChange={(event) => setUserForm((current) => ({ ...current, last_name: event.target.value }))} />
                <input required type="email" className={inputClass} value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} />
                <input className={inputClass} value={userForm.phone} onChange={(event) => setUserForm((current) => ({ ...current, phone: event.target.value }))} />
                <select className={inputClass} value={userForm.status} onChange={(event) => setUserForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="ACTIVE">ACTIVO</option>
                  <option value="INACTIVE">INACTIVO</option>
                </select>
                {editingUser.isStaffMember ? (
                  <select className={inputClass} value={userForm.staff_role} onChange={(event) => setUserForm((current) => ({ ...current, staff_role: event.target.value }))}>
                    {STAFF_POSITIONS.map((position) => (
                      <option key={position.name} value={position.name}>{position.description}</option>
                    ))}
                  </select>
                ) : null}
                <div className="flex gap-2 md:col-span-3">
                  <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">Guardar</button>
                  <button type="button" onClick={() => setEditingUser(null)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary-dark">Cancelar</button>
                </div>
              </form>
            </article>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            {[
              { title: 'Personal', rows: staff, isStaffMember: true },
              { title: 'Clientes', rows: clients, isStaffMember: false },
            ].map((group) => (
              <article key={group.title} className="rounded-2xl bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-primary-dark">{group.title}</h2>
                <div className="space-y-3">
                  {group.rows.map((person) => (
                    <div key={person.user_id} className="rounded-2xl bg-background px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-primary-dark">{person.first_name} {person.last_name}</p>
                          <p className="text-sm text-primary-dark/70">{person.email}</p>
                          <p className="text-sm text-primary-dark/70">{person.phone || 'Sin teléfono'}</p>
                          <p className="text-xs text-secondary">
                            {person.job_title || (group.isStaffMember ? 'Staff' : 'Cliente')} · {person.status}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => openEditUser(person, group.isStaffMember)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-dark shadow-sm">
                            <Pencil size={12} /> Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleUserStatus(person)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${person.status === 'ACTIVE' ? 'bg-accent-purple' : 'bg-secondary'}`}
                          >
                            {person.status === 'ACTIVE' ? 'Inactivar' : 'Activar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'catalog' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-primary-dark">Servicios y espacios</h2>
              <p className="text-sm text-primary-dark/70">Selecciona un servicio para ver únicamente sus espacios asociados.</p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-white"
              onClick={() => {
                setEditingService(null);
                setServiceForm(emptyServiceForm);
                setCatalogModal('service');
              }}
            >
              <Plus size={16} /> Nuevo servicio
            </button>
          </div>

          {services.length === 0 ? (
            <p className="rounded-2xl bg-white px-4 py-6 text-sm text-primary-dark/70 shadow-sm">No hay servicios registrados.</p>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
              <aside className="space-y-3">
                {services.map((service) => {
                  const linked = spacesMatchingService(service, spaces);
                  const active = String(selectedService?.service_id) === String(service.service_id);
                  return (
                    <article
                      key={service.service_id}
                      className={`rounded-2xl bg-white p-4 shadow-sm transition ${
                        active
                          ? 'bg-emerald-50/80 ring-2 ring-primary'
                          : 'ring-1 ring-secondary-light hover:ring-primary/40'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedServiceId(service.service_id)}
                        className="w-full text-left"
                      >
                        <p className="font-semibold text-primary-dark">{service.name}</p>
                        <p className="text-sm text-secondary">
                          {service.category_name || 'Sin categoría'} · {formatMoney(service.current_price)}
                        </p>
                        <p className="mt-1 text-xs text-primary-dark/60">
                          {linked.length} espacio{linked.length === 1 ? '' : 's'} · {service.is_available ? 'Activo' : 'Desactivado'}
                        </p>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-full bg-white px-3 py-1 text-xs font-semibold shadow-sm ring-1 ring-secondary-light"
                          onClick={() => {
                            setEditingService(service);
                            setServiceForm({
                              name: service.name,
                              category_id: service.category_id,
                              current_price: service.current_price,
                              description: service.description || '',
                              duration_label: service.duration_label || '',
                              duration_minutes: service.duration_minutes || '',
                            });
                            setCatalogModal('service');
                          }}
                        >
                          Editar
                        </button>
                        {service.is_available ? (
                          <button
                            type="button"
                            className="rounded-full bg-accent-purple px-3 py-1 text-xs font-semibold text-white"
                            onClick={() => runAction(() => api.delete(`/services/${service.service_id}`), 'Servicio desactivado')}
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-white"
                            onClick={() => runAction(() => api.put(`/services/${service.service_id}`, { is_available: true }), 'Servicio activado')}
                          >
                            Activar
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </aside>

              <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-secondary-light">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-secondary-light pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Detalle</p>
                    <h3 className="text-xl font-semibold text-primary-dark">
                      Espacios de: {selectedService?.name || 'Servicio'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"
                    onClick={() => {
                      setEditingSpace(null);
                      setSpaceForm(defaultSpaceFormForService(selectedService));
                      setCatalogModal('space');
                    }}
                  >
                    <Plus size={16} /> Agregar Espacio a este Servicio
                  </button>
                </div>

                {catalogSpaces.length === 0 ? (
                  <p className="rounded-2xl bg-background px-4 py-8 text-sm text-primary-dark/70">
                    Este servicio no tiene espacios asociados todavía.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {catalogSpaces.map((space) => (
                      <article key={space.space_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-background px-4 py-3">
                        <div>
                          <p className="font-medium text-primary-dark">{space.name}</p>
                          <p className="text-sm text-secondary">
                            {spaceTypeLabel(space.space_type)} · Capacidad {space.capacity} · {space.status}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded-full bg-white px-3 py-1 text-xs font-semibold shadow-sm"
                          onClick={() => {
                            setEditingSpace(space);
                            setSpaceForm({
                              name: space.name,
                              space_type: space.space_type,
                              capacity: space.capacity,
                              status: space.status,
                              description: space.description || '',
                            });
                            setCatalogModal('space');
                          }}
                        >
                          Editar
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      ) : null}

      {catalogModal ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-primary-dark/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg">
            {catalogModal === 'service' ? (
              <>
                <h3 className="mb-4 text-lg font-semibold text-primary-dark">
                  {editingService ? 'Editar servicio' : 'Nuevo servicio'}
                </h3>
                <form onSubmit={handleSaveService} className="grid gap-3">
                  <input required placeholder="Nombre" className={inputClass} value={serviceForm.name} onChange={(event) => setServiceForm((current) => ({ ...current, name: event.target.value }))} />
                  <select required className={inputClass} value={serviceForm.category_id} onChange={(event) => setServiceForm((current) => ({ ...current, category_id: event.target.value }))}>
                    <option value="">Categoría</option>
                    {categories.map((category) => (
                      <option key={category.category_id} value={category.category_id}>{category.name}</option>
                    ))}
                  </select>
                  <input required type="number" min="0" placeholder="Precio" className={inputClass} value={serviceForm.current_price} onChange={(event) => setServiceForm((current) => ({ ...current, current_price: event.target.value }))} />
                  <input placeholder="Duración (ej. 60 min)" className={inputClass} value={serviceForm.duration_label} onChange={(event) => setServiceForm((current) => ({ ...current, duration_label: event.target.value }))} />
                  <input type="number" min="1" placeholder="Duración en minutos" className={inputClass} value={serviceForm.duration_minutes} onChange={(event) => setServiceForm((current) => ({ ...current, duration_minutes: event.target.value }))} />
                  <textarea placeholder="Descripción" className={inputClass} value={serviceForm.description} onChange={(event) => setServiceForm((current) => ({ ...current, description: event.target.value }))} />
                  <div className="flex gap-2">
                    <button type="submit" className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-white">
                      {editingService ? 'Guardar cambios' : 'Crear servicio'}
                    </button>
                    <button type="button" className="rounded-full bg-background px-4 py-2 text-sm font-semibold" onClick={() => setCatalogModal(null)}>
                      Cerrar
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h3 className="mb-4 text-lg font-semibold text-primary-dark">
                  {editingSpace ? 'Editar espacio' : 'Nueva habitación / canil'}
                </h3>
                <form onSubmit={handleSaveSpace} className="grid gap-3">
                  <input required placeholder="Nombre" className={inputClass} value={spaceForm.name} onChange={(event) => setSpaceForm((current) => ({ ...current, name: event.target.value }))} />
                  <select className={inputClass} value={spaceForm.space_type} onChange={(event) => setSpaceForm((current) => ({ ...current, space_type: event.target.value }))}>
                    {SPACE_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <input required type="number" min="1" placeholder="Capacidad" className={inputClass} value={spaceForm.capacity} onChange={(event) => setSpaceForm((current) => ({ ...current, capacity: event.target.value }))} />
                  <select className={inputClass} value={spaceForm.status} onChange={(event) => setSpaceForm((current) => ({ ...current, status: event.target.value }))}>
                    {SPACE_STATUSES.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  <textarea placeholder="Descripción" className={inputClass} value={spaceForm.description} onChange={(event) => setSpaceForm((current) => ({ ...current, description: event.target.value }))} />
                  <div className="flex gap-2">
                    <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
                      {editingSpace ? 'Guardar espacio' : 'Crear espacio'}
                    </button>
                    <button type="button" className="rounded-full bg-background px-4 py-2 text-sm font-semibold" onClick={() => setCatalogModal(null)}>
                      Cerrar
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default AdminDashboard;
