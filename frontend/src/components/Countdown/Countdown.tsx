import { useEffect, useState } from 'react';
import css from "./Countdown.module.css";

function getParts(target: string) {
  const seconds = Math.max(0, Math.floor((new Date(target).getTime() - Date.now()) / 1000));
  return [
    { value: Math.floor(seconds / 86400), unit: 'd' },
    { value: Math.floor((seconds % 86400) / 3600), unit: 'h' },
    { value: Math.floor((seconds % 3600) / 60), unit: 'm' },
    { value: seconds % 60, unit: 's' },
  ];
}

export function Countdown({ expiresAt }: { expiresAt: string }) {
  const [parts, setParts] = useState(() => getParts(expiresAt));

  useEffect(() => {
    const timer = window.setInterval(() => setParts(getParts(expiresAt)), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return (
      <div className={css.countdown} aria-label="Order time remaining">
        {parts.map((part, index) =>
          <span className={css.countdown__part} key={part.unit}>
            {index > 0 && <span className={css.countdown__separator}>:</span>}
            <strong>{String(part.value).padStart(2, '0')}<small>{part.unit}</small></strong>
          </span>
        )}
      </div>
  );
}
