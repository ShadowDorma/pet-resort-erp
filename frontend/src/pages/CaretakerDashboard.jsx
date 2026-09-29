import { useEffect, useMemo, useState } from 'react';
import { Camera, ClipboardList, PawPrint, Plus } from 'lucide-react';
import api from '../api/axios';
import DateNavigator from '../components/DateNavigator';
import PanelSkeleton from '../components/PanelSkeleton';
import { asArray, isSameCalendarDay, requestErrorMessage, toDateInputValue } from '../lib/safeData';

const inputClass = 'w-full rounded-xl border border-secondary-light px-3 py-2 text-sm text-primary-dark';

const LOG_OPTIONS = [
  { value: 'FEEDING', label: 'Alimentación' },
  { value: 'ACTIVITY', label: 'Paseo' },
  { value: 'MEDICAL', label: 'Medicamento' },
  { value: 'NOTE', label: 'Incidencia' },
];

const IN_HOUSE = ['IN_HOUSE', 'CHECKED_IN', 'IN_PROGRESS'];
const CARETAKER_TYPES = new Set(['LODGING', 'RECREATION']);

const logLabel = (type) => LOG_OPTIONS.find((item) => item.value === type)?.label || type;

const isInHouse = (pet) => IN_HOUSE.includes(String(pet?.status || '').toUpperCase()) || pet?.board_section === 'IN_HOUSE';

const statusBadge = (pet) => {
  if (isInHouse(pet)) {
    return { label: 'En sitio', className: 'bg-accent-sage text-primary-dark' };
  }
  if (String(pet.status).toUpperCase() === 'PENDING') {
    return { label: 'Pendiente', className: 'bg-accent-sand text-primary-dark' };
  }
  return { label: 'Llegada hoy', className: 'bg-primary-light text-primary-dark' };
};

const fileToPreview = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSize = 1200;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.onerror = () => reject(new Error('No se pudo leer la imagen'));
      image.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });

