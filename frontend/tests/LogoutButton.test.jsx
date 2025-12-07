import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LogoutButton from '../src/components/LogoutButton';
import { useAuth } from '../src/lib/auth-context.jsx';

// Mock the auth context
vi.mock('../src/lib/auth-context.jsx');

describe('LogoutButton', () => {
  const mockSignOut = vi.fn();

  beforeEach(() => {
    // Provide the mocked return value for useAuth
    useAuth.mockReturnValue({ signOut: mockSignOut });
    mockSignOut.mockReset();
  });

  it('renders with icon and text by default', () => {
    render(<LogoutButton />);
    expect(screen.getByText('🚪')).toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('renders only icon when showText=false', () => {
    render(<LogoutButton showText={false} />);
    expect(screen.getByText('🚪')).toBeInTheDocument();
    expect(screen.queryByText('Sign out')).toBeNull();
  });

  it('clicking button calls signOut and shows loading', async () => {
    mockSignOut.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 50)));
    render(<LogoutButton />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Loading state
    expect(screen.getByText('⏳')).toBeInTheDocument();
    expect(screen.getByText('Signing out...')).toBeInTheDocument();
    expect(button).toBeDisabled();

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('handles signOut failure gracefully', async () => {
    mockSignOut.mockRejectedValue(new Error('Logout failed'));
    render(<LogoutButton />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(screen.getByText('⏳')).toBeInTheDocument();
    expect(screen.getByText('Signing out...')).toBeInTheDocument();

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
