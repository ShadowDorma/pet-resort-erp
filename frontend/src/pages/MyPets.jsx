import { useEffect, useMemo, useState } from 'react';
import { PawPrint, Plus, X } from 'lucide-react';
import api from '../api/axios';
import PetCard from '../components/PetCard';
import { PetPhoto } from '../components/PetPhoto';

const emptyForm = {
  name: '',
  species: 'Perro',
  breed: '',
  age_years: '',
  weight_kg: '',
  allergies: '',
  diet_notes: '',
  vet_emergency_contact: '',
  photo_url: '',
};

const inputClass =
  'rounded-xl border border-secondary-light px-3 py-2 outline-none focus:border-primary';

const fileToPreview = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSize = 1200;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.onerror = () => reject(new Error('No se pudo leer la imagen'));
      image.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });

function MyPets() {
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const title = useMemo(
    () => (editing ? `Editar ficha de ${editing.name}` : 'Registrar nueva mascota'),
    [editing]
  );

  const loadPets = async () => {
    setError('');
    try {
      const { data } = await api.get('/pets/my-pets');
      setPets(data.pets || []);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudieron cargar las mascotas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPets();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (pet) => {
    setEditing(pet);
    setForm({
      name: pet.name || '',
      species: pet.species === 'Gato' ? 'Gato' : 'Perro',
      breed: pet.breed || '',
      age_years: pet.age_years || '',
      weight_kg: pet.weight_kg || '',
      allergies: pet.allergies || '',
      diet_notes: pet.diet_notes || pet.notes || '',
      vet_emergency_contact: pet.vet_emergency_contact || '',
      photo_url: pet.photo_url || '',
    });
    setModalOpen(true);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Selecciona una imagen desde tu dispositivo');
      event.target.value = '';
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('La imagen no puede superar 8 MB');
      event.target.value = '';
      return;
    }
    try {
      const preview = await fileToPreview(file);
      setForm((current) => ({ ...current, photo_url: preview }));
      setError('');
    } catch {
      setError('No se pudo cargar la foto. Intenta con otra imagen.');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    const payload = {
      name: form.name,
      species: form.species,
      breed: form.breed || null,
      age_years: form.age_years ? Number(form.age_years) : null,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      allergies: form.allergies || null,
      diet_notes: form.diet_notes || null,
      special_care: form.diet_notes || null,
      vet_emergency_contact: form.vet_emergency_contact || null,
      photo_url: form.photo_url || null,
    };

    try {
      if (editing) {
        await api.put(`/pets/${editing.pet_id}`, payload);
        setMessage('Ficha de mascota actualizada');
      } else {
        await api.post('/pets', payload);
        setMessage('Mascota registrada');
      }
      setModalOpen(false);
      setEditing(null);
      await loadPets();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar la ficha');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-primary-dark">Cargando mascotas...</p>;
  }

  return (
    <section>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-secondary">Fichas técnicas</p>
          <h1 className="text-3xl font-semibold text-primary-dark">Mis Mascotas</h1>
          <p className="text-sm text-primary-dark/70">
            Perfiles independientes de cada animal: datos clínicos, dieta y bitácora de estadías.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-dark"
        >
          <Plus size={16} />
          Registrar nueva mascota
        </button>
      </div>

      {error ? <p className="mb-4 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mb-4 rounded-2xl bg-accent-sage/70 px-3 py-2 text-sm text-primary-dark">{message}</p> : null}

      {pets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-secondary bg-white p-12 text-center shadow-sm">
          <PawPrint className="mx-auto mb-3 text-primary" size={36} />
          <p className="text-primary-dark/70">Aún no tienes mascotas registradas.</p>
          <button type="button" onClick={openCreate} className="mt-4 text-sm font-medium text-primary underline">
            Crear la primera ficha
          </button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {pets.map((pet) => (
            <PetCard key={pet.pet_id} pet={pet} onEdit={openEdit} />
          ))}
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 p-4">
          <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-primary-dark">{title}</h2>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="Cerrar">
                <X className="text-primary-dark" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
                Nombre
                <input name="name" value={form.name} onChange={handleChange} required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
                Especie
                <select name="species" value={form.species} onChange={handleChange} className={inputClass}>
                  <option>Perro</option>
                  <option>Gato</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
                Raza
                <input name="breed" value={form.breed} onChange={handleChange} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
                Edad (años)
                <input type="number" min="0" step="0.1" name="age_years" value={form.age_years} onChange={handleChange} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
                Peso (kg)
                <input type="number" min="0.1" step="0.1" name="weight_kg" value={form.weight_kg} onChange={handleChange} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-primary-dark">
                Alergias
                <input name="allergies" value={form.allergies} onChange={handleChange} className={inputClass} />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-sm font-medium text-primary-dark">
                Dieta / cuidados especiales
                <textarea name="diet_notes" value={form.diet_notes} onChange={handleChange} rows={3} className={inputClass} />
              </label>
              <div className="sm:col-span-2 flex flex-col gap-2 text-sm font-medium text-primary-dark">
                Foto de la mascota
                <div className="flex items-center gap-4">
                  <div className="h-24 w-24 overflow-hidden rounded-2xl ring-1 ring-secondary-light">
                    <PetPhoto pet={{ ...form, name: form.name || 'Mascota' }} className="h-24" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFile}
                      className="block w-full text-sm text-primary-dark file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-dark"
                    />
                    {form.photo_url ? (
                      <button
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, photo_url: '' }))}
                        className="text-xs font-medium text-accent-purple underline"
                      >
                        Quitar foto
                      </button>
                    ) : (
                      <p className="text-xs font-normal text-primary-dark/60">
                        Elige una foto de tu celular o computadora. Si no cargas ninguna, usaremos un avatar de perro o gato.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <label className="sm:col-span-2 flex flex-col gap-1 text-sm font-medium text-primary-dark">
                Contacto de emergencia veterinaria
                <input
                  name="vet_emergency_contact"
                  value={form.vet_emergency_contact}
                  onChange={handleChange}
                  placeholder="Clínica, veterinario y teléfono"
                  className={inputClass}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-full bg-primary py-2.5 font-medium text-white hover:bg-primary-dark disabled:opacity-70"
            >
              {submitting ? 'Guardando...' : editing ? 'Guardar ficha' : 'Registrar mascota'}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export default MyPets;
