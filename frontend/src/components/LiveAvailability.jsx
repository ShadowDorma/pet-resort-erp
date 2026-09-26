import { useEffect, useState } from 'react';
import { Dog, Cat, Trees, Sparkles, X } from 'lucide-react';
import SuiteCard from './SuiteCard';
import { PATIO_PHOTOS, PATIO_FELINO_PHOTOS } from '../data/patioData';
import { SPA_PHOTOS } from '../data/spaData';

export const LODGING_CAPACITY = 10;
export const DOG_SUITE_CAP = 5;
export const CAT_SUITE_CAP = 5;
export const RECREATION_CAP = 3;
export const SPA_CAP = 1;

const byName = (left, right) => String(left.name).localeCompare(String(right.name), 'es');

const padSuites = (list, labelPrefix, spaceType, cap) => {
  const numbered = Array.from({ length: cap }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const expected = `${labelPrefix} ${number}`;
    const found = list.find((space) => {
      const name = String(space.name || '');
      return new RegExp(`${labelPrefix}\\s*0?${index + 1}\\b`, 'i').test(name);
    });
    return (
      found || {
        space_id: `virtual-${spaceType}-${number}`,
        name: expected,
        space_type: spaceType,
        occupied: false,
        current_pet: null,
        current_pets: [],
        occupied_count: 0,
        status: 'AVAILABLE',
      }
    );
  });
  return numbered;
};

const IN_HOUSE_STATUSES = new Set(['IN_HOUSE', 'CHECKED_IN', 'IN_PROGRESS']);

export const classifyStay = (booking = {}) => {
  const type = String(booking.booking_type || '').toUpperCase();
  const service = String(booking.service_name || '').toLowerCase();
  if (type === 'RECREATION' || /guarder|recreac/.test(service)) {
    return 'recreation';
  }
  if (type === 'APPOINTMENT' || /spa|baño|corte|groom|est[eé]tica|peluqu/.test(service)) {
    return 'spa';
  }
  if (type === 'LODGING' || /hotel|hosped|suite/.test(service)) {
    return 'lodging';
  }
  return 'other';
};

const spaceStayKind = (space = {}) => {
  const type = String(space.space_type || '').toUpperCase();
  const name = String(space.name || '').toLowerCase();
  if (type === 'RECREATION' || /patio|recreac/.test(name)) {
    return 'recreation';
  }
  if (type === 'SPA' || type === 'MULTIPURPOSE' || /spa|groom|est[eé]tica|peluqu|cabina/.test(name)) {
    return 'spa';
  }
  if (['DOG_SUITE', 'CAT_SUITE', 'ROOM', 'KENNEL'].includes(type) || /suite/.test(name)) {
    return 'lodging';
  }
  return 'other';
};

export const overlayLodgingOccupancy = (spaces = [], inHouseBookings = []) => {
  const list = Array.isArray(spaces) ? spaces : [];
  const active = inHouseBookings.filter((booking) =>
    IN_HOUSE_STATUSES.has(String(booking.status || '').toUpperCase())
  );
  const byKind = {
    lodging: active.filter((booking) => classifyStay(booking) === 'lodging'),
    recreation: active.filter((booking) => classifyStay(booking) === 'recreation'),
    spa: active.filter((booking) => classifyStay(booking) === 'spa'),
  };
  const idsByKind = {
    lodging: new Set(
      list.filter((space) => spaceStayKind(space) === 'lodging').map((space) => String(space.space_id))
    ),
    recreation: new Set(
      list.filter((space) => spaceStayKind(space) === 'recreation').map((space) => String(space.space_id))
    ),
    spa: new Set(list.filter((space) => spaceStayKind(space) === 'spa').map((space) => String(space.space_id))),
  };
  const firstOfKind = {
    lodging: list.find((space) => spaceStayKind(space) === 'lodging'),
    recreation: list.find((space) => spaceStayKind(space) === 'recreation'),
    spa: list.find((space) => spaceStayKind(space) === 'spa'),
  };

  return list.map((space) => {
    const kind = spaceStayKind(space);
    const pool = byKind[kind] || [];
    const validIds = idsByKind[kind] || new Set();
    const assigned = pool.filter(
      (booking) => booking.space_id && String(booking.space_id) === String(space.space_id)
    );
    const unmatched = pool.filter(
      (booking) => !booking.space_id || !validIds.has(String(booking.space_id))
    );
    const isFallback = firstOfKind[kind] && String(firstOfKind[kind].space_id) === String(space.space_id);
    const guests = kind === 'lodging' ? assigned : [...assigned, ...(isFallback ? unmatched : [])];
    const names = guests.map((guest) => guest.pet_name).filter(Boolean);

    return {
      ...space,
      occupied: guests.length > 0,
      current_pet: names[0] || null,
      current_pets: names,
      occupied_count: guests.length,
    };
  });
};

