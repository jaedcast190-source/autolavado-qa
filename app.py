from flask import Flask, jsonify, render_template, request
from datetime import datetime, timezone
import os
import re
from decimal import Decimal, ROUND_HALF_UP

app = Flask(__name__)

SERVICIOS = {
    "Express": {"precio": 80, "minutos": 15},
    "Estándar": {"precio": 150, "minutos": 30},
    "Profundo": {"precio": 350, "minutos": 90},
}

TIPOS_VEHICULO = {"Auto": 1, "SUV": 1.3, "Camioneta": 1.5, "Moto": 0.6}

ESTADOS = ["Espera", "En proceso", "Listo", "Entregado"]

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

def calcular_precio(servicio, tipo="Auto", frecuente=False):
    if not isinstance(servicio, str) or not isinstance(tipo, str):
        return None
    if servicio not in SERVICIOS or tipo not in TIPOS_VEHICULO:
        return None
    precio = Decimal(str(SERVICIOS[servicio]["precio"] * TIPOS_VEHICULO[tipo]))
    precio = precio.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    if frecuente:
        precio = (precio * Decimal("0.9")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(precio)

def siguiente_estado(actual):
    if actual not in ESTADOS:
        return None
    i = ESTADOS.index(actual)
    return ESTADOS[i + 1] if i < len(ESTADOS) - 1 else None

@app.get("/")
def index():
    return render_template("index.html")

@app.get("/health")
def health():
    return jsonify(status="ok", app="autolavado-qa", timestamp=datetime.now(timezone.utc).isoformat())

@app.get("/api/config")
def config():
    return jsonify(servicios=SERVICIOS, tipos_vehiculo=TIPOS_VEHICULO, estados=ESTADOS)

@app.post("/api/validar-ingreso")
def validar_ingreso():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(ok=False, errores={"json": "Se requiere un objeto JSON"}), 400
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
    if not isinstance(servicio, str) or servicio not in SERVICIOS:
        errores["servicio"] = "Servicio inexistente"
    if not isinstance(tipo, str) or tipo not in TIPOS_VEHICULO:
        errores["tipo"] = "Tipo de vehículo inexistente"
    if not isinstance(frecuente, bool):
        errores["frecuente"] = "El indicador frecuente debe ser booleano"

    if errores:
        return jsonify(ok=False, errores=errores), 400

    tarifa = SERVICIOS[servicio]
    return jsonify(
        ok=True,
        placa=placa,
        precio=calcular_precio(servicio, tipo, frecuente),
        minutos=tarifa["minutos"],
    )

@app.post("/api/siguiente-estado")
def api_siguiente_estado():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(ok=False, error="Se requiere un objeto JSON"), 400
    actual = data.get("estado")
    nuevo = siguiente_estado(actual)
    if nuevo is None:
        return jsonify(ok=False, error="Transición no permitida"), 400
    return jsonify(ok=True, anterior=actual, nuevo=nuevo)

@app.after_request
def security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    return response

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
