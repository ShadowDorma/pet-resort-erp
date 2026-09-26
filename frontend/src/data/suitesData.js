import dog01 from '../assets/suites/dog-01.png';
import dog02 from '../assets/suites/dog-02.png';
import dog03 from '../assets/suites/dog-03.png';
import dog04 from '../assets/suites/dog-04.png';
import dog05 from '../assets/suites/dog-05.png';
import cat01 from '../assets/suites/cat-01.png';
import cat02 from '../assets/suites/cat-02.png';
import cat03 from '../assets/suites/cat-03.png';
import cat04 from '../assets/suites/cat-04.png';
import cat05 from '../assets/suites/cat-05.png';

export const DOG_SUITE_PHOTOS = [dog01, dog02, dog03, dog04, dog05];
export const CAT_SUITE_PHOTOS = [cat01, cat02, cat03, cat04, cat05];

const dogSuites = [
  {
    id: 'suite-dog-01',
    name: 'Suite Canina 01',
    styleName: 'Classic Timber',
    species: 'DOG',
    area: '10 m²',
    description: 'Habitación minimalista de madera con cama baja integrada, pensada como dormitorio canino boutique.',
    amenities: ['Cama Queen Ortopédica', 'Cámara HD 24/7', 'Musicoterapia', 'Climatización silenciosa', 'Comedero elevado'],
  },
  {
    id: 'suite-dog-02',
    name: 'Suite Canina 02',
    styleName: 'Royal Garden & Balcony',
    species: 'DOG',
    area: '12 m²',
    description: 'Cabaña con balcón privado, piso de madera y recinto abierto al jardín interior.',
    amenities: ['Cama Ortopédica XL', 'Cámara HD 24/7', 'Ventana jardín', 'Manta termorregulada', 'Fuente de agua'],
  },
  {
    id: 'suite-dog-03',
    name: 'Suite Canina 03',
    styleName: 'Panoramic Glass',
    species: 'DOG',
    area: '9 m²',
    description: 'Suite moderna con ventanales de piso a techo y luz natural sobre el área de descanso.',
    amenities: ['Loft de descanso', 'Cámara HD 24/7', 'Difusor pet-friendly', 'Piso antideslizante', 'Juguetes de enriquecimiento'],
  },
  {
    id: 'suite-dog-04',
    name: 'Suite Canina 04',
    styleName: 'Cozy Cabin',
    species: 'DOG',
    area: '11 m²',
    description: 'Estructura de cabaña interior en madera, ambiente cálido y dormitorio canino integrado.',
    amenities: ['Fuente de Agua Waterfall', 'Cama Queen', 'Panel acústico', 'Cámara HD 24/7', 'Luz circadiana'],
  },
  {
    id: 'suite-dog-05',
    name: 'Suite Canina 05',
    styleName: 'Presidential Lounge',
    species: 'DOG',
    area: '14 m²',
    description: 'Recinto amplio boutique con acabados premium en madera y zona lounge de estancia.',
    amenities: ['Zona de juego interior', 'Cama Nido Deluxe', 'Cámara HD 24/7', 'TV relajación', 'Kit de aromaterapia'],
  },
].map((suite, index) => ({
  ...suite,
  gallery: [DOG_SUITE_PHOTOS[index]],
  imageUrl: DOG_SUITE_PHOTOS[index],
}));

const catSuites = [
  {
    id: 'suite-cat-01',
    name: 'Suite Felina 01',
    styleName: 'Catio Sunset View',
    species: 'CAT',
    area: '8 m²',
    description: 'Habitación con repisas aéreas de madera y ventanal; catio de observación sin jaula a la vista.',
    amenities: ['Rascador de Yute 2m', 'Cámara HD 24/7', 'Perchas en altura', 'Cama cueva', 'Fuente de Agua Waterfall'],
  },
  {
    id: 'suite-cat-02',
    name: 'Suite Felina 02',
    styleName: 'Wall-Climb Zen',
    species: 'CAT',
    area: '8 m²',
    description: 'Espacio con circuito de pared y módulos de descanso en madera a distintas alturas.',
    amenities: ['Nichos ocultos', 'Ventana de observación', 'Cámara HD 24/7', 'Manta heated', 'Arenero premium'],
  },
  {
    id: 'suite-cat-03',
    name: 'Suite Felina 03',
    styleName: 'Loft Balcony',
    species: 'CAT',
    area: '9 m²',
    description: 'Habitación luminosa con área elevada y balcón acristalado tipo loft felino.',
    amenities: ['Wall-walks', 'Hamaca suspendida', 'Cámara HD 24/7', 'Musicoterapia', 'Estante panorámico'],
  },
  {
    id: 'suite-cat-04',
    name: 'Suite Felina 04',
    styleName: 'Natural Haven',
    species: 'CAT',
    area: '7 m²',
    description: 'Estructura interior con plantas pet-friendly y cúpulas de descanso en madera.',
    amenities: ['Cama orthocueva', 'Luz suave regulable', 'Cámara HD 24/7', 'Rincón de escondite', 'Fuente cerámica'],
  },
  {
    id: 'suite-cat-05',
    name: 'Suite Felina 05',
    styleName: 'Imperial Tower',
    species: 'CAT',
    area: '10 m²',
    description: 'Catio multinivel con puente colgante, torres vacías e iluminación LED cálida.',
    amenities: ['Doble nivel', 'Cat grass interior', 'Cámara HD 24/7', 'Rascador sisal', 'Mirador acristalado'],
  },
].map((suite, index) => ({
  ...suite,
  gallery: [CAT_SUITE_PHOTOS[index]],
  imageUrl: CAT_SUITE_PHOTOS[index],
}));

export const SUITES = [...dogSuites, ...catSuites];

export const findSuiteCatalog = (space = {}) => {
  const name = String(space.name || '');
  const type = String(space.space_type || '').toUpperCase();
  const isCat = type === 'CAT_SUITE' || /felina/i.test(name);
  const match = name.match(/(\d+)/);
  const number = match ? String(Number(match[1])).padStart(2, '0') : '01';
  const prefix = isCat ? 'suite-cat-' : 'suite-dog-';
  return SUITES.find((suite) => suite.id === `${prefix}${number}`) || (isCat ? catSuites[0] : dogSuites[0]);
};

export default SUITES;
