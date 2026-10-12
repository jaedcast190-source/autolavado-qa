"""Autolavado — servidor Flask.

Sirve la interfaz (templates/index.html) y la API que esta consume.
El estado de operación se guarda en base de datos (PostgreSQL en Render,
SQLite en desarrollo), de modo que los datos se comparten entre todos los
dispositivos (recepción, técnicos) y no se pierden al cerrar el navegador.
"""

import os
import re
from decimal import Decimal, ROUND_HALF_UP

from flask import Flask, jsonify, render_template, request

import db

app = Flask(__name__)

# Catálogos base usados por la validación del servidor. La config real y
# editable vive en la base de datos; estos son el respaldo de arranque.
TIPOS_VEHICULO = {"Auto": 1, "SUV": 1.3, "Camioneta": 1.5, "Moto": 0.6}
ESTADOS = ["Espera", "En proceso", "Listo", "Entregado"]


# ---------------------------------------------------------------------------
# Utilidades de negocio
# ---------------------------------------------------------------------------
def normalizar_placa(valor):
    if not isinstance(valor, str):
        return ""
    return re.sub(r"[^A-Z0-9-]", "", valor.upper())[:12]


def validar_telefono(valor):
    if valor is None or valor == "":
        return True
    if not isinstance(valor, str):
        return False
    return len(re.sub(r"\D", "", valor)) == 10


def _servicios_activos(config):
    return {n: s for n, s in config.get("servicios", {}).items() if s.get("activo", True)}


