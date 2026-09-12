from flask import Flask, jsonify, render_template, request
from datetime import datetime
import os
import re

app = Flask(__name__)

SERVICIOS = {
    "Express": {"precio": 104, "minutos": 20},
    "Estándar": {"precio": 150, "minutos": 30},
    "Completo": {"precio": 220, "minutos": 45},
    "Profundo": {"precio": 300, "minutos": 60},
    "Premium": {"precio": 450, "minutos": 90},
}

ESTADOS = ["Espera", "En proceso", "Listo", "Entregado"]

def normalizar_placa(valor):
    return re.sub(r"[^A-Z0-9-]", "", (valor or "").upper())

def validar_telefono(valor):
    if not valor:
        return True
    return len(re.sub(r"\D", "", valor)) == 10

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
    return jsonify(status="ok", app="autolavado-qa", timestamp=datetime.utcnow().isoformat() + "Z")

@app.get("/api/config")
def config():
    return jsonify(servicios=SERVICIOS, estados=ESTADOS)

@app.post("/api/validar-ingreso")
def validar_ingreso():
    data = request.get_json(silent=True) or {}
    errores = {}
    nombre = (data.get("nombre") or "").strip()
    placa = normalizar_placa(data.get("placa"))
    telefono = data.get("telefono") or ""
    servicio = data.get("servicio")

    if not nombre:
        errores["nombre"] = "Nombre obligatorio"
    if len(placa) < 5:
        errores["placa"] = "Placa inválida"
    if not validar_telefono(telefono):
        errores["telefono"] = "Teléfono inválido"
    if servicio not in SERVICIOS:
        errores["servicio"] = "Servicio inexistente"

    if errores:
        return jsonify(ok=False, errores=errores), 400

    tarifa = SERVICIOS[servicio]
    return jsonify(ok=True, placa=placa, precio=tarifa["precio"], minutos=tarifa["minutos"])

@app.post("/api/siguiente-estado")
def api_siguiente_estado():
    data = request.get_json(silent=True) or {}
    actual = data.get("estado")
    nuevo = siguiente_estado(actual)
    if nuevo is None:
        return jsonify(ok=False, error="Transición no permitida"), 400
    return jsonify(ok=True, anterior=actual, nuevo=nuevo)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