export const splitLiveSpaces = (spaces = []) => {
  const list = Array.isArray(spaces) ? spaces : [];
  const dogs = padSuites(
    list.filter((space) => spaceStayKind(space) === 'lodging' && (space.space_type === 'DOG_SUITE' || /^suite canina/i.test(space.name || ''))).sort(byName),
    'Suite Canina',
    'DOG_SUITE',
    DOG_SUITE_CAP
  );
  const cats = padSuites(
    list.filter((space) => spaceStayKind(space) === 'lodging' && (space.space_type === 'CAT_SUITE' || /^suite felina/i.test(space.name || ''))).sort(byName),
    'Suite Felina',
    'CAT_SUITE',
    CAT_SUITE_CAP
  );
  const recreationDog =
    list.find((space) => /^patio canino/i.test(space.name || '')) ||
    list.find((space) => spaceStayKind(space) === 'recreation' && !/felin/i.test(space.name || '')) ||
    null;
  const recreationCat = list.find((space) => /^patio felino/i.test(space.name || '')) || null;
  const recreation = recreationDog;
  const spa = list.find((space) => spaceStayKind(space) === 'spa') || null;
  const occupiedLodging = [...dogs, ...cats].filter((space) => Boolean(space.occupied)).length;
  const occupancyPercentage = Math.round((occupiedLodging / LODGING_CAPACITY) * 100);

  return {
    dogs,
    cats,
    recreation,
    recreationCat,
    spa,
    occupiedLodging,
    occupancyPercentage,
    freeLodging: LODGING_CAPACITY - occupiedLodging,
  };
};

const petList = (space) => {
  if (!space) {
    return [];
  }
  if (Array.isArray(space.current_pets) && space.current_pets.length > 0) {
    return space.current_pets.filter(Boolean);
  }
  return space.current_pet ? [space.current_pet] : [];
};

