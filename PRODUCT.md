# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Adultos que leen español y practican inglés hablado en situaciones cotidianas. Abren Háblame para hablar, no para estudiar una lección. Pueden contestar en español, en inglés o mezclando los dos, por voz o por teclado.

## Product Purpose

Háblame es un compañero de conversación que habla un solo inglés, internacional, y muestra el significado en español debajo. El éxito es que la persona entre, vea Hi! y ¡Hola!, oiga solo inglés, pueda responder en español, y que el nivel no dependa de haber apagado el significado.

## Positioning

Un solo inglés. Británico y americano viven en esa misma lengua: color y colour, apartment y flat, elevator y lift se aceptan. Un acento no es un error. Se corrige un sonido solo cuando la frase no se entiende. Quien escribe conviene que use una de las dos formas con constancia. El español de debajo es significado, no el idioma que se practica.

## Operating Context

La sesión es una charla. Háblame dice una o dos frases y una sola pregunta. Corrige una vez, nombra la forma que falló y sigue. No aplaude cada respuesta. Si no oyó, pregunta. Si la persona cambia de tema, pregunta una vez y espera.

«Una ayuda» reformula la última idea en inglés más simple, con un ejemplo, y deja el ritmo en suave. A los 15 segundos de silencio hay un recordatorio en inglés atado a la última pregunta. A los 30 la sesión se cierra. El límite de minutos también cierra. Sin permiso para enviar voz y texto a Gemini, el micrófono no arranca.

El nivel empieza en 0. Dos resultados success suben como máximo un escalón, y nunca por encima del suggestedLevel de ese turno. Eso puede ocurrir con significado visible o teclado. partial y uncertain no mueven el nivel: ponen la racha a cero. breakdown baja un escalón. Un lapso de una palabra no baja el nivel. El ritmo es otra cosa y no se guarda.

Los temas son situaciones en inglés: un café, el fin de semana, de compras, un viaje. «El mundo de hoy» solo usa fuentes que la búsqueda devuelva. Words guarda lemas en inglés que la persona dijo. Tocar una palabra abre el significado y no la guarda.

## Capabilities and Constraints

- Lengua meta fija: inglés, id `en`, variedad International. El saludo fijo es Hi!. El significado por defecto es español, ¡Hola!.
- No hay noruego, francés, alemán, italiano, portugués, mandarín ni español como lengua que se aprende.
- Las seis exigencias valoran el inglés de verdad y no se anuncian como nivel: fragmentos y presentaciones; preguntas cotidianas y presente; relatos, pasado y planes; razones, present perfect y conectores; matiz, modismos y registro; conversación flexible y con tacto.
- La clave de Gemini vive en el servidor, a nombre de quien opera la app. Cada conversación la factura Google.
- Partes del software adaptan Mural. El aviso está en `NOTICE`: Copyright (c) 2026 Hackmamba, licencia MIT. Tiene que viajar con lo que se publique.
- Precio, tiendas y política de privacidad publicada: no decididos.

## Brand Commitments

El nombre es Háblame. La marca es un turpial venezolano cantando, con tres trazos de voz que salen del pico y un ojo blanco, sin iris ni pupila. La palabra Háblame va en negro, pesada, junto al pájaro.

## Evidence on Hand

- App web en este repositorio. Comando de desarrollo: `npm run dev`, en http://localhost:3000.
- Aviso de licencia: `NOTICE`.
- Icono de referencia del turpial aportado por quien hace el producto. No hay testimonios, precios ni fichas de tienda.

## Product Principles

1. Háblame habla inglés. El español solo explica.
2. Un solo inglés, claro y el mismo en toda la conversación.
3. La persona puede responder como le salga; el nivel no se compra apagando el significado.
4. Una pregunta, una corrección, y tiempo para pensar.
5. Lo que se publica conserva el aviso de Mural.
