// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateRangeSelector } from './DateRangeSelector.js';

afterEach(cleanup);

describe('DateRangeSelector (P10-3)', () => {
  it('renders all six preset buttons', () => {
    render(
      <DateRangeSelector value={{ from: '2026-09-01', to: '2026-09-30' }} onChange={() => {}} />,
    );

    expect(screen.getByRole('button', { name: 'Today' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'This Week' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'This Month' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'This Quarter' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'This Year' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Custom' })).toBeTruthy();
  });

  it('clicking "This Month" with a fixed reference date calls onChange with the exact month range', () => {
    const onChange = vi.fn();
    render(
      <DateRangeSelector
        value={{ from: '2026-01-01', to: '2026-01-31' }}
        onChange={onChange}
        referenceDate={new Date('2026-09-13')}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'This Month' }));

    expect(onChange).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('clicking "Custom" shows two date input fields', () => {
    render(
      <DateRangeSelector value={{ from: '2026-09-01', to: '2026-09-30' }} onChange={() => {}} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));

    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
  });

  it('in Custom mode, changing the from date calls onChange with the updated from and existing to', () => {
    const onChange = vi.fn();
    render(
      <DateRangeSelector value={{ from: '2026-09-01', to: '2026-09-30' }} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    const fromInput = document.querySelectorAll('input[type="date"]')[0];
    if (!fromInput) throw new Error('from date input did not render');

    fireEvent.change(fromInput, { target: { value: '2026-09-05' } });

    expect(onChange).toHaveBeenCalledWith({ from: '2026-09-05', to: '2026-09-30' });
  });
});
