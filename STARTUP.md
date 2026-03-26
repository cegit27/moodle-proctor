# Moodle-Proctor Startup Guide

This guide will help you start the entire Moodle-Proctor docker-compose setup.

## Prerequisites

- Docker and Docker Compose installed
- At least 4GB of RAM available for Docker
- Ports 5000, 8000, 8080, 8443, and 5433 available

## Quick Start

1. **Start all services:**
   ```bash
   docker-compose up -d
   ```

2. **Verify services are running:**
   ```bash
   docker-compose ps
   ```

3. **Check service health:**
   ```bash
   # Backend API
   curl http://localhost:5000/health

   # Moodle LMS
   curl -I http://localhost:8080

   # AI Proctoring Service
   curl http://localhost:8000/health
   ```

## Services

Once started, the following services will be available:

| Service | URL | Description |
|---------|-----|-------------|
| **Backend API** | http://localhost:5000 | Main backend API (Fastify/Node.js) |
| **API Documentation** | http://localhost:5000/docs | Interactive API docs |
| **Moodle LMS** | http://localhost:8080 | Moodle Learning Management System |
| **Moodle (HTTPS)** | https://localhost:8443 | Moodle with SSL |
| **AI Proctoring** | http://localhost:8000 | AI-based proctoring service |
| **PostgreSQL DB** | localhost:5433 | Proctoring database |

## Database Credentials

### PostgreSQL (Proctoring Data)
- **Host:** localhost:5433
- **User:** proctor_user
- **Password:** proctor_pass
- **Database:** moodle_proctor

### MariaDB (Moodle Data)
- **User:** bn_moodle
- **Password:** bitnami
- **Database:** bitnami_moodle

## Moodle Default Credentials

- **Username:** admin
- **Password:** Admin123!

## Troubleshooting

### Services not starting?

Check logs for any service:
```bash
docker-compose logs <service-name>
docker-compose logs backend
docker-compose logs ai-proctoring
docker-compose logs moodle
```

### Backend keeps restarting?

The backend requires these environment variables (already configured in docker-compose.yml):
- `JWT_SECRET`
- `AI_SERVICE_SHARED_SECRET`
- `FRAME_SIGNATURE_SECRET`
- `DATABASE_URL`

### Port already in use?

Change ports in `docker-compose.yml`:
```yaml
services:
  backend:
    ports:
      - "5001:5000"  # Use 5001 instead of 5000
```

### Need to rebuild images?

```bash
docker-compose build --no-cache <service-name>
docker-compose up -d <service-name>
```

## Known Limitations

1. **WebRTC Features Disabled:** The WebRTC/MediaSoup features are currently disabled due to build issues with mediasoup in Alpine Linux. The backend runs without these features, which means:
   - Video proctoring through WebRTC is not available
   - Manual proctoring and AI proctoring still work
   - Other backend features function normally

2. **Health Check Status:** Some services may show as "unhealthy" in `docker-compose ps` despite working correctly. This is a known issue with internal health checks. Always verify using curl commands above.

## Development

To attach logs and watch service activity:
```bash
docker-compose logs -f
```

To stop all services:
```bash
docker-compose down
```

To stop and remove all data (WARNING: deletes database data):
```bash
docker-compose down -v
```

## Support

For issues or questions, please refer to the main project README or create an issue in the repository.
