# Autolavado — Plataforma de gestión

Aplicación web para administrar un centro de lavado de vehículos: recepción,
registro de vehículos, cobros, caja diaria, calificación del servicio y
configuración del negocio.

Hecha con **Flask** (Python) e interfaz en HTML/CSS/JavaScript sin
frameworks. Los datos se guardan en **PostgreSQL**, de modo que se comparten
entre todos los dispositivos (recepción y técnicos) y no se pierden al
cerrar el navegador.

---

## Cómo funciona la base de datos

El código elige el motor según la variable de entorno `DATABASE_URL`:

- **Con `DATABASE_URL`** (la que da Render al crear el PostgreSQL) → usa PostgreSQL.
- **Sin `DATABASE_URL`** → usa un archivo SQLite local (`autolavado.db`), ideal
  para desarrollo y pruebas.

**No hay que cambiar código para cambiar de base de datos.** Solo se cambia
el valor de `DATABASE_URL`.

---

## Ejecutar en tu computadora (desarrollo)

Requiere Python 3.11 o superior.

```bash
# 1. Crear entorno e instalar dependencias
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt    # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # Mac/Linux

# 2. Arrancar
python app.py
```

Abrir http://127.0.0.1:5000. Se crea solo un `autolavado.db` con datos de ejemplo.

Para correr las pruebas:

```bash
python -m pytest
```

---

## Publicar en Render (producción)

El archivo `render.yaml` ya deja todo configurado: crea el servicio web
**y** la base de datos PostgreSQL automáticamente.

1. Subir este repositorio a GitHub.
2. En Render → **New** → **Blueprint**, elegir este repositorio.
3. Render lee `render.yaml`, crea la base de datos y el servicio, y conecta
   `DATABASE_URL` solo.
4. Al terminar, la app queda en una URL tipo `https://autolavado.onrender.com`.

Ajustes que aplica Render automáticamente:
- Build: `pip install -r requirements.txt`
- Start: `gunicorn app:app`
- Health check: `/health`

---

## Estructura del proyecto

```
app.py              Servidor Flask y API
db.py               Capa de base de datos (PostgreSQL / SQLite)
templates/
  index.html        Interfaz completa (recepción, técnico, caja, admin)
requirements.txt    Dependencias de Python
render.yaml         Configuración de despliegue en Render
Procfile            Comando de arranque (respaldo)
tests/
  test_app.py       Pruebas automáticas del backend
```

---

## API (referencia rápida)

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/` | La interfaz |
| GET | `/health` | Estado del servidor y motor de BD |
| GET | `/api/config` | Configuración del negocio (servicios, personal, bahías) |
| PUT | `/api/config` | Guardar configuración (desde el panel Administrar) |
| POST | `/api/validar-ingreso` | Valida datos y calcula precio y tiempo |
| POST | `/api/siguiente-estado` | Siguiente estado del servicio |
| GET | `/api/estado` | Lee todo el estado de operación |
| PUT | `/api/estado` | Guarda todo el estado de operación |

---

## Qué falta para una versión más completa (ideas a futuro)

- Autenticación real con usuarios y roles (dueño, recepción, técnicos).
- Envío real de WhatsApp (hoy es simulación).
- Reportes con gráficas e histórico por responsable.
- Dominio propio (se conecta en Render → Settings → Custom Domain).

Ver `TRANSFERENCIA.md` para pasar la aplicación, el dominio y la base de
datos a nombre del dueño del negocio.
