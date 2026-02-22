# Docker Quick Reference

**Quick commands for building, running, and managing the orchestrator Docker image.**

---

## Building

### Simple Build
```bash
cd orchestrator
docker build -t wagging-orchestrator:latest .
```

### Build Script
```bash
# Development build
./build-docker.sh dev

# Production build & push to registry
./build-docker.sh prod myregistry.com
```

### View Build Progress
```bash
docker build --progress=plain -t wagging-orchestrator .
```

---

## Running

### Single Container
```bash
docker run -d \
  --name orchestrator \
  -p 3000:3000 \
  -e OPENAI_API_KEY=sk-... \
  -e ANTHROPIC_API_KEY=claude-... \
  -e DATABASE_URL=mongodb://... \
  -e REDIS_URL=redis://... \
  wagging-orchestrator:latest

# Check status
docker ps | grep orchestrator

# View logs
docker logs -f orchestrator

# Test
curl http://localhost:3000/health
```

### Docker Compose
```bash
# Start all services
docker-compose up -d

# Monitor
docker-compose ps
docker-compose logs -f

# Stop
docker-compose down

# Remove volumes too
docker-compose down -v
```

---

## Testing

### Health Check
```bash
# From host
curl http://localhost:3000/health

# From inside container
docker exec orchestrator curl http://localhost:3000/health

# With verbose output
docker exec orchestrator curl -v http://localhost:3000/health
```

### Run Tests
```bash
# Inside container
docker exec orchestrator npm test

# Specific test
docker exec orchestrator npm run test:integration
```

### Shell Access
```bash
docker exec -it orchestrator sh
# Then inside: npm run test:load
```

---

## Debugging

### View Logs
```bash
# Last 100 lines
docker logs --tail=100 orchestrator

# Follow in real-time
docker logs -f orchestrator

# From specific time
docker logs --since 2024-02-22T10:00:00 orchestrator

# With timestamps
docker logs -t orchestrator
```

### Inspect Container
```bash
# Full config
docker inspect orchestrator

# Just environment
docker inspect orchestrator | grep -i env

# Port bindings
docker port orchestrator
```

### Stats
```bash
# Live stats
docker stats orchestrator

# CPU and memory
docker stats --no-stream orchestrator
```

---

## Networking

### Access Services from Host
```bash
# Orchestrator
curl http://localhost:3000/health

# MongoDB
mongosh mongodb://user:pass@localhost:27017/orchestrator

# Redis
redis-cli -p 6379 ping

# Prometheus
curl http://localhost:9090/-/healthy

# Grafana
curl http://localhost:3001/api/health
```

### Service to Service (docker-compose)
```bash
# From orchestrator to mongo via DNS
docker exec orchestrator curl http://mongo:27017

# Connections use service names automatically
# mongodb://user:pass@mongo:27017/orchestrator
```

---

## Cleanup

### Stop Container
```bash
docker stop orchestrator
docker rm orchestrator

# Or with compose
docker-compose stop
docker-compose down
```

### Remove Images
```bash
# Delete image
docker rmi wagging-orchestrator:latest

# Delete all untagged
docker image prune

# Delete unused
docker image prune -a
```

### Full Cleanup
```bash
# Remove containers, images, volumes, networks
docker system prune -a --volumes

# Or selective
docker container prune     # Remove stopped containers
docker image prune         # Remove unused images
docker volume prune        # Remove unused volumes
docker network prune       # Remove unused networks
```

---

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker logs orchestrator

# Check if port in use
lsof -i :3000

# Check image exists
docker images | grep orchestrator

# Rebuild
docker build --no-cache -t wagging-orchestrator .
```

### High Memory Usage
```bash
# Check usage
docker stats orchestrator

# Limit memory
docker update --memory=1g orchestrator

# Restart
docker restart orchestrator
```

### Connection Issues
```bash
# Check network
docker network ls
docker network inspect orchestrator-net

# Test connectivity
docker exec orchestrator ping mongo
docker exec orchestrator redis-cli -h redis ping
```

### Database Issues
```bash
# Check MongoDB
docker-compose logs mongo

# Connect and inspect
docker exec -it orchestrator mongosh mongodb://user:pass@mongo:27017/orchestrator

# Check Redis
docker exec orchestrator redis-cli -h redis ping
```

---

## Tagging & Registry

### Tag Image
```bash
# Tag for registry
docker tag wagging-orchestrator:latest myregistry.com/orchestrator:1.0.0
docker tag wagging-orchestrator:latest myregistry.com/orchestrator:latest

# Verify
docker images | grep orchestrator
```

### Push to Registry
```bash
# Login (if needed)
docker login myregistry.com

# Push
docker push myregistry.com/orchestrator:1.0.0
docker push myregistry.com/orchestrator:latest
```

### Pull from Registry
```bash
docker pull myregistry.com/orchestrator:latest
docker run -p 3000:3000 myregistry.com/orchestrator:latest
```

---

## Environment Variables

### Required
```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=mongodb://...
REDIS_URL=redis://...
```

### Optional
```bash
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
MAX_AGENTS=40
COST_BUDGET_CAP=20
```

### Set via Command Line
```bash
docker run -e OPENAI_API_KEY=sk-... -e LOG_LEVEL=debug ...
```

### Set via .env File (compose)
```bash
# .env file in compose directory
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Then: docker-compose up
```

---

## Monitoring

### Prometheus Metrics
```bash
# View targets
curl http://localhost:9090/api/v1/targets

# Query metrics
curl 'http://localhost:9090/api/v1/query?query=up'
```

### Grafana Dashboards
```
# Access dashboards
http://localhost:3001/

# Login: admin / admin (default, change in .env)

# View pre-loaded dashboards:
# - Overview
# - Agent Performance
# - Cost Tracking
# - Error Rate
```

---

## Performance Tips

### Build Optimization
- Use `.dockerignore` to skip unneeded files
- Multi-stage builds reduce final image size
- Layer caching speeds up rebuilds

### Runtime Optimization
- Set resource limits: `--memory=512m --cpus=1`
- Use Alpine image for smaller footprint
- Enable compression for network calls

### Development Workflow
```bash
# Mount source for hot reload
docker run -v $(pwd)/src:/app/src wagging-orchestrator

# Or use docker-compose volumes
docker-compose up
# Changes in ./src are reflected immediately
```

---

## Docker Compose Help

```bash
# Build services
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs

# Stop services
docker-compose stop

# Restart
docker-compose restart

# Remove everything
docker-compose down -v

# Execute command in service
docker-compose exec orchestrator npm run test

# Scale service (if supported)
docker-compose up -d --scale orchestrator=3
```

---

## Next: Kubernetes (STAGE 4)

Once Docker image is validated, deploy to Kubernetes:

```bash
# Tag for K8s registry
docker tag wagging-orchestrator:latest k8s-registry.internal/orchestrator:latest

# Push
docker push k8s-registry.internal/orchestrator:latest

# Deploy (see STAGE 4 for manifests)
kubectl apply -f k8s/deployment.yaml
```

---

**For detailed Docker documentation, see [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)**
