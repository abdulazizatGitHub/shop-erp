import type { RevenueType } from '@shop/contracts';
import {
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
import type { JobPartRecord } from '../../types/electron-api.js';

export type PayerChoice = 'customer' | 'walkin';

export interface PartLineEdit {
  readonly priceRupees: string;
  readonly payer: PayerChoice;
  readonly revenueType: RevenueType;
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
                    onChange(p.id, { ...edit, payer: e.target.value as PayerChoice });
                  }}
                >
                  {customerAvailable && <option value="customer">Customer</option>}
                  <option value="walkin">Walk-in (no charge)</option>
                  {/* TODO(P6-gap): billing a third party (e.g. a manufacturer for
                      warranty work) needs a payer-party lookup that isn't built
                      yet — customer.search/party.search only find partyType
                      'customer'/'supplier', not 'both'. See PROJECT.md/PHASE_6.md §8. */}
                  <option value="other" disabled>
                    Other party (manufacturer/warranty) — coming soon
                  </option>
                </Select>
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
