import type { GrnSummary } from '../../types/electron-api.js';
import {
  Button,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import { GrnStatusBadge } from '../../components/shared/GrnStatusBadge.js';

export interface PoDetailGrnsSectionProps {
  readonly grns: readonly GrnSummary[] | null;
  readonly canCreateGrn: boolean;
  readonly onNewGrn: () => void;
  readonly onUploadCsv: () => void;
  readonly onViewGrn: (id: string) => void;
}

export function PoDetailGrnsSection({
  grns,
  canCreateGrn,
  onNewGrn,
  onUploadCsv,
  onViewGrn,
}: PoDetailGrnsSectionProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink">Goods Receipts</h3>
        {canCreateGrn && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onUploadCsv}>
              Upload GRN CSV
            </Button>
            <Button variant="primary" onClick={onNewGrn}>
              New GRN
            </Button>
          </div>
        )}
      </div>

      {grns === null || grns.length === 0 ? (
        <EmptyState message="No goods receipts recorded yet for this purchase order." />
      ) : (
        <Table>
          <TableHead>
            <TableRow zebra={false} hover="neutral">
              <TableHeaderCell className="tracking-wide text-ink-faint">Doc No</TableHeaderCell>
              <TableHeaderCell className="tracking-wide text-ink-faint">Date</TableHeaderCell>
              <TableHeaderCell className="tracking-wide text-ink-faint">Payment</TableHeaderCell>
              <TableHeaderCell className="tracking-wide text-ink-faint">Status</TableHeaderCell>
              <TableHeaderCell className="text-right tracking-wide text-ink-faint">
                Items
              </TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {grns.map((grn) => (
              <TableRow key={grn.id} zebra={false} hover="neutral">
                <TableCell className="py-2">{grn.docNo}</TableCell>
                <TableCell className="py-2">{grn.grnDate}</TableCell>
                <TableCell className="py-2 capitalize">{grn.paymentMode}</TableCell>
                <TableCell className="py-2">
                  <GrnStatusBadge status={grn.status} />
                </TableCell>
                <TableCell className="py-2 text-right">{grn.lineCount}</TableCell>
                <TableCell className="py-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      onViewGrn(grn.id);
                    }}
                  >
                    View
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
