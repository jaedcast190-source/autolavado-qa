/* Actas de entrega y pruebas (Torre A y Torre B). Vanilla JS, sin librerías.
   Todo texto que viene del servidor se pone con textContent (nunca innerHTML). */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var ACTA = null;            // acta abierta (con items)
  var CATALOGO = null;        // {bloques:[], mapa_bloque_areas:{}}
  var TEMPORIZADORES = {};    // debounce por renglón
  var TOAST_T = null;
  var ES_TORRE_A = false;
  var SOLO_LECTURA = document.body.getAttribute("data-solo-lectura") === "1";   // supervisores: consultan, no cambian
  var PERSONAS = [];          // catálogo de personas (para elegir nombres sin escribirlos)
  var PERSONA_SELS = [];      // selectores de persona que hay en pantalla
  var LISTA = [];             // actas de la lista
  var CONF_ABIERTO = false;   // el bloque de conformes (plegado) está abierto
  var INV = null;             // inventario de pendientes
  var CONF_QUIEN = null;      // selector de "quién probó" para marcar conformes en bloque

  function el(tag, clase, texto) {
    var n = document.createElement(tag);
    if (clase) { n.className = clase; }
    if (texto !== undefined && texto !== null) { n.textContent = texto; }
    return n;
  }

  function toast(msg) {
    var t = $("#toast");
    if (!t) { return; }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(TOAST_T);
    TOAST_T = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function api(url, metodo, cuerpo) {
    var opc = { method: metodo || "GET", credentials: "same-origin", headers: {} };
    if (cuerpo !== undefined) {
      opc.headers["Content-Type"] = "application/json";
      opc.body = JSON.stringify(cuerpo);
    }
    return fetch(url, opc).then(function (r) {
      if (r.status === 401) { window.location.href = "/login"; throw new Error("Tu sesión terminó. Entra de nuevo."); }
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { throw new Error((j && j.error) || "No se pudo completar la acción."); }
        return j;
      });
    });
  }

  function fallo(e) { toast((e && e.message) || "Algo falló. Intenta de nuevo."); }

  function fechaBonita(iso) {
    if (!iso) { return ""; }
    var p = String(iso).slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso;
  }

  /* ------------------------------------------------------------- vistas */
  function mostrar(cual) {
    $("#ac-lista-sec").hidden = cual !== "lista";
    $("#ac-nueva-sec").hidden = cual !== "nueva";
    $("#ac-auto-sec").hidden = cual !== "auto";
    $("#ac-det-sec").hidden = cual !== "detalle";
    $("#ac-inv-sec").hidden = cual !== "inv";
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------- personas (elegir en vez de escribir) */
  var ETQ_FUNCION = { interno: "Interno", supervisor: "Supervisor", directivo: "Directivo", proveedor: "Proveedor" };

  function cargarPersonas() {
    return api("/api/actas/personas").then(function (j) {
      PERSONAS = j.personas || [];
      repoblarPersonas();
      pintarPersonasAdmin();
    }).catch(function () { /* sin catálogo: los selectores quedan con lo que ya tenían */ });
  }

  function llenarSelectPersona(sel) {
    var v = sel._valor || "";
    sel.textContent = "";
    sel.appendChild(new Option("— en blanco (se firma a mano) —", ""));
    var activas = PERSONAS.filter(function (p) { return p.activo; });
    var sug = sel._sugeridas || [];
    var propias = sug.length ? activas.filter(function (p) { return sug.indexOf(p.funcion) >= 0; }) : [];
    var otras = sug.length ? activas.filter(function (p) { return sug.indexOf(p.funcion) < 0; }) : activas;
    function grupo(titulo, lista) {
      if (!lista.length) { return; }
      var g = sug.length ? document.createElement("optgroup") : sel;
      if (sug.length) { g.label = titulo; sel.appendChild(g); }
      lista.forEach(function (p) { g.appendChild(new Option(p.nombre + (p.empresa ? " (" + p.empresa + ")" : ""), p.nombre)); });
    }
    grupo("Sugeridos", propias);
    grupo("Otros", otras);
    if (v && !activas.some(function (p) { return p.nombre === v; })) { sel.appendChild(new Option(v + " (escrito antes)", v)); }
    sel.appendChild(new Option("＋ Dar de alta a otra persona…", "__nueva__"));
    sel.value = v;
  }

  function repoblarPersonas() {
    PERSONA_SELS = PERSONA_SELS.filter(function (x) { return document.body.contains(x._caja); });
    PERSONA_SELS.forEach(llenarSelectPersona);
  }

  function altaPersona(nombre, funcion) {
    return api("/api/actas/personas", "POST", { nombre: nombre, funcion: funcion }).then(function (j) {
      var p = j.persona;
      var idx = PERSONAS.findIndex(function (x) { return x.id === p.id; });
      if (idx >= 0) { PERSONAS[idx] = p; } else { PERSONAS.push(p); }
      PERSONAS.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, "es"); });
      repoblarPersonas();
      pintarPersonasAdmin();
      toast(j.existente ? "Esa persona ya estaba dada de alta: " + p.nombre : "Persona dada de alta: " + p.nombre);
      return p;
    });
  }

  // selector de persona: lista para elegir, opción en blanco y alta rápida sin salir de la pantalla
  function crearSelectPersona(sugeridas, alCambiar) {
    var caja = el("div", "ac-persona");
    var sel = document.createElement("select");
    sel._sugeridas = sugeridas || [];
    sel._valor = "";
    sel._caja = caja;
    caja.appendChild(sel);
    var form = el("div", "ac-persona-nueva");
    form.hidden = true;
    var nom = document.createElement("input"); nom.type = "text"; nom.maxLength = 120; nom.placeholder = "Nombre completo";
    var fn = document.createElement("select");
    Object.keys(ETQ_FUNCION).forEach(function (k) { fn.appendChild(new Option(ETQ_FUNCION[k], k)); });
    fn.value = (sugeridas && sugeridas[0]) || "interno";
    var ok = el("button", "btn-pri", "Guardar y elegir"); ok.type = "button";
    var no = el("button", "btn-sec", "Cancelar"); no.type = "button";
    form.appendChild(nom); form.appendChild(fn); form.appendChild(ok); form.appendChild(no);
    caja.appendChild(form);
    sel._poner = function (v) { sel._valor = v || ""; llenarSelectPersona(sel); };
    sel.addEventListener("change", function () {
      if (sel.value === "__nueva__") {
        sel.value = sel._valor;
        form.hidden = false;
        nom.value = "";
        nom.focus();
        return;
      }
      sel._valor = sel.value;
      if (alCambiar) { alCambiar(sel); }
    });
    function guardar() {
      if (nom.value.trim().length < 2) { toast("Escribe el nombre de la persona."); return; }
      ok.disabled = true;
      altaPersona(nom.value, fn.value).then(function (p) {
        sel._poner(p.nombre);
        form.hidden = true;
        if (alCambiar) { alCambiar(sel); }
      }).catch(fallo).then(function () { ok.disabled = false; });
    }
    ok.addEventListener("click", guardar);
    nom.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); guardar(); } });
    no.addEventListener("click", function () { form.hidden = true; });
    PERSONA_SELS.push(sel);
    llenarSelectPersona(sel);
    return sel;
  }

  function pintarPersonasAdmin() {
    var caja = $("#ac-personas-lista");
    if (!caja) { return; }
    caja.textContent = "";
    $("#ac-n-personas").textContent = "(" + PERSONAS.filter(function (p) { return p.activo; }).length + ")";
    var alta = el("div", "ac-filtros");
    var nom = document.createElement("input"); nom.type = "text"; nom.maxLength = 120; nom.placeholder = "Nombre completo de una persona nueva";
    var fn = document.createElement("select");
    Object.keys(ETQ_FUNCION).forEach(function (k) { fn.appendChild(new Option(ETQ_FUNCION[k], k)); });
    var b = el("button", "btn-pri", "＋ Dar de alta"); b.type = "button";
    b.addEventListener("click", function () {
      if (nom.value.trim().length < 2) { toast("Escribe el nombre."); return; }
      altaPersona(nom.value, fn.value).catch(fallo);
    });
    alta.appendChild(nom); alta.appendChild(fn); alta.appendChild(b);
    caja.appendChild(alta);
    PERSONAS.forEach(function (p) {
      var f = el("div", "ac-persona-fila" + (p.activo ? "" : " inactiva"));
      f.appendChild(el("b", "", p.nombre));
      var sf = document.createElement("select");
      Object.keys(ETQ_FUNCION).forEach(function (k) { sf.appendChild(new Option(ETQ_FUNCION[k], k)); });
      sf.value = p.funcion;
      sf.addEventListener("change", function () {
        api("/api/actas/personas/" + p.id, "PUT", { funcion: sf.value }).then(function (j) { p.funcion = j.persona.funcion; toast("Función guardada"); repoblarPersonas(); }).catch(fallo);
      });
      var emp = document.createElement("input"); emp.type = "text"; emp.maxLength = 120; emp.placeholder = "Empresa / área (opcional)"; emp.value = p.empresa;
      emp.addEventListener("change", function () {
        api("/api/actas/personas/" + p.id, "PUT", { empresa: emp.value }).then(function (j) { p.empresa = j.persona.empresa; toast("Guardado"); repoblarPersonas(); }).catch(fallo);
      });
      var lab = el("label", "ac-check");
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = p.activo;
      lab.appendChild(cb); lab.appendChild(document.createTextNode(" Activa"));
      cb.addEventListener("change", function () {
        api("/api/actas/personas/" + p.id, "PUT", { activo: cb.checked }).then(function (j) { p.activo = j.persona.activo; f.className = "ac-persona-fila" + (p.activo ? "" : " inactiva"); repoblarPersonas(); }).catch(fallo);
      });
      f.appendChild(sf); f.appendChild(emp); f.appendChild(lab);
      caja.appendChild(f);
    });
  }

  /* ------------------------------------------------------------- lista */
  function tarjetaActa(a) {
    var r = a.resumen || {};
    var cerrada = a.estado === "cerrada";
    var t = el("div", "ac-tarjeta" + (cerrada ? " cerrada" : "") + (r.observaciones ? " con-obs" : ""));
    var izq = el("div");
    var linea = el("div");
    linea.appendChild(el("span", "ac-folio", a.folio));
    linea.appendChild(el("span", "ac-estado" + (cerrada ? " cerrada" : ""), cerrada ? "CERRADA" : "BORRADOR"));
    if (a.parcial_n) { linea.appendChild(el("span", "ac-estado parcial", "ENTREGA PARCIAL " + a.parcial_n)); }
    izq.appendChild(linea);
    izq.appendChild(el("div", "ac-datos", (a.titulo || "") + " · " + a.bloque + (a.area_txt ? " › " + a.area_txt : "")));
    izq.appendChild(el("div", "ac-datos",
      r.conformes + " de " + r.actividades + " conformes · " + r.probados + "/" + r.por_probar + " elementos probados" +
      (r.pendientes ? " · " + r.pendientes + " pendientes" : "") +
      (r.observaciones ? " · " + r.observaciones + " con observación" : "") +
      (a.fecha ? " · " + fechaBonita(a.fecha) : "")));
    if (a.continua || a.viene_de) {
      izq.appendChild(el("div", "ac-datos", (a.viene_de ? "Viene de " + a.viene_de.folio : "") +
        (a.viene_de && a.continua ? " · " : "") + (a.continua ? "Los pendientes siguen en " + a.continua.folio : "")));
    }
    var der = el("div", "ac-botones");
    var abrir = el("button", "btn-pri", SOLO_LECTURA || cerrada ? "Ver" : "Abrir");
    abrir.type = "button";
    abrir.addEventListener("click", function () { abrirActa(a.id); });
    var pdf = el("button", "btn-sec", "PDF");
    pdf.type = "button";
    pdf.addEventListener("click", function () { descargarPdf(a.id, a.folio); });
    der.appendChild(abrir);
    der.appendChild(pdf);
    t.appendChild(izq);
    t.appendChild(der);
    return t;
  }

  function pintarLista() {
    var proc = LISTA.filter(function (a) { return a.estado !== "cerrada"; });
    var hechas = LISTA.filter(function (a) { return a.estado === "cerrada"; });
    var q = sinAcentos($("#ac-hechas-q").value.trim());
    var caja = $("#ac-lista");
    caja.textContent = "";
    proc.forEach(function (a) { caja.appendChild(tarjetaActa(a)); });
    $("#ac-lista-vacia").hidden = proc.length > 0;
    $("#ac-n-proc").textContent = "(" + proc.length + ")";
    var ch = $("#ac-lista-hechas");
    ch.textContent = "";
    hechas.filter(function (a) { return !q || sinAcentos([a.folio, a.titulo, a.bloque, a.area_txt].join(" ")).indexOf(q) >= 0; })
      .forEach(function (a) { ch.appendChild(tarjetaActa(a)); });
    $("#ac-n-hechas").textContent = "(" + hechas.length + ")";
  }

  function cargarLista() {
    return api("/api/actas").then(function (j) {
      LISTA = j.actas || [];
      pintarLista();
    }).catch(fallo);
  }

  /* ------------------------------------------------------------- inventario de pendientes */
  function pintarInventario() {
    var f = { prov: $("#ac-inv-prov").value, bloque: $("#ac-inv-bloque").value, res: $("#ac-inv-res").value };
    var filas = INV.pendientes.filter(function (p) {
      return (!f.prov || p.proveedor === f.prov) && (!f.bloque || p.bloque === f.bloque) && (!f.res || p.resultado === f.res);
    });
    var caja = $("#ac-inv-lista");
    caja.textContent = "";
    var grupos = {};
    filas.forEach(function (p) { (grupos[p.proveedor || "(sin proveedor)"] = grupos[p.proveedor || "(sin proveedor)"] || []).push(p); });
    Object.keys(grupos).forEach(function (prov) {
      caja.appendChild(el("h4", "ac-inv-prov", prov + " — " + grupos[prov].length + " pendiente(s)"));
      grupos[prov].forEach(function (p) {
        var fila = el("div", "ac-inv-fila " + p.resultado);
        var izq = el("div");
        izq.appendChild(el("div", "ac-item-tit", p.partida));
        izq.appendChild(el("div", "ac-item-meta", [p.codigo, p.bloque, p.area].filter(Boolean).join(" · ")));
        if (p.nota) { izq.appendChild(el("div", "ac-item-meta", "Nota: " + p.nota)); }
        fila.appendChild(izq);
        var der = el("div", "ac-inv-der");
        der.appendChild(el("span", "ac-estado" + (p.resultado === "observacion" ? " obs" : ""),
          p.resultado === "observacion" ? "CON OBSERVACIÓN" : "PENDIENTE DE PROBAR"));
        der.appendChild(el("div", "ac-item-meta", p.cant_ok + "/" + p.cant_total + " " + p.unidad));
        var ver = el("button", "ac-link ac-no-imprimir", p.folio + (p.estado_acta === "cerrada" ? " (cerrada)" : " (borrador)"));
        ver.type = "button";
        ver.addEventListener("click", function () { abrirActa(p.acta_id); });
        der.appendChild(ver);
        fila.appendChild(der);
        caja.appendChild(fila);
      });
    });
    if (!filas.length) { caja.appendChild(el("p", "ac-vacio", "No hay pendientes con esos filtros.")); }
    $("#ac-inv-sub").textContent = filas.length + " actividad(es) pendiente(s) de entrega · " + INV.entregadas + " ya entregadas conformes en actas cerradas";
    var sa = $("#ac-inv-sinacta");
    sa.textContent = INV.sin_acta_total
      ? INV.sin_acta_total + " actividad(es) de obra que requieren pruebas todavía no están en ningún acta: " +
        INV.sin_acta.map(function (x) { return x.bloque + " (" + x.n + ")"; }).join(", ") + "."
      : "Todas las actividades que requieren pruebas ya están en alguna acta.";
    INV._filtradas = filas;
  }

  function abrirInventario() {
    api("/api/actas/pendientes").then(function (j) {
      INV = j;
      opcionesUnicas($("#ac-inv-prov"), unicos(j.pendientes, "proveedor"), "Todos");
      opcionesUnicas($("#ac-inv-bloque"), unicos(j.pendientes, "bloque"), "Todos");
      $("#ac-inv-res").value = "";
      pintarInventario();
      mostrar("inv");
    }).catch(fallo);
  }

  function csvInventario() {
    if (!INV || !INV._filtradas) { return; }
    function c(v) { return '"' + String(v === undefined || v === null ? "" : v).replace(/"/g, '""') + '"'; }
    var lineas = [["Proveedor", "Código", "Actividad", "Bloque", "Área", "Estado", "Probados", "Por probar", "Unidad", "Acta", "Nota"].map(c).join(",")];
    INV._filtradas.forEach(function (p) {
      lineas.push([p.proveedor, p.codigo, p.partida, p.bloque, p.area, p.resultado === "observacion" ? "Con observación" : "Pendiente de probar",
        p.cant_ok, p.cant_total, p.unidad, p.folio, p.nota].map(c).join(","));
    });
    var blob = new Blob(["\ufeff" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "inventario_pendientes_actas.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function descargarPdf(id, folio, params) {
    fetch("/api/actas/" + id + "/pdf" + (params ? "?" + params : ""), { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) { return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.error || "No se pudo generar el PDF."); }); }
      return r.blob();
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = (folio || "acta") + (params ? "_parcial" : "") + ".pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }).catch(fallo);
  }

  /* ------------------------------------------------------------- selector de actividades (nueva acta / agregar) */
  // Lista de actividades con filtros (proveedor, especialidad, texto), checklist por proveedor y "marcar visibles".
  // Lo marcado se conserva aunque el filtro lo esconda.
  function opcionesUnicas(sel, valores, textoTodos) {
    var previo = sel.value;
    sel.textContent = "";
    sel.appendChild(new Option(textoTodos, ""));
    valores.forEach(function (v) { sel.appendChild(new Option(v, v)); });
    sel.value = valores.indexOf(previo) >= 0 ? previo : "";
  }

  function unicos(lista, campo) {
    var m = {};
    lista.forEach(function (c) { if (c[campo]) { m[c[campo]] = true; } });
    return Object.keys(m).sort(function (x, y) { return x.localeCompare(y, "es"); });
  }

  function sinAcentos(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

  function crearSelector(cont, conZonas) {
    cont.textContent = "";
    var S = { lista: [], sel: {}, yaEn: {} };
    var barra = el("div", "ac-filtros");
    var lp = el("label", "", "Proveedor"); var fProv = document.createElement("select"); lp.appendChild(fProv);
    var lg = el("label", "", "Especialidad"); var fGiro = document.createElement("select"); lg.appendChild(fGiro);
    var lq = el("label", "ac-f-q", "Buscar"); var fQ = document.createElement("input"); fQ.type = "text";
    fQ.placeholder = "actividad o código…"; lq.appendChild(fQ);
    var lv = el("label", "ac-check"); var chkVis = document.createElement("input"); chkVis.type = "checkbox";
    lv.appendChild(chkVis); lv.appendChild(document.createTextNode(" Marcar las que se ven"));
    var lb = el("label", "", "Bloque"); var fBloque = document.createElement("select"); lb.appendChild(fBloque);
    var la = el("label", "", "Área"); var fArea = document.createElement("select"); la.appendChild(fArea);
    if (conZonas) { barra.appendChild(lb); barra.appendChild(la); }
    barra.appendChild(lp); barra.appendChild(lg); barra.appendChild(lq); barra.appendChild(lv);
    var cuenta = el("div", "ac-sub");
    var provs = el("div", "ac-provs");
    var lista = el("div", "ac-cand");
    cont.appendChild(barra); cont.appendChild(provs); cont.appendChild(cuenta); cont.appendChild(lista);

    function libre(c) { return (!c.ocupada_en || c.movible) && !S.yaEn[c.id]; }
    function visible(c, sinProv) {
      if (!sinProv && fProv.value && c.proveedor !== fProv.value) { return false; }
      if (fGiro.value && c.giro !== fGiro.value) { return false; }
      if (fBloque.value && c.bloque !== fBloque.value) { return false; }
      if (fArea.value && c.area !== fArea.value) { return false; }
      var q = sinAcentos(fQ.value.trim());
      if (q && sinAcentos([c.partida, c.codigo, c.proveedor, c.area].join(" ")).indexOf(q) < 0) { return false; }
      return true;
    }
    function actualizar() {
      var vis = S.lista.filter(function (c) { return visible(c) && libre(c); });
      var marcadas = S.lista.filter(function (c) { return S.sel[c.id] && libre(c); }).length;
      var visMarc = vis.filter(function (c) { return S.sel[c.id]; }).length;
      var aMover = S.lista.filter(function (c) { return S.sel[c.id] && libre(c) && c.ocupada_en; }).length;
      cuenta.textContent = marcadas + " marcada(s) en total · se ven " + vis.length + " disponibles" +
        (aMover ? " · " + aMover + " se pasarán desde otra acta en borrador" : "");
      chkVis.checked = vis.length > 0 && visMarc === vis.length;
      chkVis.indeterminate = visMarc > 0 && visMarc < vis.length;
      provs.querySelectorAll("input").forEach(function (cb) {
        var del = S.lista.filter(function (c) { return libre(c) && visible(c, true) && (c.proveedor || "") === cb.value; });
        var m = del.filter(function (c) { return S.sel[c.id]; }).length;
        cb.checked = del.length > 0 && m === del.length;
        cb.indeterminate = m > 0 && m < del.length;
      });
      lista.querySelectorAll("input[type=checkbox]").forEach(function (cb) { cb.checked = !!S.sel[cb.value]; });
    }
    function pintarProvs() {
      provs.textContent = "";
      var n = {};
      S.lista.forEach(function (c) { if (libre(c)) { n[c.proveedor || "(sin proveedor)"] = (n[c.proveedor || "(sin proveedor)"] || 0) + 1; } });
      var nombres = Object.keys(n).sort(function (x, y) { return x.localeCompare(y, "es"); });
      provs.hidden = nombres.length < 1;
      if (nombres.length) { provs.appendChild(el("b", "ac-sub", "Marcar por proveedor:")); }
      nombres.forEach(function (nom) {
        var l = el("label", "");
        var cb = document.createElement("input"); cb.type = "checkbox";
        cb.value = nom === "(sin proveedor)" ? "" : nom;
        cb.addEventListener("change", function () {
          S.lista.forEach(function (c) { if (libre(c) && visible(c, true) && (c.proveedor || "") === cb.value) { S.sel[c.id] = cb.checked; } });
          actualizar();
        });
        l.appendChild(cb);
        l.appendChild(document.createTextNode(" " + nom + " "));
        l.appendChild(el("small", "", "(" + n[nom] + ")"));
        provs.appendChild(l);
      });
    }
    function pintar() {
      lista.textContent = "";
      var pintadas = 0;
      S.lista.forEach(function (c) {
        if (!visible(c)) { return; }
        if (++pintadas > 300) { return; }
        var ya = !!S.yaEn[c.id];
        var bloqueada = !libre(c);
        var fila = el("label", "fila" + (bloqueada ? " bloqueada" : ""));
        var cb = document.createElement("input");
        cb.type = "checkbox"; cb.value = String(c.id); cb.disabled = bloqueada;
        cb.addEventListener("change", function () { S.sel[c.id] = cb.checked; actualizar(); });
        var txt = el("div");
        var t = el("div", "t", c.partida || "(sin nombre)");
        if (!c.requiere_pruebas) { t.appendChild(el("span", "etq no", "sin “requiere pruebas”")); }
        if (c.ocupada_en) {
          t.appendChild(el("span", "etq no", c.movible ? "ya está en " + c.ocupada_en + " (borrador) · si la marcas se pasa a esta acta"
            : "ya está en " + c.ocupada_en + " (conforme o cerrada)"));
        }
        if (ya) { t.appendChild(el("span", "etq", "ya está en esta acta")); }
        txt.appendChild(t);
        txt.appendChild(el("div", "m", [c.codigo, c.proveedor, c.area, c.giro].filter(Boolean).join(" · ") +
          (c.valida_depto ? " · prueba: " + c.valida_depto : "") + " · avance " + c.avance + "%"));
        fila.appendChild(cb); fila.appendChild(txt);
        lista.appendChild(fila);
      });
      if (pintadas > 300) { lista.appendChild(el("p", "ac-sub", "Se muestran 300 de " + pintadas + ". Afina con los filtros (bloque, área, proveedor).")); }
      actualizar();
    }
    [fProv, fGiro, fBloque, fArea].forEach(function (x) { x.addEventListener("change", pintar); });
    fBloque.addEventListener("change", function () {
      var areas = S.lista.filter(function (c) { return !fBloque.value || c.bloque === fBloque.value; });
      opcionesUnicas(fArea, unicos(areas, "area"), "Todas las áreas");
    });
    fQ.addEventListener("input", pintar);
    chkVis.addEventListener("change", function () {
      S.lista.forEach(function (c) { if (visible(c) && libre(c)) { S.sel[c.id] = chkVis.checked; } });
      actualizar();
    });
    return {
      cargar: function (datos, yaEn, conservar) {
        var previa = conservar ? S.sel : {};
        S.lista = datos; S.yaEn = yaEn || {}; S.sel = {};
        datos.forEach(function (c) { if (previa[c.id]) { S.sel[c.id] = true; } });
        opcionesUnicas(fProv, unicos(datos, "proveedor"), "Todos los proveedores");
        opcionesUnicas(fGiro, unicos(datos, "giro"), "Todas");
        opcionesUnicas(fBloque, unicos(datos, "bloque"), "Todos los bloques");
        opcionesUnicas(fArea, unicos(datos, "area"), "Todas las áreas");
        fQ.value = "";
        pintarProvs(); pintar();
        return datos.filter(libre).length;
      },
      ids: function () { return S.lista.filter(function (c) { return S.sel[c.id] && libre(c); }).map(function (c) { return c.id; }); }
    };
  }

  /* ------------------------------------------------------------- actas automáticas */
  function abrirAuto() {
    cargarCatalogo().then(function (c) {
      var sel = $("#ac-auto-bloque");
      sel.textContent = "";
      sel.appendChild(new Option("Todos los bloques", ""));
      (c.bloques || []).forEach(function (b) { sel.appendChild(new Option(b, b)); });
      $("#ac-auto-term").checked = false;
      mostrar("auto");
      verAuto();
    }).catch(fallo);
  }

  function cuerpoAuto(simular) {
    return { bloque: $("#ac-auto-bloque").value, solo_terminadas: $("#ac-auto-term").checked, simular: simular };
  }

  var TURNO_AUTO = 0;
  function verAuto() {
    var turno = ++TURNO_AUTO;
    var vista = $("#ac-auto-vista");
    vista.textContent = "Calculando…";
    $("#ac-auto-generar").disabled = true;
    api("/api/actas/auto", "POST", cuerpoAuto(true)).then(function (j) {
      if (turno !== TURNO_AUTO) { return; }
      vista.textContent = "";
      var actas = j.actas || [];
      var total = actas.reduce(function (n, a) { return n + a.actividades; }, 0);
      vista.appendChild(el("p", "ac-sub", actas.length + " acta(s) con " + total + " actividad(es)" +
        (j.ya_en_otra_acta ? " · " + j.ya_en_otra_acta + " actividad(es) se saltan porque ya están en otra acta" : "")));
      var caja = el("div", "ac-cand");
      actas.forEach(function (a) {
        var f = el("div", "ac-auto-fila");
        f.appendChild(el("span", "t", (a.area || "Todo el bloque") + " "));
        f.appendChild(el("span", "m", "· " + a.bloque + " · " + a.actividades + " actividad(es)"));
        caja.appendChild(f);
      });
      if (actas.length) { vista.appendChild(caja); }
      var btn = $("#ac-auto-generar");
      btn.textContent = "Generar " + actas.length + " acta(s)";
      btn.disabled = !actas.length;
    }).catch(function (e) { vista.textContent = ""; fallo(e); });
  }

  function generarAuto() {
    var btn = $("#ac-auto-generar");
    btn.disabled = true;
    api("/api/actas/auto", "POST", cuerpoAuto(false)).then(function (j) {
      toast((j.creadas || []).length + " acta(s) creada(s) en borrador.");
      mostrar("lista");
      return cargarLista();
    }).catch(function (e) { fallo(e); btn.disabled = false; });
  }

  /* ------------------------------------------------------------- nueva acta */
  var SEL_NUEVA = null, SEL_AGREGAR = null, TURNO_CAND = 0, BLOQUE_CAND = "";

  function cargarCatalogo() {
    if (CATALOGO) { return Promise.resolve(CATALOGO); }
    return api("/api/catalogos").then(function (j) { CATALOGO = j; return j; });
  }

  function abrirNueva() {
    cargarCatalogo().then(function (c) {
      var sel = $("#ac-bloque");
      sel.textContent = "";
      sel.appendChild(new Option("Elige un bloque…", ""));
      (c.bloques || []).forEach(function (b) { sel.appendChild(new Option(b, b)); });
      $("#ac-areas").textContent = "";
      $("#ac-areas-caja").hidden = true;
      $("#ac-todas").checked = false;
      $("#ac-titulo").value = "";
      $("#ac-cand-caja").hidden = true;
      BLOQUE_CAND = "";
      if (!SEL_NUEVA) { SEL_NUEVA = crearSelector($("#ac-sel-nueva")); }
      mostrar("nueva");
    }).catch(fallo);
  }

  function areasMarcadas() {
    var r = [];
    document.querySelectorAll("#ac-areas input:checked").forEach(function (c) { r.push(c.value); });
    return r;
  }

  function llenarAreas() {
    var b = $("#ac-bloque").value;
    var caja = $("#ac-areas");
    caja.textContent = "";
    var lista = (CATALOGO && CATALOGO.mapa_bloque_areas && CATALOGO.mapa_bloque_areas[b]) || [];
    lista.forEach(function (a) {
      var l = el("label", "");
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.value = a;
      cb.addEventListener("change", buscarCandidatas);
      l.appendChild(cb); l.appendChild(document.createTextNode(" " + a));
      caja.appendChild(l);
    });
    $("#ac-areas-caja").hidden = !lista.length;
  }

  function marcarAreas(v) {
    document.querySelectorAll("#ac-areas input").forEach(function (c) { c.checked = v; });
    buscarCandidatas();
  }

  function urlCandidatas(bloque, areas, todas) {
    return "/api/actas/candidatas?bloque=" + encodeURIComponent(bloque) +
      areas.map(function (a) { return "&area=" + encodeURIComponent(a); }).join("") + "&todas=" + (todas ? "1" : "0");
  }

  function buscarCandidatas() {
    var b = $("#ac-bloque").value;
    $("#ac-cand-caja").hidden = true;
    if (!b) { return; }
    var turno = ++TURNO_CAND;
    api(urlCandidatas(b, areasMarcadas(), $("#ac-todas").checked)).then(function (j) {
      if (turno !== TURNO_CAND) { return; }          // llegó una respuesta vieja: se ignora
      var lista = j.actividades || [];
      if (!lista.length) {
        toast("No hay actividades ahí. Prueba “Mostrar también las que no requieren pruebas” o cambia las áreas.");
        return;
      }
      SEL_NUEVA.cargar(lista, {}, b === BLOQUE_CAND);
      BLOQUE_CAND = b;
      $("#ac-cand-caja").hidden = false;
    }).catch(fallo);
  }

  function crearActa() {
    var ids = SEL_NUEVA.ids();
    if (!ids.length) { toast("Marca al menos una actividad."); return; }
    var btn = $("#ac-btn-crear");
    btn.disabled = true;
    api("/api/actas", "POST", {
      bloque: $("#ac-bloque").value, areas: areasMarcadas(), titulo: $("#ac-titulo").value, actividades: ids, mover: true
    }).then(function (j) {
      toast("Acta " + j.folio + " creada." + ((j.rechazadas || []).length ? " " + j.rechazadas.length + " actividad(es) no entraron (ya estaban conformes en otra acta)." : "") +
        (j.movidas ? " " + j.movidas + " se pasaron desde otra acta." : "") +
        ((j.actas_vaciadas || []).length ? " Se borró por quedar vacía: " + j.actas_vaciadas.join(", ") + "." : ""));
      return abrirActa(j.id);
    }).catch(fallo).then(function () { btn.disabled = false; });
  }

  /* ------------------------------------------------------------- detalle */
  function abrirActa(id) {
    return api("/api/actas/" + id).then(function (a) {
      if (!ACTA || ACTA.id !== a.id) {
        FILTROS_ACTA = { proveedor: "", area: "", giro: "", resultado: "", q: "", inactivas: false };
        document.querySelectorAll("#ac-filtros input[data-f]").forEach(function (x) { x.value = ""; });
        $("#ac-f-inact").checked = false;
      }
      ACTA = a;
      pintarDetalle();
      mostrar("detalle");
    }).catch(fallo);
  }

  function pintarDetalle() {
    var a = ACTA;
    var cerrada = a.estado === "cerrada";
    var bloqueado = cerrada || SOLO_LECTURA;       // no se edita: acta cerrada o usuario de consulta
    $("#ac-det-folio").textContent = a.folio + (cerrada ? " · CERRADA" : " · BORRADOR") + (a.parcial_n ? " · ENTREGA PARCIAL " + a.parcial_n : "");
    var zonas = {};
    (a.items || []).forEach(function (i) { if (i.activo && i.bloque) { zonas[i.bloque + "|" + i.area] = true; } });
    var nz = Object.keys(zonas).length;
    $("#ac-det-sub").textContent = a.bloque + (a.area_txt ? " › " + a.area_txt : " (todo el bloque)") +
      (nz > 1 ? " · actividades de " + nz + " zonas" : "");
    var cad = $("#ac-det-cadena");
    cad.textContent = "";
    [["Viene de ", a.viene_de], ["Los pendientes siguen en ", a.continua]].forEach(function (p) {
      if (!p[1]) { return; }
      if (cad.textContent) { cad.appendChild(document.createTextNode(" · ")); }
      cad.appendChild(document.createTextNode(p[0]));
      var b = el("button", "ac-link", p[1].folio);
      b.type = "button";
      b.addEventListener("click", function () { abrirActa(p[1].id); });
      cad.appendChild(b);
    });
    document.querySelectorAll("#ac-encabezado [data-campo]").forEach(function (inp) {
      var v = a[inp.getAttribute("data-campo")] || "";
      if (inp._poner) { inp._poner(v); } else { inp.value = v; }
      inp.disabled = bloqueado;
    });
    $("#ac-btn-agregar").hidden = bloqueado;
    $("#ac-btn-nueva-act").hidden = bloqueado || ES_TORRE_A;
    $("#ac-nueva-act-caja").hidden = true;
    $("#ac-btn-borrar").hidden = bloqueado;
    $("#ac-btn-cerrar").hidden = bloqueado;
    $("#ac-btn-reabrir").hidden = SOLO_LECTURA || !cerrada;
    $("#ac-agregar-caja").hidden = true;
    $("#ac-conf-barra").hidden = bloqueado;
    $("#ac-btn-cerrar").textContent = "Cerrar acta";
    pintarResumen();
    pintarFiltros();
    pintarItems();
  }

  // pendientes y observaciones primero; los conformes quedan plegados (al imprimir / PDF sí salen)
  function pintarItems() {
    var a = ACTA;
    var bloqueado = a.estado === "cerrada" || SOLO_LECTURA;
    PERSONA_SELS = PERSONA_SELS.filter(function (x) { return document.body.contains(x._caja); });   // quita los de tarjetas viejas
    var caja = $("#ac-items");
    caja.textContent = "";
    var conf = [];
    (a.items || []).forEach(function (it) {
      if (it.activo && it.resultado === "conforme") { conf.push(it); return; }
      caja.appendChild(crearTarjetaItem(it, bloqueado));
    });
    if (conf.length) {
      var d = document.createElement("details");
      d.className = "ac-plegable ac-conf-grupo";
      d.id = "ac-conf-grupo";
      d.open = CONF_ABIERTO;
      d.appendChild(el("summary", "", ""));
      conf.forEach(function (it) { d.appendChild(crearTarjetaItem(it, bloqueado)); });
      d.addEventListener("toggle", function () { CONF_ABIERTO = d.open; });
      caja.appendChild(d);
    }
    aplicarFiltros();
  }

  /* ------------------------------------------------------------- filtros del acta */
  var FILTROS_ACTA = { proveedor: "", area: "", giro: "", resultado: "", q: "", inactivas: false };

  function pintarFiltros() {
    var act = (ACTA.items || []).filter(function (i) { return i.activo; });
    document.querySelectorAll("#ac-filtros select[data-f]").forEach(function (sel) {
      var campo = sel.getAttribute("data-f");
      if (campo === "resultado") { sel.value = FILTROS_ACTA.resultado; return; }
      opcionesUnicas(sel, unicos(act, campo), campo === "proveedor" ? "Todos" : "Todas");
      FILTROS_ACTA[campo] = sel.value;
    });
    $("#ac-f-area-l").hidden = unicos(act, "area").length < 2;
    $("#ac-n-inact").textContent = String(ACTA.desactivadas || 0);
  }

  function coincideFiltros(it) {
    if (!it.activo) { return FILTROS_ACTA.inactivas; }
    var f = FILTROS_ACTA;
    if (f.proveedor && it.proveedor !== f.proveedor) { return false; }
    if (f.area && it.area !== f.area) { return false; }
    if (f.giro && it.giro !== f.giro) { return false; }
    if (f.resultado && it.resultado !== f.resultado) { return false; }
    var q = sinAcentos(f.q.trim());
    if (q && sinAcentos([it.partida, it.codigo, it.proveedor, it.nota].join(" ")).indexOf(q) < 0) { return false; }
    return true;
  }

  function hayFiltros() {
    var f = FILTROS_ACTA;
    return !!(f.proveedor || f.area || f.giro || f.resultado || f.q.trim());
  }

  function paramsFiltros() {
    var f = FILTROS_ACTA, p = [];
    ["proveedor", "area", "giro", "resultado"].forEach(function (k) { if (f[k]) { p.push(k + "=" + encodeURIComponent(f[k])); } });
    if (f.q.trim()) { p.push("q=" + encodeURIComponent(f.q.trim())); }
    return p.join("&");
  }

  function aplicarFiltros() {
    var visibles = 0, total = 0;
    var porId = {};
    (ACTA.items || []).forEach(function (i) { porId[i.id] = i; if (i.activo) { total++; } });
    document.querySelectorAll("#ac-items [data-item]").forEach(function (t) {
      var it = porId[parseInt(t.getAttribute("data-item"), 10)];
      var ok = !!it && coincideFiltros(it);
      t.hidden = !ok;
      if (ok && it.activo) { visibles++; }
    });
    var grupo = $("#ac-conf-grupo");
    if (grupo) {
      var visConf = grupo.querySelectorAll("[data-item]:not([hidden])").length;
      var totConf = grupo.querySelectorAll("[data-item]").length;
      grupo.hidden = visConf === 0;
      grupo.querySelector("summary").textContent = "✔ Conformes (" + visConf + (visConf !== totConf ? " de " + totConf : "") + ") — toca para ver";
      if (FILTROS_ACTA.resultado === "conforme" || FILTROS_ACTA.q.trim()) { grupo.open = visConf > 0; }
    }
    $("#ac-f-cuenta").textContent = "Mostrando " + visibles + " de " + total + " actividades" + (hayFiltros() ? " (con filtros)" : "");
    var pf = $("#ac-btn-pdf-f");
    pf.hidden = !hayFiltros();
    $("#ac-btn-conformes").textContent = "✔ Marcar CONFORMES los pendientes que se ven";
  }

  function marcarConformesVisibles() {
    var ids = (ACTA.items || []).filter(function (i) { return i.activo && i.resultado === "pendiente" && coincideFiltros(i); })
      .map(function (i) { return i.id; });
    if (!ids.length) { toast("No hay pendientes a la vista."); return; }
    var nombre = CONF_QUIEN ? CONF_QUIEN.value : "";
    if (!window.confirm("Se marcarán CONFORMES " + ids.length + " actividad(es) con todos sus elementos probados" +
      (nombre ? " (probó: " + nombre + ")." : "."))) { return; }
    api("/api/actas/" + ACTA.id + "/marcar_conformes", "POST", { ids: ids, probado_por: nombre }).then(function (j) {
      toast(j.marcadas + " actividad(es) marcadas conformes.");
      return abrirActa(ACTA.id);
    }).catch(fallo);
  }

  function kpi(clase, num, txt) {
    var k = el("div", "ac-kpi " + clase);
    k.appendChild(el("b", "", String(num)));
    k.appendChild(el("span", "", txt));
    return k;
  }

  function pintarResumen() {
    var r = ACTA.resumen;
    var c = $("#ac-resumen");
    c.textContent = "";
    c.appendChild(kpi("am", r.actividades, "actividades en el acta"));
    c.appendChild(kpi("", r.conformes + " / " + r.actividades, "conformes"));
    c.appendChild(kpi("", r.probados + " / " + r.por_probar, "elementos probados / por probar"));
    c.appendChild(kpi("ro", r.observaciones + r.pendientes, "con observación o pendientes"));
  }

  function guardarEncabezado(inp) {
    if (!ACTA || ACTA.estado !== "borrador") { return; }
    var campo = inp.getAttribute("data-campo");
    if (inp.value === (ACTA[campo] || "")) { return; }
    var cuerpo = {};
    cuerpo[campo] = inp.value;
    api("/api/actas/" + ACTA.id, "PUT", cuerpo).then(function () {
      ACTA[campo] = inp.value;
      toast("Guardado");
    }).catch(function (e) { if (inp._poner) { inp._poner(ACTA[campo] || ""); } else { inp.value = ACTA[campo] || ""; } fallo(e); });
  }

  function campoNum(valor, min) {
    var i = document.createElement("input");
    i.type = "number";
    i.min = String(min);
    i.step = "1";
    i.inputMode = "numeric";
    i.value = String(valor);
    return i;
  }

  function etiquetaCampo(texto, hijo) {
    var l = el("label", "");
    l.appendChild(document.createTextNode(texto));
    l.appendChild(hijo);
    return l;
  }

  function crearTarjetaItem(it, cerrada) {
    var t = el("div", "ac-item " + it.resultado + (it.activo ? "" : " inactiva"));
    t.setAttribute("data-item", String(it.id));
    var cab = el("div", "ac-item-cab");
    var izq = el("div");
    izq.appendChild(el("div", "ac-item-tit", it.partida));
    izq.appendChild(el("div", "ac-item-meta", [it.codigo, it.proveedor, it.area].filter(Boolean).join(" · ") +
      (it.valida_depto ? " · prueba: " + it.valida_depto : "")));
    cab.appendChild(izq);
    if (!it.activo) {
      izq.appendChild(el("div", "ac-item-meta", "DESACTIVADA: no cuenta ni sale en el PDF."));
      if (!cerrada) {
        var r = el("button", "ac-quitar react", "Reactivar");
        r.type = "button";
        r.addEventListener("click", function () { reactivarItem(it); });
        cab.appendChild(r);
      }
      t.appendChild(cab);
      return t;
    }
    if (!cerrada) {
      var q = el("button", "ac-quitar", "Desactivar del acta");
      q.type = "button";
      q.addEventListener("click", function () { quitarItem(it); });
      cab.appendChild(q);
    }
    t.appendChild(cab);

    var fila = el("div", "ac-prueba");
    var okI = campoNum(it.cant_ok, 0);
    var totI = campoNum(it.cant_total, 1);
    var uniI = document.createElement("input");
    uniI.type = "text"; uniI.maxLength = 30; uniI.value = it.unidad; uniI.style.width = "110px";
    uniI.placeholder = "contactos, tomas…";
    var cant = el("div", "ac-cant");
    var menos = el("button", "ac-mini", "−"); menos.type = "button";
    var mas = el("button", "ac-mini", "+"); mas.type = "button";
    var todos = el("button", "ac-mini todos", "TODOS"); todos.type = "button";
    cant.appendChild(etiquetaCampo("Probados", okI));
    cant.appendChild(el("span", "sep", "/"));
    cant.appendChild(etiquetaCampo("Por probar", totI));
    fila.appendChild(cant);
    var bots = el("div", "ac-cant");
    bots.appendChild(menos); bots.appendChild(mas); bots.appendChild(todos);
    fila.appendChild(bots);
    fila.appendChild(etiquetaCampo("Unidad", uniI));

    var res = el("div", "ac-resultado");
    [["pendiente", "Pendiente"], ["conforme", "Conforme"], ["observacion", "Con observación"]].forEach(function (p) {
      var b = el("button", "ac-res" + (it.resultado === p[0] ? " on-" + p[0] : ""), p[1]);
      b.type = "button";
      b.setAttribute("data-res", p[0]);
      b.addEventListener("click", function () { guardarItem(it, t, { resultado: p[0] }, true); });
      res.appendChild(b);
    });
    fila.appendChild(res);
    t.appendChild(fila);

    var fila2 = el("div", "ac-prueba");
    var nota = document.createElement("input"); nota.type = "text"; nota.maxLength = 600; nota.value = it.nota;
    nota.placeholder = "Observación (obligatoria si es “Con observación”)";
    var nl = etiquetaCampo("Nota / observación", nota); nl.className = "ac-nota";
    var quien = crearSelectPersona([], function (sel) { guardarItem(it, t, { probado_por: sel.value }, false); });
    quien._poner(it.probado_por);
    var fec = document.createElement("input"); fec.type = "date"; fec.value = it.fecha_prueba || "";
    fila2.appendChild(nl);
    fila2.appendChild(etiquetaCampo("Probó (nombre)", quien._caja));
    fila2.appendChild(etiquetaCampo("Fecha de la prueba", fec));
    t.appendChild(fila2);

    t._ctl = { okI: okI, totI: totI, uniI: uniI, nota: nota, quien: quien, fec: fec, res: res };
    var controles = [okI, totI, uniI, nota, quien, fec, menos, mas, todos];
    if (cerrada) {
      controles.forEach(function (c) { c.disabled = true; });
      res.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
      return t;
    }
    function leerNum(inp, def) { var n = parseInt(inp.value, 10); return isNaN(n) ? def : n; }
    okI.addEventListener("input", function () { programar(it, t, { cant_ok: leerNum(okI, 0) }); });
    totI.addEventListener("input", function () { programar(it, t, { cant_total: leerNum(totI, 1) }); });
    uniI.addEventListener("input", function () { programar(it, t, { unidad: uniI.value }); });
    nota.addEventListener("input", function () { programar(it, t, { nota: nota.value }); });
    fec.addEventListener("change", function () { guardarItem(it, t, { fecha_prueba: fec.value }, false); });
    menos.addEventListener("click", function () { guardarItem(it, t, { cant_ok: Math.max(0, leerNum(okI, 0) - 1) }, false); });
    mas.addEventListener("click", function () { guardarItem(it, t, { cant_ok: leerNum(okI, 0) + 1 }, false); });
    todos.addEventListener("click", function () { guardarItem(it, t, { cant_ok: leerNum(totI, 1) }, false); });
    return t;
  }

  // actualiza la tarjeta en su lugar (sin recrearla, para no quitarle el cursor a quien está escribiendo)
  function refrescarTarjeta(t, it) {
    var c = t._ctl;
    if (!c) { return; }
    t.className = "ac-item " + it.resultado;
    function poner(inp, v) { if (document.activeElement !== inp) { inp.value = String(v); } }
    poner(c.okI, it.cant_ok); poner(c.totI, it.cant_total); poner(c.uniI, it.unidad);
    poner(c.nota, it.nota); poner(c.fec, it.fecha_prueba || "");
    if (document.activeElement !== c.quien) { c.quien._poner(it.probado_por); }
    c.res.querySelectorAll("button").forEach(function (b) {
      var r = b.getAttribute("data-res");
      b.className = "ac-res" + (it.resultado === r ? " on-" + r : "");
    });
  }

  // junta lo que se va escribiendo y lo manda a guardar medio segundo después
  function programar(it, tarjeta, campos) {
    var previo = TEMPORIZADORES[it.id] || { campos: {}, t: null };
    clearTimeout(previo.t);
    Object.keys(campos).forEach(function (k) { previo.campos[k] = campos[k]; });
    previo.t = setTimeout(function () {
      var c = previo.campos;
      delete TEMPORIZADORES[it.id];
      guardarItem(it, tarjeta, c, false);
    }, 600);
    TEMPORIZADORES[it.id] = previo;
  }

  function guardarItem(it, tarjeta, campos, esResultado) {
    var pend = TEMPORIZADORES[it.id];
    if (pend) {     // si había cambios esperando, se mandan junto con este
      clearTimeout(pend.t);
      Object.keys(pend.campos).forEach(function (k) { if (!(k in campos)) { campos[k] = pend.campos[k]; } });
      delete TEMPORIZADORES[it.id];
    }
    api("/api/actas/" + ACTA.id + "/items/" + it.id, "PUT", campos).then(function (j) {
      var idx = ACTA.items.findIndex(function (x) { return x.id === it.id; });
      var eraConforme = idx >= 0 && ACTA.items[idx].resultado === "conforme";
      if (idx >= 0) { ACTA.items[idx] = j.item; }
      ACTA.resumen = j.resumen;
      pintarResumen();
      refrescarTarjeta(tarjeta, j.item);
      if (esResultado && (eraConforme || j.item.resultado === "conforme")) {
        var actaId = ACTA.id;
        setTimeout(function () { if (ACTA && ACTA.id === actaId) { pintarItems(); } }, 450);
      }
      if (esResultado) { toast(j.item.resultado === "conforme" ? "Marcado conforme" : (j.item.resultado === "observacion" ? "Marcado con observación" : "Marcado pendiente")); }
    }).catch(function (e) {
      fallo(e);
      abrirActa(ACTA.id);       // vuelve a leer lo que sí quedó guardado
    });
  }

  function quitarItem(it) {
    api("/api/actas/" + ACTA.id + "/items/" + it.id, "DELETE").then(function () {
      toast("Desactivada. Puedes reactivarla con “Ver desactivadas”.");
      return abrirActa(ACTA.id);
    }).catch(fallo);
  }

  function reactivarItem(it) {
    api("/api/actas/" + ACTA.id + "/items/" + it.id + "/restaurar", "POST", {}).then(function () {
      toast("Reactivada.");
      return abrirActa(ACTA.id);
    }).catch(fallo);
  }

  function abrirAgregar() {
    api(urlCandidatas("", [], true))
      .then(function (j) {
        var yaEn = {};
        (ACTA.items || []).forEach(function (i) { if (i.activo) { yaEn[i.actividad_id] = true; } });
        if (!SEL_AGREGAR) { SEL_AGREGAR = crearSelector($("#ac-sel-agregar"), true); }
        var disp = SEL_AGREGAR.cargar(j.actividades || [], yaEn);
        if (!disp) { toast("No hay más actividades disponibles en ese bloque/área."); return; }
        $("#ac-agregar-caja").hidden = false;
      }).catch(fallo);
  }

  function agregarMarcadas() {
    var ids = SEL_AGREGAR ? SEL_AGREGAR.ids() : [];
    if (!ids.length) { toast("Marca al menos una actividad."); return; }
    api("/api/actas/" + ACTA.id + "/actividades", "POST", { actividades: ids, mover: true }).then(function (j) {
      toast(j.agregadas + " actividad(es) agregada(s)." + (j.movidas ? " " + j.movidas + " se pasaron desde otra acta." : "") +
        ((j.actas_vaciadas || []).length ? " Se borró por quedar vacía: " + j.actas_vaciadas.join(", ") + "." : ""));
      return abrirActa(ACTA.id);
    }).catch(fallo);
  }

  function abrirActividadNueva() {
    cargarCatalogo().then(function (c) {
      var b = $("#ac-na-bloque");
      opcionesUnicas(b, c.bloques || [], "Elige…");
      b.value = (c.bloques || []).indexOf(ACTA.bloque) >= 0 ? ACTA.bloque : "";
      llenarAreasNueva();
      opcionesUnicas($("#ac-na-prov"), c.proveedores || [], "Elige…");
      opcionesUnicas($("#ac-na-giro"), c.giros || [], "(sin especialidad)");
      $("#ac-na-partida").value = "";
      $("#ac-agregar-caja").hidden = true;
      $("#ac-nueva-act-caja").hidden = false;
    }).catch(fallo);
  }

  function llenarAreasNueva() {
    var b = $("#ac-na-bloque").value;
    opcionesUnicas($("#ac-na-area"), (CATALOGO && CATALOGO.mapa_bloque_areas && CATALOGO.mapa_bloque_areas[b]) || [], "Elige…");
  }

  function crearActividadNueva() {
    var cuerpo = { bloque: $("#ac-na-bloque").value, area: $("#ac-na-area").value, proveedor: $("#ac-na-prov").value,
      giro: $("#ac-na-giro").value, partida: $("#ac-na-partida").value.trim() };
    if (!cuerpo.bloque || !cuerpo.area || !cuerpo.proveedor || !cuerpo.partida) { toast("Completa bloque, área, responsable y actividad."); return; }
    var btn = $("#ac-na-ok");
    btn.disabled = true;
    api("/api/actas/" + ACTA.id + "/actividad_nueva", "POST", cuerpo).then(function (j) {
      toast("Actividad " + j.codigo + " creada por validar y agregada al acta.");
      $("#ac-nueva-act-caja").hidden = true;
      return abrirActa(ACTA.id);
    }).catch(fallo).then(function () { btn.disabled = false; });
  }

  function cerrarActa() {
    var r = ACTA.resumen;
    var parcial = false;
    if (r.pendientes) {
      if (r.conformes + r.observaciones === 0) {
        toast("Para cerrar una entrega parcial marca al menos una actividad como Conforme o Con observación.");
        return;
      }
      var base = ACTA.parcial_n ? ACTA.folio.replace(/-\d+$/, "") : ACTA.folio;
      var actual = ACTA.parcial_n ? ACTA.folio : base + "-1";
      var sig = base + "-" + ((ACTA.parcial_n || 1) + 1);
      if (!window.confirm("Quedan " + r.pendientes + " actividad(es) sin probar.\n\nEsta acta se cierra como ENTREGA PARCIAL (" + actual +
        ") con lo que sí se probó, y las " + r.pendientes + " pendientes pasan a una acta nueva (" + sig +
        ") para que sigan los demás proveedores. ¿Continuar?")) { return; }
      parcial = true;
    } else {
      var msg = r.observaciones
        ? "El acta tiene " + r.observaciones + " actividad(es) con observación. ¿Cerrarla así?"
        : "¿Cerrar el acta? Después ya no se podrá editar (puedes reabrirla).";
      if (!window.confirm(msg)) { return; }
    }
    var btnC = $("#ac-btn-cerrar");
    btnC.disabled = true;
    api("/api/actas/" + ACTA.id + "/cerrar", "POST", { parcial: parcial }).then(function (j) {
      if (j.continua) {
        toast("Entrega parcial cerrada: " + j.folio + ". Los " + j.movidas + " pendientes siguen en " + j.continua.folio + ".");
        return abrirActa(j.continua.id);
      }
      toast("Acta cerrada. Ya puedes bajar el PDF.");
      return abrirActa(ACTA.id);
    }).catch(fallo).then(function () { btnC.disabled = false; });
  }

  function reabrirActa() {
    if (!window.confirm("¿Reabrir el acta para corregirla?")) { return; }
    api("/api/actas/" + ACTA.id + "/reabrir", "POST", {}).then(function () { return abrirActa(ACTA.id); }).catch(fallo);
  }

  function borrarActa() {
    if (!window.confirm("¿Borrar el acta " + ACTA.folio + "? Las actividades no se tocan.")) { return; }
    api("/api/actas/" + ACTA.id, "DELETE").then(function () {
      toast("Acta borrada.");
      ACTA = null;
      mostrar("lista");
      return cargarLista();
    }).catch(fallo);
  }

  /* ------------------------------------------------------------- arranque */
  function iniciar() {
    $("#ac-btn-nueva").addEventListener("click", abrirNueva);
    $("#ac-btn-auto").addEventListener("click", abrirAuto);
    $("#ac-auto-cancelar").addEventListener("click", function () { mostrar("lista"); });
    $("#ac-auto-bloque").addEventListener("change", verAuto);
    $("#ac-auto-term").addEventListener("change", verAuto);
    $("#ac-auto-generar").addEventListener("click", generarAuto);
    $("#ac-btn-cancelar-nueva").addEventListener("click", function () { mostrar("lista"); });
    $("#ac-bloque").addEventListener("change", function () { llenarAreas(); buscarCandidatas(); });
    $("#ac-areas-todas").addEventListener("click", function () { marcarAreas(true); });
    $("#ac-areas-ninguna").addEventListener("click", function () { marcarAreas(false); });
    $("#ac-todas").addEventListener("change", buscarCandidatas);
    $("#ac-btn-pdf-f").addEventListener("click", function (e) { e.preventDefault(); if (ACTA) { descargarPdf(ACTA.id, ACTA.folio, paramsFiltros()); } });
    $("#ac-btn-conformes").addEventListener("click", marcarConformesVisibles);
    $("#ac-f-limpiar").addEventListener("click", function () {
      FILTROS_ACTA = { proveedor: "", area: "", giro: "", resultado: "", q: "", inactivas: FILTROS_ACTA.inactivas };
      document.querySelectorAll("#ac-filtros [data-f]").forEach(function (x) { x.value = ""; });
      aplicarFiltros();
    });
    document.querySelectorAll("#ac-filtros [data-f]").forEach(function (x) {
      x.addEventListener(x.tagName === "INPUT" ? "input" : "change", function () {
        FILTROS_ACTA[x.getAttribute("data-f")] = x.value;
        aplicarFiltros();
      });
    });
    $("#ac-f-inact").addEventListener("change", function (e) { FILTROS_ACTA.inactivas = e.target.checked; aplicarFiltros(); });
    $("#ac-btn-crear").addEventListener("click", crearActa);
    $("#ac-btn-volver").addEventListener("click", function () { ACTA = null; mostrar("lista"); cargarLista(); });
    $("#ac-btn-pdf").addEventListener("click", function (e) { e.preventDefault(); if (ACTA) { descargarPdf(ACTA.id, ACTA.folio); } });
    $("#ac-btn-agregar").addEventListener("click", abrirAgregar);
    $("#ac-btn-nueva-act").addEventListener("click", abrirActividadNueva);
    $("#ac-na-bloque").addEventListener("change", llenarAreasNueva);
    $("#ac-na-ok").addEventListener("click", crearActividadNueva);
    $("#ac-na-no").addEventListener("click", function () { $("#ac-nueva-act-caja").hidden = true; });
    fetch("/api/proyecto", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (e) { ES_TORRE_A = !!(e && e.proyecto === "torre_a"); }).catch(function () { /* sin red: se queda visible */ });
    $("#ac-btn-agregar-ok").addEventListener("click", agregarMarcadas);
    $("#ac-btn-agregar-no").addEventListener("click", function () { $("#ac-agregar-caja").hidden = true; });
    $("#ac-btn-cerrar").addEventListener("click", cerrarActa);
    $("#ac-btn-reabrir").addEventListener("click", reabrirActa);
    $("#ac-btn-borrar").addEventListener("click", borrarActa);
    var SUGERIDAS = { recibe_obra: ["interno", "supervisor"], recibe_area: ["interno", "directivo"],
      proveedor_rep: ["proveedor"], supervision: ["supervisor"] };
    document.querySelectorAll("#ac-encabezado [data-persona]").forEach(function (cont) {
      var campo = cont.getAttribute("data-persona");
      var sel = crearSelectPersona(SUGERIDAS[campo] || [], guardarEncabezado);
      sel.setAttribute("data-campo", campo);
      cont.appendChild(sel._caja);
    });
    document.querySelectorAll("#ac-encabezado input[data-campo], #ac-encabezado textarea[data-campo]").forEach(function (inp) {
      inp.addEventListener("change", function () { guardarEncabezado(inp); });
    });
    CONF_QUIEN = crearSelectPersona([], null);
    var cq = $("#ac-conf-quien-caja");
    cq.appendChild(document.createTextNode("Probó: "));
    cq.appendChild(CONF_QUIEN._caja);
    $("#ac-btn-inv").addEventListener("click", abrirInventario);
    $("#ac-inv-volver").addEventListener("click", function () { mostrar("lista"); cargarLista(); });
    $("#ac-inv-csv").addEventListener("click", csvInventario);
    $("#ac-inv-imprimir").addEventListener("click", function () { window.print(); });
    ["#ac-inv-prov", "#ac-inv-bloque", "#ac-inv-res"].forEach(function (q) { $(q).addEventListener("change", pintarInventario); });
    $("#ac-hechas-q").addEventListener("input", pintarLista);
    // al imprimir desde el navegador salen TODAS las actividades (también las conformes plegadas)
    var abiertos = [];
    window.addEventListener("beforeprint", function () {
      abiertos = [];
      document.querySelectorAll("details").forEach(function (d) { abiertos.push([d, d.open]); d.open = true; });
    });
    window.addEventListener("afterprint", function () { abiertos.forEach(function (x) { x[0].open = x[1]; }); });
    if (SOLO_LECTURA) { $("#ac-modo-lectura").hidden = false; }
    cargarPersonas();
    cargarLista();
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", iniciar); }
  else { iniciar(); }
})();
