import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Sidebar from '../src/components/Sidebar';
import * as AuthContext from '../src/lib/auth-context.jsx';
import { describe, beforeEach, test, vi, expect } from 'vitest';

const mockUser = {
  email: 'test@example.com',
  metadata: { first_name: 'John', last_name: 'Doe' }
};

describe('Sidebar', () => {
  let isAccessGrantedMock;
  let hasRoleMock;

  beforeEach(() => {
    isAccessGrantedMock = vi.fn();
    hasRoleMock = vi.fn();

    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: mockUser,
      isAccessGranted: isAccessGrantedMock,
      isPilotUser: true,
      hasRole: hasRoleMock,
    });
  });

  test('renders header, user info, and logout button', async () => {
    isAccessGrantedMock.mockResolvedValue(true);
    hasRoleMock.mockResolvedValue(true);

    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Clarity')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
      expect(screen.getByText('Pilot User')).toBeInTheDocument();
      expect(screen.getByText('Sign out')).toBeInTheDocument();
    });
  });


  test('shows badges for pilot and admin views', async () => {
    isAccessGrantedMock.mockResolvedValue(true);
    hasRoleMock.mockResolvedValue(true);

    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );

    await waitFor(() => {
      // Beta Features badge (pilot)
      const betaFeaturesLink = screen.getByText('Beta Features').closest('a');
      expect(betaFeaturesLink.querySelector('span.ml-auto')).toHaveTextContent('Beta');

      // Team badge (admin)
      const teamLink = screen.getByText('Team').closest('a');
      expect(teamLink.querySelector('span.ml-auto')).toHaveTextContent('Admin');
    });
  });

  test('renders nothing for nav links if no user', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: null,
      isAccessGranted: isAccessGrantedMock,
      isPilotUser: false,
      hasRole: hasRoleMock,
    });

    render(
      <BrowserRouter>
        <Sidebar />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.queryByRole('link')).toBeNull();
    });
  });
});
