// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Badge } from './Badge.js';

afterEach(cleanup);

describe('Badge', () => {
  it('renders every tone without crashing', () => {
    const tones = ['neutral', 'brand', 'success', 'warning', 'danger'] as const;
    for (const tone of tones) {
      const { getByText, unmount } = render(<Badge tone={tone}>Credit</Badge>);
      expect(getByText('Credit')).toBeTruthy();
      unmount();
    }
  });
});
