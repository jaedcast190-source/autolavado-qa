"""Genera una simulación completa del mes de septiembre 2026 para el Autolavado.

- Promedio de 20 lavados diarios (variación realista 16-24).
- Las tres modalidades (Express, Estándar, Profundo) y los cuatro tipos de vehículo.
- Los tres técnicos (Irving, Román, Alex) y las tres bahías, rotando.
- Cada vehículo recorre todo el ciclo: Espera > En proceso > Listo > Entregado,
  con su cobro (efectivo/tarjeta/transferencia) y, la mayoría, calificación.
- Un corte de caja por cada día con actividad.

Produce un archivo estado_septiembre.json con la estructura que la app espera
({folioNum, vehiculos, cierresCaja, salidasCaja}), listo para enviar a /api/estado.
"""

import json
import random
from datetime import datetime, timedelta, date
from decimal import Decimal, ROUND_HALF_UP

random.seed(42)  # resultados reproducibles

SERVICIOS = {"Express": {"precio": 80, "minutos": 15},
             "Estándar": {"precio": 150, "minutos": 30},
             "Profundo": {"precio": 350, "minutos": 90}}
FACTOR = {"Auto": 1, "SUV": 1.3, "Camioneta": 1.5, "Moto": 0.6}
PERSONAL = {"p1": "Irving", "p2": "Román", "p3": "Alex"}
BAHIAS = {"b1": "Bahía 1", "b2": "Bahía 2", "b3": "Bahía 3"}
METODOS = ["Efectivo", "Tarjeta", "Transferencia"]

# Distribución realista: más estándar, menos profundo
MIX_SERVICIO = ["Express"]*3 + ["Estándar"]*5 + ["Profundo"]*2
MIX_VEHICULO = ["Auto"]*5 + ["SUV"]*3 + ["Camioneta"]*2 + ["Moto"]*1
MIX_METODO = ["Efectivo"]*5 + ["Tarjeta"]*3 + ["Transferencia"]*2

NOMBRES = ["Dr. Ana Torres", "Dr. Carlos Núñez", "Dra. María López", "Dr. Jorge Ramírez",
           "Dra. Laura Díaz", "Dr. Miguel Sánchez", "Dra. Patricia Gómez", "Dr. Roberto Cruz",
           "Dra. Sofía Herrera", "Dr. Fernando Reyes", "Dra. Carmen Vega", "Dr. Luis Mendoza",
           "Dra. Isabel Romero", "Dr. Andrés Castro", "Dra. Elena Flores", "Dr. Pablo Jiménez",
           "Dra. Mónica Ruiz", "Dr. Héctor Morales", "Dra. Teresa Ortiz", "Dr. Raúl Guzmán"]
MARCAS = [("Toyota", "Corolla"), ("Honda", "Civic"), ("Nissan", "Sentra"), ("Mazda", "3"),
          ("Volkswagen", "Jetta"), ("Chevrolet", "Aveo"), ("Kia", "Forte"), ("Hyundai", "Elantra"),
          ("Ford", "Escape"), ("Jeep", "Compass")]
COLORES = ["Blanco", "Negro", "Gris", "Plata", "Rojo", "Azul"]


