# Changelog

## 2025-10-06
- Ajuste del backend para normalizar los timestamps RDP y evitar errores al comparar fechas.
- Refactor del endpoint `/system/rdp-connections` combinando resultados de logs Security, RemoteConnectionManager y sesiones activas desde Python.
- Nuevo endpoint `/system/rdp-connections` con scripts PowerShell segmentados para evitar errores de longitud de comando.
- Endpoint `/system/last-shutdown` añadido para consultar el último apagado/reinicio (evento 1074).
- Normalización de la actualización de `FullName` al renombrar usuarios sin modificar la descripción.
- Frontend actualizado con pestañas para cambio de contraseñas, renombrado, último apagado y nuevo módulo de conexiones RDP (incluye tabla, filtros y advertencias).
- Ajustes de UI: título principal "ADMINISTRACION MEDIANTE WINRM", subtítulo simplificado, usuario fijo `wavenet` sin campo de entrada y contraseña obligatoria.
- Eliminación del subtítulo adicional y textos redundantes en el encabezado para destacar el branding único.
- Botón de conexión renombrado a "Conectar" y, tras conectarse, pasa a "Nueva conexión" recargando la interfaz para trabajar con otro servidor.
