import { Link } from 'react-router-dom';
import { Clock3, Mail, MapPin, Phone } from 'lucide-react';

function Footer() {
  return (
    <footer className="bg-primary-dark text-white">
      <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-12 md:grid-cols-[auto_1fr_1fr_1fr]">
        <Link to="/" className="justify-self-start">
          <img
            src="/logo.jpg"
            alt="Pet Resort"
            className="h-24 w-auto rounded-2xl bg-white object-contain p-2"
          />
        </Link>
        <div>
          <h3 className="mb-3 font-semibold uppercase tracking-wide">Navegación</h3>
          <ul className="space-y-2 text-sm text-white/80">
            <li>
              <Link to="/" className="hover:text-white">
                Inicio
              </Link>
            </li>
            <li>
              <Link to="/servicios" className="hover:text-white">
                Servicios
              </Link>
            </li>
            <li>
              <Link to="/auth" className="hover:text-white">
                Acceder
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 font-semibold uppercase tracking-wide">Horarios</h3>
          <ul className="space-y-2 text-sm text-white/80">
            <li className="flex items-start gap-2">
              <Clock3 size={16} className="mt-0.5 shrink-0" />
              Lunes a Viernes: 8am - 6pm
            </li>
            <li className="flex items-start gap-2">
              <Clock3 size={16} className="mt-0.5 shrink-0" />
              Sábado: 9am - 5pm
            </li>
            <li className="flex items-start gap-2">
              <Clock3 size={16} className="mt-0.5 shrink-0" />
              Domingo: 9am - 2pm
            </li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 font-semibold uppercase tracking-wide">Contacto</h3>
          <ul className="space-y-2 text-sm text-white/80">
            <li className="flex items-center gap-2">
              <Phone size={16} className="shrink-0" />
              3015703236
            </li>
            <li className="flex items-center gap-2">
              <Mail size={16} className="shrink-0" />
              atencion@petresort.com
            </li>
            <li className="flex items-center gap-2">
              <MapPin size={16} className="shrink-0" />
              Apartadó, Colombia
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/60">
        © {new Date().getFullYear()} Pet Resort. Cuidado boutique para tu mascota.
      </div>
    </footer>
  );
}

export default Footer;
