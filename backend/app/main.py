import os
import asyncio
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from dotenv import load_dotenv
from supertokens_python.framework.flask import Middleware
from supertokens_python import get_all_cors_headers
from supertokens_python.recipe.session.exceptions import (
    UnauthorisedError,
    InvalidClaimsError,
    TokenTheftError
)

load_dotenv()

# --- SuperTokens Configuration ---


def get_supertokens_config():
    """Get SuperTokens configuration from environment variables"""
    return {
        'connection_uri': os.getenv('SUPERTOKENS_CONNECTION_URI', 'https://try.supertokens.com'),
        'api_key': os.getenv('SUPERTOKENS_API_KEY'),
        'app_name': os.getenv('APP_NAME', 'Clarity AI'),
        'api_domain': os.getenv('API_DOMAIN', 'http://localhost:5000'),
        'website_domain': os.getenv('WEBSITE_DOMAIN', 'http://localhost:5173'),
        'session_timeout': int(os.getenv('SESSION_TIMEOUT', '3600')),
        'otp_expiry': int(os.getenv('OTP_EXPIRY', '600'))
    }


# --- Database Setup ---
db = SQLAlchemy()
migrate = Migrate()


def get_database_uri():
    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD", "")
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    dbname = os.getenv("POSTGRES_DB", "clarity_ai")

    # Handle password in URI
    password_part = f":{password}" if password else ""

    return f"postgresql://{user}{password_part}@{host}:{port}/{dbname}?options=-csearch_path%3Dpublic"

# --- App Factory ---


def create_app():
    app = Flask(__name__)

    # Set Flask configuration
    app.config["SQLALCHEMY_DATABASE_URI"] = get_database_uri()
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # Configure database connection pooling for optimal performance
    from .database_optimization import configure_connection_pooling
    configure_connection_pooling(app)

    # Set environment-specific configurations
    environment = os.getenv('FLASK_ENV', 'development')
    app.config['ENV'] = environment

    if environment == 'production':
        app.config['DEBUG'] = False
        app.config['TESTING'] = False
    else:
        app.config['DEBUG'] = True
        app.config['TESTING'] = False

    # Store SuperTokens configuration in app config for later use
    supertokens_config = get_supertokens_config()
    app.config.update(supertokens_config)

    # Initialize SuperTokens authentication service BEFORE other setup
    from .auth_service import init_supertokens, init_roles_and_permissions

    # Initialize SuperTokens with app configuration (skip in testing mode)
    if not app.config.get('TESTING', False):
        init_supertokens(supertokens_config)
        # Initialize SuperTokens middleware
        Middleware(app)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)

    # Set up query performance monitoring
    with app.app_context():
        from .database_optimization import query_monitor
        query_monitor.setup_monitoring(db.engine)

    # Configure CORS with SuperTokens support and enhanced settings
    cors_origins = [
        supertokens_config.get('website_domain', 'http://localhost:5173'),
        'http://localhost:5173',
        'http://localhost:3000',
    ]

    # Add additional allowed origins from environment if specified
    additional_origins = os.getenv('ADDITIONAL_CORS_ORIGINS', '')
    if additional_origins:
        cors_origins.extend([origin.strip()
                            for origin in additional_origins.split(',')])

    # Remove duplicates
    cors_origins = list(set(cors_origins))

    # Get SuperTokens CORS headers (empty list in testing mode)
    try:
        supertokens_headers = get_all_cors_headers() if not app.config.get('TESTING') else []
    except:
        supertokens_headers = []

    CORS(
        app,
        origins=cors_origins,
        allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept",
                       "Origin", "fdi-version", "rid", "anti-csrf"] + supertokens_headers,
        supports_credentials=True,
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        expose_headers=supertokens_headers,
        max_age=86400
    )

    # Add explicit OPTIONS handler for all routes
    @app.before_request
    def handle_preflight():
        if request.method == "OPTIONS":
            response = jsonify({})
            response.headers.add("Access-Control-Allow-Origin",
                                 request.headers.get('Origin', '*'))
            # Include SuperTokens specific headers
            allowed_headers = ["Content-Type", "Authorization", "X-Requested-With",
                               "Accept", "Origin", "fdi-version", "rid", "anti-csrf"] + supertokens_headers
            response.headers.add(
                'Access-Control-Allow-Headers', ", ".join(allowed_headers))
            response.headers.add('Access-Control-Allow-Methods',
                                 "GET, POST, PUT, DELETE, OPTIONS, PATCH")
            response.headers.add('Access-Control-Allow-Credentials', 'true')
            response.headers.add('Access-Control-Max-Age', '86400')
            return response

    # Add SuperTokens error handlers
    @app.errorhandler(UnauthorisedError)
    def handle_unauthorized(e):
        return jsonify({
            "error": "unauthorized",
            "message": "Authentication required"
        }), 401

    @app.errorhandler(InvalidClaimsError)
    def handle_invalid_claims(e):
        return jsonify({
            "error": "forbidden",
            "message": "Insufficient permissions",
            "details": {"invalid_claims": e.invalid_claims}
        }), 403

    @app.errorhandler(TokenTheftError)
    def handle_token_theft(e):
        return jsonify({
            "error": "token_theft",
            "message": "Session security violation detected"
        }), 401

    # Add security headers middleware
    @app.after_request
    def add_security_headers(response):
        from .session_security import add_security_headers_middleware
        return add_security_headers_middleware(response)

    # Add startup validation for SuperTokens configuration
    def validate_supertokens_config():
        """Validate SuperTokens configuration on startup."""
        required_config = ['connection_uri',
                           'app_name', 'api_domain', 'website_domain']
        missing_config = []

        for key in required_config:
            if not supertokens_config.get(key):
                missing_config.append(key)

        if missing_config:
            print(
                f"Warning: Missing SuperTokens configuration: {missing_config}")
            return False

        print("SuperTokens configuration validated successfully")
        return True

    # Validate configuration
    app.config['SUPERTOKENS_CONFIG_VALID'] = validate_supertokens_config()

    # Initialize roles and permissions on startup with enhanced error handling
    def initialize_supertokens_roles():
        """Initialize SuperTokens roles and permissions."""
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(init_roles_and_permissions())
            loop.close()
            app.config['SUPERTOKENS_INITIALIZED'] = True
            return True
        except Exception as e:
            print(
                f"Note: SuperTokens roles not initialized - using local role configuration")
            print("This is normal if UserRoles recipe is not enabled in SuperTokens Core")
            app.config['SUPERTOKENS_INITIALIZED'] = False
            return False

    # Try to initialize roles and permissions immediately
    initialize_supertokens_roles()

    # Add a route to manually trigger role initialization if needed
    @app.route('/api/admin/init-roles', methods=['POST'])
    def manual_role_initialization():
        """Manually trigger SuperTokens role initialization (admin only)."""
        if initialize_supertokens_roles():
            return jsonify({
                "message": "SuperTokens roles and permissions initialized successfully",
                "timestamp": datetime.utcnow().isoformat()
            })
        else:
            return jsonify({
                "error": "Failed to initialize SuperTokens roles and permissions",
                "timestamp": datetime.utcnow().isoformat()
            }), 500

    with app.app_context():
        # Import models so Alembic can see them
        from . import models

        from . import routes
        app.register_blueprint(routes.api_bp)

    return app
