"""Capa de almacenamiento del Autolavado.

Guarda la configuración del negocio y el estado de operación (vehículos,
cobros, cortes de caja y salidas) en una base de datos.

Diseño clave para la donación:
- Si existe la variable de entorno DATABASE_URL (PostgreSQL de Render),
  se usa PostgreSQL.
- Si no existe, se usa un archivo SQLite local (para desarrollo y pruebas).
Así, cuando la app pase a nombre del amigo, solo se cambia DATABASE_URL
por la base de datos de ellos; no se toca una sola línea de código.

El estado de operación se guarda como un único documento JSON por motivos
de simplicidad y para no romper la interfaz existente, que ya maneja todo
el estado como un objeto {folioNum, vehiculos, cierresCaja, salidasCaja}.
"""

import json
import os
from datetime import datetime, timezone

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USA_POSTGRES = DATABASE_URL.startswith("postgres")

# Clave única del documento de estado (una sola sucursal por ahora).
ESTADO_ID = "principal"

CONFIG_POR_DEFECTO = {
    "version": 1,
    "nombre_negocio": "Autolavado",
    "tipos_vehiculo": {"Auto": 1, "SUV": 1.3, "Camioneta": 1.5, "Moto": 0.6},
    "estados": ["Espera", "En proceso", "Listo", "Entregado"],
    "servicios": {
        "Express":  {"precio": 80,  "minutos": 15, "activo": True},
        "Estándar": {"precio": 150, "minutos": 30, "activo": True},
        "Profundo": {"precio": 350, "minutos": 90, "activo": True},
    },
    "personal": {
        "p1": {"nombre": "Irving", "activo": True, "servicios": None},
        "p2": {"nombre": "Román",  "activo": True, "servicios": None},
        "p3": {"nombre": "Alex",   "activo": True, "servicios": None},
    },
    "bahias": {
        "b1": {"nombre": "Bahía 1", "activo": True, "servicios": None},
        "b2": {"nombre": "Bahía 2", "activo": True, "servicios": None},
        "b3": {"nombre": "Bahía 3", "activo": True, "servicios": None},
    },
    # Fases del lavado (sub-estados dentro de "En proceso").
    # El técnico las va marcando; el monitor y el cliente ven en cuál va.
    # minutos = tiempo esperado de cada fase (para la barra de avance).
    "fases": [
        {"id": "f1", "nombre": "Enjabonado", "minutos": 5, "activo": True},
        {"id": "f2", "nombre": "Enjuague",   "minutos": 4, "activo": True},
        {"id": "f3", "nombre": "Secado",     "minutos": 6, "activo": True},
        {"id": "f4", "nombre": "Aspirado",   "minutos": 8, "activo": True},
        {"id": "f5", "nombre": "Vestiduras", "minutos": 15, "activo": True},
        {"id": "f6", "nombre": "Encerado",   "minutos": 12, "activo": True},
    ],
}

ESTADO_POR_DEFECTO = {
    "folioNum": 3,
    "vehiculos": [
        {"folio": "CW-0001", "hora": "09:15", "horaCita": "09:15", "entrega": "09:45",
         "nombre": "Dr. Ana Torres", "sub": "Auto · MPV-556", "placa": "MPV-556",
         "lavado": "Estándar", "precio": 150, "resp": "Irving", "bahia": "Bahía 1",
         "pago": "Efectivo", "pagado": True, "frec": False, "km": "",
         "estado": "Entregado", "calif": 5, "creadoEn": "demo"},
        {"folio": "CW-0002", "hora": "09:50", "horaCita": "09:50", "entrega": "10:05",
         "nombre": "Dr. Carlos Núñez", "sub": "SUV · JFD-703", "placa": "JFD-703",
         "lavado": "Express", "precio": 104, "resp": "Román", "bahia": "Bahía 2",
         "pago": "Tarjeta", "pagado": True, "frec": True, "km": "",
         "estado": "Listo", "calif": 0, "creadoEn": "demo"},
        {"folio": "CW-0003", "hora": "10:10", "horaCita": "10:10", "entrega": "10:40",
         "nombre": "Dra. María López", "sub": "Auto · HTR-119", "placa": "HTR-119",
         "lavado": "Estándar", "precio": 150, "resp": "Alex", "bahia": "Bahía 3",
         "pago": "Por definir", "pagado": False, "frec": False, "km": "",
         "estado": "En proceso", "calif": 0, "creadoEn": "demo"},
    ],
    "cierresCaja": [],
    "salidasCaja": [],
}