def calcular_precio(config, servicio, tipo="Auto", frecuente=False):
    if not isinstance(servicio, str) or not isinstance(tipo, str):
        return None
    servicios = config.get("servicios", {})
    tipos = config.get("tipos_vehiculo", TIPOS_VEHICULO)
    if servicio not in servicios or tipo not in tipos:
        return None
    base = servicios[servicio].get("precio_actual", servicios[servicio].get("precio"))
    precio = Decimal(str(base * tipos[tipo])).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    if frecuente:
        precio = (precio * Decimal("0.9")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(precio)


def siguiente_estado(actual):
    if actual not in ESTADOS:
        return None
    i = ESTADOS.index(actual)
    return ESTADOS[i + 1] if i < len(ESTADOS) - 1 else None


def _config_para_interfaz():
    """Config con los campos derivados que la interfaz espera
    (precios_actuales por tipo de vehículo)."""
    config = db.leer_configuracion() or db.CONFIG_POR_DEFECTO
    tipos = config.get("tipos_vehiculo", TIPOS_VEHICULO)
    for nombre, s in config.get("servicios", {}).items():
        base = s.get("precio_actual", s.get("precio"))
        if "precios_vehiculo" in s and isinstance(s["precios_vehiculo"], dict):
            s["precios_actuales"] = {t: s["precios_vehiculo"][t].get("precio")
                                     for t in s["precios_vehiculo"]}
        else:
            s["precios_actuales"] = {
                t: int(Decimal(str(base * f)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
                for t, f in tipos.items()
            }
        s.setdefault("precio_actual", base)
    return config


# ---------------------------------------------------------------------------
# Páginas
# ---------------------------------------------------------------------------
@app.get("/")
def index():
    config = db.leer_configuracion() or db.CONFIG_POR_DEFECTO
    return render_template("index.html", configuracion=config)


@app.get("/favicon.ico")
def favicon():
    return ("", 204)


@app.get("/health")
def health():
    motor = "postgres" if db.USA_POSTGRES else "sqlite"
    return jsonify(status="ok", app="autolavado", motor=motor)


# ---------------------------------------------------------------------------
# API de configuración
# ---------------------------------------------------------------------------
@app.get("/api/config")
def api_config():
    return jsonify(_config_para_interfaz())


@app.put("/api/config")
def api_guardar_config():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(ok=False, error="Se requiere un objeto JSON"), 400
    if not isinstance(data.get("nombre_negocio"), str) or not data["nombre_negocio"].strip():
        return jsonify(ok=False, error="El nombre del negocio es obligatorio"), 400
    if not isinstance(data.get("servicios"), dict) or not data["servicios"]:
        return jsonify(ok=False, error="Debe existir al menos un servicio"), 400

    actual = db.leer_configuracion() or dict(db.CONFIG_POR_DEFECTO)
    actual["nombre_negocio"] = data["nombre_negocio"].strip()[:80]
    actual["servicios"] = data["servicios"]
    if isinstance(data.get("personal"), dict):
        actual["personal"] = data["personal"]
    if isinstance(data.get("bahias"), dict):
        actual["bahias"] = data["bahias"]
    if isinstance(data.get("tipos_vehiculo"), dict):
        actual["tipos_vehiculo"] = data["tipos_vehiculo"]
    actual["version"] = int(actual.get("version", 1)) + 1

    db.guardar_configuracion(actual)
    return jsonify(ok=True, version=actual["version"], config=_config_para_interfaz())


# ---------------------------------------------------------------------------
# API de validación de ingreso (precio + minutos)
# ---------------------------------------------------------------------------
@app.post("/api/validar-ingreso")
def validar_ingreso():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(ok=False, errores={"json": "Se requiere un objeto JSON"}), 400

    config = db.leer_configuracion() or db.CONFIG_POR_DEFECTO
    servicios = config.get("servicios", {})
    tipos = config.get("tipos_vehiculo", TIPOS_VEHICULO)

    errores = {}
    nombre_raw = data.get("nombre")
    nombre = nombre_raw.strip() if isinstance(nombre_raw, str) else ""
    placa = normalizar_placa(data.get("placa"))
    telefono = data.get("telefono")
    servicio = data.get("servicio")
    tipo = data.get("tipo", "Auto")
    frecuente = data.get("frecuente", False)

    if not nombre:
        errores["nombre"] = "Nombre obligatorio"
    elif len(nombre) > 100:
        errores["nombre"] = "Nombre demasiado largo"
    if len(placa) < 5:
        errores["placa"] = "Placa inválida"
    if not validar_telefono(telefono):
        errores["telefono"] = "Teléfono inválido"
    if not isinstance(servicio, str) or servicio not in servicios:
        errores["servicio"] = "Servicio inexistente"
    if not isinstance(tipo, str) or tipo not in tipos:
        errores["tipo"] = "Tipo de vehículo inexistente"
    if not isinstance(frecuente, bool):
        errores["frecuente"] = "El indicador frecuente debe ser booleano"

    if errores:
        return jsonify(ok=False, errores=errores), 400

    return jsonify(
        ok=True,
        placa=placa,
        precio=calcular_precio(config, servicio, tipo, frecuente),
        minutos=servicios[servicio]["minutos"],
    )


@app.post("/api/siguiente-estado")
def api_siguiente_estado():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(ok=False, error="Se requiere un objeto JSON"), 400
    nuevo = siguiente_estado(data.get("estado"))
    if nuevo is None:
        return jsonify(ok=False, error="Transición no permitida"), 400
    return jsonify(ok=True, anterior=data.get("estado"), nuevo=nuevo)


# ---------------------------------------------------------------------------
# API de ESTADO de operación — reemplaza localStorage.
# La interfaz lee todo el documento y lo vuelve a escribir completo.
# ---------------------------------------------------------------------------
@app.get("/api/estado")
def api_leer_estado():
    estado = db.leer_estado()
    if estado is None:
        estado = dict(db.ESTADO_POR_DEFECTO)
    return jsonify(ok=True, estado=estado)


@app.put("/api/estado")
def api_guardar_estado():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(ok=False, error="Se requiere un objeto JSON"), 400
    if not isinstance(data.get("vehiculos"), list):
        return jsonify(ok=False, error="El estado debe incluir la lista de vehículos"), 400

    estado = {
        "folioNum": int(data.get("folioNum", 0)) if str(data.get("folioNum", "")).lstrip("-").isdigit() else 0,
        "vehiculos": data.get("vehiculos", []),
        "cierresCaja": data.get("cierresCaja", []) if isinstance(data.get("cierresCaja"), list) else [],
        "salidasCaja": data.get("salidasCaja", []) if isinstance(data.get("salidasCaja"), list) else [],
    }
    db.guardar_estado(estado)
    return jsonify(ok=True)


# ---------------------------------------------------------------------------
# Seguridad e inicialización
# ---------------------------------------------------------------------------
@app.after_request
def security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


# Inicializa la base de datos al importar el módulo (sirve tanto para
# `python app.py` como para Gunicorn en Render).
db.inicializar()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
