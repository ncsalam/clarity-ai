// AuthWrapper.test.jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AuthWrapper from '../src/components/AuthWrapper';
import { useAuth } from '../src/lib/auth-context';

vi.mock('../src/lib/auth-context');

describe('AuthWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const child = <div>Protected Content</div>;

  it('renders loading spinner when loading', () => {
    useAuth.mockReturnValue({
      loading: true,
      isAuthenticated: false,
      validateAndRefreshSession: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AuthWrapper>{child}</AuthWrapper>
      </MemoryRouter>
    );

    expect(screen.getByText(/Initializing/i)).toBeInTheDocument();
  });

  it('renders children for public route', () => {
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: false,
      user: null,
      validateAndRefreshSession: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AuthWrapper authConfig={{ requireAuth: false }}>{child}</AuthWrapper>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('denies access for unauthenticated user', async () => {
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: false,
      validateAndRefreshSession: vi.fn().mockResolvedValue(false),
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<AuthWrapper>{child}</AuthWrapper>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  it('grants access when authenticated and permissions/roles satisfied', async () => {
    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      user: { id: 1 },
      isProfileComplete: () => true,
      validateAndRefreshSession: vi.fn().mockResolvedValue(true),
      isAccessGranted: vi.fn().mockResolvedValue(true),
      hasRole: vi.fn().mockResolvedValue(true),
      canAccessRoute: vi.fn().mockResolvedValue(true),
      isPilotUser: true,
    });

    render(
      <MemoryRouter>
        <AuthWrapper authConfig={{ permissions: ['read'], roles: ['admin'] }}>
          {child}
        </AuthWrapper>
      </MemoryRouter>
    );

    expect(await screen.findByText('Protected Content')).toBeInTheDocument();
  });

  it('renders fallback when access denied', async () => {
    const fallback = <div>Access Denied</div>;

    useAuth.mockReturnValue({
      loading: false,
      isAuthenticated: true,
      user: { id: 1 },
      isProfileComplete: () => true,
      validateAndRefreshSession: vi.fn().mockResolvedValue(true),
      isAccessGranted: vi.fn().mockResolvedValue(false),
      hasRole: vi.fn().mockResolvedValue(false),
      canAccessRoute: vi.fn().mockResolvedValue(false),
      isPilotUser: true,
    });

    render(
      <MemoryRouter>
        <AuthWrapper fallback={fallback}>{child}</AuthWrapper>
      </MemoryRouter>
    );

    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });
});
