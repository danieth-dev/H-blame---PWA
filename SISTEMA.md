# SISTEMA — Háblame PWA

Última actualización: 2026-10-18

## Qué hace la app

Háblame es un compañero de conversación de inglés para el teléfono. El tutor habla solo inglés (variedad internacional); el español aparece debajo como subtítulo de significado. El usuario puede responder en voz o teclado, en español, inglés o mezclando los dos. La lógica pedagógica adapta el nivel (0–5) sin penalizar por tener subtítulos visibles.

## Stack técnico (según native-pwa)

- HTML5 semántico + módulos ES nativos, sin bundler ni build step
- Vanilla CSS con custom properties y tokens de `DESIGN.md`
- Servido por `python -m http.server 3001` en local; preparado para GitHub Pages en producción
- `file://` nunca funciona (Service Worker y ES modules requieren contexto seguro HTTP/HTTPS)

## Voz en directo (Gemini Live)

| Pieza | Valor |
|---|---|
| Servicio | `js/live.js` (singleton: WS, mic, PCM, tools) |
| Vista | `js/views/charla.js` solo dibuja y escucha eventos |
| Modelo | `models/gemini-3.8-live` |
| Endpoint | `wss://…/v1beta.GenerativeService.BidiGenerateContent?key=` |
| Voz | Aoede |
| Audio salida | PCM16 24 kHz |
| Audio entrada | PCM16 16 kHz desde el micrófono |
| thinkingConfig | no se envía |
| UI de texto Live | solo `outputTranscription.text` (nunca `part.text`) |
| Clave | `settings.apiKey` cifrada en IndexedDB (Ajustes / bienvenida) |
| Sin clave / sin permiso | no hay sesión Live; banner y CTA a Ajustes |

### Eventos UI (`live`)

`started` · `stopped` · `listening` · `speaking` · `transcript` · `needSubtitle` · `error` · `tool` · `situation`

Banner: Apagado / Escuchando / Respondiendo.

### Flash (resto)

`js/gemini.js` (Gemini 3.8 Flash + fallback): subtítulos ES (`apiSubtitle` con reintento), «Una ayuda», explicar palabra al tocar.
Teclado: preferir Live (`sendClientText`); si no arranca, Flash con reintento. Subtítulos Live por turno (sin cancelar el anterior; placeholder «Traduciendo…»).

### Tools Live (el modelo no escribe en IDB)

| Tool | Efecto |
|---|---|
| `guardar_palabra` | `applyVocabularyUsage` + vocabulario |
| `listar_palabras_pendientes` | overdue (hasta 5) |
| `actualizar_perfil_turno` | `applyProfileTurn` + perfil |
| `cambiar_situacion` | situación de la sesión + evento UI |
| `cerrar_sesion` | cierra Live |

Idempotencia ~3 s en mutaciones. Error claro al modelo si falla o es ambigua.

### Sesión y navegación

- Cambiar de ruta **no** mata Live; al volver a Charla se redibuja el estado.
- Recargar restaura `activeSession` (historial visible); Live **no** auto-abre el mic.
- Reconexión: historial inyectado una vez como contexto privado (no releer en voz alta).
- «Nueva charla»: confirma → archiva/borra solo la charla visible → sesión limpia; no borra vocabulario ni perfil.
- Idle: recordatorio ~15 s; cierre ~30 s. Límite de minutos cierra la sesión.

## Datos en el dispositivo (local-first)

Base de datos: **IndexedDB** `hablame_v1` (un solo módulo `js/db.js`).

| Store | keyPath | Índices | Propósito |
|---|---|---|---|
| `profile` | `"targetLanguageId"` | — | Perfil pedagógico (`en`) |
| `vocabulary` | `id` | `languageId`, `lemma` | Vocabulario con etapas |
| `settings` | `key` | — | Ajustes, permiso, sesión activa, clave |
| `sessions` | `id` (auto) | `createdAt` | Historial archivado |

### Claves de settings

| Clave | Tipo | Por defecto | Propósito |
|---|---|---|---|
| `apiKey` | string cifrado (PBKDF2 + AES-GCM) | `null` | Clave Gemini (nunca en el repo) |
| `aiPermission` | `"granted"` \| `"withdrawn"` | `"withdrawn"` | Consentimiento voz/texto → Gemini |
| `minuteLimit` | number | 10 | Límite de minutos por sesión |
| `interests` | string | `""` | Temas de interés |
| `onboardingDone` | boolean | false | Bienvenida completada |
| `activeSession` | object | `null` | Charla visible (recargar no la pierde) |
| `voiceMs` | number | 0 | Tiempo de voz acumulado |
| `searches` | number | 0 | Contador de consultas de actualidad |

## Rutas (hash router)

| Hash | Vista | Archivo |
|---|---|---|
| `#/` | Bienvenida | `js/views/bienvenida.js` |
| `#/charla` | Charla Live + Flash | `js/views/charla.js` |
| `#/temas` | Situaciones | `js/views/temas.js` |
| `#/palabras` | Libreta | `js/views/palabras.js` |
| `#/ajustes` | Clave, permiso, límite | `js/views/ajustes.js` |

## Reglas nativas y gestos (native-pwa)

1. Menú contextual desactivado salvo `.selectable`; sin drag de vínculos; scroll con `touch-action: pan-y` y `overscroll-behavior: contain`.
2. Controles custom (pills, steppers); sin `<select>` nativo de Android.
3. Service Worker **red-primero**; caché `hablame-v10`.
   - Marca: `assets/logo.png` (turpial) junto a Háblame; iconos PWA en `icons/`.
   - Iconos UI: SVG de trazo en `js/icons.js` (sin emoji), también en Temas.
4. Aviso Mural (`NOTICE`) embebido en la app.
