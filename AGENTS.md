# Cambios recientes

- Se añadió el endpoint `POST /users/count` en `backend/app/main.py` para contar usuarios locales habilitados excluyendo cuentas del playbook original (WDAGUtilityAccount, administrator, wavenet, DefaultAccount, Guest y prefijos MSSQLSERVER*/SQLEXPRESS*/BEJERMAN*).
- Se expuso la nueva acción en el frontend: cliente `apiCountLocalUsers` y panel “Cantidad de usuarios locales” en `frontend/src/ui/App.tsx` con manejo de errores/estado.
- Se construyeron las imágenes con `docker compose build` y se levantaron los servicios con `docker compose up -d`; los logs no mostraron errores críticos, solo advertencias conocidas de winrm ante respuestas inesperadas del host.
