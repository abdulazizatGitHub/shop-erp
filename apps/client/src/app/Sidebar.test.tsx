// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar.js';

vi.mock('../lib/ipc.js', () => ({
  ipc: {
    setting: {
      getShopName: vi.fn().mockResolvedValue('Shop ERP'),
    },
  },
}));

afterEach(cleanup);

describe('Sidebar — P11-1 Reports expandable nav group', () => {
  it('renders "Daily Reports" and "Accounts" sub-items when the Reports group is expanded (200px sidebar)', () => {
    // Sidebar defaults to its 56px width and the Reports group's own
    // disclosure defaults to closed — arriving on the Reports tab
    // auto-opens the disclosure, and the sidebar itself starts expanded
    // only when localStorage says so. This test asserts the sub-items
    // exist once both are true, which is exactly the state the owner
    // sees the first time they land on a Reports tab with a wide sidebar.
    localStorage.setItem('sidebar-expanded', 'true');
    localStorage.setItem('sidebar-reports-expanded', 'true');

    render(
      <Sidebar
        activeTab="reports"
        onSelectTab={() => {}}
        activeReportsGroup="daily"
        onSelectReportsGroup={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Daily Reports' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accounts' })).toBeTruthy();

    localStorage.clear();
  });

  it('does not show sub-item labels when the sidebar is in 56px collapsed mode', () => {
    localStorage.setItem('sidebar-expanded', 'false');
    localStorage.setItem('sidebar-reports-expanded', 'true');

    render(
      <Sidebar
        activeTab="reports"
        onSelectTab={() => {}}
        activeReportsGroup="daily"
        onSelectReportsGroup={() => {}}
      />,
    );

    // Collapsed mode's flyout is JS-driven (opens on hover/focus), so
    // absent any interaction the sub-item labels must be genuinely missing
    // from the DOM, not just CSS-hidden.
    expect(screen.queryByText('Daily Reports')).toBeNull();
    expect(screen.queryByText('Accounts')).toBeNull();

    localStorage.clear();
  });
});
