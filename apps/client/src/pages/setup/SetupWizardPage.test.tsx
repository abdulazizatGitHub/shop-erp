// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    setup: {
      finish: vi.fn(),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { ITEM_COLUMNS } from '../items/useImportItemsFlow.js';
import { SetupWizardPage } from './SetupWizardPage.js';

const finish = vi.mocked(ipc.setup.finish);

afterEach(cleanup);

function fillRequiredFields(): void {
  fireEvent.change(screen.getByLabelText('Shop name'), {
    target: { value: 'Malakand AC & Fridge Repair' },
  });
  fireEvent.change(screen.getByLabelText('Owner name'), { target: { value: 'Zahid Khan' } });
}

describe('SetupWizardPage', () => {
  it('Finish is disabled until both shop name and owner name are filled', () => {
    render(<SetupWizardPage onComplete={vi.fn()} />);

    const finishButton = screen.getByRole('button', { name: 'Finish setup' });
    expect(finishButton.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('Shop name'), { target: { value: 'Malakand AC' } });
    expect(finishButton.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('Owner name'), { target: { value: 'Zahid Khan' } });
    expect(finishButton.hasAttribute('disabled')).toBe(false);
  });

  it('with no CSV selected: calls setup.finish without an itemsCsv field, then onComplete', async () => {
    finish.mockResolvedValue({ itemsImport: null, itemsImportError: null });
    const onComplete = vi.fn();
    render(<SetupWizardPage onComplete={onComplete} />);

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));

    await screen.findByText('Setup complete.');
    expect(finish).toHaveBeenCalledWith({
      shopName: 'Malakand AC & Fridge Repair',
      ownerName: 'Zahid Khan',
      paperSize: 'A4',
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('defaults to A4 and switches to A5 when selected', async () => {
    finish.mockResolvedValue({ itemsImport: null, itemsImportError: null });
    render(<SetupWizardPage onComplete={vi.fn()} />);

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'A5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));

    await screen.findByText('Setup complete.');
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ paperSize: 'A5' }));
  });

  it('a CSV with rejected rows still completes setup and shows an import summary toast', async () => {
    finish.mockResolvedValue({
      itemsImport: {
        itemsReportPath: '/tmp/report.csv',
        itemsLogReportPath: '/tmp/log.csv',
        itemsAccepted: 12,
        itemsRejected: 3,
        itemsSkipped: 0,
      },
      itemsImportError: null,
    });
    const onComplete = vi.fn();
    render(<SetupWizardPage onComplete={onComplete} />);

    fillRequiredFields();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const csvContent = [
      ITEM_COLUMNS.join(','),
      ',Gas R-134a,,Spare Parts,,,,Kg,Cylinder,13.6,Y,N,35000,4200,4000,5,,,,',
    ].join('\n');
    const file = new File([csvContent], 'items.csv', { type: 'text/csv' });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);

    await screen.findByText('1 rows ready to import');
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));

    await screen.findByText(/Setup complete\. Items: 12 imported, 3 rejected/);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('setup:finish itself failing (e.g. validation) keeps the wizard open and shows the error', async () => {
    finish.mockRejectedValue(new Error('Shop name is required.'));
    const onComplete = vi.fn();
    render(<SetupWizardPage onComplete={onComplete} />);

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));

    await screen.findByText('Shop name is required.');
    expect(onComplete).not.toHaveBeenCalled();
  });
});
