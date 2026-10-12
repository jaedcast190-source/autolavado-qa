"""Pruebas del backend del Autolavado.

Usan SQLite temporal (sin DATABASE_URL), de modo que no tocan ninguna
base de datos real. Verifican precios, validaciones y persistencia.
"""
import os
import sys
import tempfile
import importlib

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture()
def cliente():
    # Base de datos temporal y aislada por cada corrida.
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    os.environ.pop("DATABASE_URL", None)
    os.environ["SQLITE_PATH"] = tmp.name

    import db as dbmod
    importlib.reload(dbmod)
    import app as appmod
    importlib.reload(appmod)

    appmod.app.config.update(TESTING=True)
    with appmod.app.test_client() as c:
        # Inicia sesión como admin para las pruebas de endpoints protegidos.
        c.post("/api/login", json={"usuario": "admin", "password": "admin123"})
        yield c
    os.unlink(tmp.name)


@pytest.fixture()
def cliente_sin_login():
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    os.environ.pop("DATABASE_URL", None)
    os.environ["SQLITE_PATH"] = tmp.name
    import db as dbmod
    importlib.reload(dbmod)
    import app as appmod
    importlib.reload(appmod)
    appmod.app.config.update(TESTING=True)
    with appmod.app.test_client() as c:
        yield c
    os.unlink(tmp.name)


# --- Salud y config ---
def test_health(cliente):
    r = cliente.get("/health")
    assert r.status_code == 200
    assert r.get_json()["status"] == "ok"


def test_config_tiene_servicios(cliente):
    r = cliente.get("/api/config")
    data = r.get_json()
    assert "Express" in data["servicios"]
    assert data["servicios"]["Estándar"]["precios_actuales"]["SUV"] == 195


# --- Precios ---
def test_precio_suv_profundo_frecuente(cliente):
    r = cliente.post("/api/validar-ingreso", json={
        "nombre": "Dr. X", "placa": "ABC-123", "telefono": "4771234567",
        "servicio": "Profundo", "tipo": "SUV", "frecuente": True})
    assert r.status_code == 200
    # 350 * 1.3 = 455 -> *0.9 = 409.5 -> 410
    assert r.get_json()["precio"] == 410


def test_precio_auto_estandar(cliente):
    r = cliente.post("/api/validar-ingreso", json={
        "nombre": "A", "placa": "ABC-12", "servicio": "Estándar", "tipo": "Auto"})
    assert r.get_json()["precio"] == 150


# --- Validaciones ---
def test_rechaza_placa_corta(cliente):
    r = cliente.post("/api/validar-ingreso", json={
        "nombre": "A", "placa": "AB", "servicio": "Express"})
    assert r.status_code == 400
    assert "placa" in r.get_json()["errores"]


def test_rechaza_telefono_invalido(cliente):
    r = cliente.post("/api/validar-ingreso", json={
        "nombre": "A", "placa": "ABCDE", "telefono": "123", "servicio": "Express"})
    assert r.status_code == 400
    assert "telefono" in r.get_json()["errores"]


def test_rechaza_json_no_objeto(cliente):
    r = cliente.post("/api/validar-ingreso", json=[1, 2, 3])
    assert r.status_code == 400


def test_telefono_opcional(cliente):
    r = cliente.post("/api/validar-ingreso", json={
        "nombre": "A", "placa": "ABCDE", "servicio": "Express", "tipo": "Auto"})
    assert r.status_code == 200


# --- Estado: persistencia ---
def test_estado_inicial_trae_demo(cliente):
    r = cliente.get("/api/estado")
    assert r.status_code == 200
    assert len(r.get_json()["estado"]["vehiculos"]) == 3


def test_estado_guarda_y_relee(cliente):
    nuevo = {"folioNum": 9, "vehiculos": [{"folio": "CW-0009", "nombre": "Z"}],
             "cierresCaja": [], "salidasCaja": []}
    r = cliente.put("/api/estado", json=nuevo)
    assert r.status_code == 200
    r2 = cliente.get("/api/estado")
    e = r2.get_json()["estado"]
    assert e["folioNum"] == 9
    assert e["vehiculos"][0]["nombre"] == "Z"


def test_estado_rechaza_sin_vehiculos(cliente):
    r = cliente.put("/api/estado", json={"folioNum": 1})
    assert r.status_code == 400


# --- Transición de estados ---
def test_siguiente_estado(cliente):
    r = cliente.post("/api/siguiente-estado", json={"estado": "Espera"})
    assert r.get_json()["nuevo"] == "En proceso"


def test_siguiente_estado_final(cliente):
    r = cliente.post("/api/siguiente-estado", json={"estado": "Entregado"})
    assert r.status_code == 400


# --- Config: guardar ---
def test_guardar_config(cliente):
    cfg = {
        "nombre_negocio": "Autolavado HAP",
        "servicios": {"Express": {"precio": 90, "minutos": 15, "activo": True}},
    }
    r = cliente.put("/api/config", json=cfg)
    assert r.status_code == 200
    r2 = cliente.get("/api/config")
    assert r2.get_json()["nombre_negocio"] == "Autolavado HAP"