def precio_de(servicio, tipo, frecuente):
    base = SERVICIOS[servicio]["precio"]
    p = Decimal(str(base * FACTOR[tipo])).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    if frecuente:
        p = (p * Decimal("0.9")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(p)


def centavos(pesos):
    return int(round(pesos * 100))


def placa_aleatoria():
    letras = "".join(random.choice("ABCDEFGHJKLMNPRSTUVWXYZ") for _ in range(3))
    nums = "".join(random.choice("0123456789") for _ in range(3))
    return f"{letras}-{nums}"


def generar():
    vehiculos = []
    cierres = []
    salidas = []
    folio = 0

    anio, mes = 2026, 9
    dia = date(anio, mes, 1)
    fin = date(anio, mes, 30)

    while dia <= fin:
        fecha_iso = dia.isoformat()
        # Promedio ~20 diario. Días hábiles más altos, fines de semana algo menos.
        base = 23 if dia.weekday() < 5 else 15
        cantidad = max(10, int(random.gauss(base, 3)))

        tot_dia = {"Efectivo": 0, "Tarjeta": 0, "Transferencia": 0}

        # hora de apertura: 8:00
        minuto_actual = 8 * 60
        for _ in range(cantidad):
            folio += 1
            servicio = random.choice(MIX_SERVICIO)
            tipo = random.choice(MIX_VEHICULO)
            frecuente = random.random() < 0.25
            precio = precio_de(servicio, tipo, frecuente)
            dur = SERVICIOS[servicio]["minutos"]

            pid = random.choice(list(PERSONAL))
            bid = random.choice(list(BAHIAS))
            metodo = random.choice(MIX_METODO)
            nombre = random.choice(NOMBRES)
            marca, modelo = random.choice(MARCAS)
            color = random.choice(COLORES)
            placa = placa_aleatoria()

            # horarios
            h_cita = minuto_actual
            inicio = h_cita + random.randint(0, 20)
            fin_serv = inicio + dur
            entrega_real = fin_serv + random.randint(2, 15)
            minuto_actual += random.randint(15, 35)  # siguiente auto

            def hm(m):
                return f"{m//60:02d}:{m%60:02d}"

            def iso(m):
                return datetime(anio, mes, dia.day, min(23, m // 60), m % 60).isoformat()

            # calificación: 70% califican; de esos, mayoría 4-5
            calif = 0
            if random.random() < 0.70:
                calif = random.choices([5, 4, 3, 2, 1], weights=[45, 30, 15, 7, 3])[0]

            v = {
                "folio": f"CW-{folio:04d}",
                "hora": hm(h_cita),
                "horaCita": hm(h_cita),
                "fechaCita": fecha_iso,
                "entrega": hm(entrega_real),
                "nombre": nombre,
                "telefono": "477" + "".join(random.choice("0123456789") for _ in range(7)),
                "placa": placa,
                "sub": f"{tipo} · {placa}",
                "lavado": servicio,
                "precio": precio,
                "marca": marca, "modelo": modelo, "color": color,
                "inspeccionIngreso": {"suciedad": random.choice(["Ligera", "Media", "Alta"]),
                                       "pertenenciasConfirmadas": True, "danos": "",
                                       "fecha": iso(h_cita)},
                "tarifaHistorica": precio,
                "duracionMinutos": dur,
                "presente": True,
                "responsableId": pid, "bahiaId": bid,
                "resp": PERSONAL[pid], "bahia": BAHIAS[bid],
                "pago": metodo, "pagado": True,
                "cobros": [{"centavos": centavos(precio), "metodo": metodo,
                            "fecha": fecha_iso, "hora": iso(entrega_real)}],
                "fechaPago": fecha_iso,
                "frec": frecuente, "km": str(random.randint(20000, 150000)),
                "notas": "",
                "estado": "Entregado", "calif": calif,
                "creadoEn": iso(h_cita),
                "inicioReal": iso(inicio), "finReal": iso(fin_serv),
                "finEstimado": iso(fin_serv), "entregaReal": iso(entrega_real),
                "historial": [
                    {"estado": "Espera", "fecha": iso(h_cita)},
                    {"estado": "En proceso", "fecha": iso(inicio)},
                    {"estado": "Listo", "fecha": iso(fin_serv)},
                    {"estado": "Entregado", "fecha": iso(entrega_real)},
                ],
            }
            vehiculos.append(v)
            tot_dia[metodo] += centavos(precio)

        # salida de caja ocasional (gasto de insumos) algunos días
        if random.random() < 0.4:
            salidas.append({"tipo": "Gasto", "centavos": centavos(random.choice([120, 200, 350, 80])),
                            "metodo": "Efectivo", "motivo": random.choice(["Jabón y shampoo", "Franelas", "Agua", "Cera"]),
                            "fecha": fecha_iso, "hora": datetime(anio, mes, dia.day, 19, 0).isoformat()})

        # corte de caja del día
        salida_efvo = sum(s["centavos"] for s in salidas if s["fecha"] == fecha_iso and s["metodo"] == "Efectivo")
        fondo = centavos(500)
        esperado = fondo + tot_dia["Efectivo"] - salida_efvo
        # contado: casi siempre cuadra, a veces pequeña diferencia
        contado = esperado + random.choice([0, 0, 0, 0, -2000, 5000, -500])
        movimientos = sum(1 for v in vehiculos if v["creadoEn"].startswith(fecha_iso))
        cierres.append({
            "fecha": fecha_iso, "hora": datetime(anio, mes, dia.day, 20, 0).isoformat(),
            "revision": 1, "totales": tot_dia, "movimientos": movimientos,
            "salidasEfectivo": salida_efvo, "fondo": fondo, "esperado": esperado,
            "contado": contado, "diferencia": contado - esperado,
        })

        dia += timedelta(days=1)

    estado = {"folioNum": folio, "vehiculos": vehiculos,
              "cierresCaja": cierres, "salidasCaja": salidas}
    return estado


if __name__ == "__main__":
    estado = generar()
    with open("estado_septiembre.json", "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False)

    # Resumen
    vs = estado["vehiculos"]
    total = sum(v["precio"] for v in vs)
    print(f"Vehículos generados: {len(vs)}")
    print(f"Días con corte de caja: {len(estado['cierresCaja'])}")
    print(f"Salidas de caja (gastos): {len(estado['salidasCaja'])}")
    print(f"Ingreso total del mes: ${total:,}")
    print(f"Promedio diario de autos: {len(vs)/30:.1f}")
    from collections import Counter
    print("Por servicio:", dict(Counter(v["lavado"] for v in vs)))
    print("Por técnico:", dict(Counter(v["resp"] for v in vs)))
    print("Por vehículo:", dict(Counter(v["sub"].split(" · ")[0] for v in vs)))
    print("Por método:", dict(Counter(v["pago"] for v in vs)))
    calif = [v["calif"] for v in vs if v["calif"] > 0]
    print(f"Calificados: {len(calif)} · promedio {sum(calif)/len(calif):.2f}")
