// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    customer: {
      search: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    jobClient: {
      search: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    job: {
      create: vi.fn(),
    },
    brand: {
      list: vi.fn().mockResolvedValue([{ id: 'brand-gree', name: 'Gree' }]),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { JobCreateForm } from './JobCreateForm.js';

const jobCreate = vi.mocked(ipc.job.create);
const customerCreate = vi.mocked(ipc.customer.create);
const jobClientSearch = vi.mocked(ipc.jobClient.search);
const brandList = vi.mocked(ipc.brand.list);

afterEach(() => {
  cleanup();
  brandList.mockResolvedValue([{ id: 'brand-gree', name: 'Gree' }]);
});

async function fillRequiredFieldsExceptPhone(): Promise<void> {
  fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'Test Customer' } });
  // P16-2 — the brand dropdown is now populated by a live ipc.brand.list()
  // fetch (useActiveBrands.ts), not a hardcoded constant, so "Gree" isn't
  // selectable as an <option> until that resolves.
  await waitFor(() => {
    expect(
      screen.getByLabelText<HTMLSelectElement>('Brand').querySelector('option[value="Gree"]'),
    ).toBeTruthy();
  });
  fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'Gree' } });
  fireEvent.change(screen.getByLabelText('Reported fault'), { target: { value: 'Not cooling' } });
}

describe('JobCreateForm (P14-2)', () => {
  it('blocks submission and shows an error when the phone field has 10 digits, not 11', async () => {
    render(<JobCreateForm onCreated={() => {}} onCancel={() => {}} />);

    await fillRequiredFieldsExceptPhone();
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0300123456' } });

    fireEvent.click(screen.getByText('Create Job'));

    expect(
      await screen.findByText('Phone number must be exactly 11 digits (e.g. 03001234567)'),
    ).toBeTruthy();
    expect(jobCreate).not.toHaveBeenCalled();
    expect(customerCreate).not.toHaveBeenCalled();
  });

  it('blocks submission and shows an error when the phone field is empty', async () => {
    render(<JobCreateForm onCreated={() => {}} onCancel={() => {}} />);

    await fillRequiredFieldsExceptPhone();
    fireEvent.click(screen.getByText('Create Job'));

    expect(await screen.findByText('Phone is required')).toBeTruthy();
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it('P16-2: if the brand list fails to load, intake is never blocked — "Other" is still selectable and an error is shown', async () => {
    brandList.mockRejectedValueOnce(new Error('IPC timeout'));

    render(<JobCreateForm onCreated={() => {}} onCancel={() => {}} />);

    await screen.findByText(/Brand list unavailable/);
    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'Other' } });
    expect(screen.getByLabelText('Brand (other)')).toBeTruthy();
  });

  it('non-digit characters typed into the phone field are stripped, not rejected at submit', () => {
    render(<JobCreateForm onCreated={() => {}} onCancel={() => {}} />);

    const phoneInput = screen.getByLabelText<HTMLInputElement>('Phone');
    fireEvent.change(phoneInput, { target: { value: '0300-abc-1234567' } });

    expect(phoneInput.value).toBe('03001234567');
  });
});

describe('JobCreateForm (P15-4 — job type + on-site address group)', () => {
  it('defaults to "In shop" and does not show the address group', () => {
    render(<JobCreateForm onCreated={() => {}} onCancel={() => {}} />);

    expect(screen.queryByLabelText('Address')).toBeNull();
    expect(screen.queryByLabelText('Area')).toBeNull();
    expect(screen.queryByLabelText('Landmark')).toBeNull();
  });

  it('clicking "On-site" reveals the Address/Area/Landmark group', () => {
    render(<JobCreateForm onCreated={() => {}} onCancel={() => {}} />);

    fireEvent.click(screen.getByText('On-site'));

    expect(screen.getByLabelText('Address')).toBeTruthy();
    expect(screen.getByLabelText('Area')).toBeTruthy();
    expect(screen.getByLabelText('Landmark')).toBeTruthy();
  });

  it('clicking back to "In shop" hides the address group again', () => {
    render(<JobCreateForm onCreated={() => {}} onCancel={() => {}} />);

    fireEvent.click(screen.getByText('On-site'));
    expect(screen.getByLabelText('Address')).toBeTruthy();

    fireEvent.click(screen.getByText('In shop'));
    expect(screen.queryByLabelText('Address')).toBeNull();
  });

  it('selecting an existing client auto-fills Address/Area/Landmark when on-site is shown', async () => {
    jobClientSearch.mockResolvedValueOnce([
      {
        id: 'client-1',
        name: 'Fazal Rabbi',
        phone: '03119876543',
        phone2: null,
        address: 'House 12, GT Road',
        area: 'Batkhela',
        landmark: 'next to blue mosque',
        notes: null,
      },
    ]);

    render(<JobCreateForm onCreated={() => {}} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'Fazal' } });
    fireEvent.mouseDown(await screen.findByText('Fazal Rabbi'));

    fireEvent.click(screen.getByText('On-site'));

    expect(screen.getByLabelText<HTMLInputElement>('Address').value).toBe('House 12, GT Road');
    expect(screen.getByLabelText<HTMLInputElement>('Area').value).toBe('Batkhela');
    expect(screen.getByLabelText<HTMLInputElement>('Landmark').value).toBe('next to blue mosque');
  });
});
