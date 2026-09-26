import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Check, Clock3, Sparkles, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  durationText,
  formatCop,
  pricePeriod,
  serviceImage,
  serviceIncludes,
} from '../lib/serviceCatalog';
import { spaServiceGallery, spaServiceLabels } from '../data/spaData';

function ServiceDrawer({ service, open, onClose }) {
  const { user } = useAuth();
  const includes = serviceIncludes(service);
  const bookTo = user
    ? `/reservar${service.service_id ? `?service=${service.service_id}` : ''}`
    : '/auth';
  const gallery = spaServiceGallery(service);
  const galleryLabels = spaServiceLabels(service);
  const [photo, setPhoto] = useState(0);
  const cover = gallery[photo] || serviceImage(service);

  useEffect(() => {
    if (open) {
      setPhoto(0);
    }
  }, [open, service?.service_id]);

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

  if (!open || !service) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex justify-end">
      <button type="button" className="absolute inset-0 bg-primary-dark/40 animate-fade-in" onClick={onClose} aria-label="Cerrar detalle" />
      <aside className="relative flex h-full w-full max-w-full flex-col overflow-y-auto bg-white shadow-2xl animate-drawer-in sm:max-w-md">
        <div className="relative h-56 overflow-hidden">
          <img src={cover} alt={service.name} className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-primary-dark shadow-md"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
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
                aria-label={galleryLabels[index] || `Vista ${index + 1}`}
              >
                <img src={url} alt={galleryLabels[index] || ''} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex flex-1 flex-col p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
            {service.category_name || 'Experiencia Pet Resort'}
          </p>
          <h3 className="mt-1 text-2xl font-semibold text-primary-dark">{service.name}</h3>
          <p className="mt-3 text-sm leading-relaxed text-primary-dark/75">
            {service.description || 'Cuidado boutique para tu compañero, con personal atento y espacios pensados para el bienestar.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary-dark px-3 py-1 text-xs font-semibold text-white">
              {formatCop(service.current_price)} {pricePeriod(service)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary-light px-3 py-1 text-xs font-semibold text-primary-dark">
              <Clock3 size={12} /> {durationText(service)}
            </span>
          </div>
          <h4 className="mt-6 text-sm font-semibold text-primary-dark">Qué incluye el servicio</h4>
          <ul className="mt-3 space-y-2">
            {includes.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-primary-dark/80">
                <span className="mt-0.5 rounded-full bg-emerald-100 p-0.5 text-emerald-700">
                  <Check size={14} />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <Link
            to={bookTo}
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-primary-dark"
          >
            <Sparkles size={16} />
            Agendar en 1 clic
          </Link>
        </div>
      </aside>
    </div>,
    document.body
  );
}

function ServiceCard({ service, compact = false }) {
  const { user } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const bookTo = user
    ? `/reservar${service.service_id ? `?service=${service.service_id}` : ''}`
    : '/auth';

  return (
    <>
      <article className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-secondary-light/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
        <div className={`relative overflow-hidden ${compact ? 'h-44' : 'h-56'}`}>
          <img
            src={serviceImage(service)}
            alt={service.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary-dark/50 via-transparent to-transparent" />
          <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-primary-dark shadow-md">
            {formatCop(service.current_price)} {pricePeriod(service)}
          </span>
          <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-primary-dark/85 px-3 py-1 text-xs font-semibold text-white shadow-md">
            <Clock3 size={12} /> {durationText(service)}
          </span>
          <p className="absolute bottom-4 left-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/90">
            {service.category_name || service.target_pet_type || 'Pet Resort'}
          </p>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <h2 className="text-xl font-semibold text-primary-dark">{service.name}</h2>
          <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-primary-dark/70">
            {service.description || 'Experiencia boutique para tu mascota.'}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              className="rounded-full bg-white px-3 py-2.5 text-center text-sm font-semibold text-primary-dark ring-1 ring-secondary-light transition hover:bg-primary-light"
            >
              Ver detalles
            </button>
            <Link
              to={bookTo}
              className="rounded-full bg-primary px-3 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-primary-dark"
            >
              Agendar
            </Link>
          </div>
        </div>
      </article>
      <ServiceDrawer service={service} open={drawer} onClose={() => setDrawer(false)} />
    </>
  );
}

export default ServiceCard;
