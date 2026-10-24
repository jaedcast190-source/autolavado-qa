# autolavado-qa — Instrucciones para Claude

## Qué es
Plataforma de gestión de un autolavado (empresa independiente dentro del Hospital Aranda de la Parra;
sus clientes son sobre todo médicos). Recepción y registro de vehículos, cola de lavado por fases,
técnicos, cobro y corte de caja, seguimiento por QR y calificación del servicio.
Es una **donación**: al final pasará a nombre del dueño (ver `TRANSFERENCIA.md`). Todo debe poder
entenderlo y mantenerlo alguien más.

## Arquitectura
- **Backend:** `app.py` (Flask, ~20 rutas) + `db.py` (acceso a datos, usuarios y contraseñas PBKDF2).
- **Base de datos:** PostgreSQL en Render si existe `DATABASE_URL`; si no, SQLite local (`autolavado.db`).
  El estado de operación se guarda como **un solo documento JSON** (`estado`: folioNum, vehiculos,
  cierresCaja, salidasCaja) y la configuración en otro (`configuracion`).
  La interfaz lee el documento completo y lo vuelve a escribir: cuidado con sobrescribir cambios de otro dispositivo.
- **Frontend:** `templates/index.html` (app principal, JS dentro del HTML), `monitor.html` (TV del local),
  `seguimiento.html` (página pública del cliente por QR), `login.html`; `static/vehiculos.js`.
- **Roles:** `admin` (todo), `recepcion` (registra, día, técnicos, caja), `tecnico` (solo su cola).
  Decorador `@requiere_login(...)`.
- **Rutas públicas a propósito:** `/monitor` y `/api/monitor` (TV, solo lectura y campos mínimos),
  `/seguimiento/<codigo>` y su calificación (cliente por QR), `/health`, y las de cálculo
  `/api/validar-ingreso` y `/api/siguiente-estado` (no guardan nada). Toda ruta nueva que **escriba** lleva `@requiere_login`.
- **Despliegue:** GitHub → Render (`render.yaml`, plan gratuito, PostgreSQL propio).

## Forma de trabajo (obligatoria)
1. **Modo plan primero.** Presenta el plan y espera mi aprobación antes de tocar código.
2. **Pregunta antes de asumir** reglas del negocio (precios, fases, qué ve cada rol, caja).
3. **Error repetido = asesor.** Si el mismo error o prueba falla dos veces, consulta al asesor antes del tercer intento.
4. **Para localizar código** usa el subagente `explorador`; no leas `index.html` completo (2,000+ líneas).
5. **Antes de terminar** ejecuta el subagente `revisor-critico` y corrige lo que reporte.
6. **Nunca** hagas commit, push ni despliegue sin mi autorización explícita.
7. **Simplicidad:** el mínimo código que resuelve lo pedido. Sin funciones, archivos ni "mejoras" que nadie pidió.
8. **Cambios quirúrgicos:** toca solo lo necesario. Lo que funciona no se reescribe ni se reordena.
9. **Si hay dos caminos razonables,** muéstralos con pros y contras antes de elegir.
10. **Define el éxito antes de empezar** (cómo sabremos que quedó bien) y no digas "listo" sin haberlo comprobado.

## Entregas chicas y con evidencia (obligatorio)
La IA genera mucho código muy rápido; nadie revisa bien 1,800 líneas de golpe. Por eso:
1. **Una entrega = un flujo.** Cada entrega cubre un solo cambio o flujo y, como guía, menos de ~400 líneas
   modificadas. Si el plan pasa de eso, divídelo en pasos numerados; cada paso se entrega y se prueba
   por separado, y no empiezas el siguiente sin mi visto bueno.
2. **Planear es diseñar, no solo listar pasos.** Si el cambio toca datos, esquema, roles, rutas o servicios
   externos, el plan explica cómo encaja con lo que ya existe: qué tablas, rutas y pantallas afecta
   y qué podría romperse.
