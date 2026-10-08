import React from 'react';
const paths = {
  summary: 'M3 10 12 3l9 7v10H15v-6H9v6H3Z',
  all: 'M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 8h6M9 12h6',
  payments: 'M3 6h18v14H3ZM3 10h18M15 15h3M7 3h10',
  more: 'M4 6h16M4 12h16M4 18h16',
  bills: 'M12 5v14M5 12h14',
};
export default function AppIcon({ name }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.more} /></svg>; }
