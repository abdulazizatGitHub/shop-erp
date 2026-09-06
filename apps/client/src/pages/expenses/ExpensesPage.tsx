import { useEffect, useState } from 'react';
import type { ExpenseCategoryDto, ExpenseDto } from '@shop/contracts';
import type { BusinessUnitOption } from '../../types/electron-api.js';
import { Alert, Button, Card, LoadingState, PageHeader } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { AddExpenseModal } from './AddExpenseModal.js';
import { ExpenseListTable } from './ExpenseListTable.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function ExpensesPage(): React.JSX.Element {
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [expenses, setExpenses] = useState<readonly ExpenseDto[] | null>(null);
  const [categories, setCategories] = useState<readonly ExpenseCategoryDto[]>([]);
  const [businessUnits, setBusinessUnits] = useState<readonly BusinessUnitOption[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function loadExpenses(): void {
    ipc.expense
      .list({ from, to })
      .then((rows) => {
        setExpenses(rows);
        setListError(null);
      })
      .catch((err: unknown) => {
        setListError(err instanceof Error ? err.message : 'Failed to load expenses');
      });
  }

  useEffect(() => {
    loadExpenses();
    // loadExpenses is redefined each render from `from`/`to` in closure —
    // depending on [from, to] here (not the function itself) matches
    // AdvancesSection.tsx's same pattern.
  }, [from, to]);

  useEffect(() => {
    ipc.expense
      .listCategories()
      .then(setCategories)
      .catch(() => {
        // Add-expense form degrades to an empty category list; not fatal to viewing the page.
      });
    ipc.expense
      .listBusinessUnits()
      .then(setBusinessUnits)
      .catch(() => {
        // Same — the form just has nothing to offer until this loads.
      });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Expenses"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setMessage(null);
              setAddOpen(true);
            }}
          >
            Add Expense
          </Button>
        }
      />

      {message && <Alert variant="success">{message}</Alert>}

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
            }}
            className="rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
            }}
            className="rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
          />
        </label>
      </div>

      <Card title="Expenses">
        {listError && <Alert variant="danger">{listError}</Alert>}
        {expenses === null ? (
          <LoadingState message="Loading expenses…" />
        ) : (
          <ExpenseListTable expenses={expenses} />
        )}
      </Card>

      <AddExpenseModal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
        }}
        categories={categories}
        businessUnits={businessUnits}
        onCreated={(result) => {
          setAddOpen(false);
          setMessage(`Expense recorded: ${result.docNo}`);
          loadExpenses();
        }}
      />
    </div>
  );
}
