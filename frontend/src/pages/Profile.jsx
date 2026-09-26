import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, PawPrint, Shield, UserRound } from 'lucide-react';
import api from '../api/axios';
import { getPrimaryRole, useAuth } from '../context/AuthContext';
import PetCard from '../components/PetCard';

const inputClass =
  'w-full rounded-xl border border-secondary-light px-3 py-2 text-sm outline-none focus:border-primary';

const ROLE_COPY = {
  CLIENT: {
    label: 'Cliente / Propietario',
    permissions: [
      'Gestionar tu perfil personal',
      'Registrar y editar fichas de tus mascotas',
      'Reservar hospedaje, recreación y estética',
      'Consultar la bitácora en vivo de cada animal',
    ],
  },
  RECEPCIONIST: {
    label: 'Recepcionista',
    permissions: [
      'Check-in y check-out',
      'Directorio de clientes y mascotas',
      'Reservas, citas y asignación de espacios',
    ],
  },
  CARETAKER: {
    label: 'Cuidador',
    permissions: [
      'Bitácora de alimentación, paseos e incidencias',
      'Consulta de fichas de mascotas hospedadas',
    ],
  },
  STYLIST: {
    label: 'Estilista / Groomer',
    permissions: ['Agenda de spa y estética', 'Reporte de servicios realizados'],
  },
  ADMIN: {
    label: 'Administrador',
    permissions: [
      'Control total del establecimiento',
      'Personal, catálogo, reportes y ocupación',
      'Acceso a todos los paneles operativos',
    ],
  },
};

function Profile() {
  const { user, setUser } = useAuth();
  const role = getPrimaryRole(user);
  const roleInfo = ROLE_COPY[role] || ROLE_COPY.CLIENT;
  const [profile, setProfile] = useState(null);
  const [pets, setPets] = useState([]);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    address: '',
    emergency_contact: '',
  });
  const [passwords, setPasswords] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/users/profile');
        const nextUser = data.user;
        setProfile(nextUser);
        setPets(data.pets || []);
        setForm({
          full_name: `${nextUser.first_name || ''} ${nextUser.last_name || ''}`.trim(),
          phone: nextUser.phone || '',
          email: nextUser.email || '',
          address: nextUser.address || '',
          emergency_contact: nextUser.emergency_contact || '',
        });
        setUser(nextUser);
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudo cargar el perfil');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [setUser]);

  const handleForm = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handlePass = (event) => {
    const { name, value } = event.target;
    setPasswords((current) => ({ ...current, [name]: value }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.put('/users/profile', form);
      setProfile(data.user);
      setUser(data.user);
      setMessage('Datos personales actualizados');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar el perfil');
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    setSavingPass(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.put('/users/change-password', passwords);
      setPasswords({ current_password: '', new_password: '', confirm_password: '' });
      setMessage(data.message || 'Contraseña actualizada');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cambiar la contraseña');
    } finally {
      setSavingPass(false);
    }
  };

  if (loading) {
    return <p className="text-primary-dark">Cargando perfil...</p>;
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-secondary">Cuenta</p>
        <h1 className="text-3xl font-semibold text-primary-dark">Mi Perfil</h1>
        <p className="text-sm text-primary-dark/70">
          Datos del propietario o colaborador. Las fichas de los animales viven en Mis Mascotas.
        </p>
      </div>

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-2xl bg-accent-sage/70 px-4 py-3 text-sm text-primary-dark">{message}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <form onSubmit={saveProfile} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-secondary-light">
          <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-semibold text-primary-dark">
            <UserRound size={18} />
            Datos personales
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-medium text-primary-dark">
              Nombre completo
              <input name="full_name" value={form.full_name} onChange={handleForm} required className={`${inputClass} mt-1`} />
            </label>
            <label className="text-sm font-medium text-primary-dark">
              Teléfono
              <input name="phone" value={form.phone} onChange={handleForm} className={`${inputClass} mt-1`} />
            </label>
            <label className="text-sm font-medium text-primary-dark">
              Correo electrónico
              <input type="email" name="email" value={form.email} onChange={handleForm} required className={`${inputClass} mt-1`} />
            </label>
            <label className="sm:col-span-2 text-sm font-medium text-primary-dark">
              Dirección de residencia
              <input name="address" value={form.address} onChange={handleForm} className={`${inputClass} mt-1`} />
            </label>
            <label className="sm:col-span-2 text-sm font-medium text-primary-dark">
              Contacto alternativo de emergencia
              <input
                name="emergency_contact"
                value={form.emergency_contact}
                onChange={handleForm}
                placeholder="Nombre y teléfono"
                className={`${inputClass} mt-1`}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-70"
          >
            {saving ? 'Guardando...' : 'Guardar datos'}
          </button>
        </form>

        <div className="space-y-6">
          <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-secondary-light">
            <h2 className="mb-3 inline-flex items-center gap-2 text-lg font-semibold text-primary-dark">
              <Shield size={18} />
              Rol y permisos
            </h2>
            <p className="rounded-full bg-primary-light px-3 py-1 text-sm font-semibold text-primary-dark inline-block">
              {roleInfo.label}
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-primary-dark/80">
              {roleInfo.permissions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {profile?.job_title ? (
              <p className="mt-3 text-xs text-primary-dark/60">Cargo: {profile.job_title}</p>
            ) : null}
          </article>

          <form onSubmit={savePassword} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-secondary-light">
            <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-semibold text-primary-dark">
              <KeyRound size={18} />
              Seguridad
            </h2>
            <div className="grid gap-3">
              <label className="text-sm font-medium text-primary-dark">
                Contraseña actual
                <input type="password" name="current_password" value={passwords.current_password} onChange={handlePass} required className={`${inputClass} mt-1`} />
              </label>
              <label className="text-sm font-medium text-primary-dark">
                Nueva contraseña
                <input type="password" name="new_password" value={passwords.new_password} onChange={handlePass} required minLength={8} className={`${inputClass} mt-1`} />
              </label>
              <label className="text-sm font-medium text-primary-dark">
                Confirmar contraseña
                <input type="password" name="confirm_password" value={passwords.confirm_password} onChange={handlePass} required minLength={8} className={`${inputClass} mt-1`} />
              </label>
            </div>
            <button
              type="submit"
              disabled={savingPass}
              className="mt-5 rounded-full bg-accent-purple px-5 py-2.5 text-sm font-medium text-white disabled:opacity-70"
            >
              {savingPass ? 'Actualizando...' : 'Cambiar contraseña'}
            </button>
          </form>
        </div>
      </div>

      {role === 'CLIENT' ? (
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-secondary-light">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-primary-dark">
              <PawPrint size={18} />
              Mascotas vinculadas
            </h2>
            <Link to="/mis-mascotas" className="text-sm font-medium text-primary underline">
              Ir a fichas de mascotas
            </Link>
          </div>
          {pets.length === 0 ? (
            <p className="text-sm text-primary-dark/60">Todavía no hay mascotas asociadas a esta cuenta.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pets.map((pet) => (
                <PetCard key={pet.pet_id} pet={pet} compact />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}

export default Profile;
