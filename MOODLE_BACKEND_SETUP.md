# Moodle Backend Setup

This project already includes a local Moodle backend in [docker-compose.yml](C:/Users/curvy/Desktop/dsc-project/docker-compose.yml).

Use these credentials in the frontend:

- Username: `admin`
- Password: `Admin123!`

## What this setup runs

- Moodle LMS: `http://localhost:8080`
- Moodle database (MariaDB): Docker container
- Proctoring backend API: `http://localhost:5000`

## Step 1: Start Docker services

From the project root:

```powershell
docker compose up -d mariadb moodle postgres migration backend
```

If your Docker uses the older command, use:

```powershell
docker-compose up -d mariadb moodle postgres migration backend
```

## Step 2: Wait for Moodle to finish booting

Open:

`http://localhost:8080`

If Moodle is still starting, wait 1 to 2 minutes and refresh.

## Step 3: Important note about the admin password

For a fresh Moodle install, Docker is now configured to create:

- Username: `admin`
- Password: `Admin123!`

But Moodle keeps its data in Docker volumes. That means:

- If this is your first time starting Moodle, use `admin / Admin123!`
- If Moodle was started before, the old password may still be saved inside the volume

If `Admin123!` does not work, do one of these:

### Option A: Change the password inside Moodle

1. Log in with the old password.
2. Open Site administration.
3. Go to Users > Accounts > Browse list of users.
4. Open the `admin` user.
5. Set the new password to `Admin123!`.
6. Save.

### Option B: Reset the whole Moodle Docker data

Only do this if you are okay deleting the local Moodle data.

```powershell
docker compose down -v
docker compose up -d mariadb moodle postgres migration backend
```

After that, Moodle will be recreated with:

- Username: `admin`
- Password: `Admin123!`

## Step 4: Frontend environment

Create [frontend/.env.local](C:/Users/curvy/Desktop/dsc-project/frontend/.env.local) with:

```env
BACKEND_URL=http://localhost:5000
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
MOODLE_BASE_URL=http://localhost:8080
MOODLE_SERVICE=moodle_mobile_app
```

Why these values matter:

- The current login page sends credentials to the frontend route `POST /api/auth/backend-login`
- That route forwards login to the backend at `http://localhost:5000`
- The backend then authenticates against Moodle

## Step 5: Start the frontend

```powershell
cd frontend
npm install
npm run dev
```

Open:

`http://localhost:3000/login`

## Step 6: Login in the frontend

Use:

- Username: `admin`
- Password: `Admin123!`

## Quick check if login fails

1. Confirm Moodle is open at `http://localhost:8080`
2. Confirm backend is open at `http://localhost:5000/health`
3. Confirm [frontend/.env.local](C:/Users/curvy/Desktop/dsc-project/frontend/.env.local) has `BACKEND_URL=http://localhost:5000`
4. If Moodle was already initialized before, update the admin password manually or reset Docker volumes

## Files involved

- [docker-compose.yml](C:/Users/curvy/Desktop/dsc-project/docker-compose.yml)
- [frontend/src/app/login/page.tsx](C:/Users/curvy/Desktop/dsc-project/frontend/src/app/login/page.tsx)
- [frontend/src/app/api/auth/backend-login/route.ts](C:/Users/curvy/Desktop/dsc-project/frontend/src/app/api/auth/backend-login/route.ts)
- [backend/src/modules/auth/moodle.service.ts](C:/Users/curvy/Desktop/dsc-project/backend/src/modules/auth/moodle.service.ts)
