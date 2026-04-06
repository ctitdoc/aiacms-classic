#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-start}"
APP_DIR="${HOME}/apps/aiacms-classic"

cd "${APP_DIR}"

case "${ACTION}" in
  start)
    docker compose up -d --build
    docker compose ps
    docker compose logs --tail=100
    ;;
  stop)
    docker compose stop
    docker compose ps
    ;;
  restart|re-start)
    docker compose down
    docker compose up -d --build
    docker compose ps
    docker compose logs --tail=100
    ;;
  logs)
    docker compose logs --tail=100
    ;;
  ps)
    docker compose ps
    ;;
  clean)
    docker compose down --remove-orphans
    docker image prune -f
    docker builder prune -f
    docker container prune -f
    docker network prune -f
    docker system df
    ;;
  clean-all)
    docker compose down --remove-orphans --volumes
    docker system prune -af
    docker builder prune -af
    docker volume prune -f
    docker system df
    ;;
  *)
    echo "Usage: $0 [start|stop|restart|re-start|logs|ps|clean|clean-all]"
    exit 1
    ;;
esac