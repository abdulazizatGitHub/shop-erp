// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/ipc.js', () => ({
  ipc: {
    expense: {
      listCategoriesAdmin: vi.fn(),
      createCategory: vi.fn(),
      updateCategoryName: vi.fn(),
      toggleCategoryActive: vi.fn(),
    },
  },
}));

import type { ExpenseCategoryAdminDto } from '@shop/contracts';
import { ipc } from '../../../lib/ipc.js';
import { ExpenseCategoriesTab } from './ExpenseCategoriesTab.js';

const listCategoriesAdmin = vi.mocked(ipc.expense.listCategoriesAdmin);
const createCategory = vi.mocked(ipc.expense.createCategory);
const updateCategoryName = vi.mocked(ipc.expense.updateCategoryName);
const toggleCategoryActive = vi.mocked(ipc.expense.toggleCategoryActive);

const ELECTRICITY: ExpenseCategoryAdminDto = { id: 'c1', name: 'Electricity', isActive: true };
const OLD_VENDOR: ExpenseCategoryAdminDto = { id: 'c2', name: 'Old Vendor', isActive: false };
const CATEGORIES: readonly ExpenseCategoryAdminDto[] = [ELECTRICITY, OLD_VENDOR];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * P17-4 (docs/phases/PHASE_17.md §2.6/§8, S17-EXP-1, Q-DRAWING/A17-3).
 */
describe('ExpenseCategoriesTab', () => {
  it('lists both active and inactive categories with status shown — name-only field list, no kind/billable/owner-drawing control anywhere', async () => {
    listCategoriesAdmin.mockResolvedValue(CATEGORIES);

    render(<ExpenseCategoriesTab />);

    await waitFor(() => {
      expect(screen.getByText('Electricity')).toBeTruthy();
    });
    expect(screen.getByText('Old Vendor')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
    // Corrected field list (Q-DRAWING/A17-3): nothing on this screen
    // exposes kind, billable, or owner-drawing at all.
    expect(screen.queryByText(/kind/i)).toBeNull();
    expect(screen.queryByText(/billable/i)).toBeNull();
    expect(screen.queryByText(/owner.?draw/i)).toBeNull();
  });

  it('adding a category calls createCategory with just the trimmed name', async () => {
    listCategoriesAdmin.mockResolvedValue([]);
    createCategory.mockResolvedValue({ id: 'c3', name: 'Office Supplies', isActive: true });

    render(<ExpenseCategoriesTab />);
    await screen.findByLabelText('New category name');

    fireEvent.change(screen.getByLabelText('New category name'), {
      target: { value: '  Office Supplies  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(createCategory).toHaveBeenCalledWith({ name: 'Office Supplies' });
    });
  });

  it('editing a category calls updateCategoryName with just the id and the new name', async () => {
    listCategoriesAdmin.mockResolvedValue([ELECTRICITY]);
    updateCategoryName.mockResolvedValue({ id: 'c1', name: 'Power', isActive: true });

    render(<ExpenseCategoriesTab />);
    await screen.findByText('Electricity');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const input = screen.getByDisplayValue('Electricity');
    fireEvent.change(input, { target: { value: 'Power' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateCategoryName).toHaveBeenCalledWith({ id: 'c1', name: 'Power' });
    });
  });

  it('editing pre-fills the current name (enabled to save immediately) and disables Save only if cleared blank — name-only, no lock in this form', async () => {
    // Restated against the plan's own wording: "edit (name only once
    // referenced)" — this screen never asks whether a category is
    // referenced, because the edit input has no other field that
    // referencing would need to lock.
    listCategoriesAdmin.mockResolvedValue([ELECTRICITY]);

    render(<ExpenseCategoriesTab />);
    await screen.findByText('Electricity');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByDisplayValue('Electricity')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false);

    fireEvent.change(screen.getByDisplayValue('Electricity'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  });

  it('clicking Deactivate on an active category calls toggleCategoryActive with isActive: false', async () => {
    listCategoriesAdmin.mockResolvedValue(CATEGORIES);
    toggleCategoryActive.mockResolvedValue({ id: 'c1', name: 'Electricity', isActive: false });

    render(<ExpenseCategoriesTab />);
    await screen.findByText('Electricity');

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => {
      expect(toggleCategoryActive).toHaveBeenCalledWith({ id: 'c1', isActive: false });
    });
  });

  it('clicking Activate on an inactive category calls toggleCategoryActive with isActive: true (reactivation)', async () => {
    listCategoriesAdmin.mockResolvedValue(CATEGORIES);
    toggleCategoryActive.mockResolvedValue({ id: 'c2', name: 'Old Vendor', isActive: true });

    render(<ExpenseCategoriesTab />);
    await screen.findByText('Old Vendor');

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

    await waitFor(() => {
      expect(toggleCategoryActive).toHaveBeenCalledWith({ id: 'c2', isActive: true });
    });
  });
});
