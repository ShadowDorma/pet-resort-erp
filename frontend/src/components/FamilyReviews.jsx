import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import api from '../api/axios';
import { getPrimaryRole, useAuth } from '../context/AuthContext';

const StarRow = ({ value = 0, size = 16, className = '' }) => (
  <span className={`inline-flex items-center gap-0.5 ${className}`}>
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        size={size}
        className={star <= value ? 'fill-accent-sand text-accent-sand' : 'text-secondary-light'}
      />
    ))}
  </span>
);

function FamilyReviews() {
  const { user } = useAuth();
  const role = user ? getPrimaryRole(user) : null;
  const canWrite = role === 'CLIENT';
  const [reviews, setReviews] = useState([]);
  const [average, setAverage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [hover, setHover] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadReviews = async () => {
    try {
      const { data } = await api.get('/reviews');
      setReviews(data.reviews || []);
      setAverage(data.average || 0);
      const mine = (data.reviews || []).find((item) => item.is_mine);
      if (mine) {
        setRating(mine.rating);
        setComment(mine.comment);
      }
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [user?.user_id]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canWrite) {
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/reviews', { rating, comment });
      setSuccess('Tu valoración se publicó correctamente.');
      await loadReviews();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar la reseña');
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    if (!reviews.length) {
      return 'Aún no hay valoraciones públicas';
    }
    return `${average}/5 · ${reviews.length} ${reviews.length === 1 ? 'familia' : 'familias'}`;
  }, [average, reviews.length]);

  return (
    <section id="valoraciones" className="scroll-mt-24 bg-white py-16">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-10 text-center">
          <p className="mb-2 text-sm font-medium uppercase tracking-wide text-secondary">Familias</p>
          <h2 className="text-3xl font-semibold text-primary-dark">Valoraciones de las familias</h2>
          <p className="mt-2 inline-flex items-center gap-2 text-sm text-primary-dark/70">
            <Star className="fill-accent-sand text-accent-sand" size={16} />
            {summary}
          </p>
        </div>

        {loading ? (
          <p className="text-center text-sm text-primary-dark/70">Cargando testimonios...</p>
        ) : reviews.length === 0 ? (
          <p className="mb-10 text-center text-sm text-primary-dark/70">
            Sé la primera familia en compartir tu experiencia en Pet Resort.
          </p>
        ) : (
          <div className="mb-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) => (
              <article
                key={review.review_id}
                className="rounded-2xl border border-secondary-light bg-background p-5 shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-semibold text-primary-dark">{review.author_name}</p>
                  <StarRow value={review.rating} />
                </div>
                <p className="text-sm leading-relaxed text-primary-dark/75">{review.comment}</p>
                <p className="mt-3 text-xs text-primary-dark/50">
                  {new Date(review.updated_at || review.created_at).toLocaleDateString('es-CO')}
                </p>
              </article>
            ))}
          </div>
        )}

        {canWrite ? (
          <form
            onSubmit={handleSubmit}
            className="mx-auto max-w-2xl rounded-3xl border border-secondary-light bg-background p-6 shadow-sm"
          >
            <h3 className="text-lg font-semibold text-primary-dark">Escribe tu reseña</h3>
            <p className="mt-1 text-sm text-primary-dark/70">
              Califica el servicio recibido. Si ya enviaste una reseña, se actualizará la anterior.
            </p>
            <div className="mt-4 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(star)}
                  className="rounded-full p-1"
                  aria-label={`${star} estrellas`}
                >
                  <Star
                    size={26}
                    className={
                      star <= (hover || rating)
                        ? 'fill-accent-sand text-accent-sand'
                        : 'text-secondary-light'
                    }
                  />
                </button>
              ))}
              <span className="ml-2 text-sm font-medium text-primary-dark">{rating} / 5</span>
            </div>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={4}
              maxLength={600}
              required
              placeholder="Cuéntanos cómo fue la estadía o el servicio de tu mascota..."
              className="mt-4 w-full rounded-2xl border border-secondary-light bg-white px-4 py-3 text-sm text-primary-dark outline-none focus:ring-2 focus:ring-primary"
            />
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            {success ? <p className="mt-2 text-sm text-emerald-700">{success}</p> : null}
            <button
              type="submit"
              disabled={saving}
              className="mt-4 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {saving ? 'Enviando...' : 'Enviar valoración'}
            </button>
          </form>
        ) : (
          <div className="mx-auto max-w-2xl rounded-3xl border border-dashed border-secondary bg-background px-6 py-8 text-center">
            <p className="text-sm text-primary-dark/75">
              {user
                ? 'Solo las familias con cuenta de cliente pueden redactar una valoración.'
                : 'Inicia sesión como cliente para calificar el servicio y dejar tu testimonio.'}
            </p>
            {!user ? (
              <Link
                to="/auth"
                className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                Acceder para opinar
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

export default FamilyReviews;
export { StarRow };
