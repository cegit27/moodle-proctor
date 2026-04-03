#!/bin/bash

# ============================================================================
# Moodle-Proctor Complete Setup and Test Runner
# Automated setup for development and testing
# ============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# ============================================================================
# PREREQUISITE CHECKS
# ============================================================================

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version | sed 's/v//')
        log_success "Node.js $NODE_VERSION found"
    else
        log_error "Node.js is not installed. Please install Node.js 22+"
        exit 1
    fi

    # Check npm
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        log_success "npm $NPM_VERSION found"
    else
        log_error "npm is not installed"
        exit 1
    fi

    # Check Python
    if command -v python &> /dev/null; then
        PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
        log_success "Python $PYTHON_VERSION found"
    else
        log_error "Python is not installed. Please install Python 3.11+"
        exit 1
    fi

    # Check PostgreSQL
    if command -v psql &> /dev/null; then
        PSQL_VERSION=$(psql --version | head -n1 | awk '{print $3}')
        log_success "PostgreSQL $PSQL_VERSION found"
    else
        log_error "PostgreSQL is not installed. Please install PostgreSQL 15+"
        exit 1
    fi

    # Check Docker (optional for local development)
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version | awk '{print $3}' | sed 's/,//')
        log_success "Docker $DOCKER_VERSION found"
        DOCKER_AVAILABLE=true
    else
        log_warning "Docker not found. Containerized testing will be skipped."
        DOCKER_AVAILABLE=false
    fi

    log_success "All prerequisites met!"
}

# ============================================================================
# DATABASE SETUP
# ============================================================================

setup_database() {
    log_info "Setting up PostgreSQL database..."

    # Database connection details
    DB_HOST="localhost"
    DB_PORT="5432"
    DB_USER="postgres"
    DB_PASS="9894guha"
    DB_NAME="moodle_proctor"
    DB_TEST_NAME="moodle_proctor_test"

    # Set PGPASSWORD for authentication
    export PGPASSWORD="$DB_PASS"

    # Create databases if they don't exist
    log_info "Creating databases..."

    # Create main database
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        log_success "Database '$DB_NAME' already exists"
    else
        createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
        log_success "Created database '$DB_NAME'"
    fi

    # Create test database
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_TEST_NAME"; then
        log_success "Database '$DB_TEST_NAME' already exists"
    else
        createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_TEST_NAME"
        log_success "Created database '$DB_TEST_NAME'"
    fi

    # Create proctor_user role
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "SELECT 1 FROM pg_roles WHERE rolname='proctor_user';" | grep -q 1; then
        log_success "Role 'proctor_user' already exists"
    else
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE ROLE proctor_user WITH PASSWORD '$DB_PASS' LOGIN;"
        log_success "Created role 'proctor_user'"
    fi

    # Grant privileges
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO proctor_user;"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "GRANT ALL PRIVILEGES ON DATABASE $DB_TEST_NAME TO proctor_user;"

    log_success "Database setup complete!"
}

# ============================================================================
# DEPENDENCY INSTALLATION
# ============================================================================

install_dependencies() {
    log_info "Installing dependencies..."

    # Backend dependencies
    log_info "Installing backend dependencies..."
    cd backend
    npm install
    log_success "Backend dependencies installed"

    # Frontend dependencies
    log_info "Installing frontend dependencies..."
    cd ../frontend
    npm install
    log_success "Frontend dependencies installed"

    # AI Proctoring dependencies
    log_info "Installing AI proctoring dependencies..."
    cd ../ai_proctoring
    pip install -r requirements.txt
    pip install pytest pytest-cov pytest-asyncio
    log_success "AI proctoring dependencies installed"

    cd ..
    log_success "All dependencies installed!"
}

# ============================================================================
# DATABASE MIGRATIONS
# ============================================================================

run_migrations() {
    log_info "Running database migrations..."

    cd backend

    # Set environment for migrations
    export DATABASE_URL="postgresql://proctor_user:9894guha@localhost:5432/moodle_proctor"

    # Run migrations
    npm run migrate

    log_success "Database migrations completed!"
    cd ..
}

