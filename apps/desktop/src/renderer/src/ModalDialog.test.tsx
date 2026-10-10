import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ModalDialog } from './ModalDialog';

it('renders as a modal and closes from Escape or the backdrop', () => {
  const onClose = vi.fn();
  render(
    <ModalDialog ariaLabel="Record detail" onClose={onClose}>
      <section>Detail content</section>
    </ModalDialog>,
  );

  const dialog = screen.getByRole('dialog', { name: 'Record detail' });
  expect(dialog).toHaveAttribute('open');

  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  fireEvent.click(dialog);

  expect(onClose).toHaveBeenCalledTimes(2);
});
