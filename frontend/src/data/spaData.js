export const SPA_PHOTOS = [
  '/spa/spa-01.png',
  '/spa/spa-02.jpg',
  '/spa/spa-03.jpg',
  '/spa/spa-04.jpg',
];

export const SPA_PHOTO_LABELS = [
  'Baño para gato',
  'Baño para perro',
  'Corte para perro',
  'Corte para gato',
];

export const SPA_RELAX_PHOTOS = [
  '/spa/spa-relax-01.jpg',
  '/spa/spa-relax-02.png',
  '/spa/spa-relax-03.png',
  '/spa/spa-relax-04.png',
];

export const SPA_RELAX_LABELS = [
  'Aromaterapia felina',
  'Masaje canino',
  'Spa de toallas',
  'Relajación felina',
];

export const isRelaxSpaService = (service = {}) =>
  /relaj/i.test(`${service.name || ''} ${service.description || ''}`);

export const spaServiceGallery = (service = {}) => {
  const category = String(service.category_type || '').toUpperCase();
  const hay = `${service.name || ''} ${service.description || ''}`.toLowerCase();
  if (!(category === 'SPA' || /spa|baño|corte|groom/.test(hay))) {
    return [];
  }
  return isRelaxSpaService(service) ? SPA_RELAX_PHOTOS : SPA_PHOTOS;
};

export const spaServiceLabels = (service = {}) =>
  isRelaxSpaService(service) ? SPA_RELAX_LABELS : SPA_PHOTO_LABELS;

export const SPA_CABINA = {
  name: 'Cabina de Spa & Estética 01',
  title: 'Corte y baño',
  imageUrl: SPA_PHOTOS[1],
  gallery: SPA_PHOTOS,
  description: 'Cabina de baño, corte y estética para perros y gatos.',
};

export const isSpaCabin = (space = {}) => {
  const type = String(space.space_type || '').toUpperCase();
  const name = String(space.name || '').toLowerCase();
  return type === 'SPA' || type === 'MULTIPURPOSE' || /cabina de spa|estética 01|estetica 01/.test(name);
};

export const spaGallery = (space = {}) => (isSpaCabin(space) ? SPA_PHOTOS : []);

export const spaCover = (space = {}) => spaGallery(space)[0] || SPA_PHOTOS[0];

export const spaServicePhoto = (service = {}) => {
  const gallery = spaServiceGallery(service);
  if (isRelaxSpaService(service)) {
    return gallery[0] || SPA_RELAX_PHOTOS[0];
  }
  const name = String(service.name || '').toLowerCase();
  if (/corte/.test(name) && /baño|bano/.test(name)) {
    return SPA_PHOTOS[1];
  }
  if (/corte/.test(name)) {
    return SPA_PHOTOS[2];
  }
  return SPA_PHOTOS[1];
};
