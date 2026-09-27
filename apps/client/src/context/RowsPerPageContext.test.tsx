// @vitest-environment jsdom
import { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/ipc.js', () => ({
  ipc: {
    setting: {
      getRowsPerPage: vi.fn(),
    },
  },
}));

import { ipc } from '../lib/ipc.js';
import { RowsPerPageProvider, useRowsPerPage, useSetRowsPerPage } from './RowsPerPageContext.js';

const getRowsPerPage = vi.mocked(ipc.setting.getRowsPerPage);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Consumer(): React.JSX.Element {
  const rowsPerPage = useRowsPerPage();
  return <p>rows: {rowsPerPage}</p>;
}

function ConsumerWithSetter(): React.JSX.Element {
  const rowsPerPage = useRowsPerPage();
  const setRowsPerPage = useSetRowsPerPage();
  return (
    <div>
      <p>rows: {rowsPerPage}</p>
      <button
        onClick={() => {
          setRowsPerPage(50);
        }}
      >
        Set 50
      </button>
    </div>
  );
}

/**
 * P17-3 (docs/phases/PHASE_17.md §2.5, §8). The one shared hook every
 * report/list table reads instead of its own local ROWS_PER_PAGE
 * constant.
 */
describe('useRowsPerPage / RowsPerPageProvider', () => {
  it('returns the default (10) when rendered outside any provider', () => {
    render(<Consumer />);

    expect(screen.getByText('rows: 10')).toBeTruthy();
  });

  it('resolves the value from setting:getRowsPerPage and re-renders the subscriber with it', async () => {
    getRowsPerPage.mockResolvedValue(25);

    render(
      <RowsPerPageProvider>
        <Consumer />
      </RowsPerPageProvider>,
    );

    expect(await screen.findByText('rows: 25')).toBeTruthy();
  });

  it('re-renders every subscriber immediately when the value changes — no reload (A17-4)', async () => {
    getRowsPerPage.mockResolvedValue(10);

    render(
      <RowsPerPageProvider>
        <ConsumerWithSetter />
        <Consumer />
      </RowsPerPageProvider>,
    );

    await screen.findAllByText('rows: 10');

    act(() => {
      screen.getByText('Set 50').click();
    });

    const updated = await screen.findAllByText('rows: 50');
    expect(updated).toHaveLength(2); // both subscribers picked up the change
  });
});
