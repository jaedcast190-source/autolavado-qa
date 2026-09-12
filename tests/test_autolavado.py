import pytest
from app import app, calcular_precio, normalizar_placa, validar_telefono, siguiente_estado

@pytest.fixture()
def client():
    app.config.update(TESTING=True)
    with app.test_client() as client:
        yield client

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json["status"] == "ok"
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"

def test_home(client):
    assert client.get("/").status_code == 200

@pytest.mark.parametrize("entrada,esperada", [
    ("abc 123", "ABC123"),
    ("gto-123-a", "GTO-123-A"),
])
def test_normalizar_placa(entrada, esperada):
    assert normalizar_placa(entrada) == esperada

def test_telefono():
    assert validar_telefono("477 123 4567")
    assert not validar_telefono("123")
    assert not validar_telefono(4771234567)

@pytest.mark.parametrize("servicio,tipo,frecuente,esperado", [
    ("Express", "Auto", False, 80),
    ("Express", "SUV", False, 104),
    ("Estándar", "Camioneta", True, 203),
    ("Profundo", "Moto", False, 210),
])
def test_calculo_precio(servicio, tipo, frecuente, esperado):
    assert calcular_precio(servicio, tipo, frecuente) == esperado

def test_calculo_precio_rechaza_catalogos_invalidos():
    assert calcular_precio("Inventado", "Auto") is None
    assert calcular_precio("Express", "Tráiler") is None

@pytest.mark.parametrize("actual,nuevo", [
    ("Espera","En proceso"),
    ("En proceso","Listo"),
    ("Listo","Entregado"),
    ("Entregado",None),
])
def test_flujo_estados(actual,nuevo):
    assert siguiente_estado(actual) == nuevo

def test_validacion_correcta(client):
    r = client.post("/api/validar-ingreso", json={
        "nombre":"Cliente QA",
        "placa":"abc 123",
        "telefono":"4771234567",
        "servicio":"Estándar"
    })
    assert r.status_code == 200
    assert r.json["precio"] == 150
    assert r.json["placa"] == "ABC123"

def test_validacion_aplica_tipo_y_descuento(client):
    r = client.post("/api/validar-ingreso", json={
        "nombre":"Cliente QA",
        "placa":"abc 123",
        "telefono":"4771234567",
        "servicio":"Estándar",
        "tipo":"Camioneta",
        "frecuente":True,
    })
    assert r.status_code == 200
    assert r.json["precio"] == 203

def test_validacion_rechaza_tipos_de_dato_incorrectos(client):
    r = client.post("/api/validar-ingreso", json={
        "nombre": 123,
        "placa": ["ABC123"],
        "telefono": 4771234567,
        "servicio":"Express",
        "tipo":"Tráiler",
        "frecuente":"sí",
    })
    assert r.status_code == 400
    assert set(r.json["errores"]) == {"nombre", "placa", "telefono", "tipo", "frecuente"}

def test_configuracion_coincide_con_tarifas_operativas(client):
    r = client.get("/api/config")
    assert r.status_code == 200
    assert r.json["servicios"]["Express"] == {"precio": 80, "minutos": 15}
    assert r.json["servicios"]["Profundo"] == {"precio": 350, "minutos": 90}

def test_validacion_rechaza_datos_malos(client):
    r = client.post("/api/validar-ingreso", json={
        "nombre":"",
        "placa":"1",
        "telefono":"123",
        "servicio":"Inventado"
    })
    assert r.status_code == 400
    assert set(r.json["errores"]) == {"nombre","placa","telefono","servicio"}

def test_no_regresa_entregado_a_espera(client):
    r = client.post("/api/siguiente-estado", json={"estado":"Entregado"})
    assert r.status_code == 400


@pytest.mark.parametrize("ruta", ["/api/validar-ingreso", "/api/siguiente-estado"])
@pytest.mark.parametrize("cuerpo", ['[1]', '"texto"', '42', 'true', 'null', '[]', '{'])
def test_api_rechaza_cuerpos_que_no_son_objetos(client, ruta, cuerpo):
    r = client.post(ruta, data=cuerpo, content_type="application/json")
    assert r.status_code == 400
    assert r.json["ok"] is False


@pytest.mark.parametrize("campo", ["servicio", "tipo", "telefono"])
@pytest.mark.parametrize("valor", [[], {}, False, 0])
def test_ingreso_rechaza_tipos_invalidos_sin_error_interno(client, campo, valor):
    data = {"nombre": "Cliente QA", "placa": "ABC123", "servicio": "Express"}
    data[campo] = valor
    r = client.post("/api/validar-ingreso", json=data)
    assert r.status_code == 400
    assert campo in r.json["errores"]


@pytest.mark.parametrize("servicio,tipo", [([], "Auto"), ("Express", {})])
def test_calculo_rechaza_catalogos_con_tipos_invalidos(servicio, tipo):
    assert calcular_precio(servicio, tipo) is None