# ============================================================================
# BUILD APPLICATIONS
# ============================================================================

build_applications() {
    log_info "Building applications..."

    # Build backend
    log_info "Building backend..."
    cd backend
    npm run build
    log_success "Backend built"

    # Build frontend
    log_info "Building frontend..."
    cd ../frontend
    npm run build
    log_success "Frontend built"

    cd ..
    log_success "All applications built!"
}

# ============================================================================
# RUN TESTS
# ============================================================================

run_tests() {
    log_info "Running test suite..."

    # Set test environment
    export DATABASE_URL="postgresql://proctor_user:9894guha@localhost:5432/moodle_proctor_test"
    export NODE_ENV="test"

    # Backend unit tests
    log_info "Running backend unit tests..."
    cd backend
    npm run test:unit
    log_success "Backend unit tests passed"

    # Backend integration tests
    log_info "Running backend integration tests..."
    npm run test:integration
    log_success "Backend integration tests passed"

    # Python unit tests
    log_info "Running Python unit tests..."
    cd ../ai_proctoring
    python -m pytest tests/unit/ -v
    log_success "Python unit tests passed"

    cd ..
    log_success "All tests passed!"
}

# ============================================================================
# RUN E2E TESTS
# ============================================================================

run_e2e_tests() {
    log_info "Running E2E tests..."

    # Install Playwright browsers
    log_info "Installing Playwright browsers..."
    cd backend
    npx playwright install --with-deps

    # Start backend in background for E2E tests
    log_info "Starting backend for E2E tests..."
    export DATABASE_URL="postgresql://proctor_user:9894guha@localhost:5432/moodle_proctor_test"
    export NODE_ENV="test"
    export PORT="5000"

    npm run start &
    BACKEND_PID=$!

    # Wait for backend to be ready
    log_info "Waiting for backend to be ready..."
    sleep 10

    # Run E2E tests
    log_info "Running E2E tests..."
    npm run test:e2e

    # Kill backend
    kill $BACKEND_PID 2>/dev/null || true

    log_success "E2E tests completed!"
    cd ..
}

# ============================================================================
# DOCKER OPERATIONS (if Docker is available)
# ============================================================================

run_docker_setup() {
    if [ "$DOCKER_AVAILABLE" = false ]; then
        log_warning "Docker not available, skipping containerized setup"
        return
    fi

    log_info "Running Docker setup..."

    # Build and start containers
    log_info "Building and starting containers..."
    docker compose up --build -d

    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    sleep 30

    # Check container status
    log_info "Checking container status..."
    docker compose ps

    log_success "Docker setup complete!"
}

# ============================================================================
# MAIN SCRIPT
# ============================================================================

main() {
    echo "=================================================="
    echo "🏫 Moodle-Proctor Complete Setup & Test Runner"
    echo "=================================================="
    echo

    # Parse command line arguments
    RUN_DOCKER=false
    RUN_E2E=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --docker)
                RUN_DOCKER=true
                shift
                ;;
            --e2e)
                RUN_E2E=true
                shift
                ;;
            --help)
                echo "Usage: $0 [options]"
                echo "Options:"
                echo "  --docker    Run Docker containerized setup"
                echo "  --e2e       Run E2E tests (requires backend running)"
                echo "  --help      Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Run setup steps
    check_prerequisites
    setup_database
    install_dependencies
    run_migrations
    build_applications

    if [ "$RUN_DOCKER" = true ]; then
        run_docker_setup
    fi

    run_tests

    if [ "$RUN_E2E" = true ]; then
        run_e2e_tests
    fi

    echo
    echo "=================================================="
    log_success "🎉 Setup and testing completed successfully!"
    echo
    echo "Next steps:"
    echo "1. Start the application: docker compose up"
    echo "2. Access frontend: http://localhost:3000"
    echo "3. Access backend API: http://localhost:5000"
    echo "4. Access AI service: http://localhost:8000"
    echo "5. Access Moodle: http://localhost:8080"
    echo "=================================================="
}

# Run main function
main "$@"