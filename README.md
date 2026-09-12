# Autolavado QA

Primera estructura Flask de pruebas para la plataforma de autolavado.

## Ejecutar localmente

```bash
python -m venv .venv
pip install -r requirements.txt
python app.py
```

Abrir `http://127.0.0.1:5000`.

## Pruebas

```bash
python -m pytest -q
node --test tests/frontend_runtime.test.cjs
```

La interfaz servida por Flask está en `templates/index.html`. Los datos de esta
versión QA se conservan en el almacenamiento local del navegador y pueden
respaldarse desde el botón **Respaldo**.

Las pruebas JavaScript requieren Node.js e incluyen fallos de almacenamiento y
recargas simuladas. WhatsApp solo permite previsualizar mensajes; no realiza envíos.
El ingreso diario usa la fecha local del cobro al entregar el vehículo. Para
registros antiguos sin fecha de cobro, usa la fecha de cita como aproximación;
si tampoco existe esa fecha, no los suma. Los ejemplos de demostración se incluyen
en el día actual. Este indicador no sustituye un cierre de caja.

## Render

- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app`

La ruta `/health` permite comprobar que el servidor está activo.
