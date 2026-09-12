# Auditoría integral — Autolavado QA

Fecha: 2026-09-12  
Rama de trabajo: `auditoria/correccion-integral`  
Base protegida: `main` en `2fade99f61e4a943af618cef264c6e5724fb28fa`

## Resultado de esta ronda

- Se unificaron tarifas y duraciones entre servidor e interfaz.
- Se corrigió el redondeo monetario para que Python y JavaScript produzcan el mismo total.
- Se reforzó la validación de tipos de datos, nombres, placas, teléfonos, servicios y vehículos.
- Se añadieron encabezados HTTP básicos de seguridad.
- Se protegió el tablero contra inyección de HTML desde datos capturados.
- Se corrigió la persistencia de calificaciones, comentarios y fallas reportadas.
- Se conserva la fecha de la cita y la métrica diaria usa la fecha local.
- Se hizo visible y funcional el acceso de Administración.
- Se eliminó el HTML duplicado; `templates/index.html` es la interfaz canónica.
- Se corrigió el comando documentado de pruebas y se excluyeron archivos locales del repositorio.

## Validaciones ejecutadas

- 26 pruebas automatizadas aprobadas.
- Compilación Python aprobada.
- Validación de sintaxis JavaScript aprobada.
- Arranque real con Gunicorn aprobado.
- `/`, `/health` y `/api/config` respondieron correctamente.
- Revisión de espacios y conflictos con `git diff --check` aprobada.

## Riesgos que siguen abiertos

Esta versión sigue siendo un prototipo QA de un solo dispositivo:

1. Los vehículos se guardan en `localStorage`, no en una base de datos central.
2. El acceso de Administración es informativo; todavía no edita empresa, tarifas, personal ni roles.
3. No existe autenticación real ni perfiles de acceso.
4. WhatsApp es una simulación y no realiza envíos.
5. Los reportes históricos, cierres de caja y métricas por responsable aún no existen como módulos persistentes.

Estos puntos requieren una segunda etapa de desarrollo con base de datos y autenticación. No deben presentarse como funciones terminadas en producción.

## Continuación local — 2026-09-12

- Se corrigió el manejo de cuerpos JSON que no son objetos en ambos endpoints POST: ahora responden 400 en lugar de provocar un error interno.
- Se rechazan listas y objetos en los catálogos de servicio y vehículo sin errores 500.
- Se rechazan teléfonos con tipos inválidos, incluso valores vacíos como listas, objetos, `false` y `0`; se mantienen opcionales el campo omitido, `null` y la cadena vacía.
- Se añadieron 28 casos de regresión: 54 pruebas aprobadas en Windows, compilación Python y `git diff --check` aprobados.
- Se creó un entorno local `.venv` con las dependencias del repositorio. La segunda etapa con persistencia central y autenticación sigue pendiente.

## Revisión del Pull Request — 2026-09-12

- Los cambios de estado y calificaciones se revierten si falla localStorage; la calificación permanece abierta para reintentar.
- Los botones y la confirmación de WhatsApp indican explícitamente que se trata de una simulación sin envío.
- El encabezado presenta la fecha local actual y se escapan también los campos restaurados de pago, servicio y estado.
- El ingreso diario excluye cobros de otras fechas. Las nuevas entregas registran fecha de cobro local; los registros antiguos usan fecha de cita como aproximación y los que no tienen fecha se excluyen, salvo los ejemplos demo.
- Validación: 54 pruebas Python y 10 pruebas JavaScript ejecutables aprobadas. Las pruebas JavaScript usan un DOM mínimo y almacenamiento simulado, no un navegador real.
