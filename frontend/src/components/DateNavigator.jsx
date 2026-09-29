import { CalendarDays } from 'lucide-react';
import { toDateInputValue } from '../lib/safeData';

const inputClass =
  'rounded-xl border border-secondary-light bg-white px-3 py-2 text-sm text-primary-dark outline-none focus:border-primary';

function DateNavigator({ value, onChange, label = 'Fecha' }) {
  const selected = value || toDateInputValue();

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-secondary-light">
      <label className="text-sm font-medium text-primary-dark">
        {label}
        <input
          type="date"
          value={selected}
          onChange={(event) => onChange(event.target.value || toDateInputValue())}
          className={`${inputClass} mt-1 min-w-[11rem]`}
        />
      </label>
      <button
        type="button"
        onClick={() => onChange(toDateInputValue())}
        className="inline-flex items-center gap-2 rounded-full bg-primary-light px-3 py-2 text-sm font-medium text-primary-dark"
      >
        <CalendarDays size={16} />
        Hoy
      </button>
    </div>
  );
}

export default DateNavigator;
