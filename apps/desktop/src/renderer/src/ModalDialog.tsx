import { useEffect, useRef, type ReactNode } from 'react';

export function ModalDialog({
  ariaLabel,
  children,
  className,
  onClose,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocus = document.activeElement as HTMLElement | null;
    if (!dialog) return;

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');

    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      returnFocus?.focus();
    };
  }, []);

  return (
    <dialog
      aria-label={ariaLabel}
      className={['detail-dialog', className].filter(Boolean).join(' ')}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      {children}
    </dialog>
  );
}
