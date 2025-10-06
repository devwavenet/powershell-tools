# Sistema Dockerizado: Administración de usuarios Windows vía WinRM (5986)

Este proyecto provee una interfaz moderna (React + Tailwind) y una API (FastAPI + pywinrm) para conectarse a un servidor Windows por WinRM sobre TLS (puerto 5986), mostrar el nombre del host y ofrecer un menú donde la primera opción es “Cambio de Nombre o contraseña”. La lógica de cambio de contraseñas y renombrado se basa en el script PowerShell provisto.

## Arquitectura
- Backend: FastAPI + pywinrm (Python) — expone endpoints para probar conexión, cambiar contraseñas y renombrar usuarios locales.
- Frontend: React + Vite + Tailwind — UI limpia, moderna, responsiva.
- Orquestación: Docker Compose — `frontend` (puerto 5173) y `backend` (puerto 8000).

## Requisitos previos en el servidor Windows
Debe estar configurado WinRM sobre HTTPS (5986) y el usuario utilizado debe tener privilegios administrativos locales.

Ejemplo rápido (PowerShell en el servidor o vía GPO según su estándar):

```powershell
# Ejecutar en PowerShell con privilegios de administrador
winrm quickconfig -q
winrm set winrm/config/service '@{AllowUnencrypted="false"}'
winrm set winrm/config/service/auth '@{Basic="false"; Kerberos="true"; NTLM="true"}'
# Asegure un listener HTTPS con un certificado instalado en la máquina
# Verificar listeners
winrm enumerate winrm/config/Listener
# Permitir puerto 5986 en firewall
New-NetFirewallRule -Name "WinRM-HTTPS" -DisplayName "WinRM over HTTPS" -Protocol TCP -LocalPort 5986 -Action Allow
```

Si el certificado es autofirmado, la UI permite “Ignorar certificado”. En entornos productivos se recomienda usar un certificado confiable.

## Puesta en marcha

1. Construir e iniciar con Docker Compose:

```bash
docker compose up --build
```

2. Abrir el frontend:

- Navegue a `http://localhost:5173`

3. Conectar a un servidor:

- Ingrese solo la IP/host. Las credenciales están fijas por defecto (`WINRM_USERNAME` y `WINRM_PASSWORD`).
- Deje activado “HTTPS” y puerto `5986`.
- Si usa certificado autofirmado, marque “Ignorar certificado”.
- Al conectar, se muestra el nombre del host y el menú principal.

4. Menú “Cambio de Nombre o contraseña”:

- Cambiar contraseñas: ingrese usuarios separados por espacio. Por defecto se generan contraseñas seguras (mín. 8, con mayúsculas, minúsculas, dígitos y especiales; evitando comenzar con `=`), replicando la lógica del script. Puede descargar el resumen en un archivo de texto.
- Cambiar nombres: ingrese los nombres actuales y los nuevos (en el mismo orden), separados por espacio. Podrá descargar el resumen.

## Endpoints principales (backend)
- `POST /connect/test` — Prueba de conexión y devuelve `hostname`.
- `POST /users/change-passwords` — Cambia contraseñas de usuarios locales.
- `POST /users/rename` — Renombra usuarios locales.

Todos requieren en el cuerpo: `host`, `username`, `password`, y opcionalmente `use_https`, `port`, `ignore_cert`.

## Notas de seguridad
- Las credenciales se envían al backend vía HTTP (en localhost por defecto). Para producción, coloque un proxy HTTPS delante del backend.
- Evite marcar “Ignorar certificado” en ambientes productivos: use certificados válidos.

### Credenciales fijas
Por defecto, el backend toma credenciales desde variables de entorno y el `docker-compose.yml` ya define:

- `WINRM_USERNAME=wavenet`
- `WINRM_PASSWORD=Hyper.24`

Puede cambiarlas editando `docker-compose.yml` o exportando variables antes de levantar los servicios.

## Estructura
- `backend/` — API FastAPI (pywinrm).
- `frontend/` — UI React + Tailwind (Vite).
- `docker-compose.yml` — Orquesta ambos servicios.

## Problemas frecuentes
- Certificado/WinRM: si falla la conexión en 5986, verifique listener HTTPS, firewall y credenciales administrativas.
- Usuarios locales: los cmdlets `Get-LocalUser`, `Set-LocalUser` y `Rename-LocalUser` requieren Windows 10/11/Server 2016+ y permisos.

## Licencia
Uso interno/demostración. Ajuste según sus políticas.
