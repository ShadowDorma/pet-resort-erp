export const PATIO_PHOTOS = [
  '/patio/patio-04.jpg',
  '/patio/patio-05.jpg',
  '/patio/patio-03.jpg',
  '/patio/patio-02.jpg',
  '/patio/patio-01.jpg',
];

export const PATIO_FELINO_PHOTOS = [
  '/patio/patio-felino-01.jpg',
  '/patio/patio-felino-02.jpg',
  '/patio/patio-felino-03.jpg',
  '/patio/patio-felino-04.jpg',
  '/patio/patio-felino-05.jpg',
];

export const PATIO_CANINO = {
  name: 'Patio Canino 01',
  title: 'Patio de Recreación Canino',
  imageUrl: PATIO_PHOTOS[0],
  gallery: PATIO_PHOTOS,
  description: 'Patio de guardería y recreación para perros, con juego supervisado y aforo máximo de 3 mascotas.',
};

export const PATIO_FELINO = {
  name: 'Patio Felino 01',
  title: 'Patio de Recreación Felino',
  imageUrl: PATIO_FELINO_PHOTOS[0],
  gallery: PATIO_FELINO_PHOTOS,
  description: 'Catio de guardería y recreación para gatos, con juego supervisado y aforo máximo de 3 mascotas.',
};

export const isDogPatio = (space = {}) => /^patio canino 01$/i.test(String(space.name || '').trim());

export const isCatPatio = (space = {}) => /^patio felino 01$/i.test(String(space.name || '').trim());

export const patioGallery = (space = {}) => {
  if (isCatPatio(space)) {
    return PATIO_FELINO_PHOTOS;
  }
  if (isDogPatio(space)) {
    return PATIO_PHOTOS;
  }
  return [];
};

export const patioCover = (space = {}) =>
  patioGallery(space)[0] || (isCatPatio(space) ? PATIO_FELINO_PHOTOS[0] : PATIO_PHOTOS[0]);
