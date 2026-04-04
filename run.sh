#!/bin/bash -xv
cd ~/apps/aiacms-classic
docker compose up -d --build
docker compose ps
docker compose logs --tail=100
