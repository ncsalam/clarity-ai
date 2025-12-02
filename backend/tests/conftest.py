"""
Pytest configuration and fixtures for backend tests.

This module provides shared fixtures and configuration for all tests,
including proper event loop management for SuperTokens async operations.
"""

import pytest
import asyncio
import os
from unittest.mock import Mock, patch, MagicMock
from flask import Flask


# Configure pytest to handle async operations properly
@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()


@pytest.fixture(scope="function")
def app():
    """
    Create and configure a test Flask app instance.
    
    This fixture mocks SuperTokens initialization to avoid async issues
    and provides a clean app instance for each test.
    """
    # Create a mock middleware that does nothing
    class MockMiddleware:
        def __init__(self, app):
            pass
    
    # Mock database optimization module
    mock_query_monitor = MagicMock()
    mock_query_monitor.setup_monitoring = MagicMock()
    
    # Create a mock require_auth decorator that checks for test authentication header
    def mock_require_auth(permissions=None):
        def decorator(f):
            def wrapper(*args, **kwargs):
                from flask import g, request, jsonify
                
                # Check if test wants to simulate authentication
                auth_header = request.headers.get('X-Test-Auth')
                
                if auth_header == 'authenticated':
                    # Simulate authenticated user
                    g.user_id = request.headers.get('X-Test-User-ID', 'test_user_123')
                    return f(*args, **kwargs)
                elif auth_header is None:
                    # No test header - default to authenticated for backward compatibility
                    g.user_id = "test_user_123"
                    return f(*args, **kwargs)
                else:
                    # Explicitly unauthenticated
                    return jsonify({"error": "authentication_error", "message": "Authentication required"}), 401
                    
            wrapper.__name__ = f.__name__
            return wrapper
        return decorator
    
    # Mock SuperTokens before importing create_app
    with patch('app.auth_service.init_supertokens'), \
         patch('app.auth_service.init_roles_and_permissions'), \
         patch('app.auth_service.require_auth', mock_require_auth), \
         patch('supertokens_python.framework.flask.Middleware', MockMiddleware), \
         patch('supertokens_python.get_all_cors_headers', return_value=[]), \
         patch('app.database_optimization.configure_connection_pooling'), \
         patch('app.database_optimization.query_monitor', mock_query_monitor), \
         patch('app.main.get_database_uri', return_value="sqlite:///:memory:"):
        
        from app.main import create_app, db
        
        # Set environment to testing before creating app
        os.environ['FLASK_ENV'] = 'testing'
        
        app = create_app()
        app.config.update({
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SQLALCHEMY_TRACK_MODIFICATIONS": False,
            "WTF_CSRF_ENABLED": False,
        })
        
        # Remove the SuperTokens before_request handler that causes event loop issues
        if hasattr(app, 'before_request_funcs') and None in app.before_request_funcs:
            # Filter out SuperTokens middleware handlers
            app.before_request_funcs[None] = [
                func for func in app.before_request_funcs[None]
                if 'supertokens' not in str(func).lower() and 'middleware' not in str(func).lower()
            ]
        
        # Remove SuperTokens error handlers that cause initialization errors
        if hasattr(app, 'error_handler_spec') and None in app.error_handler_spec:
            if Exception in app.error_handler_spec[None]:
                # Filter out SuperTokens error handlers
                handlers = app.error_handler_spec[None][Exception]
                app.error_handler_spec[None][Exception] = {
                    k: v for k, v in handlers.items()
                    if 'supertokens' not in str(v).lower()
                }
        
        # Create tables
        with app.app_context():
            db.create_all()
            yield app
            db.session.remove()
            db.drop_all()


# Ensure every test runs inside an application context
@pytest.fixture(autouse=True)
def _global_app_context(app):
    with app.app_context():
        yield


@pytest.fixture(scope="function")
def client(app):
    """Create a test client for the app."""
    return app.test_client()


@pytest.fixture(scope="function")
def authenticated_client(app):
    """
    Create a test client with authentication enabled.
    Sets g.user_id for authenticated requests.
    """
    client = app.test_client()
    
    # Store original before_request handlers
    original_handlers = app.before_request_funcs.get(None, []).copy()
    
    # Add authentication handler
    def set_test_user():
        from flask import g
        g.user_id = "test_user_123"
    
    if None not in app.before_request_funcs:
        app.before_request_funcs[None] = []
    app.before_request_funcs[None].insert(0, set_test_user)
    
    yield client
    
    # Restore original handlers
    app.before_request_funcs[None] = original_handlers


@pytest.fixture(scope="function")
def runner(app):
    """Create a test CLI runner for the app."""
    return app.test_cli_runner()


@pytest.fixture
def mock_session():
    """Mock SuperTokens session for authenticated requests."""
    session = MagicMock()
    session.get_user_id.return_value = "test_user_123"
    session.get_access_token_payload.return_value = {
        "roles": ["core-user"],
        "permissions": ["api:core", "documents:read", "documents:write"]
    }
    return session


@pytest.fixture
def mock_admin_session():
    """Mock SuperTokens session for admin user."""
    session = MagicMock()
    session.get_user_id.return_value = "admin_user_123"
    session.get_access_token_payload.return_value = {
        "roles": ["admin"],
        "permissions": ["*"]
    }
    return session


@pytest.fixture
def mock_pilot_session():
    """Mock SuperTokens session for pilot user."""
    session = MagicMock()
    session.get_user_id.return_value = "pilot_user_123"
    session.get_access_token_payload.return_value = {
        "roles": ["pilot-user"],
        "permissions": ["api:basic", "documents:read"]
    }
    return session


@pytest.fixture(autouse=True)
def reset_supertokens():
    """Reset SuperTokens state between tests."""
    # This runs before each test
    yield
    # Cleanup after test
    pass


@pytest.fixture(autouse=True)
def mock_userroles():
    """Mock SuperTokens userroles functions to avoid API calls."""
    # Create a mock roles response
    mock_roles_response = MagicMock()
    mock_roles_response.roles = ["core-user"]
    
    # Create async mock function that can be overridden by tests
    async def mock_get_roles_for_user(user_id):
        return mock_roles_response
    
    # Mock at both app.session_utils and app.auth_service levels
    with patch('app.session_utils.userroles') as mock_ur_session, \
         patch('app.auth_service.userroles') as mock_ur_auth:
        mock_ur_session.get_roles_for_user = mock_get_roles_for_user
        mock_ur_auth.get_roles_for_user = mock_get_roles_for_user
        yield mock_ur_session


@pytest.fixture
def mock_supertokens_middleware():
    """Mock SuperTokens middleware to avoid async issues in tests."""
    with patch('supertokens_python.framework.flask.Middleware') as mock:
        yield mock


# Environment variable fixtures
@pytest.fixture(autouse=True)
def setup_test_env(monkeypatch):
    """Set up test environment variables."""
    test_env = {
        'FLASK_ENV': 'testing',
        'TESTING': 'True',
        'POSTGRES_USER': 'test_user',
        'POSTGRES_PASSWORD': 'test_password',
        'POSTGRES_HOST': 'localhost',
        'POSTGRES_PORT': '5432',
        'POSTGRES_DB': 'test_clarity_ai',
        'SUPERTOKENS_CONNECTION_URI': 'http://localhost:3567',
        'SUPERTOKENS_API_KEY': 'test_api_key',
        'APP_NAME': 'Clarity AI Test',
        'API_DOMAIN': 'http://localhost:5000',
        'WEBSITE_DOMAIN': 'http://localhost:5173',
    }
    
    for key, value in test_env.items():
        monkeypatch.setenv(key, value)
