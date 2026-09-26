import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Cat, Check, Dog, Maximize2, X } from 'lucide-react';
import { getPrimaryRole, useAuth } from '../context/AuthContext';
import { findSuiteCatalog } from '../data/suitesData';

const petNames = (space) => {
  if (Array.isArray(space?.current_pets) && space.current_pets.length > 0) {
    return space.current_pets.filter(Boolean);
  }
  return space?.current_pet ? [space.current_pet] : [];
};

function SuitePhoto({ src, alt }) {
  return (
    <div className="relative w-full overflow-hidden bg-zinc-900">
      <div className="w-full pt-[75%]" aria-hidden="true" />
      <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-contain object-center" />
    </div>
  );
}

function SuiteDrawer({ suite, space, open, onClose, variant }) {
  const [photo, setPhoto] = useState(0);
  const occupied = Boolean(space?.occupied);
  const guests = petNames(space);
  const gallery = suite?.gallery?.length ? suite.gallery : [suite?.imageUrl].filter(Boolean);

  useEffect(() => {
    setPhoto(0);
  }, [suite?.id, open]);

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

  if (!open || !suite) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex justify-end">
      <button type="button" className="absolute inset-0 bg-primary-dark/40 animate-fade-in" onClick={onClose} aria-label="Cerrar detalle" />
      <aside className="relative flex h-full w-full max-w-full flex-col overflow-y-auto bg-white shadow-2xl animate-drawer-in sm:max-w-lg">
        <div className="relative w-full shrink-0">
          <SuitePhoto src={gallery[photo]} alt={`${suite.name} — interior`} />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-primary-dark shadow-md"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
          <span
            className={`absolute left-4 top-4 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${
              occupied ? 'bg-amber-200 text-amber-900' : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {occupied ? 'Ocupada' : 'Disponible'}
          </span>
        </div>
        {gallery.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto px-5 pt-4">
            {gallery.map((url, index) => (
              <button
                key={url}
                type="button"
                onClick={() => setPhoto(index)}
                className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl ring-2 transition ${
                  photo === index ? 'ring-primary' : 'ring-transparent'
                }`}
              >
                <img src={url} alt={`Vista ${index + 1}`} referrerPolicy="no-referrer" className="h-full w-full object-cover object-center" />
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex flex-1 flex-col p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
            {suite.species === 'CAT' ? 'Ala felina' : 'Ala canina'} · {suite.area}
          </p>
          <h3 className="mt-1 text-2xl font-semibold text-primary-dark">{suite.name}</h3>
          {suite.styleName ? <p className="text-sm font-medium text-secondary">{suite.styleName}</p> : null}
          <p className="mt-3 text-sm leading-relaxed text-primary-dark/75">{suite.description}</p>
          {occupied ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Huésped actual: {guests.join(', ') || 'Mascota en sitio'}
            </p>
          ) : null}
          <h4 className="mt-6 text-sm font-semibold text-primary-dark">Amenidades de la habitación</h4>
          <ul className="mt-3 space-y-2">
            {suite.amenities.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-primary-dark/80">
                <span className="mt-0.5 rounded-full bg-emerald-100 p-0.5 text-emerald-700">
                  <Check size={14} />
                </span>
                {item}
              </li>
            ))}
          </ul>
          {variant === 'staff' ? (
            <p className="mt-auto rounded-2xl bg-primary-light/60 px-4 py-3 text-sm text-primary-dark">
              {occupied
                ? 'Esta suite ya está asignada. Libérala con el check-out.'
                : 'Para asignarla, elige esta habitación en el check-in de recepción.'}
            </p>
          ) : (
            <Link
              to={occupied ? '#' : '/reservar'}
              onClick={occupied ? (event) => event.preventDefault() : undefined}
              className={`mt-auto inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold text-white shadow-md ${
                occupied ? 'cursor-not-allowed bg-primary-dark/30' : 'bg-primary hover:bg-primary-dark'
              }`}
            >
              {occupied ? 'No disponible ahora' : 'Reservar esta suite'}
            </Link>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}

function SuiteCard({ space = {}, variant = 'catalog' }) {
  const { user } = useAuth();
  const role = getPrimaryRole(user);
  const suite = findSuiteCatalog(space);
  const occupied = Boolean(space.occupied);
  const guests = petNames(space);
  const Icon = suite.species === 'CAT' ? Cat : Dog;
  const [open, setOpen] = useState(false);
  const previewAmenities = suite.amenities.slice(0, 3);
  const staff = variant === 'staff' || ['RECEPCIONIST', 'ADMIN', 'CARETAKER'].includes(role);

  return (
    <>
      <article
        className="group flex h-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-secondary-light/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
        onClick={() => setOpen(true)}
      >
        <div className="relative w-full shrink-0">
          <SuitePhoto src={suite.imageUrl} alt={suite.name} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
          <span
            className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shadow-sm ${
              occupied ? 'bg-amber-200/95 text-amber-900' : 'bg-emerald-100/95 text-emerald-800'
            }`}
          >
            {occupied ? 'Ocupada' : 'Disponible'}
          </span>
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[11px] font-semibold text-primary-dark">
            <Maximize2 size={12} /> {suite.area}
          </span>
          <p className="absolute bottom-3 left-3 inline-flex items-center gap-1 text-xs font-semibold text-white">
            <Icon size={14} />
            {suite.species === 'CAT' ? 'Felina' : 'Canina'}
          </p>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <h3 className="font-semibold text-primary-dark">{suite.name}</h3>
          {suite.styleName ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{suite.styleName}</p>
          ) : null}
          <p className="mt-1 line-clamp-2 text-xs text-primary-dark/65">{suite.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {previewAmenities.map((item) => (
              <span key={item} className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold text-primary-dark">
                {item.replace('Cámara HD 24/7', 'Cámara HD').replace('Cama Queen Ortopédica', 'Cama Queen')}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-primary-dark/60">
            {occupied ? `Huésped: ${guests.join(', ') || 'En sitio'}` : 'Lista para check-in'}
          </p>
          <span className="mt-3 text-sm font-semibold text-primary">Ver detalles de la suite</span>
        </div>
      </article>
      <SuiteDrawer
        suite={suite}
        space={space}
        open={open}
        onClose={() => setOpen(false)}
        variant={staff ? 'staff' : 'catalog'}
      />
    </>
  );
}

export default SuiteCard;
