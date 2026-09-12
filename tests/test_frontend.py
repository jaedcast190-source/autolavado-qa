from pathlib import Path


HTML = (Path(__file__).parents[1] / "templates" / "index.html").read_text(encoding="utf-8")


def test_existe_un_solo_html_canonico():
    assert not (Path(__file__).parents[1] / "autolavado_qa_v2.html").exists()


def test_acceso_administrador_visible_y_funcional():
    assert 'id="btnAdmin"' in HTML
    assert 'id="modalAdmin"' in HTML
    assert "function abrirAdmin()" in HTML
    assert "function cerrarAdmin(e)" in HTML


def test_render_protege_datos_capturados_contra_html_inyectado():
    assert "function escaparHTML(valor)" in HTML
    for field in ("v.nombre", "v.sub", "v.folio", "v.bahia", "v.resp", "v.entrega"):
        assert f"escaparHTML({field})" in HTML or f"escaparHTML({field});" in HTML


def test_calificacion_y_detalles_se_persisten():
    assert "comentarioCalif" in HTML
    assert "vehiculos[calIdx].fallas" in HTML
    rating_section = HTML[HTML.index("function guardarCalif()") : HTML.index("function cerrarCal(e)")]
    assert "guardarDatos();" in rating_section


def test_registro_conserva_fecha_de_cita():
    assert 'fechaCita: document.getElementById("inFecha").value || fechaLocalISO()' in HTML


def test_tarifas_y_duraciones_frontales_coinciden_con_servidor():
    assert 'var TARIFA = { "Express":80, "Estándar":150, "Profundo":350 };' in HTML
    assert 'var DURACION = { "Express":15, "Estándar":30, "Profundo":90 };' in HTML