# ---------------------------------------------------------------------------
# Usuarios y roles
# ---------------------------------------------------------------------------
# Roles: "admin" (todo), "recepcion" (registra, día, técnicos, caja),
#        "tecnico" (solo su cola).
import hashlib
import hmac as _hmac
import secrets


def hashear_password(password, sal=None):
    """Hash seguro de contraseña con PBKDF2 (sin dependencias externas)."""
    if sal is None:
        sal = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), sal.encode("utf-8"), 120000)
    return sal + "$" + dk.hex()


def verificar_password(password, almacenado):
    try:
        sal, _ = almacenado.split("$", 1)
    except (ValueError, AttributeError):
        return False
    return _hmac.compare_digest(hashear_password(password, sal), almacenado)


def _usuarios_por_defecto():
    """Usuarios de arranque. Claves temporales que el dueño debe cambiar."""
    return {
        "admin": {"nombre": "Administrador", "rol": "admin",
                  "password": hashear_password("admin123"), "activo": True,
                  "tecnicoId": None},
        "recepcion": {"nombre": "Recepción", "rol": "recepcion",
                      "password": hashear_password("recepcion123"), "activo": True,
                      "tecnicoId": None},
        # Un usuario por técnico (ligado a su id en personal p1/p2/p3)
        "irving": {"nombre": "Irving", "rol": "tecnico",
                   "password": hashear_password("irving123"), "activo": True,
                   "tecnicoId": "p1"},
        "roman": {"nombre": "Román", "rol": "tecnico",
                  "password": hashear_password("roman123"), "activo": True,
                  "tecnicoId": "p2"},
        "alex": {"nombre": "Alex", "rol": "tecnico",
                 "password": hashear_password("alex123"), "activo": True,
                 "tecnicoId": "p3"},
    }


# ---------------------------------------------------------------------------
# Conexión
# ---------------------------------------------------------------------------
def _ruta_sqlite():
    base = os.environ.get("SQLITE_PATH")
def _ruta_sqlite():
    base = os.environ.get("SQLITE_PATH")
    if base:
        return base
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "autolavado.db")


def _conectar():
    """Devuelve (conexion, marcador) según el motor disponible."""
    if USA_POSTGRES:
        import psycopg
        url = DATABASE_URL
        # Render a veces entrega 'postgres://'; psycopg acepta 'postgresql://'.
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        conn = psycopg.connect(url)
        return conn, "%s"
    import sqlite3
    conn = sqlite3.connect(_ruta_sqlite())
    return conn, "?"


def inicializar():
    """Crea las tablas si no existen y siembra config/estado por defecto.

    Primero crea las tablas y hace commit; luego usa las funciones públicas
    (cada una con su propia conexión) para sembrar. Así se evita reutilizar
    una conexión/cursor en medio de una transacción, que da problemas en
    PostgreSQL.
    """
    conn, _ = _conectar()
    try:
        cur = conn.cursor()
        if USA_POSTGRES:
            cur.execute("CREATE TABLE IF NOT EXISTS configuracion (id TEXT PRIMARY KEY, datos JSONB NOT NULL)")
            cur.execute("CREATE TABLE IF NOT EXISTS estado (id TEXT PRIMARY KEY, datos JSONB NOT NULL, actualizado TIMESTAMPTZ NOT NULL)")
        else:
            cur.execute("CREATE TABLE IF NOT EXISTS configuracion (id TEXT PRIMARY KEY, datos TEXT NOT NULL)")
            cur.execute("CREATE TABLE IF NOT EXISTS estado (id TEXT PRIMARY KEY, datos TEXT NOT NULL, actualizado TEXT NOT NULL)")
        conn.commit()
    finally:
        conn.close()

    # Sembrar valores por defecto solo si aún no existen (conexiones propias).
    if leer_configuracion() is None:
        guardar_configuracion(CONFIG_POR_DEFECTO)
    if leer_estado() is None:
        guardar_estado(ESTADO_POR_DEFECTO)
    if leer_usuarios() is None:
        guardar_usuarios(_usuarios_por_defecto())


