import type { PartyAnyDto, RevenueType } from '@shop/contracts';
import {
  Button,
  MoneyDisplay,
  QuantityDisplay,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextInput,
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import type { JobPartRecord } from '../../types/electron-api.js';
import { SearchSelect } from '../sales/SearchSelect.js';

export type PayerChoice = 'customer' | 'walkin' | 'other';

export interface PartLineEdit {
  readonly priceRupees: string;
  readonly payer: PayerChoice;
  /** Set only when payer === 'other' and a party has actually been picked. */
  readonly otherPartyId: string | null;
  readonly otherPartyName: string | null;
  readonly revenueType: RevenueType;
}

/**
 * Shown under the payer <Select> whenever payer === 'other'. Search box
 * until a party is picked, then the picked name with a "Change" button —
 * shared by DeliveryPartLines and DeliveryLabourLines (P8-2, BUG-18).
 */
export function OtherPartyPicker({
  otherPartyId,
  otherPartyName,
  ariaLabel,
  onPick,
  onClear,
}: {
  readonly otherPartyId: string | null;
  readonly otherPartyName: string | null;
  readonly ariaLabel: string;
  readonly onPick: (party: PartyAnyDto) => void;
  readonly onClear: () => void;
}): React.JSX.Element {
  if (otherPartyId) {
    return (
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className="truncate">{otherPartyName}</span>
        <Button variant="secondary" onClick={onClear}>
          Change
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-1">
      <SearchSelect<PartyAnyDto>
        placeholder="Search party by name…"
        search={(query) => ipc.party.searchAny({ query })}
        getKey={(party) => party.id}
        getLabel={(party) => party.name}
        onSelect={onPick}
      />
      <span className="sr-only">{ariaLabel}</span>
    </div>
  );
}

const REVENUE_TYPES: readonly RevenueType[] = ['customer_paid', 'contract', 'warranty', 'internal'];

export interface DeliveryPartLinesProps {
  readonly parts: readonly JobPartRecord[];
  readonly edits: Record<string, PartLineEdit>;
  readonly customerAvailable: boolean;
  readonly onChange: (jobPartId: string, edit: PartLineEdit) => void;
}

/** Read-only per-item rows (qty/cost come from the job_part snapshot); price/payer/revenue type are editable. */
export function DeliveryPartLines({
  parts,
  edits,
  customerAvailable,
  onChange,
}: DeliveryPartLinesProps): React.JSX.Element {
  if (parts.length === 0) {
    return <p className="text-sm text-ink-faint">No billable parts issued to this job.</p>;
  }
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Item</TableHeaderCell>
          <TableHeaderCell>Qty</TableHeaderCell>
          <TableHeaderCell>Unit Cost</TableHeaderCell>
          <TableHeaderCell>Price (Rs)</TableHeaderCell>
          <TableHeaderCell>Payer</TableHeaderCell>
          <TableHeaderCell>Revenue type</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {parts.map((p) => {
          const edit = edits[p.id];
          if (!edit) return null;
          return (
            <TableRow key={p.id}>
              <TableCell>{p.itemName}</TableCell>
              <TableCell>
                <QuantityDisplay quantityMilli={p.quantityMilli} />
              </TableCell>
              <TableCell>
                <MoneyDisplay paisaValue={p.unitCostPaisa} size="sm" />
              </TableCell>
              <TableCell>
                <TextInput
                  aria-label={`Price for ${p.itemName}`}
                  variant="number"
                  value={edit.priceRupees}
                  onChange={(e) => {
                    onChange(p.id, { ...edit, priceRupees: e.target.value });
                  }}
                />
              </TableCell>
              <TableCell>
                <Select
                  aria-label={`Payer for ${p.itemName}`}
                  value={edit.payer}
                  onChange={(e) => {
                    const payer = e.target.value as PayerChoice;
                    onChange(p.id, { ...edit, payer, otherPartyId: null, otherPartyName: null });
                  }}
                >
                  {customerAvailable && <option value="customer">Customer</option>}
                  <option value="walkin">Walk-in (no charge)</option>
                  <option value="other">Other party…</option>
                </Select>
                {edit.payer === 'other' && (
                  <OtherPartyPicker
                    otherPartyId={edit.otherPartyId}
                    otherPartyName={edit.otherPartyName}
                    ariaLabel={`Other payer party for ${p.itemName}`}
                    onPick={(party) => {
                      onChange(p.id, {
                        ...edit,
                        otherPartyId: party.id,
                        otherPartyName: party.name,
                      });
                    }}
                    onClear={() => {
                      onChange(p.id, { ...edit, otherPartyId: null, otherPartyName: null });
                    }}
                  />
                )}
              </TableCell>
              <TableCell>
                <Select
                  aria-label={`Revenue type for ${p.itemName}`}
                  value={edit.revenueType}
                  onChange={(e) => {
                    onChange(p.id, { ...edit, revenueType: e.target.value as RevenueType });
                  }}
                >
                  {REVENUE_TYPES.map((rt) => (
                    <option key={rt} value={rt}>
                      {rt}
                    </option>
                  ))}
                </Select>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
