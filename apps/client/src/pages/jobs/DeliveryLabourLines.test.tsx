// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServiceChargeOption } from '../../types/electron-api.js';
import { DeliveryLabourLines, type LabourLineEdit } from './DeliveryLabourLines.js';

afterEach(cleanup);

const SERVICE_CHARGES: ServiceChargeOption[] = [
  { id: 'sc-1', name: 'AC Installation', businessUnitId: 'bu-repair', retailChargePaisa: 150000 },
  { id: 'sc-2', name: 'Gas Charging', businessUnitId: 'bu-repair', retailChargePaisa: 80000 },
];

/** Wraps DeliveryLabourLines with real state, mirroring exactly how
 * JobDeliveryModal.tsx wires onAdd/onChange/onRemove — so this test
 * exercises the real multi-add/remove behaviour, not a mock. */
function Harness(): React.JSX.Element {
  const [lines, setLines] = useState<readonly LabourLineEdit[]>([]);
  return (
    <DeliveryLabourLines
      lines={lines}
      serviceCharges={SERVICE_CHARGES}
      customerAvailable
      onAdd={(line) => {
        setLines((prev) => [...prev, line]);
      }}
      onChange={(key, line) => {
        setLines((prev) => prev.map((l) => (l.key === key ? line : l)));
      }}
      onRemove={(key) => {
        setLines((prev) => prev.filter((l) => l.key !== key));
      }}
    />
  );
}

function addCharge(name: string): void {
  fireEvent.change(screen.getByLabelText('Add labour charge'), {
    target: { value: SERVICE_CHARGES.find((c) => c.name === name)?.id },
  });
  fireEvent.click(screen.getByText('Add'));
}

describe('DeliveryLabourLines (F3 — multi-add pattern)', () => {
  it('adding a charge appears as a line below the dropdown, which resets to placeholder', () => {
    render(<Harness />);

    addCharge('AC Installation');

    // 'AC Installation' also appears as a <select> option — scope to the
    // table row cell specifically, not the dropdown.
    expect(screen.getByRole('cell', { name: 'AC Installation' })).toBeTruthy();
    expect(screen.getByLabelText<HTMLSelectElement>('Add labour charge').value).toBe('');
  });

  it('adding two charges shows both as separate lines', () => {
    render(<Harness />);

    addCharge('AC Installation');
    addCharge('Gas Charging');

    expect(screen.getByRole('cell', { name: 'AC Installation' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Gas Charging' })).toBeTruthy();
  });

  it('removing one line leaves the other', () => {
    render(<Harness />);

    addCharge('AC Installation');
    addCharge('Gas Charging');
    fireEvent.click(screen.getByLabelText('Remove AC Installation'));

    expect(screen.queryByRole('cell', { name: 'AC Installation' })).toBeNull();
    expect(screen.getByRole('cell', { name: 'Gas Charging' })).toBeTruthy();
  });
});
