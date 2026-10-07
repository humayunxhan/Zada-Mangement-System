import React from 'react';

const paths = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  bill: <><path d="M7 3h10l3 3v15l-4-2-4 2-4-2-4 2V6a3 3 0 0 1 3-3Z" /><path d="M8 8h8M8 12h8M8 16h4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  returns: <><path d="m7 4-4 4 4 4M3 8h11a6 6 0 0 1 0 12h-4" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 20v-2a6 6 0 0 0-4-5.65" /></>,
  logout: <><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M9 12h12m-4-4 4 4-4 4" /></>,
  refresh: <><path d="M20 7a8 8 0 1 0 1 8M20 3v5h-5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12 4 4L19 6" />,
  alert: <><path d="m10.3 4-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  pharmacy: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z" />,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
};

export default function Icon({ name, size = 20, className = '' }) {
  return <svg className={`ui-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] || paths.bill}</svg>;
}
