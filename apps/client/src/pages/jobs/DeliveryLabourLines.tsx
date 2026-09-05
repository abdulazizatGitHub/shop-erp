import { useState } from 'react';
import type { RevenueType } from '@shop/contracts';
import { newId } from '@shop/shared';
import {
  Button,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextInput,
} from '@shop/ui';
import type { ServiceChargeOption } from '../../types/electron-api.js';
import type { PayerChoice } from './DeliveryPartLines.js';

export interface LabourLineEdit {
  readonly key: string;
  readonly serviceChargeId: string;
  readonly serviceChargeName: string;
  readonly priceRupees: string;
  readonly payer: PayerChoice;
  readonly revenueType: RevenueType;
}

const REVENUE_TYPES: readonly RevenueType[] = ['customer_paid', 'contract', 'warranty', 'internal'];

export interface DeliveryLabourLinesProps {
  readonly lines: readonly LabourLineEdit[];
  readonly serviceCharges: readonly ServiceChargeOption[];
  readonly customerAvailable: boolean;
  readonly onAdd: (line: LabourLineEdit) => void;
  readonly onChange: (key: string, line: LabourLineEdit) => void;
  readonly onRemove: (key: string) => void;
}

/** Labour lines aren't pre-populated (unlike parts) — the user adds them from the service_charge list. */
export function DeliveryLabourLines({
  lines,
  serviceCharges,
  customerAvailable,
  onAdd,
  onChange,
  onRemove,
}: DeliveryLabourLinesProps): React.JSX.Element {
  const [pendingChargeId, setPendingChargeId] = useState('');

  function handleAdd(): void {
    const charge = serviceCharges.find((c) => c.id === pendingChargeId);
    if (!charge) return;
    onAdd({
      key: newId(),
      serviceChargeId: charge.id,
      serviceChargeName: charge.name,
      priceRupees: '',
      payer: customerAvailable ? 'customer' : 'walkin',
      revenueType: 'customer_paid',
    });
    setPendingChargeId('');
  }

  return (
    <div className="flex flex-col gap-2">
      {lines.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Charge</TableHeaderCell>
              <TableHeaderCell>Price (Rs, blank = default)</TableHeaderCell>
              <TableHeaderCell>Payer</TableHeaderCell>
              <TableHeaderCell>Revenue type</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.key}>
                <TableCell>{line.serviceChargeName}</TableCell>
                <TableCell>
                  <TextInput
                    aria-label={`Price for ${line.serviceChargeName}`}
                    variant="number"
                    value={line.priceRupees}
                    onChange={(e) => {
                      onChange(line.key, { ...line, priceRupees: e.target.value });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    aria-label={`Payer for ${line.serviceChargeName}`}
                    value={line.payer}
                    onChange={(e) => {
                      onChange(line.key, { ...line, payer: e.target.value as PayerChoice });
                    }}
                  >
                    {customerAvailable && <option value="customer">Customer</option>}
                    <option value="walkin">Walk-in (no charge)</option>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    aria-label={`Revenue type for ${line.serviceChargeName}`}
                    value={line.revenueType}
                    onChange={(e) => {
                      onChange(line.key, { ...line, revenueType: e.target.value as RevenueType });
                    }}
                  >
                    {REVENUE_TYPES.map((rt) => (
                      <option key={rt} value={rt}>
                        {rt}
                      </option>
                    ))}
                  </Select>
                </TableCell>
                <TableCell>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      onRemove(line.key);
                    }}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div className="flex items-center gap-2">
        <Select
          aria-label="Add labour charge"
          value={pendingChargeId}
          onChange={(e) => {
            setPendingChargeId(e.target.value);
          }}
        >
          <option value="">Add a labour charge…</option>
          {serviceCharges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button variant="secondary" disabled={pendingChargeId.length === 0} onClick={handleAdd}>
          Add
        </Button>
      </div>
    </div>
  );
}
