import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Radio } from 'lucide-react';
import api from '../api/axios';
import { formatPetAge, speciesBadge } from '../components/PetCard';
import { PetPhoto } from '../components/PetPhoto';

const logLabel = (type) => {
  const map = {
    FEEDING: 'Alimentación',
    ACTIVITY: 'Paseo',
    MEDICAL: 'Medicamento',
    NOTE: 'Nota / incidencia',
  };
  return map[type] || type;
};

function PetDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'bitacora' ? 'bitacora' : 'ficha';
  const [pet, setPet] = useState(null);
  const [instructions, setInstructions] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      setError('');
      try {
        const [petRes, logsRes, instRes] = await Promise.all([
          api.get(`/pets/${id}`),
          api.get(`/pets/${id}/logs`).catch(() => ({ data: { logs: [] } })),
          api.get(`/pets/${id}/instructions`).catch(() => ({ data: { instructions: [] } })),
        ]);
        setPet(petRes.data.pet || petRes.data);
        setLogs(logsRes.data.logs || []);
        setInstructions((instRes.data.instructions || [])[0] || null);
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudo cargar el detalle de la mascota');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [id]);

  if (loading) {
    return <p className="text-primary-dark">Cargando mascota...</p>;
  }

  if (error || !pet) {
    return (
      <section>
        <p className="mb-4 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{error || 'Mascota no encontrada'}</p>
        <Link to="/mis-mascotas" className="text-sm text-primary underline">
          Volver a mis mascotas
        </Link>
      </section>
    );
  }

  const care = instructions || {};

  return (
    <section>
      <Link to="/mis-mascotas" className="mb-4 inline-flex items-center gap-2 text-sm text-primary">
        <ArrowLeft size={16} />
        Mis mascotas
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="h-24 w-24 overflow-hidden rounded-2xl ring-1 ring-secondary-light">
          <PetPhoto pet={pet} className="h-24" rounded="rounded-2xl" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold text-primary-dark">{pet.name}</h1>
          <p className="text-sm text-secondary">
            {pet.species} · {pet.breed || 'Raza no indicada'} · {formatPetAge(pet)}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${speciesBadge(pet.species)}`}>{pet.species}</span>
      </div>

      <div className="mb-5 flex gap-2 rounded-2xl bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => setParams({})}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === 'ficha' ? 'bg-primary text-white' : 'text-primary-dark'}`}
        >
          Ficha de la mascota
        </button>
        <button
          type="button"
          onClick={() => setParams({ tab: 'bitacora' })}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === 'bitacora' ? 'bg-primary text-white' : 'text-primary-dark'}`}
        >
          Bitácora / seguimiento
        </button>
      </div>

      {tab === 'ficha' ? (
        <article className="grid gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-secondary-light sm:grid-cols-2">
          {[
            ['Especie', pet.species],
            ['Raza', pet.breed || 'No indicada'],
            ['Edad', formatPetAge(pet)],
            ['Peso', pet.weight_kg ? `${pet.weight_kg} kg` : 'No indicado'],
            ['Alergias', pet.allergies || care.allergies || 'Ninguna registrada'],
            ['Dieta / cuidados especiales', pet.diet_notes || care.special_care || care.feeding_instructions || 'Sin indicaciones'],
            ['Contacto de emergencia veterinaria', pet.vet_emergency_contact || care.emergency_notes || 'No registrado'],
            ['Notas', pet.notes || 'Sin notas'],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs uppercase tracking-wide text-secondary">{label}</p>
              <p className="mt-1 text-sm text-primary-dark">{value}</p>
            </div>
          ))}
        </article>
      ) : (
        <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-secondary-light">
          <h2 className="mb-3 inline-flex items-center gap-2 text-lg font-semibold text-primary-dark">
            <Radio size={18} />
            Seguimiento en vivo
          </h2>
          <p className="mb-4 text-sm text-primary-dark/70">
            Fotos, alimentación, paseos e incidencias registradas por cuidadores o estilistas.
          </p>
          {logs.length === 0 ? (
            <p className="text-sm text-primary-dark/60">Todavía no hay registros de bitácora para esta mascota.</p>
          ) : (
            <ul className="space-y-3">
              {logs.map((log) => (
                <li key={log.id} className="rounded-2xl bg-primary-light/40 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm text-primary-dark">{logLabel(log.type)}</strong>
                    <span className="text-xs text-primary-dark/60">{new Date(log.created_at).toLocaleString('es-CO')}</span>
                  </div>
                  <p className="mt-1 text-sm">{log.description}</p>
                  {log.photo_url ? (
                    <img src={log.photo_url} alt="Registro de bitácora" className="mt-3 max-h-56 rounded-xl object-cover" />
                  ) : null}
                  {log.caretaker_first_name ? (
                    <p className="mt-1 text-xs text-secondary">
                      Por {log.caretaker_first_name} {log.caretaker_last_name}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </article>
      )}
    </section>
  );
}

export default PetDetail;
