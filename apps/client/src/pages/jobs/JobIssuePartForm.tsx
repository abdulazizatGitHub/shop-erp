import { useState } from 'react';
import type { ItemDto } from '@shop/contracts';
import { Money, Qty } from '@shop/shared';
import { Alert, Button, Select, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { SearchSelect } from '../sales/SearchSelect.js';

export interface JobIssuePartFormProps {
  readonly jobId: string;
  readonly technicians: ReadonlyArray<{ id: string; name: string }>;
  readonly defaultTechnicianId: string | null;
  readonly onIssued: () => void;
  readonly onCancel: () => void;
}

/** The "+ Add part" form — split out of JobPartsSection.tsx to keep that
 * file under 300 lines. Same window.api.job.issueToJob() call as the
 * retired IssuedPartsPanel.tsx, restyled to the P6.5 one-row layout. */
export function JobIssuePartForm({
  jobId,
  technicians,
  defaultTechnicianId,
  onIssued,
  onCancel,
}: JobIssuePartFormProps): React.JSX.Element {
  const [pendingItem, setPendingItem] = useState<ItemDto | null>(null);
  const [qtyInput, setQtyInput] = useState('1');
  const [priceRupees, setPriceRupees] = useState('');
  const [technicianId, setTechnicianId] = useState(defaultTechnicianId ?? '');
  const [isBillable, setIsBillable] = useState(true);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  async function handleIssue(): Promise<void> {
    setIssueError(null);
    if (!pendingItem) {
      setIssueError('Select an item first');
      return;
    }
    if (technicianId.length === 0) {
      setIssueError('Select the technician taking the part');
      return;
    }
    let quantityMilli: number;
    try {
      quantityMilli = Qty.fromUnits(qtyInput);
    } catch {
      setIssueError('Quantity is not a valid amount');
      return;
    }
    if (quantityMilli <= 0) {
      setIssueError('Quantity must be greater than zero');
      return;
    }
    let unitPricePaisa: number | null = null;
    if (priceRupees.trim().length > 0) {
      try {
        unitPricePaisa = Money.fromRupees(priceRupees);
      } catch {
        setIssueError('Price is not a valid amount');
        return;
      }
    }
    setIssuing(true);
    try {
      await ipc.job.issueToJob({
        jobId,
        itemId: pendingItem.id,
        quantityMilli,
        technicianPartyId: technicianId,
        unitPricePaisa,
        isBillable,
      });
      onIssued();
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : 'Failed to issue part');
    } finally {
      setIssuing(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {issueError && <Alert variant="danger">{issueError}</Alert>}
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <SearchSelect<ItemDto>
            placeholder="Search item to issue"
            search={(query) => ipc.item.search({ query, categoryId: null })}
            getKey={(item) => item.id}
            getLabel={(item) => `${item.nameEn} (${item.itemCode})`}
            onSelect={setPendingItem}
          />
          {pendingItem && <p className="mt-1 text-xs text-gray-500">{pendingItem.nameEn}</p>}
        </div>
        <div className="w-24">
          <TextInput
            label="Qty"
            variant="number"
            value={qtyInput}
            onChange={(e) => {
              setQtyInput(e.target.value);
            }}
          />
        </div>
        <div className="w-32">
          <TextInput
            label="Price Rs"
            variant="number"
            value={priceRupees}
            onChange={(e) => {
              setPriceRupees(e.target.value);
            }}
          />
        </div>
        <div className="w-40">
          <Select
            label="Technician"
            value={technicianId}
            onChange={(e) => {
              setTechnicianId(e.target.value);
            }}
          >
            <option value="">Select…</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={isBillable}
          onChange={(e) => {
            setIsBillable(e.target.checked);
          }}
        />
        Billable to customer
      </label>

      <div className="mt-4 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <Button
          variant="primary"
          disabled={issuing}
          onClick={() => {
            void handleIssue();
          }}
        >
          Issue Part
        </Button>
      </div>
    </div>
  );
}
