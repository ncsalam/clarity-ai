[![DOI](https://zenodo.org/badge/1080501217.svg)](https://doi.org/10.5281/zenodo.17547339)  [![CI Pipeline](https://github.com/Aum3010/ncsu-csc510-2025-s1-g3-clarity-ai/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Aum3010/ncsu-csc510-2025-s1-g3-clarity-ai/actions/workflows/ci.yml)  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)


# 💡 Clarity AI: Intelligent Requirements Analysis

Clarity AI is a full-stack application that leverages Large Language Models (LLMs) and Retrieval-Augmented Generation (RAG) to transform unstructured discussions (like meeting transcripts or raw feature ideas) into structured, high-quality software requirements, user stories, and acceptance criteria.

We aim to eliminate ambiguity and contradictions in the planning phase, enabling development teams to build the right software with confidence.

TL;DR  - This is what we wished we had when we made it, so we made it for everyone to use!

## Demo Video

[![Watch the video!](https://img.youtube.com/vi/_zeJ2iY12UA/0.jpg)](https://youtu.be/_zeJ2iY12UA)

## 🚀 Tech Stack

Clarity AI is a microservices application running via Docker Compose.

* **Backend (API & AI Core):** Python 3.11, Flask, SQLAlchemy, Pydantic.
* **Database (Persistence & Vector DB):** PostgreSQL with the `pgvector` extension for RAG context storage.
* **Frontend (UI):** Node.js, React, and Vite.
* **Authentication:** SuperTokens.

## Features
- **Passwordless Authentication**: Email-based OTP login powered by SuperTokens
- **User Profile Management**: Complete user profiles with role-based access control
- **Document Management**: Upload and manage project documents
- **AI-Powered Requirements**: Generate structured requirements from unstructured documents
- **Dashboard**: Overview of project requirements and documents
- **RAG-based Analysis**: Uses Retrieval-Augmented Generation to reduce the risk of LLM hallucinations.
- **Ambiguity Detection**: Identifies ambiguous statements within requirements and flags it for the user.
- **Contradiction Identification**: Identifies pairs of contradicting requirements and flags it for the user.

## Made by NCSU CSC-510 Section 001 Group 3
- Aum Pandya
- Pranav Bhagwat
- Tayo Olukotun

## Updated by NCSU CSC-510 Section 001 Group 23
- Elliot Rezek
- Nathan Chacko
- Noah Salam
- William Jackson

# Repo Information

## Project Structure

This repository is a monorepo containing:

* `/backend` : The Python (Flask) API, database logic, LLM processing, and SuperTokens authentication.
* `/frontend` : The React user interface with SuperTokens passwordless authentication.
* `/backend/tests` : Test suite for evaluating the frontend and backend features.


# Quick Start Guide (Recommended)

The easiest way to run the application is using Docker Compose:

```bash
# Clone the repository
git https://github.com/ncsalam/clarity-ai.git
cd clarity-ai

# Copy environment file
cp .env.example .env

# Edit .env file with your configuration (see Environment Variables section below)
# This isn't necessary right away to get the app to start.

# Start all services (backend, frontend, database, SuperTokens)
docker compose up

```
Finally, you'll have to initialize the database. In a separate terminal, run:
```bash
docker compose exec backend flask db upgrade
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- SuperTokens Core: http://localhost:3567

---

# Manual Setup

**NOTE:** manual setup instructions have not been updated and may not be functional.

Refer [INSTALL.md](docs/INSTALL.md) for details.

# Troubleshooting

## Backend Issues
- **Database connection errors**: Ensure PostgreSQL is running and credentials in `.env` are correct
- **SuperTokens errors**: Make sure SuperTokens Core is running on port 3567
- **Migration errors**: Run `flask db upgrade` to apply latest migrations

## Frontend Issues
- **CORS errors**: Verify `VITE_SUPERTOKENS_API_DOMAIN` matches your backend URL
- **Authentication errors**: Check that SuperTokens Core is accessible
- **Build errors**: Delete `node_modules` and run `npm install` again

## Docker Issues
- **Port conflicts**: Ensure ports 5000, 5173, 5432, and 3567 are available
- **Container errors**: Run `docker compose down -v` to clean up and restart

# Development Processes

## Running Tests
```bash
cd backend
python -m pytest
```

## Database Migrations
```bash
# Create a new migration
flask db migrate -m "Description of changes"

# Apply migrations
flask db upgrade

# Rollback last migration
flask db downgrade
```

## Code Structure
- `backend/app/routes.py`: API endpoints
- `backend/app/auth_service.py`: SuperTokens authentication logic
- `backend/app/models.py`: Database models
- `frontend/src/lib/auth-context.jsx`: Authentication state management
- `frontend/src/lib/supertokens-config.js`: SuperTokens frontend configuration

# Continuous Integration (CI)

This project uses **GitHub Actions** for automated testing and code quality checks. The CI pipeline runs automatically on every push and pull request to ensure code quality and catch issues early.

## What Gets Tested

The CI pipeline runs two parallel jobs:

#### Frontend Tests
- **Linting**: ESLint checks for code quality and style issues
- **Unit Tests**: Vitest runs all frontend tests
- **Build Verification**: Vite build ensures the application compiles successfully

#### Backend Tests
- **Unit & Integration Tests**: Pytest runs all backend tests with a real PostgreSQL database
- **Database Migrations**: Verifies migrations run successfully
- **Syntax Verification**: Checks Python syntax on main application files

### When CI Runs

- **On Push**: Every time you push code to any branch
- **On Pull Request**: When PRs are opened, updated, or reopened
- **Manual Trigger**: Can be run manually from the Actions tab

### Viewing CI Results

1. **In Pull Requests**: Status checks appear at the bottom of the PR
   - ✅ Green checkmark = All tests passed
   - ❌ Red X = One or more tests failed
   - 🟡 Yellow dot = Tests are running

2. **In the Actions Tab**: Click "Actions" in the repository to see all workflow runs
   - View detailed logs for each job
   - See which specific tests failed
   - Check execution time and performance

3. **Status Badges**: Check the workflow status at the top of the repository

### Interpreting CI Failures

If your CI pipeline fails, follow these steps:

1. **Click on the failed check** in your PR to view the logs
2. **Identify which job failed**: Frontend or Backend
3. **Read the error message** in the logs
4. **Run tests locally** to reproduce the issue:
   ```bash
   # Frontend
   cd frontend
   npm run lint    # Check linting errors
   npm run test    # Run tests
   npm run build   # Verify build

   # Backend
   cd backend
   pytest -v       # Run tests with verbose output
   ```
5. **Fix the issue** and push your changes
6. **CI will automatically re-run** on the new commit

### Common CI Issues and Solutions

### Frontend Issues

**Linting Errors**
```bash
# Problem: ESLint found code style issues
# Solution: Run ESLint locally and fix issues
cd frontend
npm run lint

# Auto-fix many issues
npm run lint -- --fix
```

**Test Failures**
```bash
# Problem: Frontend tests are failing
# Solution: Run tests locally to debug
cd frontend
npm run test

# Run specific test file
npm run test -- path/to/test-file.test.js
```

**Build Failures**
```bash
# Problem: Vite build is failing
# Solution: Run build locally to see errors
cd frontend
npm run build

# Common causes:
# - TypeScript errors
# - Missing dependencies
# - Import path issues
```

### Backend Issues

**Test Failures**
```bash
# Problem: Backend tests are failing
# Solution: Run pytest locally with verbose output
cd backend
pytest -v

# Run specific test file
pytest tests/test_specific.py -v

# Run with print statements visible
pytest -v -s
```

**Database Migration Errors**
```bash
# Problem: Migrations are failing in CI
# Solution: Test migrations locally
cd backend
flask db upgrade

# If migrations are out of sync
flask db downgrade
flask db upgrade
```

**Import/Syntax Errors**
```bash
# Problem: Python syntax errors
# Solution: Check syntax locally
cd backend
python -m py_compile app/main.py

# Or use a linter
flake8 app/
```

### Service Container Issues

**PostgreSQL Connection Errors**
- CI uses a PostgreSQL service container
- If tests fail with connection errors, the health check may have failed
- Check the "Wait for PostgreSQL" step in the logs

**SuperTokens Connection Errors**
- CI uses a SuperTokens service container
- If auth tests fail, check the "Wait for SuperTokens" step
- SuperTokens takes longer to start (up to 30 seconds)

## Performance

The CI pipeline is optimized for speed:
- **Parallel Jobs**: Frontend and backend tests run simultaneously
- **Dependency Caching**: npm and pip dependencies are cached
- **Typical Runtime**: 3-5 minutes for most changes
- **Cache Hit**: ~30 seconds faster with cached dependencies

## Required Status Checks

Before merging a pull request:
- ✅ Frontend Tests must pass
- ✅ Backend Tests must pass
- ✅ All linting checks must pass
- ✅ Build verification must succeed

These checks are enforced by branch protection rules on the `main` branch.

## Running CI Locally

To run the same checks locally before pushing:

```bash
# Frontend checks
cd frontend
npm ci                 # Clean install (like CI)
npm run lint          # Linting
npm run test          # Tests
npm run build         # Build

# Backend checks
cd backend
pip install -r requirements.txt
pytest -v             # Tests
python -m py_compile app/main.py  # Syntax check
```

## CI Configuration

The CI pipeline is defined in `.github/workflows/ci.yml`. Key features:

- **Concurrency Control**: Cancels outdated workflow runs when new commits are pushed
- **Caching**: Speeds up runs by caching dependencies
- **Service Containers**: Provides PostgreSQL and SuperTokens for integration tests
- **Status Reporting**: Posts detailed results to pull requests
- **Secrets & Variables**: Uses GitHub repository secrets and variables for configuration

### Required GitHub Secrets

Configure these in **Repository Settings > Secrets and variables > Actions > Secrets**:

**SuperTokens Database:**
| Secret Name | Description | Default (if not set) |
|------------|-------------|---------------------|
| `CI_SUPERTOKENS_POSTGRES_USER` | PostgreSQL username for SuperTokens database | `supertokens_user` |
| `CI_SUPERTOKENS_POSTGRES_PASSWORD` | PostgreSQL password for SuperTokens database | `supertokens_password` |
| `CI_SUPERTOKENS_POSTGRES_DB` | PostgreSQL database name for SuperTokens | `supertokens` |

**Application Database:**
| Secret Name | Description | Default (if not set) |
|------------|-------------|---------------------|
| `CI_APP_POSTGRES_USER` | PostgreSQL username for application database | `test_user` |
| `CI_APP_POSTGRES_PASSWORD` | PostgreSQL password for application database | `test_password` |
| `CI_APP_POSTGRES_DB` | PostgreSQL database name for application | `test_clarity_ai` |

**Authentication:**
| Secret Name | Description | Default (if not set) |
|------------|-------------|---------------------|
| `CI_SUPERTOKENS_API_KEY` | SuperTokens API key for CI tests | `test_api_key` |

**External Services (Optional):**
| Secret Name | Description | When to Set |
|------------|-------------|-------------|
| `OPENAI_API_KEY` | OpenAI API key | Only if testing RAG features with real API (tests use mocks by default) |
| `LANGCHAIN_API_KEY` | LangChain API key | Only if using LangChain tracing in tests (rarely needed) |

### Required GitHub Variables

Configure these in **Repository Settings > Secrets and variables > Actions > Variables**:

| Variable Name | Description | Default (if not set) |
|--------------|-------------|---------------------|
| `CI_APP_NAME` | Application name for tests | `Clarity AI Test` |
| `CI_API_DOMAIN` | Backend API domain | `http://localhost:5000` |
| `CI_WEBSITE_DOMAIN` | Frontend domain | `http://localhost:5173` |
| `CI_NODE_VERSION` | Node.js version to use | `20.x` |
| `CI_PYTHON_VERSION` | Python version to use | `3.11` |

**Note**: The workflow includes fallback defaults for all secrets and variables, so it will work out of the box. Configure custom values only if you need different settings.

For detailed setup instructions, see [.github/CI_SETUP.md](.github/CI_SETUP.md).

For more details about the workflow, see the workflow file comments.

# Contributing

Refer [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)

# Code of Conduct

Refer [docs/CODE_OF_CONDUCT.md](docs/CODE_OF_CONDUCT.md)

# License

This project is [MIT-licensed](LICENSE).
It was created as a part of the CSC-510 coursework at North Carolina State University, Raleigh, USA.
