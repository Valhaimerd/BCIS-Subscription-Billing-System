import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { ModalDialog } from '../ModalDialog';

export function DetailSheet({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <ModalDialog
      ariaLabel={title}
      className="detail-dialog--sheet"
      onClose={onClose}
    >
      <section className="detail-sheet-content">
        <header className="detail-sheet-heading">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button aria-label="Close details" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        {children}
      </section>
    </ModalDialog>
  );
}
