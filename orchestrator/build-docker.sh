#!/bin/bash
# Docker build and deployment script
# Usage: ./build-docker.sh [stage] [registry]
# Examples:
#   ./build-docker.sh dev                    # Build for development
#   ./build-docker.sh prod myregistry.com    # Build for production

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="wagging-orchestrator"
DEFAULT_STAGE="dev"
DEFAULT_REGISTRY="localhost"
STAGE=${1:-$DEFAULT_STAGE}
REGISTRY=${2:-$DEFAULT_REGISTRY}
WORKDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Version from package.json
VERSION=$(grep '"version"' "$WORKDIR/package.json" | head -1 | awk -F'"' '{print $4}')
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Full image name
if [ "$REGISTRY" != "localhost" ]; then
  FULL_IMAGE_NAME="$REGISTRY/$IMAGE_NAME:$VERSION"
  LATEST_IMAGE_NAME="$REGISTRY/$IMAGE_NAME:latest"
else
  FULL_IMAGE_NAME="$IMAGE_NAME:$VERSION"
  LATEST_IMAGE_NAME="$IMAGE_NAME:latest"
fi

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}        Docker Build & Deployment Script${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Build Parameters:${NC}"
echo "  Stage:     $STAGE"
echo "  Registry:  $REGISTRY"
echo "  Image:     $FULL_IMAGE_NAME"
echo "  Version:   $VERSION"
echo "  Git SHA:   $GIT_SHA"
echo "  Built:     $BUILD_DATE"
echo ""

# Validation
if [ ! -f "$WORKDIR/Dockerfile" ]; then
  echo -e "${RED}❌ Error: Dockerfile not found in $WORKDIR${NC}"
  exit 1
fi

# Check if .env exists
if [ ! -f "$WORKDIR/.env" ] && [ "$STAGE" = "prod" ]; then
  echo -e "${YELLOW}⚠️  Warning: .env file not found. Using .env.example${NC}"
  echo -e "${YELLOW}     You must configure credentials before deployment${NC}"
  echo ""
fi

# Function to print step
print_step() {
  echo -e "${GREEN}→${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

# Build Docker image
print_step "Building Docker image..."
docker build \
  --build-arg VERSION="$VERSION" \
  --build-arg BUILD_DATE="$BUILD_DATE" \
  --build-arg GIT_SHA="$GIT_SHA" \
  --label "org.opencontainers.image.version=$VERSION" \
  --label "org.opencontainers.image.created=$BUILD_DATE" \
  --label "org.opencontainers.image.revision=$GIT_SHA" \
  -f "$WORKDIR/Dockerfile" \
  -t "$FULL_IMAGE_NAME" \
  -t "$LATEST_IMAGE_NAME" \
  "$WORKDIR" || {
  print_error "Docker build failed"
  exit 1
}

echo -e "${GREEN}✅ Image built successfully${NC}"
echo ""

# Show image info
print_step "Image Information:"
docker image inspect "$FULL_IMAGE_NAME" | jq '.[0] | {
  ID: .Id,
  Size: .Size,
  Created: .Created,
  Architecture: .Architecture,
  Os: .Os
}' 2>/dev/null || docker images | grep "$IMAGE_NAME"

echo ""

# Test image (optional)
if [ "$STAGE" = "dev" ]; then
  print_step "Testing image..."
  
  # Create test container
  if docker run --rm -t "$FULL_IMAGE_NAME" node --version > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Image test passed${NC}"
  else
    print_error "Image test failed"
    exit 1
  fi
  
  echo ""
fi

# Push to registry (if not localhost)
if [ "$REGISTRY" != "localhost" ]; then
  print_step "Pushing image to registry..."
  
  docker push "$FULL_IMAGE_NAME" || {
    print_error "Failed to push $FULL_IMAGE_NAME"
    exit 1
  }
  
  docker push "$LATEST_IMAGE_NAME" || {
    print_error "Failed to push $LATEST_IMAGE_NAME"
    exit 1
  }
  
  echo -e "${GREEN}✅ Image pushed successfully${NC}"
  echo ""
fi

# Docker Compose setup
if [ "$STAGE" = "dev" ]; then
  print_step "Setting up docker-compose environment..."
  
  # Check .env
  if [ ! -f "$WORKDIR/.env" ]; then
    print_step "Creating .env from .env.example..."
    cp "$WORKDIR/.env.example" "$WORKDIR/.env"
    echo -e "${YELLOW}⚠️  Configure .env with your API keys before running${NC}"
  fi
  
  # Build compose
  print_step "Building docker-compose services..."
  docker-compose -f "$WORKDIR/docker-compose.yml" build --no-cache || {
    print_error "Docker Compose build failed"
    exit 1
  }
  
  echo -e "${GREEN}✅ Docker Compose setup complete${NC}"
  echo ""
  
  echo -e "${BLUE}Next steps:${NC}"
  echo "  1. Configure .env file:"
  echo "     - Add OPENAI_API_KEY"
  echo "     - Add ANTHROPIC_API_KEY"
  echo "     - Set MONGO_PASSWORD"
  echo "     - Set REDIS_PASSWORD"
  echo ""
  echo "  2. Start services:"
  echo "     docker-compose up -d"
  echo ""
  echo "  3. Check status:"
  echo "     docker-compose ps"
  echo ""
  echo "  4. View logs:"
  echo "     docker-compose logs orchestrator"
  echo ""
  echo "  5. Test API:"
  echo "     curl http://localhost:3000/health"
  echo ""
fi

# Summary
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Build Complete!${NC}"
echo ""
echo "Image URI: $FULL_IMAGE_NAME"
echo "Latest:   $LATEST_IMAGE_NAME"
echo ""

if [ "$STAGE" = "prod" ]; then
  echo -e "${YELLOW}Production Deployment:${NC}"
  echo "  1. Verify image:"
  echo "     docker inspect $FULL_IMAGE_NAME"
  echo ""
  echo "  2. Push to registry:"
  echo "     docker push $FULL_IMAGE_NAME"
  echo ""
  echo "  3. Deploy to Docker Swarm/Kubernetes:"
  echo "     docker service create --image $FULL_IMAGE_NAME orchestrator"
  echo ""
fi

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
