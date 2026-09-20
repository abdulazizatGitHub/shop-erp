// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    customer: {
      search: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    job: {
      create: vi.fn(),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { JobCreateForm } from './JobCreateForm.js';

const jobCreate = vi.mocked(ipc.job.create);
const customerCreate = vi.mocked(ipc.customer.create);

afterEach(cleanup);

function fillRequiredFieldsExceptPhone(): void {
  fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'Test Customer' } });
  fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'Gree' } });
  fireEvent.change(screen.getByLabelText('Reported fault'), { target: { value: 'Not cooling' } });
}

describe('JobCreateForm (P14-2)', () => {
  it('blocks submission and shows an error when the phone field has 10 digits, not 11', async () => {
    render(<JobCreateForm onCreated={() => {}} onCancel={() => {}} />);

    fillRequiredFieldsExceptPhone();
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

    fillRequiredFieldsExceptPhone();
    fireEvent.click(screen.getByText('Create Job'));

    expect(await screen.findByText('Phone is required')).toBeTruthy();
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it('non-digit characters typed into the phone field are stripped, not rejected at submit', () => {
    render(<JobCreateForm onCreated={() => {}} onCancel={() => {}} />);

    const phoneInput = screen.getByLabelText<HTMLInputElement>('Phone');
    fireEvent.change(phoneInput, { target: { value: '0300-abc-1234567' } });

    expect(phoneInput.value).toBe('03001234567');
  });
});
