# AGENTS.md — Guía para agentes de código

## Visión general

Sistema Dockerizado para administración de usuarios Windows vía WinRM (puerto 5986).

- **Backend**: Python 3.11 + FastAPI + pywinrm — `backend/app/main.py` (archivo único).
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS — `frontend/src/`.
- **Orquestación**: Docker Compose — servicios `backend` (puerto 8000 interno) y `frontend` (puerto 5173→80).
- **Proxy**: Nginx (`frontend/nginx.conf`) reenvía `/api/` al backend.

## Build / Run

```bash
# Construir imágenes y levantar servicios
docker compose build
docker compose up -d

# Solo frontend (desarrollo local con hot-reload)
cd frontend && npm run dev

# Build de producción del frontend
cd frontend && npm run build

# Preview del frontend construido
cd frontend && npm run preview
```

## Lint / Typecheck / Tests

El proyecto **no tiene** configuración de linting (ESLint/Prettier), tests ni type-checking dedicado. Si necesitás verificar tipos manualmente:

```bash
cd frontend && npx tsc --noEmit
```

El backend no tiene tests ni pytest configurado. Los endpoints se prueban manualmente o vía Docker.

## Estructura del proyecto

```
.
├── backend/
│   ├── app/
│   │   └── main.py          # Toda la lógica del backend (endpoints, modelos, helpers)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.tsx          # Entry point React
│   │   ├── index.css         # Estilos Tailwind
│   │   └── ui/
│   │       ├── App.tsx       # Componente principal (~1000 líneas, toda la UI)
│   │       └── api.ts        # Cliente HTTP (axios) para los endpoints
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── nginx.conf            # Proxy /api/ → backend:8000
│   └── Dockerfile
├── docker-compose.yml
├── AGENTS.md
└── README.md
```

## Estilo de código

### Backend (Python)

- **Formato**: Sin formateador configurado. Seguir estilo existente (4 espacios, ~120 cols).
- **Tipos**: Usar `typing` (List, Dict, Optional, Tuple). Modelos Pydantic con `Field(...)`.
- **Imports**: Agrupar: stdlib → third-party (fastapi, pywinrm, pydantic). Sin orden alfabético estricto.
- **Nombres**: `snake_case` para funciones/variables. Clases PascalCase.
- **Endpoints**: Definir con decoradores `@app.post("/path")` o `@app.get("/path")`.
- **Errores**: `raise HTTPException(status_code=400, detail="mensaje")` para errores de negocio.
- **Helpers privados**: Prefijo `_` (ej: `_get_creds`, `_run_rdp_script`).
- **PowerShell**: Scripts inline como strings raw (`r'''...'''`) pasados a `run_ps()`.

### Frontend (TypeScript/React)

- **Formato**: Sin ESLint/Prettier. Seguir estilo existente: 2 espacios, punto y coma opcional (no se usa), comillas simples.
- **Tipos**: `strict: true` en tsconfig. Usar `type` para alias de tipos (no `interface`). Importar tipos con `import type`.
- **Imports**: React → third-party (axios) → locales (`./api`). Imports nombrados desestructurados cuando hay varios.
- **Componentes**: Función flecha `const App = () => { ... }` exportada como `export default`.
- **Estado**: `useState` con tipos explícitos. Nombres descriptivos: `isConnecting`, `connectError`, `connectedHost`.
- **Handlers**: Prefijo `handle` (ej: `handleConnect`, `handleChangePasswords`).
- **Async**: `async/await` con `try/catch/finally`. `setIsLoading(true/false)` en finally.
- **UI**: Tailwind CSS con clases utilitarias. Componentes inline (sin archivos separados).
- **Errores en UI**: Helper `getErrorMessage(error)` que maneja AxiosError y Error genérico.
- **API**: Todas las funciones en `api.ts`, usan `http.post/get` con axios. Retornan data desestructurada.

### Docker / Despliegue

- Backend: `python:3.11-slim`, uvicorn como servidor.
- Frontend: Build multi-stage con `node:20-alpine` + `nginx:1.27-alpine`.
- Variables de entorno: `WINRM_USERNAME`, `WINRM_PASSWORD` definidas en `docker-compose.yml`.

## Convenciones importantes

- No hay tests — verificar cambios manualmente o con `docker compose build`.
- El backend es un solo archivo (`main.py`). No agregar módulos sin consultar.
- El frontend es un solo componente grande (`App.tsx`) + archivo de API (`api.ts`).
- Los endpoints reciben credenciales en el body (o usan env vars por defecto).
- Mensajes de UI en **español**.
- No exponer puertos del backend al host; solo accesible dentro de la red Docker.
