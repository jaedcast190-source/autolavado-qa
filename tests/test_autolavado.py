import pytest
from app import app, normalizar_placa, validar_telefono, siguiente_estado

@pytest.fixture()
def client():
    app.config.update(TESTING=True)
    with app.test_client() as client:
        yield client

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json["status"] == "ok"

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