def test_config_rechaza_sin_nombre(cliente):
    r = cliente.put("/api/config", json={"servicios": {"X": {"precio": 1, "minutos": 1}}})
    assert r.status_code == 400


# --- Fases ---
def test_config_trae_fases(cliente):
    r = cliente.get("/api/config")
    fases = r.get_json().get("fases", [])
    assert len(fases) >= 1
    assert all("nombre" in f and "minutos" in f for f in fases)


def test_guardar_fases(cliente):
    cfg = {
        "nombre_negocio": "Autolavado",
        "servicios": {"Express": {"precio": 80, "minutos": 15, "activo": True}},
        "fases": [{"id": "f1", "nombre": "Lavado", "minutos": 10, "activo": True},
                  {"id": "f2", "nombre": "Secado", "minutos": 5, "activo": True}],
    }
    r = cliente.put("/api/config", json=cfg)
    assert r.status_code == 200
    fases = r.get_json()["config"]["fases"]
    assert [f["nombre"] for f in fases] == ["Lavado", "Secado"]


# --- Seguimiento del cliente ---
def test_seguimiento_codigo_valido(cliente):
    estado = {"folioNum": 1, "vehiculos": [
        {"folio": "CW-0001", "codigo": "ABC123", "placa": "XYZ-000",
         "lavado": "Express", "estado": "En proceso", "faseActual": 1}],
        "cierresCaja": [], "salidasCaja": []}
    cliente.put("/api/estado", json=estado)
    r = cliente.get("/api/seguimiento/ABC123")
    assert r.status_code == 200
    v = r.get_json()["vehiculo"]
    assert v["placa"] == "XYZ-000"
    assert v["estado"] == "En proceso"


def test_seguimiento_no_expone_otros(cliente):
    # El endpoint devuelve solo campos públicos, no cobros ni teléfono
    estado = {"folioNum": 1, "vehiculos": [
        {"folio": "CW-0001", "codigo": "ABC123", "placa": "XYZ-000", "telefono": "4771234567",
         "lavado": "Express", "estado": "Listo", "cobros": [{"centavos": 8000}]}],
        "cierresCaja": [], "salidasCaja": []}
    cliente.put("/api/estado", json=estado)
    v = cliente.get("/api/seguimiento/ABC123").get_json()["vehiculo"]
    assert "telefono" not in v
    assert "cobros" not in v


def test_seguimiento_codigo_inexistente(cliente):
    r = cliente.get("/api/seguimiento/NOEXISTE")
    assert r.status_code == 404


def test_seguimiento_calificar(cliente):
    estado = {"folioNum": 1, "vehiculos": [
        {"folio": "CW-0001", "codigo": "ABC123", "placa": "XYZ-000",
         "lavado": "Express", "estado": "Entregado", "calif": 0}],
        "cierresCaja": [], "salidasCaja": []}
    cliente.put("/api/estado", json=estado)
    r = cliente.post("/api/seguimiento/ABC123/calificar", json={"estrellas": 5, "comentario": "Excelente"})
    assert r.status_code == 200
    v = cliente.get("/api/seguimiento/ABC123").get_json()["vehiculo"]
    assert v["calif"] == 5


def test_seguimiento_calificar_invalida(cliente):
    estado = {"folioNum": 1, "vehiculos": [
        {"folio": "CW-0001", "codigo": "ABC123", "estado": "Entregado"}],
        "cierresCaja": [], "salidasCaja": []}
    cliente.put("/api/estado", json=estado)
    r = cliente.post("/api/seguimiento/ABC123/calificar", json={"estrellas": 9})
    assert r.status_code == 400


# --- QR ---
def test_qr_png(cliente):
    r = cliente.get("/qr/ABC123.png")
    assert r.status_code == 200
    assert r.mimetype == "image/png"
    assert r.data[:8] == b"\x89PNG\r\n\x1a\n"


# --- Monitor ---
def test_monitor_carga(cliente):
    r = cliente.get("/monitor")
    assert r.status_code == 200
    assert b"Central de lavado" in r.data


def test_api_monitor_publico_sin_login(cliente_sin_login):
    # La pantalla de central de lavado no tiene sesión: el endpoint debe
    # responder 200 (público) y no 401, que era el bug de "no se ven los autos".
    r = cliente_sin_login.get("/api/monitor")
    assert r.status_code == 200
    d = r.get_json()
    assert d["ok"] is True
    assert isinstance(d["vehiculos"], list)
    assert isinstance(d["fases"], list)


