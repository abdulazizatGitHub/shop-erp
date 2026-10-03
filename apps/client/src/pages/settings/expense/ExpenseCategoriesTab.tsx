import { useEffect, useState } from 'react';
import type { ExpenseCategoryAdminDto } from '@shop/contracts';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextInput,
} from '@shop/ui';
import { ipc } from '../../../lib/ipc.js';

/**
 * P17-4 (docs/phases/PHASE_17.md §2.6, S17-EXP-1). Settings > Expenses >
 * Categories. Name-only form (Q-DRAWING/A17-3, ANSWERED — kind/
 * isBillable/isOwnerDrawing are hidden, never sent by this screen at
 * all, not merely hidden fields in a wider form). Mirrors BrandsTab.tsx's
 * immediate-add-plus-per-row-toggle shape; adds inline rename (BrandsTab
 * has no edit at all, since a brand name never needs correcting after
 * the fact the way a mistyped category name does) rather than a
 * separate modal, since there is exactly one editable field.
 */
export function ExpenseCategoriesTab(): React.JSX.Element {
  const [categories, setCategories] = useState<readonly ExpenseCategoryAdminDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function load(): void {
    ipc.expense
      .listCategoriesAdmin()
      .then(setCategories)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load expense categories');
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(): Promise<void> {
    const name = newName.trim();
    if (name.length === 0) {
      setError('Category name is required');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await ipc.expense.createCategory({ name });
      setNewName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add expense category');
    } finally {
      setAdding(false);
    }
  }

  function startEdit(category: ExpenseCategoryAdminDto): void {
    setEditingId(category.id);
    setEditName(category.name);
    setError(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditName('');
  }

  async function handleSaveEdit(id: string): Promise<void> {
    const name = editName.trim();
    if (name.length === 0) {
      setError('Category name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await ipc.expense.updateCategoryName({ id, name });
      setEditingId(null);
      setEditName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename expense category');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(category: ExpenseCategoryAdminDto): Promise<void> {
    setTogglingId(category.id);
    setError(null);
    try {
      await ipc.expense.toggleCategoryActive({ id: category.id, isActive: !category.isActive });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update expense category');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <TextInput
            label="New category name"
            value={newName}
            disabled={adding}
            onChange={(e) => {
              setNewName(e.target.value);
            }}
          />
        </div>
        <Button
          variant="primary"
          disabled={adding}
          onClick={() => {
            void handleAdd();
          }}
        >
          {adding ? 'Adding…' : 'Add'}
        </Button>
      </div>
      {categories === null && <p className="text-sm text-ink-muted">Loading…</p>}
      {categories !== null && categories.length === 0 && (
        <EmptyState
          message="No expense categories yet"
          hint="Add the categories expenses are recorded against."
        />
      )}
      {categories !== null && categories.length > 0 && (
        <Table>
          <TableHead>
            <TableRow hover="neutral">
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell className="text-right">Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id} hover="neutral">
                <TableCell>
                  {editingId === category.id ? (
                    <TextInput
                      value={editName}
                      disabled={saving}
                      onChange={(e) => {
                        setEditName(e.target.value);
                      }}
                    />
                  ) : (
                    category.name
                  )}
                </TableCell>
                <TableCell>
                  <Badge tone={category.isActive ? 'success' : 'neutral'}>
                    {category.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {editingId === category.id ? (
                      <>
                        <Button variant="secondary" disabled={saving} onClick={cancelEdit}>
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          disabled={saving || editName.trim().length === 0}
                          onClick={() => {
                            void handleSaveEdit(category.id);
                          }}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            startEdit(category);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={togglingId === category.id}
                          onClick={() => {
                            void handleToggle(category);
                          }}
                        >
                          {category.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
