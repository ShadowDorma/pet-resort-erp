import { Link } from 'react-router-dom';
import { Pencil, Radio } from 'lucide-react';
import { PetPhoto } from './PetPhoto';

export const formatPetAge = (pet) => {
  if (pet?.age_years) {
    const value = Number(pet.age_years);
    return `${value} ${value === 1 ? 'año' : 'años'}`;
  }
  if (pet?.birth_date) {
    const years = Math.floor((Date.now() - new Date(pet.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    if (years >= 0) {
      return `${years} ${years === 1 ? 'año' : 'años'}`;
    }
  }
  return 'Edad no indicada';
};

export const speciesBadge = (species) =>
  String(species).toLowerCase().includes('gat')
    ? 'bg-accent-sage text-primary-dark'
    : 'bg-primary-light text-primary-dark';

function PetCard({ pet, compact = false, onEdit, showLogLink = true }) {
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-secondary-light transition hover:-translate-y-0.5 hover:shadow-md">
      <Link to={`/mis-mascotas/${pet.pet_id}`} className="block">
        <div className={`relative overflow-hidden bg-primary-light ${compact ? 'h-24' : 'h-40'}`}>
          <PetPhoto pet={pet} className={compact ? 'h-24' : 'h-40'} />
          <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${speciesBadge(pet.species)}`}>
            {pet.species || 'Mascota'}
          </span>
        </div>
        <div className={compact ? 'p-3' : 'p-5'}>
          <h2 className={`font-semibold text-primary-dark ${compact ? 'text-base' : 'text-xl'}`}>{pet.name}</h2>
          <p className="text-sm text-secondary">{pet.breed || 'Raza no indicada'}</p>
          {compact ? null : (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-primary-light px-3 py-1 text-xs font-medium text-primary-dark">
                {formatPetAge(pet)}
              </span>
              <span className="rounded-full bg-secondary/20 px-3 py-1 text-xs font-medium text-primary-dark">
                {pet.weight_kg ? `${pet.weight_kg} kg` : 'Peso N/D'}
              </span>
            </div>
          )}
        </div>
      </Link>
      {compact ? null : (
        <div className="flex flex-wrap gap-2 px-5 pb-5">
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(pet)}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-medium text-primary-dark ring-1 ring-secondary-light"
            >
              <Pencil size={15} />
              Editar ficha
            </button>
          ) : null}
          {showLogLink ? (
            <Link
              to={`/mis-mascotas/${pet.pet_id}?tab=bitacora`}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-medium text-white"
            >
              <Radio size={15} />
              Ver bitácora / seguimiento
            </Link>
          ) : null}
        </div>
      )}
    </article>
  );
}

export default PetCard;
