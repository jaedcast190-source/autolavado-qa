# Cómo transferir la aplicación al dueño del negocio

Esta aplicación es una **donación**. La idea es que el dueño del autolavado
termine siendo responsable de su propio dominio y su propia base de datos,
para que no dependa de nadie más y pague solo lo que use.

Esta guía explica cómo hacer ese traspaso, en orden.

---

## Resumen de costos (para el dueño)

| Concepto | Costo aproximado | Cuándo se necesita |
|---|---|---|
| Servicio web en Render | Gratis para empezar; ~7 USD/mes el plan que no se duerme | Desde el inicio |
| Base de datos PostgreSQL en Render | Gratis 1 mes; después ~7 USD/mes | Antes de que caduque la gratuita |
| Dominio propio (ej. miautolavado.com) | ~150–350 MXN al año | Cuando quieran su propia dirección |

> El plan gratuito de Render "se duerme" si no se usa por un rato y tarda
> unos segundos en despertar. Para un negocio en operación conviene el plan
> de paga, pero se puede empezar gratis para probar.

---

## Paso 1 — Pasar el código (GitHub)

El código vive en un repositorio de GitHub. Hay dos formas de que quede a
nombre del dueño:

- **Opción sencilla:** el dueño crea su cuenta de GitHub y se le **transfiere**
  el repositorio (GitHub → Settings del repo → *Transfer ownership*).
- **Opción alterna:** el dueño hace una copia (*fork* o *import*) a su cuenta.

---

## Paso 2 — Pasar la base de datos (PostgreSQL)

La base de datos gratuita de Render caduca al mes. Antes de eso:

1. El dueño crea su cuenta en Render.
2. Crea un PostgreSQL nuevo en **su** cuenta.
3. Se copian los datos de la base actual a la nueva (Render permite exportar
   e importar; o se usa `pg_dump` / `pg_restore`).
4. Se actualiza la variable `DATABASE_URL` del servicio web para que apunte a
   la base nueva.

> Mientras tanto, los datos están seguros: siempre se pueden exportar.

---

## Paso 3 — Pasar el hosting (Render)

1. El dueño conecta **su** GitHub a **su** Render.
2. Crea el servicio desde el `render.yaml` del repositorio.
3. Render arma el servicio web y la base de datos.

A partir de aquí, la app corre y se cobra (si aplica) en la cuenta del dueño.

---

## Paso 4 — Dominio propio (opcional)

1. El dueño compra un dominio (GoDaddy, Namecheap, Google Domains, etc.).
2. En Render → servicio web → **Settings → Custom Domains**, agrega su dominio.
3. Render indica qué registros DNS poner; se configuran donde compró el dominio.
4. En unos minutos la app queda en `https://sudominio.com`.

---

## Lo que NO cambia nunca

- El **código** es el mismo en todas las cuentas.
- Cambiar de base de datos = cambiar la variable `DATABASE_URL`. Nada más.
- Cambiar de dominio = configuración en Render. No se toca el código.

Esto es a propósito: la aplicación se diseñó para que el traspaso sea simple
y el dueño quede como único responsable, sin candados.
