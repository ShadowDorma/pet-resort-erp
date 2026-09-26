import { Cat, Dog } from 'lucide-react';

export const isCatSpecies = (species) => {
  const value = String(species || '').toLowerCase();
  return value.includes('gat') || value.includes('cat') || value.includes('felin');
};

function SpeciesFallback({ isCat, className, rounded }) {
  return (
    <div
      className={`flex w-full items-center justify-center ${className} ${rounded} ${
        isCat
          ? 'bg-gradient-to-br from-accent-sage to-secondary-light'
          : 'bg-gradient-to-br from-primary-light to-secondary'
      }`}
    >
      {isCat ? (
        <Cat className="text-primary-dark/55" size={className.includes('h-24') || className.includes('h-28') ? 36 : 52} />
      ) : (
        <Dog className="text-primary-dark/55" size={className.includes('h-24') || className.includes('h-28') ? 36 : 52} />
      )}
    </div>
  );
}

export function PetPhoto({ pet, className = 'h-40', rounded = '' }) {
  const isCat = isCatSpecies(pet?.species);
  const src = pet?.photo_url;

  if (!src) {
    return <SpeciesFallback isCat={isCat} className={className} rounded={rounded} />;
  }

  return (
    <div className={`relative overflow-hidden ${className} w-full ${rounded}`}>
      <img src={src} alt={pet?.name || 'Mascota'} className="h-full w-full object-cover" />
    </div>
  );
}