3. **Caso real, no caso perfecto.** Diseña para el uso real (celular, red lenta, usuario con prisa),
   no para la demo. Nada de abstracciones ni opciones "por si acaso".
4. **"Listo" solo con evidencia.** Toda entrega incluye:
   - los comandos de verificación que corriste y su resultado real (no "debería pasar");
   - el recorrido del flujo como usuario real, con el rol que corresponde, paso a paso
     (con capturas si tienes navegador);
   - cuáles de los casos del punto 5 probaste;
   - **qué NO pudiste probar y por qué.** Mejor decirlo que dejarlo implícito.
5. **Casos que siempre se prueban** en lo que toques:
   - datos vacíos / primera vez que se usa;
   - error de red o servidor caído: mensaje claro y sin perder lo capturado;
   - doble clic en guardar: no duplica;
   - usuario sin permiso: no ve ni modifica lo que no le toca;
   - pantalla de celular;
   - textos con acentos y ñ.

## Ahorro de tokens
- Usa subagentes Haiku (`explorador`) para buscar, leer documentación, resumir y tareas repetitivas. El modelo principal solo para lógica de negocio, refactors y arquitectura.
- Respuestas directas: sin saludos, preámbulos ni explicaciones repetidas.
- **Archivos existentes:** cambia solo las líneas necesarias; nunca reescribas el archivo completo. **Archivos nuevos:** entrégalos completos.
- Al terminar, di al inicio **qué archivos cambiaron**.

## Verificación mínima antes de entregar
```
python -m py_compile app.py db.py
python -m pytest -q tests
```
Las pruebas usan SQLite temporal: nunca tocan la base real. Si cambias lógica de negocio, agrega o ajusta su prueba en `tests/test_app.py`.
Prueba en navegador las pantallas tocadas (incluido celular): 0 errores en consola.

## Flujos críticos (recorrido de humo)
Después de cualquier cambio, recorre los que toque tu cambio:
1. **Recepción** registra un vehículo → recibe folio y precio calculado en el servidor.
2. **Técnico** lo ve en su cola (y solo la suya) y lo avanza por las fases hasta terminado.
3. **Recepción** cobra → el corte de caja del día cuadra (ingresos − salidas).
4. **Cliente** abre el QR de seguimiento, ve su estado (sin datos de otros) y califica.
5. **Monitor de TV** refleja el cambio sin mostrar datos personales.
6. **Dos dispositivos a la vez** (recepción y técnico): un cambio en uno no borra el del otro.

## Reglas de código
- Nunca entregues fragmentos con "// resto igual": si muestras una función, que sea la función completa.
- JavaScript vanilla, sin frameworks. Python: solo lo de `requirements.txt` salvo que lo apruebe.
- Una función = un propósito. Nombres descriptivos en español.
- Siempre: guards al inicio, null checks, debounce en botones que guardan, `try/catch` en todo `fetch`, mensajes claros en español.
- SQL siempre con parámetros; el código debe funcionar igual en PostgreSQL y en SQLite.
- Precios y montos en pesos (MXN), calculados en el servidor, nunca confiar en el que manda el navegador.

## Seguridad y datos
- Los datos de clientes (nombre, teléfono, placa) son personales: no los expongas en rutas públicas
  ni en logs. `/api/monitor` y `/seguimiento` muestran solo lo mínimo.
- Nunca escribas contraseñas, claves ni datos reales en el código, commits o archivos de datos.
- Secretos solo en variables de entorno de Render (`SECRET_KEY`, `DATABASE_URL`).
- Los usuarios por defecto de `db.py` son solo para arrancar; en producción deben tener contraseñas propias.

## Despliegue
Antes de proponer un despliegue: verificación mínima limpia, revisor-critico sin hallazgos graves
y lista de cambios en lenguaje simple. Nunca reemplaces el estado de producción con datos de prueba
(`datos/estado_septiembre.json` es una simulación).
