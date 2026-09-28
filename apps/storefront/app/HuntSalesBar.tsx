'use client';

import { useEffect, useState } from 'react';
import './hunt-sales.css';

export function HuntSalesBar({ endsAt }: { endsAt?: string }) {
  const deadline = endsAt ? Date.parse(endsAt) : NaN;
  const configured = Number.isFinite(deadline);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    setRemaining(null);
    if (!configured) return;
    const update = () => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      return seconds;
    };
    if (update() === 0) return;
    const interval = window.setInterval(() => {
      if (update() === 0) window.clearInterval(interval);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [deadline, configured]);

  const days = Math.floor((remaining ?? 0) / 86400);
  const clock = [
    Math.floor(((remaining ?? 0) % 86400) / 3600),
    Math.floor(((remaining ?? 0) % 3600) / 60),
    (remaining ?? 0) % 60,
  ].map(value => String(value).padStart(2, '0')).join(' : ');
  const endLabel = configured ? new Intl.DateTimeFormat('en-GH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra',
  }).format(deadline) : '';

  return (
    <aside className="hunt-sales" aria-label="Hunt Sales promotion">
      <div className="container hunt-sales-inner">
        <strong className="hunt-sales-title">Hunt Sales</strong>
        {!configured ? <span>Coming soon</span> : remaining === 0 ? (
          <span>Promotion ended</span>
        ) : (
          <>
            <span aria-hidden="true">Ends in</span>
            <span className="hunt-sales-clock" aria-hidden="true">
              {remaining === null ? '-- : -- : --' : `${days > 0 ? `${days}d  ` : ''}${clock}`}
            </span>
            <span className="hunt-sales-sr">Promotion ends {endLabel}, Ghana time.</span>
          </>
        )}
      </div>
    </aside>
  );
}
