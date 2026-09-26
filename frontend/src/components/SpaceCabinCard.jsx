import { useState } from 'react';
import { Cat, Dog, Sparkles, Trees } from 'lucide-react';
import { spaceImage } from '../lib/serviceCatalog';
import { patioGallery } from '../data/patioData';
import { spaGallery, SPA_PHOTO_LABELS } from '../data/spaData';

function SpaceCabinCard({ space }) {
  const type = String(space.space_type || '').toUpperCase();
  const isCat = (type === 'CAT_SUITE' || /felin/i.test(space.name || '')) && type !== 'RECREATION';
  const isRec = type === 'RECREATION';
  const isSpa = type === 'MULTIPURPOSE' || type === 'SPA';
  const Icon = isRec ? Trees : isCat ? Cat : isSpa ? Sparkles : Dog;
  const occupied = Boolean(space.occupied);
  const used = Number(space.occupied_count || (occupied ? 1 : 0));
  const max = Number(space.capacity || (isRec ? 3 : isSpa ? 1 : 1));
  const percent = Math.round((Math.min(used, max) / max) * 100);
  const gallery = isRec ? patioGallery(space) : isSpa ? spaGallery(space) : [];
  const [photo, setPhoto] = useState(0);
  const cover = gallery[photo] || spaceImage(space);

  return (
    <article className="group overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-secondary-light/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className={`relative overflow-hidden ${isRec ? 'h-52' : 'h-36'}`}>
        <img
          src={cover}
          alt={space.name}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
        />
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shadow-sm ${
            occupied || percent >= 100
              ? 'bg-amber-200/95 text-amber-900'
              : 'bg-emerald-100/95 text-emerald-800'
          }`}
        >
          {occupied || percent >= 100 ? 'Ocupado' : 'Disponible'}
        </span>
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-primary-dark">
          <Icon size={14} />
          {isRec && /felin/i.test(space.name || '') ? 'Patio felino' : isCat ? 'Felino' : isRec ? 'Patio' : isSpa ? 'Spa' : 'Canino'}
        </span>
      </div>
      {gallery.length > 1 ? (
        <div className="flex gap-1.5 px-3 pt-3">
          {gallery.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => setPhoto(index)}
              className={`h-12 flex-1 overflow-hidden rounded-lg ring-2 ${
                photo === index ? 'ring-primary' : 'ring-transparent'
              }`}
              aria-label={
                isSpa ? SPA_PHOTO_LABELS[index] || `Vista ${index + 1}` : `Vista ${index + 1} del patio`
              }
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="p-4">
        <h3 className="font-semibold text-primary-dark">{space.name}</h3>
        <p className="mt-1 text-xs text-primary-dark/60">{space.description || 'Cabaña boutique Pet Resort'}</p>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-primary-dark/50">
            <span>Capacidad</span>
            <span>{percent}% de ocupación</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary-light/80">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                percent >= 100 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${Math.max(percent, 6)}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

export default SpaceCabinCard;
