# Moodle Configuration

## Purpose

This directory contains custom configuration files for the Moodle container to ensure proper network accessibility.

## moodle-vhost.conf

### Problem
The default Bitnami Moodle image configures Apache to listen on `127.0.0.1:8080` (localhost only). This prevents the Moodle service from being accessible from outside the container, including:
- Host machine
- Other containers in the Docker network (e.g., backend service)
- External API clients

### Solution
This custom VirtualHost configuration changes Apache to listen on `*:8080` (all interfaces), making Moodle accessible from:
- `http://localhost:8080` (host machine)
- `http://moodle:8080` (other containers via Docker network)
- External network access (via port mapping)

### Changes
- Changed `<VirtualHost 127.0.0.1:8080>` to `<VirtualHost *:8080>`

### Deployment
The configuration is mounted as a read-only volume in `docker-compose.yml`:
```yaml
volumes:
  - ./moodle-config/moodle-vhost.conf:/opt/bitnami/apache/conf/vhosts/moodle-vhost.conf:ro
```

This ensures the fix persists across container restarts and recreations.
