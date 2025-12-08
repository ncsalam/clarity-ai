import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth-context.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';

const AuthGuard = ({ 
  children, 
  requireAuth = true, 
  requireCompleteProfile = true,
  redirectTo = null,
  permissions = [],
  roles = []
}) => {
  const location = useLocation();
  const { 
    isAuthenticated, 
    user, 
    loading, 
    isProfileComplete,
    validateAndRefreshSession,
    isAccessGranted,
    hasRole,
    canAccessRoute
  } = useAuth();

  const [authValidating, setAuthValidating] = useState(false);
  const [permissionValidating, setPermissionValidating] = useState(false);
  const [hasAccess, setHasAccess] = useState(null);

  // Enhanced authentication status validation with session refresh
  useEffect(() => {
    const validateAuth = async () => {
      if (loading) return; // Wait for initial auth loading to complete
      
      setAuthValidating(true);
      try {
        // If user is already authenticated, trust the auth context state
        if (isAuthenticated || !requireAuth) {
          setHasAccess(true);
        } else if (requireAuth) {
          // Only validate session if not authenticated but auth is required
          const sessionValid = await validateAndRefreshSession();
          setHasAccess(sessionValid);
        }
      } catch (error) {
        console.error('Error validating authentication:', error);
        setHasAccess(false);
      } finally {
        setAuthValidating(false);
      }
    };

    validateAuth();
  }, [loading, isAuthenticated, requireAuth, validateAndRefreshSession]);

  // Permission and role validation for authenticated users
  useEffect(() => {
    const validatePermissions = async () => {
      if (!isAuthenticated || !requireAuth) return;
      
      setPermissionValidating(true);
      try {
        // Check permissions if specified
        if (permissions.length > 0) {
          const hasPermissions = await isAccessGranted(permissions);
          if (!hasPermissions) {
            setHasAccess(false);
            return;
          }
        }

        // Check roles if specified
        if (roles.length > 0) {
          const roleChecks = await Promise.all(
            roles.map(role => hasRole(role))
          );
          const hasRequiredRole = roleChecks.some(hasRole => hasRole);
          if (!hasRequiredRole) {
            setHasAccess(false);
            return;
          }
        }

        // Check route-specific access if available
        const routeName = location.pathname.substring(1) || 'overview';
        const canAccess = await canAccessRoute(routeName);
        setHasAccess(canAccess);
      } catch (error) {
        console.error('Error validating permissions:', error);
        setHasAccess(false);
      } finally {
        setPermissionValidating(false);
      }
    };

    if (hasAccess === true && isAuthenticated) {
      validatePermissions();
    }
  }, [
    isAuthenticated, 
    hasAccess, 
    permissions, 
    roles, 
    location.pathname,
    isAccessGranted,
    hasRole,
    canAccessRoute,
    requireAuth
  ]);

  // Show loading states during authentication verification
  if (loading || authValidating || permissionValidating || hasAccess === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LoadingSpinner size="xl" />
          <p className="mt-4 text-gray-600">
            {loading && "Initializing..."}
            {authValidating && "Validating session..."}
            {permissionValidating && "Checking permissions..."}
            {hasAccess === null && !loading && !authValidating && !permissionValidating && "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  // Public routes that don't require authentication
  if (!requireAuth) {
    // If user is already authenticated and trying to access login, handle automatic redirects
    if (isAuthenticated && location.pathname === '/login') {
      // Only redirect if user has complete profile - let LoginPage handle profile completion internally
      if (user && isProfileComplete(user)) {
        return <Navigate to="/overview" replace />;
      }
      // For incomplete profiles, let LoginPage handle the step management internally
    }
    return children;
  }

  // Protected routes that require authentication
  if (!isAuthenticated || hasAccess === false) {
    // Determine redirect destination
    const redirectDestination = redirectTo || '/login';
    
    // Save the attempted location for redirect after login
    const state = location.pathname !== '/login' ? { from: location } : undefined;
    
    return <Navigate to={redirectDestination} state={state} replace />;
  }

  // Profile completion checking for authenticated users
  if (requireCompleteProfile && user && !isProfileComplete(user)) {
    // Allow access to profile completion step
    if (location.pathname === '/login' && location.search.includes('step=profile')) {
      return children;
    }
    
    // Redirect to profile completion with current location saved
    const profileCompletionUrl = '/login?step=profile';
    const state = location.pathname !== '/login' ? { from: location } : undefined;
    
    return <Navigate to={profileCompletionUrl} state={state} replace />;
  }

  // All checks passed - render protected content
  return children;
};

export default AuthGuard;