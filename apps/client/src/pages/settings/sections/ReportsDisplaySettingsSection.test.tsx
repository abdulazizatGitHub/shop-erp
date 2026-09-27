// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/ipc.js', () => ({
  ipc: {
    setting: {
      getRowsPerPage: vi.fn(),
      setRowsPerPage: vi.fn(),
    },
  },
}));

import { ipc } from '../../../lib/ipc.js';
import { RowsPerPageProvider, useRowsPerPage } from '../../../context/RowsPerPageContext.js';
import { SettingsSectionFrame } from '../SettingsSectionFrame.js';
import { ReportsDisplaySettingsSection } from './ReportsDisplaySettingsSection.js';

const getRowsPerPage = vi.mocked(ipc.setting.getRowsPerPage);
const setRowsPerPage = vi.mocked(ipc.setting.setRowsPerPage);

function OpenTableStandIn(): React.JSX.Element {
  const rowsPerPage = useRowsPerPage();
  return <p>open table rows: {rowsPerPage}</p>;
}

function renderInFrame(): ReturnType<typeof render> {
  return render(
    <RowsPerPageProvider>
      <SettingsSectionFrame title="Display" description="">
        <ReportsDisplaySettingsSection />
      </SettingsSectionFrame>
      <OpenTableStandIn />
    </RowsPerPageProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ReportsDisplaySettingsSection (P17-3, docs/phases/PHASE_17.md §2.5/§8)', () => {
  it('loads the current setting and shows it selected', async () => {
    getRowsPerPage.mockResolvedValue(25);

    renderInFrame();

    expect(await screen.findByText('open table rows: 25')).toBeTruthy();
    expect(screen.getByText('Save').hasAttribute('disabled')).toBe(true);
  });

  it('choosing 50 and saving calls setRowsPerPage and updates every open table live, no reload', async () => {
    getRowsPerPage.mockResolvedValue(10);
    setRowsPerPage.mockResolvedValue(undefined);

    renderInFrame();
    await screen.findByText('open table rows: 10');

    fireEvent.click(screen.getByRole('button', { name: '50' }));
    expect(screen.getByText('Save').hasAttribute('disabled')).toBe(false);

    fireEvent.click(screen.getByText('Save'));

    await screen.findByText('Rows per page saved.');
    expect(setRowsPerPage).toHaveBeenCalledWith({ value: 50 });
    // The other, already-mounted "table" picked up 50 immediately.
    expect(screen.getByText('open table rows: 50')).toBeTruthy();
  });

  it('a fresh DB (getRowsPerPage resolves 10) shows 10 already selected, Save disabled', async () => {
    getRowsPerPage.mockResolvedValue(10);

    renderInFrame();

    await screen.findByText('open table rows: 10');
    expect(screen.getByRole('button', { name: '10' }).getAttribute('class')).toContain('bg-brand');
    expect(screen.getByText('Save').hasAttribute('disabled')).toBe(true);
  });
});
