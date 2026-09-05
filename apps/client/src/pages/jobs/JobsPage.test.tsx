// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    job: {
      list: vi.fn().mockResolvedValue([]),
      listTechnicians: vi.fn().mockResolvedValue([]),
    },
    customer: {
      get: vi.fn().mockResolvedValue(null),
    },
  },
}));

import JobsPage from './JobsPage.js';

afterEach(cleanup);

describe('JobsPage (P6-8 smoke test)', () => {
  it('renders the header and an empty state once job:list resolves with no jobs', async () => {
    render(<JobsPage />);

    expect(screen.getByText('Jobs')).toBeTruthy();
    expect(await screen.findByText('No jobs found.')).toBeTruthy();
  });
});
