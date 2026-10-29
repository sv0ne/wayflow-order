import { useEffect, useState } from 'react';

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

  return <div className="countdown" aria-label="Order time remaining">
    {parts.map((part, index) => <span className="countdown-part" key={part.unit}>
      {index > 0 && <span className="countdown-separator">:</span>}
      <strong>{String(part.value).padStart(2, '0')}<small>{part.unit}</small></strong>
    </span>)}
  </div>;
}