function OperationalCard({ icon: Icon, title, used, max, pets, hint, gallery = [] }) {
  const occupied = used > 0;
  const full = used >= max;
  const percent = Math.round((Math.min(used, max) / max) * 100);
  const [photo, setPhoto] = useState(0);
  const cover = gallery[photo] || gallery[0];

  return (
    <article
      className={`overflow-hidden rounded-3xl border shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${
        full
          ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50'
          : occupied
            ? 'border-secondary/30 bg-gradient-to-br from-accent-sand/80 to-white'
            : 'border-emerald-100 bg-gradient-to-br from-white to-emerald-50/60'
      }`}
    >
      {cover ? (
        <div className="relative h-40 overflow-hidden">
          <img src={cover} alt={title} className="h-full w-full object-cover object-center" />
          {gallery.length > 1 ? (
            <div className="absolute bottom-2 left-2 right-2 flex gap-1.5 overflow-x-auto">
              {gallery.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setPhoto(index)}
                  className={`h-10 w-12 shrink-0 overflow-hidden rounded-lg ring-2 ${
                    photo === index ? 'ring-white' : 'ring-white/40'
                  }`}
                  aria-label={`Foto ${index + 1}`}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="inline-flex rounded-2xl bg-white/80 p-2 text-primary-dark ring-1 ring-secondary-light">
          <Icon size={20} />
        </span>
        <div>
          <h4 className="font-semibold text-primary-dark">{title}</h4>
          <p className="text-xs text-primary-dark/60">{hint}</p>
        </div>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            full ? 'bg-amber-200 text-amber-900' : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {full ? 'Ocupado' : 'Disponible'}
        </span>
      </div>
      <p className="text-lg font-semibold text-primary-dark">
        {used}/{max}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70">
        <div
          className={`h-full rounded-full ${full ? 'bg-amber-400' : 'bg-emerald-400'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs font-semibold text-primary-dark/50">{percent}% de ocupación</p>
      <p className="mt-1 text-sm text-primary-dark/70">
        {pets.length > 0 ? pets.join(', ') : occupied ? 'En servicio' : 'Sin ocupación ahora'}
      </p>
      </div>
    </article>
  );
}

function LiveAvailability({ spaces = [], title = 'Disponibilidad en tiempo real' }) {
  const live = splitLiveSpaces(spaces);
  const recreationPets = petList(live.recreation).slice(0, RECREATION_CAP);
  const recreationCatPets = petList(live.recreationCat).slice(0, RECREATION_CAP);
  const spaPets = petList(live.spa).slice(0, SPA_CAP);
  const recreationUsed = Number(live.recreation?.occupied_count ?? recreationPets.length);
  const recreationCatUsed = Number(live.recreationCat?.occupied_count ?? recreationCatPets.length);
  const spaUsed = Number(live.spa?.occupied_count ?? spaPets.length);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-secondary">{title}</p>
          <h3 className="text-xl font-semibold text-primary-dark">Hospedaje 10 habitaciones</h3>
          <p className="text-sm text-primary-dark/70">5 suites caninas + 5 suites felinas. Recreación y spa van aparte.</p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm ring-1 ring-secondary-light">
          <p className="text-xs uppercase tracking-wide text-secondary">Ocupación hotel</p>
          <p className="text-2xl font-semibold text-primary-dark">{live.occupancyPercentage}%</p>
          <p className="text-xs text-primary-dark/60">
            {live.freeLodging}/{LODGING_CAPACITY} disponibles · {live.occupiedLodging} ocupadas
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-secondary-light">
        <div className="mb-4 flex items-center gap-2 text-primary-dark">
          <Dog size={18} />
          <h4 className="font-semibold">Hospedaje Canino (5 Cupos)</h4>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {live.dogs.length > 0 ? (
            live.dogs.map((space) => <SuiteCard key={space.space_id} space={space} variant="staff" />)
          ) : (
            <p className="text-sm text-primary-dark/60">No hay suites caninas configuradas.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-secondary-light">
        <div className="mb-4 flex items-center gap-2 text-primary-dark">
          <Cat size={18} />
          <h4 className="font-semibold">Hospedaje Felino (5 Cupos)</h4>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {live.cats.length > 0 ? (
            live.cats.map((space) => <SuiteCard key={space.space_id} space={space} variant="staff" />)
          ) : (
            <p className="text-sm text-primary-dark/60">No hay suites felinas configuradas.</p>
          )}
        </div>
      </div>

      <div className="rounded-3xl bg-primary-dark/5 p-5 ring-1 ring-primary/10">
        <h4 className="mb-4 font-semibold text-primary-dark">Áreas Operativas y Servicios</h4>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <OperationalCard
            icon={Trees}
            title="Patio Canino"
            hint="Guardería canina · máximo 3 mascotas"
            used={Math.min(recreationUsed, RECREATION_CAP)}
            max={RECREATION_CAP}
            pets={recreationPets}
            gallery={PATIO_PHOTOS}
          />
          <OperationalCard
            icon={Cat}
            title="Patio Felino"
            hint="Guardería felina · máximo 3 mascotas"
            used={Math.min(recreationCatUsed, RECREATION_CAP)}
            max={RECREATION_CAP}
            pets={recreationCatPets}
            gallery={PATIO_FELINO_PHOTOS}
          />
          <OperationalCard
            icon={Sparkles}
            title="Cabina de Spa & Estética"
            hint="Puesto de atención · máximo 1 mascota por turno"
            used={Math.min(spaUsed, SPA_CAP)}
            max={SPA_CAP}
            pets={spaPets}
            gallery={SPA_PHOTOS}
          />
        </div>
      </div>
    </section>
  );
}

export default LiveAvailability;

export function SuiteMapDrawer({ open, onClose, spaces = [] }) {
  const live = splitLiveSpaces(spaces);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[200] flex justify-end">
      <button type="button" className="absolute inset-0 bg-primary-dark/40" onClick={onClose} aria-label="Cerrar mapa de suites" />
      <aside className="relative flex h-full w-full max-w-full flex-col overflow-y-auto bg-background shadow-2xl sm:max-w-5xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-secondary-light bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Mapa en tiempo real</p>
            <h2 className="text-xl font-semibold text-primary-dark">Disponibilidad de suites (10)</h2>
            <p className="text-sm text-primary-dark/70">
              {live.occupiedLodging} ocupada{live.occupiedLodging === 1 ? '' : 's'} / {live.freeLodging} libre{live.freeLodging === 1 ? '' : 's'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-primary-light p-2 text-primary-dark" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          <LiveAvailability spaces={spaces} />
        </div>
      </aside>
    </div>
  );
}
