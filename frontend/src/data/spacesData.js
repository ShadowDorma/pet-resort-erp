import { PATIO_PHOTOS, PATIO_FELINO_PHOTOS } from './patioData';
import { SPA_PHOTOS } from './spaData';

export const OFFICIAL_SPACES = [
  {
    name: 'Suite Canina 01',
    space_type: 'DOG_SUITE',
    capacity: 1,
    kind: 'dog_hotel',
    description: 'Suite individual de hotel canino',
  },
  {
    name: 'Suite Canina 02',
    space_type: 'DOG_SUITE',
    capacity: 1,
    kind: 'dog_hotel',
    description: 'Suite individual de hotel canino',
  },
  {
    name: 'Suite Canina 03',
    space_type: 'DOG_SUITE',
    capacity: 1,
    kind: 'dog_hotel',
    description: 'Suite individual de hotel canino',
  },
  {
    name: 'Suite Canina 04',
    space_type: 'DOG_SUITE',
    capacity: 1,
    kind: 'dog_hotel',
    description: 'Suite individual de hotel canino',
  },
  {
    name: 'Suite Canina 05',
    space_type: 'DOG_SUITE',
    capacity: 1,
    kind: 'dog_hotel',
    description: 'Suite individual de hotel canino',
  },
  {
    name: 'Suite Felina 01',
    space_type: 'CAT_SUITE',
    capacity: 1,
    kind: 'cat_hotel',
    description: 'Suite individual de hotel felino',
  },
  {
    name: 'Suite Felina 02',
    space_type: 'CAT_SUITE',
    capacity: 1,
    kind: 'cat_hotel',
    description: 'Suite individual de hotel felino',
  },
  {
    name: 'Suite Felina 03',
    space_type: 'CAT_SUITE',
    capacity: 1,
    kind: 'cat_hotel',
    description: 'Suite individual de hotel felino',
  },
  {
    name: 'Suite Felina 04',
    space_type: 'CAT_SUITE',
    capacity: 1,
    kind: 'cat_hotel',
    description: 'Suite individual de hotel felino',
  },
  {
    name: 'Suite Felina 05',
    space_type: 'CAT_SUITE',
    capacity: 1,
    kind: 'cat_hotel',
    description: 'Suite individual de hotel felino',
  },
  {
    name: 'Patio Canino 01',
    space_type: 'RECREATION',
    capacity: 3,
    kind: 'daycare',
    description: 'Patio de guardería y recreación para perros',
    imageUrl: PATIO_PHOTOS[0],
    gallery: PATIO_PHOTOS,
  },
  {
    name: 'Patio Felino 01',
    space_type: 'RECREATION',
    capacity: 3,
    kind: 'daycare',
    description: 'Patio de guardería y recreación para gatos',
    imageUrl: PATIO_FELINO_PHOTOS[0],
    gallery: PATIO_FELINO_PHOTOS,
  },
  {
    name: 'Cabina de Spa & Estética 01',
    space_type: 'SPA',
    capacity: 1,
    kind: 'spa',
    description: 'Cabina de baño, corte y spa relajante',
    imageUrl: SPA_PHOTOS[1],
    gallery: SPA_PHOTOS,
  },
];

export const OFFICIAL_SPACE_NAMES = OFFICIAL_SPACES.map((space) => space.name);

export const serviceSpaceKind = (service = {}) => {
  const category = String(service.category_type || '').toUpperCase();
  const hay = `${service.name || ''} ${service.target_pet_type || ''} ${service.category_name || ''}`.toLowerCase();
  if (category === 'RECREATION' || /guarder|recreac/.test(hay)) {
    return 'daycare';
  }
  if (category === 'SPA' || /spa|baño|corte|groom|est[eé]tica|peluqu/.test(hay)) {
    return 'spa';
  }
  if (category === 'HOTEL' || /hotel|hosped|suite/.test(hay)) {
    if (/felin|gato/.test(hay) && !/perro|canin/.test(hay)) {
      return 'cat_hotel';
    }
    return 'dog_hotel';
  }
  return null;
};

export const spacesMatchingService = (service, spaces = []) => {
  const kind = serviceSpaceKind(service);
  if (!kind) {
    return [];
  }
  const allowed = new Set(OFFICIAL_SPACES.filter((space) => space.kind === kind).map((space) => space.name));
  return spaces.filter((space) => {
    if (String(space.status || '').toUpperCase() === 'INACTIVE') {
      return false;
    }
    return allowed.has(space.name);
  });
};
