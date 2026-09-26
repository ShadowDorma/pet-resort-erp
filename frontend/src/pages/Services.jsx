import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Trees } from 'lucide-react';
import api from '../api/axios';
import ServiceCard from '../components/ServiceCard';
import SpaceCabinCard from '../components/SpaceCabinCard';
import SuiteCard from '../components/SuiteCard';
import { OFFICIAL_SPACES } from '../data/spacesData';

function Services() {
  const [services, setServices] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setError('');
      try {
        const [servicesRes, spacesRes] = await Promise.all([
          api.get('/services'),
          api.get('/services/spaces').catch(() => ({ data: { spaces: [] } })),
        ]);
        setServices(servicesRes.data.services || []);
        setSpaces(spacesRes.data.spaces || []);
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudo cargar el catálogo de servicios');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const categories = useMemo(() => {
    const unique = [...new Set(services.map((item) => item.category_name).filter(Boolean))];
    return ['ALL', ...unique];
  }, [services]);

  const visible = services.filter((item) => filter === 'ALL' || item.category_name === filter);
  const catalogSpaces = useMemo(() => {
    const fromApi = spaces.filter((space) => String(space.status || 'AVAILABLE').toUpperCase() !== 'INACTIVE');
    return OFFICIAL_SPACES.map((official, index) => {
      const found = fromApi.find((space) => space.name === official.name);
      return {
        ...official,
        ...found,
        name: official.name,
        space_type: official.space_type,
        capacity: official.capacity,
        description: found?.description || official.description,
        space_id: found?.space_id || `catalog-${index}`,
        status: found?.status || 'AVAILABLE',
      };
    });
  }, [spaces]);
  const lodgingSpaces = catalogSpaces.filter((space) =>
    ['DOG_SUITE', 'CAT_SUITE', 'ROOM'].includes(String(space.space_type || '').toUpperCase())
  );
  const recreationSpaces = catalogSpaces
    .filter((space) => String(space.space_type || '').toUpperCase() === 'RECREATION')
    .sort((left, right) => String(left.name).localeCompare(String(right.name), 'es'));
  const spaSpaces = catalogSpaces.filter((space) =>
    ['MULTIPURPOSE', 'SPA'].includes(String(space.space_type || '').toUpperCase())
  );

  return (
    <section className="space-y-12">
      <div className="overflow-hidden rounded-3xl bg-primary-dark text-white shadow-xl">
        <div className="grid md:grid-cols-[1.2fr_1fr]">
          <div className="p-8 md:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-secondary-light">Club boutique</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">Catálogo de experiencias</h1>
            <p className="mt-3 max-w-xl text-sm text-white/75">
              Hospedaje tipo suite, spa sereno y recreación guiada. Un club canino y felino de lujo, con cupos reducidos y atención 1 a 1.
            </p>
          </div>
          <div className="relative hidden min-h-48 md:block">
            <img
              src="https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1200&q=80"
              alt="Mascotas en Pet Resort"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        </div>
      </div>

      <div>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-secondary">Servicios</p>
            <h2 className="text-2xl font-semibold text-primary-dark">Elige el ritual de tu mascota</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  filter === item ? 'bg-primary text-white shadow-md' : 'bg-white text-primary-dark ring-1 ring-secondary-light'
                }`}
              >
                {item === 'ALL' ? 'Todos' : item}
              </button>
            ))}
          </div>
        </div>

        {loading ? <p className="text-primary-dark">Cargando servicios...</p> : null}
        {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        {!loading && !error && visible.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-primary-dark/70 shadow-sm">
            Aún no hay servicios publicados.
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((service) => (
            <ServiceCard key={service.service_id} service={service} />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-6 flex items-center gap-3">
          <span className="rounded-2xl bg-secondary-light p-2 text-primary-dark">
            <Sparkles size={18} />
          </span>
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-secondary">Galería de espacios</p>
            <h2 className="text-2xl font-semibold text-primary-dark">Suites del club</h2>
          </div>
        </div>
        {lodgingSpaces.length === 0 ? (
          <p className="text-sm text-primary-dark/60">Las suites se mostrarán cuando el catálogo esté publicado.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
            {lodgingSpaces.map((space) => (
              <SuiteCard key={space.space_id} space={space} variant="catalog" />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-6 flex items-center gap-3">
          <span className="rounded-2xl bg-secondary-light p-2 text-primary-dark">
            <Trees size={18} />
          </span>
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-secondary">Guardería y recreación</p>
            <h2 className="text-2xl font-semibold text-primary-dark">Patios para perros y gatos</h2>
            <p className="text-sm text-primary-dark/65">Dos estaciones al aire libre, una canina y una felina, con cupos reducidos.</p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {recreationSpaces.map((space) => (
            <SpaceCabinCard key={space.space_id} space={space} />
          ))}
        </div>
      </div>

      {spaSpaces.length > 0 ? (
        <div>
          <div className="mb-6 flex items-center gap-3">
            <span className="rounded-2xl bg-secondary-light p-2 text-primary-dark">
              <Sparkles size={18} />
            </span>
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-secondary">Corte y baño</p>
              <h2 className="text-2xl font-semibold text-primary-dark">Cabina de Spa & Estética</h2>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {spaSpaces.map((space) => (
              <SpaceCabinCard key={space.space_id} space={space} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default Services;
