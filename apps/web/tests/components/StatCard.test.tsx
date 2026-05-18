import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatCard } from '../../src/components/StatCard';

describe('StatCard', () => {
  it('renders label, value, and hint', () => {
    render(<StatCard label="Agents" value={42} hint="active and healthy" />);
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('active and healthy')).toBeInTheDocument();
  });

  it('skips hint when not provided', () => {
    render(<StatCard label="Spans" value="—" />);
    expect(screen.getByText('Spans')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('active')).not.toBeInTheDocument();
  });
});
