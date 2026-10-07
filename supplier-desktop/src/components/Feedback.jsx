import React from 'react';
import Icon from './Icon';

export default function Feedback({ children, tone = 'error', onDismiss }) {
  return <div className={`ui-feedback ui-feedback-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    <Icon name={tone === 'error' ? 'alert' : 'check'} size={18} />
    <span>{children}</span>
    {onDismiss && <button className="icon-button" type="button" onClick={onDismiss} aria-label="Dismiss message"><Icon name="close" size={16} /></button>}
  </div>;
}
