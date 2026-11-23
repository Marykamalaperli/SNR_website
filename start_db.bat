@echo off
title SNR NEST - Database Container
echo Starting PostgreSQL container in Docker...
cd /d "%~dp0"
docker compose up -d db
echo.
echo PostgreSQL is running in Docker on 127.0.0.1:5432.
echo Check container status with: docker ps
pause