function PetBoardCard({ pet, onAddLog, selectedDate }) {
  const todayLogs = asArray(pet?.logs).filter((log) => isSameCalendarDay(log?.created_at, selectedDate));
  const badge = statusBadge(pet);

  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-secondary-light">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-primary-dark">{pet?.pet_name || 'Mascota'}</h2>
          <p className="text-sm text-secondary">
            {pet?.species} · {pet?.breed || 'Raza N/D'}
          </p>
          <p className="text-xs text-primary-dark/60">
            {pet?.owner_first_name} {pet?.owner_last_name}
          </p>
          <p className="text-xs text-primary-dark/60">
            {pet?.service_name || (pet?.booking_type === 'RECREATION' ? 'Día de Guardería' : 'Hospedaje')}
            {pet?.space_name ? ` · ${pet.space_name}` : pet?.destination_kind ? ` · ${pet.destination_kind}` : ''}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
      </div>
      {pet.special_care || pet.medications ? (
        <p className="mb-3 rounded-xl bg-accent-sand/80 px-3 py-2 text-xs text-primary-dark">
          {pet.special_care || pet.medications}
        </p>
      ) : null}
      <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-primary-dark">
        <ClipboardList size={16} />
        Bitácora del día
      </h3>
      {todayLogs.length === 0 ? (
        <p className="text-sm text-primary-dark/60">Aún no hay registros en esta fecha.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {todayLogs.map((log) => (
            <li key={log.id} className="rounded-xl bg-primary-light/50 px-3 py-2 text-xs">
              <strong>{logLabel(log.type)}</strong> ·{' '}
              {new Date(log.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
              <p>{log.description}</p>
              {log.photo_url ? (
                <img src={log.photo_url} alt="Foto de bitácora" className="mt-2 max-h-28 rounded-lg object-cover" />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => onAddLog(pet)}
        className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-2 text-sm font-medium text-white"
      >
        <Plus size={15} />
        Registrar bitácora / foto
      </button>
    </article>
  );
}

function CaretakerDashboard() {
  const [pets, setPets] = useState([]);
  const [tab, setTab] = useState('inHouse');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(toDateInputValue());
  const [activePet, setActivePet] = useState(null);
  const [logType, setLogType] = useState('FEEDING');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadPets = async (date = selectedDate) => {
    try {
      const { data } = await api.get('/caretaker/pets', { params: { date } });
      setPets(
        asArray(data?.pets).filter((pet) => CARETAKER_TYPES.has(String(pet?.booking_type || '').toUpperCase()))
      );
    } catch (err) {
      setPets([]);
      throw err;
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        await loadPets(selectedDate);
      } catch (err) {
        if (!cancelled) {
          setError(requestErrorMessage(err, 'No se pudieron cargar las mascotas hospedadas'));
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

  const inHousePets = useMemo(() => pets.filter((pet) => isInHouse(pet)), [pets]);
  const arrivalPets = useMemo(() => pets.filter((pet) => !isInHouse(pet)), [pets]);
  const visiblePets = tab === 'arrivals' ? arrivalPets : inHousePets;

  useEffect(() => {
    if (inHousePets.length === 0 && arrivalPets.length > 0) {
      setTab('arrivals');
    }
  }, [arrivalPets.length, inHousePets.length]);

  const handleCreateLog = async (event) => {
    event.preventDefault();
    if (!activePet) {
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await api.post('/caretaker/logs', {
        booking_id: activePet.booking_id,
        type: logType,
        description,
        photo_url: photoUrl || null,
      });
      setMessage(`Registro de ${logLabel(logType).toLowerCase()} guardado`);
      setDescription('');
      setPhotoUrl('');
      setActivePet(null);
      await loadPets(selectedDate);
    } catch (err) {
      setError(requestErrorMessage(err, 'No se pudo registrar la bitácora'));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Selecciona una imagen desde tu dispositivo');
      event.target.value = '';
      return;
    }
    try {
      setPhotoUrl(await fileToPreview(file));
      setError('');
    } catch {
      setError('No se pudo cargar la foto. Intenta con otra imagen.');
    }
  };

  if (loading) {
    return (
      <section>
        <h1 className="mb-4 text-3xl font-semibold text-primary-dark">Cuidados en casa</h1>
        <PanelSkeleton label="Cargando cuidados..." />
      </section>
    );
  }

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-secondary">Operación</p>
          <h1 className="text-3xl font-semibold text-primary-dark">Cuidados en casa</h1>
          <p className="text-sm text-primary-dark/70">Hospedaje y guardería. Elige una fecha para ver la programación.</p>
        </div>
        <DateNavigator value={selectedDate} onChange={setSelectedDate} label="Ver programación" />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('inHouse')}
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            tab === 'inHouse' ? 'bg-primary text-white' : 'bg-white text-primary-dark ring-1 ring-secondary-light'
          }`}
        >
          Mascotas en sitio ({inHousePets.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('arrivals')}
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            tab === 'arrivals' ? 'bg-primary text-white' : 'bg-white text-primary-dark ring-1 ring-secondary-light'
          }`}
        >
          Llegadas programadas ({arrivalPets.length})
        </button>
      </div>

      {error ? <p className="mb-4 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mb-4 rounded-2xl bg-accent-sage/60 px-3 py-2 text-sm text-primary-dark">{message}</p> : null}

      {visiblePets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-secondary bg-white p-12 text-center">
          <PawPrint className="mx-auto mb-3 text-primary" />
          <p className="text-primary-dark/70">
            {tab === 'arrivals'
              ? 'No hay llegadas de hospedaje o guardería programadas para esta fecha.'
              : 'No hay mascotas en sitio de hospedaje o guardería en esta fecha.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {visiblePets.map((pet) => (
            <PetBoardCard
              key={pet.booking_id || pet.pet_id}
              pet={pet}
              selectedDate={selectedDate}
              onAddLog={(item) => {
                setActivePet(item);
                setLogType('FEEDING');
                setDescription('');
                setPhotoUrl('');
              }}
            />
          ))}
        </div>
      )}

      {activePet ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 p-4">
          <form onSubmit={handleCreateLog} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-primary-dark">Bitácora de {activePet.pet_name}</h2>
            <p className="mb-4 text-xs text-primary-dark/60">Alimentación, paseo, medicamento, incidencia o foto.</p>
            <label className="mb-3 block text-sm font-medium">
              Tipo
              <select value={logType} onChange={(event) => setLogType(event.target.value)} className={`${inputClass} mt-1`}>
                {LOG_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-3 block text-sm font-medium">
              Descripción
              <textarea required value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-sm font-medium">
              Foto (opcional)
              <input type="file" accept="image/*" onChange={handlePhoto} className={`${inputClass} mt-1`} />
            </label>
            {photoUrl ? (
              <img src={photoUrl} alt="Vista previa" className="mt-3 max-h-32 rounded-xl object-cover" />
            ) : (
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-primary-dark/50">
                <Camera size={14} />
                Puedes adjuntar una foto del registro.
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setActivePet(null)} className="flex-1 rounded-full border py-2 text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="flex-1 rounded-full bg-primary py-2 text-sm font-medium text-white">
                Guardar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export default CaretakerDashboard;
