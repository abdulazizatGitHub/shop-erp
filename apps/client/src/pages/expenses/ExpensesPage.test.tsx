// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    expense: {
      list: vi.fn(),
      listCategories: vi.fn(),
      listBusinessUnits: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { ExpensesPage } from './ExpensesPage.js';

const list = vi.mocked(ipc.expense.list);
const listCategories = vi.mocked(ipc.expense.listCategories);
const listBusinessUnits = vi.mocked(ipc.expense.listBusinessUnits);

// The exact EC-P7-4 scenario.
const EC_P7_4_EXPENSES = [
  {
    id: 'e1',
    docNo: 'EXP-0001',
    categoryId: 'c-electricity',
    categoryName: 'Electricity',
    expenseDate: '2026-08-15',
    amountPaisa: 450000,
    businessUnitId: 'bu-shared',
    businessUnitCode: 'SHARED' as const,
    vehicle: null,
    method: 'cash' as const,
    notes: null,
  },
  {
    id: 'e2',
    docNo: 'EXP-0002',
    categoryId: 'c-bikefuel',
    categoryName: 'Bike Fuel',
    expenseDate: '2026-08-15',
    amountPaisa: 80000,
    businessUnitId: 'bu-repair',
    businessUnitCode: 'REPAIR' as const,
    vehicle: 'NX-100',
    method: 'cash' as const,
    notes: null,
  },
  {
    id: 'e3',
    docNo: 'EXP-0003',
    categoryId: 'c-courier',
    categoryName: 'Courier',
    expenseDate: '2026-08-15',
    amountPaisa: 20000,
    businessUnitId: 'bu-parts',
    businessUnitCode: 'PARTS' as const,
    vehicle: null,
    method: 'owner_personal' as const,
    notes: null,
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ExpensesPage (P7-9 smoke test, EC-P7-9/EC-P7-4)', () => {
  it('lists the 3 EC-P7-4 expenses with correct category/amount/unit/method columns', async () => {
    list.mockResolvedValue(EC_P7_4_EXPENSES);
    listCategories.mockResolvedValue([]);
    listBusinessUnits.mockResolvedValue([]);

    render(<ExpensesPage />);

    expect(await screen.findByText('Electricity')).toBeTruthy();
    expect(screen.getByText('Bike Fuel')).toBeTruthy();
    expect(screen.getByText('Courier')).toBeTruthy();

    // Amounts via MoneyDisplay (Rs 4,500 / Rs 800 / Rs 200).
    expect(screen.getByText('Rs 4,500')).toBeTruthy();
    expect(screen.getByText('Rs 800')).toBeTruthy();
    expect(screen.getByText('Rs 200')).toBeTruthy();

    // Unit shown as business_unit code, never the UUID.
    expect(screen.getByText('SHARED')).toBeTruthy();
    expect(screen.getByText('REPAIR')).toBeTruthy();
    expect(screen.getByText('PARTS')).toBeTruthy();

    // Method labels: cash -> Till, owner_personal -> Owner.
    expect(screen.getAllByText('Till')).toHaveLength(2);
    expect(screen.getByText('Owner')).toBeTruthy();
  });

  it('Add Expense form blocks submission when the business unit is left on its placeholder, even with real units loaded', async () => {
    // BUG-21: previously mocked listBusinessUnits to [], which never
    // exercises the real default-selection bug (the <select> silently
    // defaulting to the first real unit). Use the real PARTS/REPAIR/SHARED
    // units here so the placeholder option is what's actually tested.
    list.mockResolvedValue([]);
    listCategories.mockResolvedValue([
      { id: 'c1', name: 'Electricity', kind: 'fixed', allocationMethod: 'shared_revenue' },
    ]);
    listBusinessUnits.mockResolvedValue([
      { id: 'bu-parts', code: 'PARTS', name: 'Spare Parts' },
      { id: 'bu-repair', code: 'REPAIR', name: 'Repair' },
      { id: 'bu-shared', code: 'SHARED', name: 'Shared' },
    ]);

    render(<ExpensesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add Expense' }));

    expect(await screen.findByText('Add expense')).toBeTruthy();

    const unitSelect = screen.getByLabelText('Which unit does this cost belong to?');
    expect((unitSelect as HTMLSelectElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Select which unit this cost belongs to')).toBeTruthy();
    expect(ipc.expense.create).not.toHaveBeenCalled();
  });

  it('Add Expense form lists Spare Parts / Repair / Shared as business unit options', async () => {
    list.mockResolvedValue([]);
    listCategories.mockResolvedValue([]);
    listBusinessUnits.mockResolvedValue([
      { id: 'bu-parts', code: 'PARTS', name: 'Spare Parts' },
      { id: 'bu-repair', code: 'REPAIR', name: 'Repair' },
      { id: 'bu-shared', code: 'SHARED', name: 'Shared' },
    ]);

    render(<ExpensesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add Expense' }));
    await screen.findByText('Add expense');

    expect(screen.getByRole('option', { name: 'Spare Parts' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Repair' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Shared' })).toBeTruthy();
  });
});
