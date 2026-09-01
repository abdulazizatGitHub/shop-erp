// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from './Table.js';

afterEach(cleanup);

describe('Table', () => {
  it('renders a full table without crashing', () => {
    const { getByText } = render(
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Item</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>Compressor</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(getByText('Item')).toBeTruthy();
    expect(getByText('Compressor')).toBeTruthy();
  });
});
