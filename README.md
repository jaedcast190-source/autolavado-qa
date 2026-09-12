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
pytest -q
```

## Render

- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app`

La ruta `/health` permite comprobar que el servidor está activo.