# ---------------------------------------------------------------------------
# Serialización según motor
# ---------------------------------------------------------------------------
def _serializar(datos):
    return datos if USA_POSTGRES else json.dumps(datos, ensure_ascii=False)


def _deserializar(valor):
    if valor is None:
        return None
    if isinstance(valor, (dict, list)):
        return valor
    return json.loads(valor)


# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
def leer_configuracion(conn=None):
    propia = conn is None
    if propia:
        conn, marc = _conectar()
    else:
        marc = "%s" if USA_POSTGRES else "?"
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT datos FROM configuracion WHERE id = {marc}", ("cfg",))
        fila = cur.fetchone()
        return _deserializar(fila[0]) if fila else None
    finally:
        if propia:
            conn.close()


def _guardar_config_interno(datos, conn):
    marc = "%s" if USA_POSTGRES else "?"
    cur = conn.cursor()
    payload = _serializar(datos)
    if USA_POSTGRES:
        cur.execute(
            "INSERT INTO configuracion (id, datos) VALUES (%s, %s) "
            "ON CONFLICT (id) DO UPDATE SET datos = EXCLUDED.datos",
            ("cfg", json.dumps(datos, ensure_ascii=False)),
        )
    else:
        cur.execute(
            f"INSERT INTO configuracion (id, datos) VALUES ({marc}, {marc}) "
            "ON CONFLICT(id) DO UPDATE SET datos = excluded.datos",
            ("cfg", payload),
        )


def guardar_configuracion(datos):
    conn, _ = _conectar()
    try:
        _guardar_config_interno(datos, conn=conn)
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Estado de operación
# ---------------------------------------------------------------------------
def leer_estado(conn=None):
    propia = conn is None
    if propia:
        conn, marc = _conectar()
    else:
        marc = "%s" if USA_POSTGRES else "?"
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT datos FROM estado WHERE id = {marc}", (ESTADO_ID,))
        fila = cur.fetchone()
        return _deserializar(fila[0]) if fila else None
    finally:
        if propia:
            conn.close()


def _guardar_estado_interno(datos, conn):
    marc = "%s" if USA_POSTGRES else "?"
    ahora = datetime.now(timezone.utc).isoformat()
    cur = conn.cursor()
    if USA_POSTGRES:
        cur.execute(
            "INSERT INTO estado (id, datos, actualizado) VALUES (%s, %s, %s) "
            "ON CONFLICT (id) DO UPDATE SET datos = EXCLUDED.datos, actualizado = EXCLUDED.actualizado",
            (ESTADO_ID, json.dumps(datos, ensure_ascii=False), ahora),
        )
    else:
        cur.execute(
            f"INSERT INTO estado (id, datos, actualizado) VALUES ({marc}, {marc}, {marc}) "
            "ON CONFLICT(id) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado",
            (ESTADO_ID, _serializar(datos), ahora),
        )


def guardar_estado(datos):
    conn, _ = _conectar()
    try:
        _guardar_estado_interno(datos, conn=conn)
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Usuarios (guardados como un documento JSON, igual que configuracion)
# ---------------------------------------------------------------------------
def leer_usuarios():
    conn, marc = _conectar()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT datos FROM configuracion WHERE id = {marc}", ("usuarios",))
        fila = cur.fetchone()
        return _deserializar(fila[0]) if fila else None
    finally:
        conn.close()


def guardar_usuarios(datos):
    conn, _ = _conectar()
    marc = "%s" if USA_POSTGRES else "?"
    try:
        cur = conn.cursor()
        if USA_POSTGRES:
            cur.execute(
                "INSERT INTO configuracion (id, datos) VALUES (%s, %s) "
                "ON CONFLICT (id) DO UPDATE SET datos = EXCLUDED.datos",
                ("usuarios", json.dumps(datos, ensure_ascii=False)),
            )
        else:
            cur.execute(
                f"INSERT INTO configuracion (id, datos) VALUES ({marc}, {marc}) "
                "ON CONFLICT(id) DO UPDATE SET datos = excluded.datos",
                ("usuarios", _serializar(datos)),
            )
        conn.commit()
    finally:
        conn.close()
