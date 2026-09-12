const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../templates/index.html'), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).join('\n');

function iniciar(storage = new Map()) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        value: '', checked: false, textContent: '', innerHTML: '', style: {},
        classList: {
          add: value => classes.add(value), remove: value => classes.delete(value),
          contains: value => classes.has(value),
        },
        addEventListener() {}, focus() {},
      });
    }
    return elements.get(id);
  }
  element('inLavado').value = 'Estándar';
  element('inTipo').value = 'Auto';
  element('inHora').value = '10:30';
  const context = vm.createContext({
    document: { getElementById: element, querySelectorAll: () => [] },
    localStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value) },
    setTimeout() {}, clearTimeout() {},
  });
  vm.runInContext(script, context);
  return { context, element, storage };
}

test('un fallo al guardar estado revierte estado, pago e historial', () => {
  const { context: app, element } = iniciar();
  const before = JSON.stringify(app.vehiculos[1]);
  app.localStorage.setItem = () => { throw new Error('Cuota agotada'); };
  app.cambiarEstado(1);
  assert.equal(JSON.stringify(app.vehiculos[1]), before);
  assert.match(element('toast').textContent, /No fue posible guardar/);
});

test('un cambio de estado guardado sobrevive a una recarga', () => {
  const { context: app, storage } = iniciar();
  app.cambiarEstado(2);
  const reloaded = iniciar(storage).context.vehiculos[2];
  assert.equal(reloaded.estado, 'Listo');
  assert.equal(reloaded.historial.at(-1).estado, 'Listo');
});

test('un fallo al guardar calificación conserva datos previos y el formulario abierto', () => {
  const { context: app, element } = iniciar();
  const before = JSON.stringify(app.vehiculos[1]);
  app.abrirCalif(1);
  app.setEstrellas(2);
  element('calComent').value = 'Faltó limpiar';
  app.localStorage.setItem = () => { throw new Error('Cuota agotada'); };
  app.guardarCalif();
  assert.equal(JSON.stringify(app.vehiculos[1]), before);
  assert.equal(element('modalCal').classList.contains('show'), true);
  assert.equal(element('calComent').value, 'Faltó limpiar');
  assert.match(element('toast').textContent, /No fue posible guardar/);
});

test('calificación, comentario y fallas guardados sobreviven a una recarga', () => {
  const { context: app, element, storage } = iniciar();
  app.abrirCalif(1);
  app.setEstrellas(2);
  element('calComent').value = ' Faltó limpiar ';
  app.document.querySelectorAll = selector => selector.includes('.chip.on')
    ? [{ textContent: 'Interiores' }] : [];
  app.guardarCalif();
  const reloaded = iniciar(storage).context.vehiculos[1];
  assert.equal(reloaded.calif, 2);
  assert.equal(reloaded.comentarioCalif, 'Faltó limpiar');
  assert.equal(JSON.stringify(reloaded.fallas), '["Interiores"]');
  assert.equal(element('modalCal').classList.contains('show'), false);
});

test('un registro sin espacio conserva el formulario y no consume folio', () => {
  const { context: app, element } = iniciar();
  element('inNombre').value = 'Cliente QA';
  element('inPlaca').value = 'ABC123';
  const before = JSON.stringify(app.vehiculos);
  const folio = app.folioNum;
  app.localStorage.setItem = () => { throw new Error('Cuota agotada'); };
  app.registrarVehiculo();
  assert.equal(JSON.stringify(app.vehiculos), before);
  assert.equal(app.folioNum, folio);
  assert.equal(element('inNombre').value, 'Cliente QA');
});

test('WhatsApp informa que la simulación no envió mensajes', () => {
  const { context: app, element } = iniciar();
  app.enviarWhatsApp('confirmacion');
  app.confirmarEnvioWA();
  assert.match(element('toast').textContent, /no se envió ningún mensaje/);
  assert.equal(element('modalWA').classList.contains('show'), false);
});

test('los catálogos y pagos restaurados no se interpretan como HTML', () => {
  const { context: app, element } = iniciar();
  const payload = '<img src=x onerror=alert(1)>';
  Object.assign(app.vehiculos[2], { lavado: payload, estado: payload, pago: payload });
  app.render();
  assert.equal(element('cola').innerHTML.includes(payload), false);
  assert.equal(element('cola').innerHTML.includes('&lt;img'), true);
});

test('el encabezado muestra la fecha local actual', () => {
  const { element } = iniciar();
  assert.equal(element('fechaHoy').textContent, new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }));
});

test('ingreso del día excluye cobros de otras fechas y registros sin fecha', () => {
  const { context: app, element } = iniciar();
  const hoy = app.fechaLocalISO();
  app.vehiculos = [
    { pagado: true, precio: 150, fechaPago: hoy },
    { pagado: true, precio: 80, fechaPago: '2000-01-01', fechaCita: hoy },
    { pagado: false, precio: 350, fechaCita: hoy },
    { pagado: true, precio: 100, fechaCita: hoy },
    { pagado: true, precio: 200 },
  ];
  app.actualizarMetricas();
  assert.equal(element('mIngreso').textContent, '$250');
});

test('entregar una cita anterior registra el cobro en la fecha actual', () => {
  const { context: app, storage } = iniciar();
  Object.assign(app.vehiculos[2], { estado: 'Listo', fechaCita: '2000-01-01', creadoEn: '2000-01-01T12:00:00Z' });
  app.cambiarEstado(2);
  const reloaded = iniciar(storage).context.vehiculos[2];
  assert.equal(reloaded.fechaPago, app.fechaLocalISO());
  assert.equal(reloaded.pagado, true);
});
