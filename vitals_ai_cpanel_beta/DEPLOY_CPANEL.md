# Despliegue en cPanel (Next.js + Python + MySQL)

## Objetivo
Levantar el beta con:
- **Frontend**: Next.js (Application Manager / Node.js)
- **Backend**: Python (Setup Python App / Passenger WSGI)
- **BD**: MySQL (cPanel)

## 0) Subdominios recomendados
- `app.tudominio.com`  -> Frontend Next.js
- `api.tudominio.com`  -> Backend Python

## 1) Base de datos MySQL (cPanel)
1. cPanel > MySQL® Databases:
   - Crear DB: `cpaneluser_vitalsbeta`
   - Crear usuario y password
   - Asignar usuario a la DB con ALL PRIVILEGES
2. Anota:
   - DB_HOST = `localhost`
   - DB_NAME, DB_USER, DB_PASSWORD

## 2) Backend Python (WSGI)
### 2.1 Subir código
Sube la carpeta `backend/` al home de tu cuenta, por ejemplo:
- `/home/cpaneluser/vitals_backend`

### 2.2 Crear app en Setup Python App
cPanel > Setup Python App:
- Python version: 3.10+ (según ofrezca tu hosting)
- Application root: `vitals_backend`
- Application URL: `api.tudominio.com` (o base URL `/`)
- Startup file: `passenger_wsgi.py`
- Entry point: `application`

### 2.3 Variables de entorno (en cPanel)
Configura (copiando `backend/.env.example`):
- `SECRET_KEY`
- `CORS_ALLOW_ORIGINS=https://app.tudominio.com`
- `DB_HOST=localhost`
- `DB_NAME=...`
- `DB_USER=...`
- `DB_PASSWORD=...`

### 2.4 Instalar dependencias
Usa "Run Pip Install" o Terminal/SSH:
- `pip install -r requirements.txt`

### 2.5 Inicializar tablas
Opción A (CLI):
- `python scripts/init_db.py`

Opción B (HTTP, solo 1 vez):
- `POST https://api.tudominio.com/api/v1/db/init`

### 2.6 Reiniciar backend tras cambios
Crear/actualizar el archivo:
- `tmp/restart.txt`

## 3) Frontend Next.js (Node)
### 3.1 Subir código
Sube la carpeta `frontend/` por ejemplo a:
- `/home/cpaneluser/vitals_frontend`

### 3.2 Configurar variables
Crea `.env` (con base en `frontend/.env.example`):
- `NEXT_PUBLIC_API_BASE_URL=https://api.tudominio.com`

### 3.3 Build
Desde Terminal/SSH o Application Manager:
- `npm install`
- `npm run build`

### 3.4 Registrar app en Application Manager
cPanel > Application Manager:
- Deployment Domain: `app.tudominio.com`
- Application Path: `vitals_frontend`
- Startup: `npm start`

## 4) Prueba rápida
- Frontend: `https://app.tudominio.com`
- Backend health: `https://api.tudominio.com/health`
- Triage: usar la pantalla de Signos Vitales -> Cuestionario -> Escaneo.

## 5) Nota sobre IA (LLM)
El LLM open-source NO debe correr dentro de cPanel.
Si deseas explicación por IA:
- Levanta un microservicio (vLLM/Ollama) en VPS
- Configura en backend:
  - `LLM_BASE_URL=https://llm.tudominio.com/v1`
  - `LLM_MODEL_NAME=mistral` (según tu servidor)
