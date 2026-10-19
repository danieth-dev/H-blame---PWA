---
name: Háblame
description: Compañero de conversación en un solo inglés, con un turpial venezolano que canta.
colors:
  ink: "#141418"
  gold: "#FECC22"
  warm-orange: "#FEA425"
  voice: "#FEC222"
  white: "#FFFFFF"
  cream: "#FEFAF2"
  wing: "#FFFBF3"
  tinta-canvas: "#18150F"
  tinta-elevated: "#242018"
  tinta-text: "#F5EDE0"
  tinta-muted: "#A89F90"
  tinta-deep: "#0F0D0A"
  cream-shadow: "#F3E8D4"
typography:
  display:
    fontFamily: "Nunito, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Nunito, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Nunito, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "Nunito, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Nunito, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.04em"
rounded:
  pill: "999px"
  card: "22px"
  tile: "28%"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
    padding: "16px 24px"
    height: "58px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.gold}"
  mark:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
---

# Design System: Háblame

## Overview

**Creative North Star: "El turpial que canta"**

Háblame se reconoce por un turpial venezolano de pico abierto. Negro carbón, pecho de oro que baja a naranja, ojo blanco sin pupila, y tres cápsulas de voz en amarillo. El fondo es crema. La palabra Háblame es negra y pesada.

La conversación vive en una columna estrecha, de día, sobre crema. El oro aparece poco: el pájaro, las rayas de la voz y algún acento. El texto se lee en negro. El rosa melocotón que todavía pinta el código de la interfaz no es esta identidad.

**Key Characteristics:**

- Un pájaro, no un orbe.
- Tres colores que mandan: negro, oro, crema.
- El ojo es un disco blanco, vacío.
- Las rayas de voz son cápsulas rectas, de largo distinto, saliendo del pico.
- El español explica; no compite con la frase en inglés.

## Colors

El turpial se lee por contraste, no por un degradado de interfaz.

### Primary

- **Negro carbón** (`{colors.ink}`): cabeza, alas, cola y el texto Háblame. También el texto de la conversación.

### Secondary

- **Amarillo dorado** (`{colors.gold}`): el pecho. Baja hacia **Naranja cálido** (`{colors.warm-orange}`) solo en el cuerpo del pájaro.
- **Amarillo de voz** (`{colors.voice}`): las tres líneas que salen del pico.

### Neutral

- **Crema** (`{colors.cream}`): fondo del icono y de la pantalla.
- **Blanco puro** (`{colors.white}`): el ojo, nada más. No es color de texto.
- **Blanco del ala** (`{colors.wing}`): el detalle claro del ala.

### Named Rules

**The Three Marks Rule.** Negro, oro y crema son la identidad. El naranja solo sombrea el pecho. El blanco solo es el ojo.

**The Quiet Gold Rule.** El oro no se usa para párrafos ni para botones de texto largo. Sobre crema no se lee.

### Themes (Ajustes → Estilo)

- **Crema** (por defecto): lienzo `{colors.cream}`, texto `{colors.ink}`. Es el día del turpial.
- **Tinta**: noche cálida, no un invertido frío. Lienzo `#18150F`, superficies `#242018`, texto `#F5EDE0`, muted `#A89F90`. El oro y el pájaro siguen iguales. Se elige en Ajustes; `data-theme` en `<html>` y `settings.uiTheme`.

**The Warm Ink Rule.** En Tinta el negro no es `#000`. Tiene calor de crema apagada. El texto no es blanco puro: es crema suave.

## Typography

**Display Font:** Nunito (con la pila del sistema), peso 800, para el nombre junto al pájaro.
**Body Font:** Nunito, para leer la charla y el significado.

**Character:** El nombre es pesado y redondo, como el wordmark del icono. El texto de la conversación es más blando y se lee.

### Hierarchy

- **Display** (800, 30px, line-height 1, tracking apretado): el nombre Háblame junto al turpial.
- **Headline** (600, 34px, 1.12): títulos de un paso, como el inicio.
- **Title** (700, 16px): una ficha o una situación.
- **Body** (500, 15px, 1.45): la frase que se oye y el significado debajo.
- **Label** (700, 12px): Meaning, Talk, el estado corto.

### Named Rules

**The One Wordmark Rule.** El negro extra-bold se reserva para Háblame. Los botones y las frases no imitan ese peso.

## Layout

Una columna de charla, tope cercano a 420px, centrada, con aire crema alrededor. El pájaro y el nombre viven arriba, en un candado corto. La frase en inglés va grande y en el centro. El significado en español va debajo, más chico, en el mismo eje.

## Elevation & Depth

La pantalla es plana. El crema y el blanco del ala separan superficies. La sombra, cuando existe, es corta y solo sostiene el pájaro o el botón principal. No hay halo de color alrededor de las tarjetas.

### Named Rules

**The Flat Room Rule.** El fondo no tiene orbes, manchas ni degradados de ambiente. La profundidad la pone el pájaro, no el fondo.

## Shapes

El icono es un recuadro crema de esquinas amplias, cerca del 28% del lado. Los botones de acción son píldoras. Las fichas de conversación usan esquinas de 22px. El ojo es un círculo. Las rayas de voz son cápsulas de punta redonda, rectas, no arcos.

## Components

### Buttons

- **Shape:** píldora.
- **Primary:** negro (`{colors.ink}`) sobre crema de pantalla, texto crema, alto 58px.
- **Hover / Focus:** el texto pasa a oro. El foco se ve con un anillo negro, no con un resplandor.
- **Secondary:** crema con borde claro, texto negro. Para Reintentar y acciones quietas.

### Chips

- **Style:** crema un punto más cálida que el fondo, texto negro, sin borde pesado.
- **State:** la situación activa puede llevar un punto de oro. No se pinta el chip entero de amarillo.

### Cards / Containers

- **Corner Style:** 22px.
- **Background:** crema o el blanco del ala.
- **Shadow Strategy:** ninguna en reposo.
- **Border:** solo si hace falta separar del fondo, un filo casi del mismo crema.
- **Internal Padding:** 16px.

### Navigation

Barra inferior de tres destinos, texto negro, el activo con un punto de oro. El nombre de cada destino no grita.

### Turpial

El pájaro es la marca. Cabeza, ala y cola en negro. Pecho de `{colors.gold}` a `{colors.warm-orange}`. Ojo blanco, sin pupila. Tres cápsulas `{colors.voice}`, de largo distinto, saliendo del pico hacia arriba a la derecha. En la cabecera va pequeño, al lado de Háblame. En el icono de la app ocupa el recuadro crema, con el nombre debajo solo cuando el espacio lo permite. A 16px se lee el pecho negro y las rayas, no el texto.

## Do's and Don'ts

### Do:

- **Do** dejar el fondo en crema `{colors.cream}` y el texto en negro `{colors.ink}`.
- **Do** usar el oro en el pájaro y en las tres rayas de voz.
- **Do** mantener el ojo como un disco blanco, vacío.
- **Do** poner el significado en español debajo de la frase en inglés, más chico y en negro suave.

### Don't:

- **Don't** usar el rosa melocotón `#E97888` ni el orbe como marca. Esa paleta es la interfaz anterior.
- **Don't** escribir párrafos en `{colors.gold}`.
- **Don't** pintar un iris o una pupila en el ojo.
- **Don't** partir el turpial en un logo británico y otro americano.
- **Don't** leer en voz alta listas, protocolos ni «my thinking».
