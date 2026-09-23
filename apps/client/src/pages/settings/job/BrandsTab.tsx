import { useEffect, useState } from 'react';
import type { BrandAdminDto } from '@shop/contracts';
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
 * P16-2 — Job Settings > Brands. Unlike Service Charges, this section has
 * no dirty-tracked form (no bottom action bar, per review): adding a
 * brand is an immediate action (name input + Add button, cleared and
 * re-listed on success), and each row's Active/Inactive toggle fires
 * immediately too — same shape as the per-row toggle already used here.
 */
export function BrandsTab(): React.JSX.Element {
  const [brands, setBrands] = useState<readonly BrandAdminDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function load(): void {
    ipc.brand
      .listAdmin()
      .then(setBrands)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load brands');
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(): Promise<void> {
    const name = newName.trim();
    if (name.length === 0) {
      setError('Brand name is required');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await ipc.brand.create({ name });
      setNewName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add brand');
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(brand: BrandAdminDto): Promise<void> {
    setTogglingId(brand.id);
    setError(null);
    try {
      await ipc.brand.toggleActive({ id: brand.id, isActive: !brand.isActive });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update brand');
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
            label="New brand name"
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
      {brands === null && <p className="text-sm text-ink-muted">Loading…</p>}
      {brands !== null && brands.length === 0 && (
        <EmptyState
          message="No brands yet"
          hint="Add the appliance brands the shop services to make them available at job intake."
        />
      )}
      {brands !== null && brands.length > 0 && (
        <Table>
          <TableHead>
            <TableRow hover="neutral">
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell className="text-right">Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {brands.map((brand) => (
              <TableRow key={brand.id} hover="neutral">
                <TableCell>{brand.name}</TableCell>
                <TableCell>
                  <Badge tone={brand.isActive ? 'success' : 'neutral'}>
                    {brand.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="secondary"
                    disabled={togglingId === brand.id}
                    onClick={() => {
                      void handleToggle(brand);
                    }}
                  >
                    {brand.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
