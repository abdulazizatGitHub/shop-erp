// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination.js';

afterEach(cleanup);

describe('Pagination', () => {
  it('totalRows=25, rowsPerPage=10, currentPage=1: shows "Showing 1–10 of 25 rows", Previous disabled, Next enabled, 3 page buttons', () => {
    render(<Pagination totalRows={25} rowsPerPage={10} currentPage={1} onPageChange={() => {}} />);

    expect(screen.getByText('Showing 1–10 of 25 rows')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous page' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: 'Next page' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Page 3' })).toBeTruthy();
  });

  it('totalRows=25, rowsPerPage=10, currentPage=3: shows "Showing 21–25 of 25 rows", Next disabled, Previous enabled', () => {
    render(<Pagination totalRows={25} rowsPerPage={10} currentPage={3} onPageChange={() => {}} />);

    expect(screen.getByText('Showing 21–25 of 25 rows')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next page' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Previous page' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('totalRows=8, rowsPerPage=10: renders nothing', () => {
    const { container } = render(
      <Pagination totalRows={8} rowsPerPage={10} currentPage={1} onPageChange={() => {}} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('clicking Next on page 1 calls onPageChange(2)', () => {
    const onPageChange = vi.fn();
    render(
      <Pagination totalRows={25} rowsPerPage={10} currentPage={1} onPageChange={onPageChange} />,
    );

    screen.getByRole('button', { name: 'Next page' }).click();

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('clicking Previous on page 2 calls onPageChange(1)', () => {
    const onPageChange = vi.fn();
    render(
      <Pagination totalRows={25} rowsPerPage={10} currentPage={2} onPageChange={onPageChange} />,
    );

    screen.getByRole('button', { name: 'Previous page' }).click();

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('clicking a page number button calls onPageChange with that page number', () => {
    const onPageChange = vi.fn();
    render(
      <Pagination totalRows={25} rowsPerPage={10} currentPage={1} onPageChange={onPageChange} />,
    );

    screen.getByRole('button', { name: 'Page 3' }).click();

    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
