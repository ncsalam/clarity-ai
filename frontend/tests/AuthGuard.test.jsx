// AuthGuard.test.jsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AuthGuard from '../src/components/AuthGuard';
import { useAuth } from '../src/lib/auth-context';

vi.mock('../src/lib/auth-context');

const LoadingChild = () => <div>Protected Content</div>;

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading spinner when loading', () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      loading: true,
      user: null,
      isProfileComplete: () => false,
      validateAndRefreshSession: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AuthGuard>
          <LoadingChild />
        </AuthGuard>
      </MemoryRouter>
    );

    expect(screen.getByText(/Initializing/i)).toBeInTheDocument();
  });

  it('renders children for public routes if requireAuth=false', () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      loading: false,
      user: null,
      validateAndRefreshSession: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AuthGuard requireAuth={false}>
          <div>Public Content</div>
        </AuthGuard>
      </MemoryRouter>
    );

    expect(screen.getByText('Public Content')).toBeInTheDocument();
  });

  it('redirects unauthenticated user to /login for protected route', async () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      loading: false,
      user: null,
      validateAndRefreshSession: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <AuthGuard>
                <div>Protected</div>
              </AuthGuard>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(container.textContent).toContain('Login Page');
    });
  });

  it('renders children if authenticated and has access', async () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { id: 1 },
      isProfileComplete: () => true,
      validateAndRefreshSession: vi.fn(),
      isAccessGranted: vi.fn().mockResolvedValue(true),
      hasRole: vi.fn().mockResolvedValue(true),
      canAccessRoute: vi.fn().mockResolvedValue(true),
    });

    render(
      <MemoryRouter>
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('redirects user with incomplete profile to /login?step=profile', async () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { id: 1 },
      isProfileComplete: () => false,
      validateAndRefreshSession: vi.fn(),
      isAccessGranted: vi.fn().mockResolvedValue(true),
      hasRole: vi.fn().mockResolvedValue(true),
      canAccessRoute: vi.fn().mockResolvedValue(true),
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <AuthGuard>
                <div>Dashboard</div>
              </AuthGuard>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(container.textContent).toContain('Login Page');
    });
  });
});
