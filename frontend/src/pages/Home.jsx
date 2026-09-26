import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  CalendarCheck,
  HeartHandshake,
  ShieldCheck,
  Star,
} from 'lucide-react';
import api from '../api/axios';
import { getHomePath, useAuth } from '../context/AuthContext';
import ServiceCard from '../components/ServiceCard';
import FamilyReviews from '../components/FamilyReviews';
import Footer from '../components/Footer';

const fallbackServices = [
  {
    name: 'Hospedaje boutique',
    description: 'Suites climatizadas, monitoreo y rutina personalizada para cada huésped.',
    current_price: 120000,
    category_type: 'HOTEL',
    category_name: 'Hospedaje',
    duration_label: 'Por noche',
  },
  {
    name: 'Spa & grooming',
    description: 'Baño, corte, hidratación y aromaterapia con productos pet-friendly.',
    current_price: 65000,
    category_type: 'SPA',
    category_name: 'Spa & Grooming',
    duration_label: '90 min',
  },
  {
    name: 'Recreación dirigida',
    description: 'Juego, socialización y ejercicio supervisado en espacios seguros.',
    current_price: 45000,
    category_type: 'RECREATION',
    category_name: 'Recreación',
    duration_label: 'Jornada',
  },
];

const plans = [
  {
    name: 'Esencial',
    price: '$89.000',
    period: '/ noche',
    features: ['Alojamiento estándar', 'Alimentación incluida', 'Reporte diario'],
    highlighted: false,
  },
  {
    name: 'Plan Recomendado',
    price: '$149.000',
    period: '/ noche',
    features: ['Suite boutique', 'Spa express', 'Paseos y recreación', 'Fotos del día'],
    highlighted: true,
  },
  {
    name: 'Premium Wellness',
    price: '$210.000',
    period: '/ noche',
    features: ['Suite vista jardín', 'Grooming completo', 'Cuidados especiales', 'Check-out flexible'],
    highlighted: false,
  },
];

function Home() {
  const { user } = useAuth();
  const [services, setServices] = useState(fallbackServices);

  useEffect(() => {
    const loadServices = async () => {
      try {
        const { data } = await api.get('/services');
        const catalog = (data.services || []).slice(0, 3);
        if (catalog.length > 0) {
          setServices(catalog);
        }
      } catch {
        setServices(fallbackServices);
      }
    };

    loadServices();
  }, []);

  const bookingPath = user ? getHomePath(user) : '/auth';

  return (
    <div className="scroll-smooth bg-background">
      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-2 md:py-16">
        <div>
          <p className="mb-4 inline-flex rounded-full bg-accent-sand px-4 py-1.5 text-sm font-medium text-primary-dark">
            Bienvenido a Pet Resort
          </p>
          <h1 className="text-3xl font-semibold leading-tight text-primary-dark sm:text-4xl lg:text-5xl">
            Un hotel boutique y spa pensado para la felicidad de tu mascota
          </h1>
          <p className="mt-4 max-w-xl text-base text-primary-dark/75 sm:text-lg">
            Hospedaje, estética y recreación con cuidado profesional. Un entorno calmado,
            seguro y lleno de mimos para que tu compañero viva una estadía inolvidable.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to={bookingPath}
              className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Reservar Cita
            </Link>
            <a
              href="#catalogo"
              className="rounded-full border border-secondary bg-white px-6 py-3 text-sm font-semibold text-primary-dark hover:bg-primary-light"
            >
              Explorar Servicios
            </a>
            <a
              href="#valoraciones"
              className="rounded-full border border-primary bg-white px-6 py-3 text-sm font-semibold text-primary hover:bg-primary-light"
            >
              Ver valoraciones de las familias
            </a>
          </div>
          <a href="#valoraciones" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-primary-dark shadow-sm">
            <Star className="fill-accent-sand text-accent-sand" size={18} />
            Valoraciones de las familias
          </a>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-3xl shadow-xl">
            <img
              src="https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&q=80&w=800"
              alt="Perro feliz en Pet Resort"
              className="h-[420px] w-full object-cover"
            />
          </div>
          <div className="absolute left-4 top-4 rounded-2xl bg-white/95 px-4 py-3 shadow-lg">
            <p className="text-xs uppercase tracking-wide text-primary-dark/60">Check-in</p>
            <p className="font-semibold text-primary-dark">Express y sin estrés</p>
          </div>
          <div className="absolute bottom-4 right-4 rounded-2xl bg-accent-purple px-4 py-3 text-white shadow-lg">
            <p className="text-xs uppercase tracking-wide text-white/80">Cuidado</p>
            <p className="font-semibold">Atención 1 a 1</p>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Award, title: 'Groomers Certificados', text: 'Estilistas con protocolo de bienestar animal.' },
            { icon: HeartHandshake, title: 'Productos Pet-Friendly', text: 'Fórmulas suaves, sin agresivos ni fragancias fuertes.' },
            { icon: ShieldCheck, title: 'Sin Estrés', text: 'Rutinas pausadas, espacios calmados y personal empático.' },
            { icon: CalendarCheck, title: 'Reservas Online', text: 'Agenda hospedaje o spa en minutos, 24/7.' },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-light text-primary-dark">
                <item.icon size={22} />
              </span>
              <div>
                <h2 className="font-semibold text-primary-dark">{item.title}</h2>
                <p className="text-sm text-primary-dark/70">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="catalogo" className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-10 text-center">
          <p className="mb-2 text-sm font-medium uppercase tracking-wide text-secondary">Catálogo</p>
          <h2 className="text-3xl font-semibold text-primary-dark">Todo lo que tu mascota necesita</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {services.map((service) => (
            <ServiceCard key={service.service_id || service.name} service={service} compact />
          ))}
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10 text-center">
            <p className="mb-2 text-sm font-medium uppercase tracking-wide text-secondary">Tarifas</p>
            <h2 className="text-3xl font-semibold text-primary-dark">Elige el plan perfecto</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`rounded-3xl p-6 shadow-sm ${
                  plan.highlighted
                    ? 'bg-primary-dark text-white md:-translate-y-3'
                    : 'border border-secondary-light bg-background text-primary-dark'
                }`}
              >
                {plan.highlighted ? (
                  <p className="mb-3 inline-flex rounded-full bg-accent-sand px-3 py-1 text-xs font-semibold text-primary-dark">
                    Recomendado
                  </p>
                ) : null}
                <h3 className="text-xl font-semibold">{plan.name}</h3>
                <p className="mt-3 text-3xl font-semibold">
                  {plan.price}
                  <span className={`text-sm font-normal ${plan.highlighted ? 'text-white/70' : 'text-primary-dark/60'}`}>
                    {plan.period}
                  </span>
                </p>
                <ul className="mt-5 space-y-2 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>
                <Link
                  to={bookingPath}
                  className={`mt-6 block rounded-full px-4 py-2 text-center text-sm font-semibold ${
                    plan.highlighted
                      ? 'bg-accent-sand text-primary-dark'
                      : 'bg-primary text-white hover:bg-primary-dark'
                  }`}
                >
                  Reservar este plan
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <FamilyReviews />

      <Footer />
    </div>
  );
}

export default Home;
