import React, { useEffect, useId, useRef } from 'react';
import Icon from './Icon';

export default function Modal({ title, children, onClose, busy = false }) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    dialog.current.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="ui-dialog" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose} disabled={busy}><Icon name="close" /></button></div>
    {children}
  </dialog>;
}