def test_api_monitor_solo_en_proceso(cliente):
    # Guarda un auto en proceso y uno en espera; el monitor solo ve el activo.
    cliente.put("/api/estado", json={"folioNum": 2, "vehiculos": [
        {"folio": "CW-0101", "placa": "AAA-111", "estado": "En proceso",
         "faseActual": 1, "tipoVehiculo": "SUV", "creadoEn": "2026-10-12T10:00:00"},
        {"folio": "CW-0102", "placa": "BBB-222", "estado": "Espera",
         "creadoEn": "2026-10-12T10:05:00"},
    ]})
    r = cliente.get("/api/monitor")
    assert r.status_code == 200
    vs = r.get_json()["vehiculos"]
    placas = [v["placa"] for v in vs]
    assert "AAA-111" in placas and "BBB-222" not in placas
    assert vs[0]["tipoVehiculo"] == "SUV"


# --- Optimización: guardado ligero de activos ---
def test_patch_activos_conserva_historico(cliente):
    # Carga histórico (día pasado) + estado inicial
    historico = {"folioNum": 2, "vehiculos": [
        {"folio": "CW-0001", "placa": "OLD-001", "estado": "Entregado",
         "creadoEn": "2026-09-01T10:00:00", "lavado": "Express"},
        {"folio": "CW-0002", "placa": "OLD-002", "estado": "Entregado",
         "creadoEn": "2026-09-02T10:00:00", "lavado": "Express"}],
        "cierresCaja": [], "salidasCaja": []}
    cliente.put("/api/estado", json=historico)
    # PATCH con solo un auto de hoy
    hoy = "2026-10-12"
    r = cliente.patch("/api/estado/activos", json={
        "hoy": hoy, "folioNum": 3,
        "vehiculos": [{"folio": "CW-0003", "placa": "NEW-003", "estado": "Espera",
                       "creadoEn": hoy + "T10:00:00", "lavado": "Express"}],
        "cierresCaja": [], "salidasCaja": []})
    assert r.status_code == 200
    # El histórico de septiembre debe seguir ahí + el nuevo
    vs = cliente.get("/api/estado").get_json()["estado"]["vehiculos"]
    placas = {v["placa"] for v in vs}
    assert "OLD-001" in placas and "OLD-002" in placas and "NEW-003" in placas


def test_patch_activos_reemplaza_los_de_hoy(cliente):
    hoy = "2026-10-12"
    inicial = {"folioNum": 1, "vehiculos": [
        {"folio": "CW-0001", "placa": "HOY-A", "estado": "Espera", "creadoEn": hoy + "T09:00:00"}],
        "cierresCaja": [], "salidasCaja": []}
    cliente.put("/api/estado", json=inicial)
    # El auto HOY-A ahora está "En proceso" (cambió de estado)
    r = cliente.patch("/api/estado/activos", json={
        "hoy": hoy, "folioNum": 1,
        "vehiculos": [{"folio": "CW-0001", "placa": "HOY-A", "estado": "En proceso", "creadoEn": hoy + "T09:00:00"}],
        "cierresCaja": [], "salidasCaja": []})
    assert r.status_code == 200
    vs = cliente.get("/api/estado").get_json()["estado"]["vehiculos"]
    hoy_a = [v for v in vs if v["placa"] == "HOY-A"]
    assert len(hoy_a) == 1  # no se duplicó
    assert hoy_a[0]["estado"] == "En proceso"  # se actualizó


def test_patch_activos_rechaza_sin_fecha(cliente):
    r = cliente.patch("/api/estado/activos", json={"vehiculos": []})
    assert r.status_code == 400


# --- Login y roles ---
def test_login_correcto(cliente_sin_login):
    r = cliente_sin_login.post("/api/login", json={"usuario": "admin", "password": "admin123"})
    assert r.status_code == 200
    assert r.get_json()["usuario"]["rol"] == "admin"


def test_login_incorrecto(cliente_sin_login):
    r = cliente_sin_login.post("/api/login", json={"usuario": "admin", "password": "mala"})
    assert r.status_code == 401


def test_login_tecnico(cliente_sin_login):
    r = cliente_sin_login.post("/api/login", json={"usuario": "irving", "password": "irving123"})
    assert r.status_code == 200
    u = r.get_json()["usuario"]
    assert u["rol"] == "tecnico" and u["tecnicoId"] == "p1"


def test_estado_requiere_login(cliente_sin_login):
    r = cliente_sin_login.get("/api/estado")
    assert r.status_code == 401


def test_config_put_solo_admin(cliente_sin_login):
    # Login como técnico (no admin)
    cliente_sin_login.post("/api/login", json={"usuario": "irving", "password": "irving123"})
    r = cliente_sin_login.put("/api/config", json={"nombre_negocio": "X", "servicios": {"A": {"precio": 1, "minutos": 1}}})
    assert r.status_code == 403  # técnico no puede configurar


def test_logout(cliente):
    r = cliente.post("/api/logout")
    assert r.status_code == 200
    # Tras logout, el estado ya no es accesible
    assert cliente.get("/api/estado").status_code == 401


def test_password_hash_verifica():
    import db
    h = db.hashear_password("secreto")
    assert db.verificar_password("secreto", h)
    assert not db.verificar_password("otro", h)
    assert "$" in h and "secreto" not in h  # no guarda texto plano
