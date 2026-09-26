import { patioCover, isDogPatio, isCatPatio } from '../data/patioData';
import { spaCover, spaServicePhoto, isSpaCabin } from '../data/spaData';
import { CAT_SUITE_PHOTOS, DOG_SUITE_PHOTOS } from '../data/suitesData';

export const formatCop = (value) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const IMAGES = {
  dogHotel: DOG_SUITE_PHOTOS[0],
  catHotel: CAT_SUITE_PHOTOS[0],
  spaDog: spaServicePhoto({ name: 'Baño y Corte Completo' }),
  spaRelax: spaServicePhoto({ name: 'Spa Relajante' }),
  play: patioCover(),
  dogSuite: DOG_SUITE_PHOTOS[1],
  catSuite: CAT_SUITE_PHOTOS[2],
  patio: patioCover(),
  spaCabin: spaCover(),
};

export const serviceImage = (service = {}) => {
  const name = String(service.name || '').toLowerCase();
  const type = String(service.category_type || '').toUpperCase();
  const target = String(service.target_pet_type || '').toLowerCase();
  if (type === 'HOTEL' || /hotel|suite|hosped/.test(name)) {
    if (target.includes('gat') || name.includes('felin') || name.includes('gat')) {
      return IMAGES.catHotel;
    }
    return IMAGES.dogHotel;
  }
  if (type === 'SPA' || /spa|baño|corte|groom/.test(name)) {
    return spaServicePhoto(service);
  }
  return IMAGES.play;
};

export const spaceImage = (space = {}) => {
  const type = String(space.space_type || '').toUpperCase();
  const name = String(space.name || '').toLowerCase();
  if (isDogPatio(space) || isCatPatio(space)) {
    return patioCover(space);
  }
  if (type === 'CAT_SUITE' || (/felin/.test(name) && !/patio/.test(name))) {
    return IMAGES.catSuite;
  }
  if (type === 'RECREATION' || /patio|recreac/.test(name)) {
    return IMAGES.play;
  }
  if (isSpaCabin(space) || type === 'SPA' || type === 'MULTIPURPOSE' || /spa|estetica|estética|cabina/.test(name)) {
    return spaCover(space);
  }
  return IMAGES.dogSuite;
};

export const serviceIncludes = (service = {}) => {
  const type = String(service.category_type || '').toUpperCase();
  if (type === 'HOTEL' || /hotel|suite|hosped/i.test(service.name || '')) {
    return [
      'Suite climatizada individual',
      'Monitoreo y rutina personalizada',
      'Alimentación según dieta del huésped',
      'Reporte diario a la familia',
    ];
  }
  if (type === 'SPA' || /spa|baño|corte/i.test(service.name || '')) {
    return [
      'Evaluación de pelaje y piel',
      'Productos pet-friendly',
      'Secado profesional y acabado',
      'Ambiente calmado, sin estrés',
    ];
  }
  return [
    'Grupos reducidos y supervisión',
    'Juego, socialización y descansos',
    'Hidratación continua',
    'Cuidadores certificados',
  ];
};

export const pricePeriod = (service = {}) => {
  const type = String(service.category_type || '').toUpperCase();
  const label = String(service.duration_label || '').toLowerCase();
  if (type === 'HOTEL' || label.includes('día') || label.includes('noche')) {
    return '/ noche';
  }
  if (type === 'RECREATION' || label.includes('jornada')) {
    return '/ jornada';
  }
  return '/ sesión';
};

export const durationText = (service = {}) =>
  service.duration_label ||
  (service.duration_minutes ? `${service.duration_minutes} min` : 'A convenir');
