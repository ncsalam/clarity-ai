// AccessControl.test.jsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AccessControl, { useAccessControl } from '../src/components/AccessControl.jsx';
import { vi } from 'vitest';

// Mock the auth context
vi.mock('../src/lib/auth-context.jsx', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../src/lib/auth-context.jsx';

describe('AccessControl Component', () => {
  const ChildComponent = () => <div>Protected Content</div>;
  const FallbackComponent = () => <div>Access Denied</div>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders children when access is granted', async () => {
    useAuth.mockReturnValue({
      isAccessGranted: vi.fn().mockResolvedValue(true),
      hasRole: vi.fn().mockResolvedValue(true),
      isPilotUser: true,
      isAuthenticated: true,
      loading: false,
    });

    render(
      <AccessControl
        children={<ChildComponent />}
        fallback={<FallbackComponent />}
        permissions={['read']}
      />
    );

    expect(await screen.findByText('Protected Content')).toBeInTheDocument();
  });

  test('renders fallback when access is denied due to missing permission', async () => {
    useAuth.mockReturnValue({
      isAccessGranted: vi.fn().mockResolvedValue(false),
      hasRole: vi.fn().mockResolvedValue(true),
      isPilotUser: true,
      isAuthenticated: true,
      loading: false,
    });

    render(
      <AccessControl
        children={<ChildComponent />}
        fallback={<FallbackComponent />}
        permissions={['write']}
      />
    );

    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });

  test('denies access if admin role is required but user is not admin', async () => {
    useAuth.mockReturnValue({
      isAccessGranted: vi.fn().mockResolvedValue(true),
      hasRole: vi.fn().mockImplementation(async (role) => role === 'admin' ? false : true),
      isPilotUser: true,
      isAuthenticated: true,
      loading: false,
    });

    render(
      <AccessControl
        children={<ChildComponent />}
        fallback={<FallbackComponent />}
        requireAdmin={true}
      />
    );

    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });

  test('denies access if pilot is required but user is not pilot', async () => {
    useAuth.mockReturnValue({
      isAccessGranted: vi.fn().mockResolvedValue(true),
      hasRole: vi.fn().mockResolvedValue(true),
      isPilotUser: false,
      isAuthenticated: true,
      loading: false,
    });

    render(
      <AccessControl
        children={<ChildComponent />}
        fallback={<FallbackComponent />}
        requirePilot={true}
      />
    );

    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });

  test('handles unauthenticated users', async () => {
    useAuth.mockReturnValue({
      isAccessGranted: vi.fn(),
      hasRole: vi.fn(),
      isPilotUser: false,
      isAuthenticated: false,
      loading: false,
    });

    render(
      <AccessControl
        children={<ChildComponent />}
        fallback={<FallbackComponent />}
      />
    );

    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });

  test('handles errors in permission checks gracefully', async () => {
    useAuth.mockReturnValue({
      isAccessGranted: vi.fn().mockRejectedValue(new Error('Failed')),
      hasRole: vi.fn().mockRejectedValue(new Error('Failed')),
      isPilotUser: true,
      isAuthenticated: true,
      loading: false,
    });

    render(
      <AccessControl
        children={<ChildComponent />}
        fallback={<FallbackComponent />}
        permissions={['read']}
      />
    );

    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });
});

// Optional: Test the hook separately
describe('useAccessControl Hook', () => {
  test('returns hasAccess true for granted permissions', async () => {
    useAuth.mockReturnValue({
      isAccessGranted: vi.fn().mockResolvedValue(true),
      hasRole: vi.fn().mockResolvedValue(true),
      isPilotUser: true,
      isAuthenticated: true,
      loading: false,
    });

    const TestComponent = () => {
      const { hasAccess, isChecking } = useAccessControl({ permissions: ['read'] });
      return (
        <div>
          <span data-testid="access">{hasAccess.toString()}</span>
          <span data-testid="checking">{isChecking.toString()}</span>
        </div>
      );
    };

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('access').textContent).toBe('true');
      expect(screen.getByTestId('checking').textContent).toBe('false');
    });
  });
});
