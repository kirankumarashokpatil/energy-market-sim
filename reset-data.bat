@echo off
echo Stopping GridForge containers...
docker-compose down

echo Removing GunDB data volume...
docker volume rm gridforge-app_gundb_data

echo Restarting containers with fresh data...
docker-compose up -d

echo Waiting for services to start...
timeout /t 5 /nobreak >nul

echo Checking container status...
docker-compose ps

echo.
echo ✅ GridForge data reset complete!
echo 🎯 New rooms will now start at SP 1
echo 🌐 Access the app at: http://localhost:3000
pause
