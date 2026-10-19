# SISTEMA — Háblame PWA

Última actualización: 2026-10-18

## Qué hace la app

Háblame es un compañero de conversación de inglés para el teléfono. El tutor habla solo inglés (variedad internacional); el español aparece debajo como subtítulo de significado. El usuario puede responder en voz o teclado, en español, inglés o mezclando los dos. La lógica pedagógica adapta el nivel (0–5) turno a turno sin penalizar por tener subtítulos visibles.

## Stack técnico (según native-pwa)

- HTML5 semántico + módulos ES nativos, sin bundler ni build step
- Vanilla CSS con custom properties y tokens de `DESIGN.md`
- Servido por `python -m http.server 3001` en local; preparado para GitHub Pages en producción
- `file://` nunca funciona (Service Worker y ES modules requieren contexto seguro HTTP/HTTPS)

## Datos en el dispositivo (local-first)

Base de datos: **IndexedDB** `hablame_v1` (un solo módulo `js/db.js` gestiona la conexión y transacciones).

| Store | keyPath | Índices | Propósito |
|---|---|---|---|
| `profile` | `"targetLanguageId"` | — | Perfil pedagógico del usuario (`en`) con nivel, rachas y objetivos |
| `vocabulary` | `id` | `languageId`, `lemma` | Vocabulario aprendido con etapas de memorización y decaimiento |
| `settings` | `key` | — | Ajustes de configuración, permisos y sesión activa |
| `sessions` | `id` (auto) | `createdAt` | Historial de charlas archivadas para consulta |

### Claves de settings

| Clave | Tipo | Por defecto | Propósito |
|---|---|---|---|
| `apiKey` | string cifrado con `crypto.subtle` (PBKDF2 + AES-GCM) | `null` | Clave privada de Google Gemini API (nunca en localStorage) |
| `aiPermission` | `"granted"` o `"withdrawn"` | `"withdrawn"` | Consentimiento explícito para enviar voz y texto a Gemini |
| `minuteLimit` | number | 10 | Límite de minutos por sesión |
| `interests` | string | `""` | Temas de interés del usuario |
| `onboardingDone` | boolean | false | Indica si completó la pantalla de bienvenida |
| `activeSession` | object | `null` | Estado de la conversación en curso (recargar no pierde la sesión) |
| `voiceMs` | number | 0 | Tiempo acumulado de voz escuchada / practicada |
| `searches` | number | 0 | Contador de consultas de actualidad |

## Rutas (hash router)

| Hash | Vista | Archivo |
|---|---|---|
| `#/` | Bienvenida (onboarding con clave API) | `js/views/bienvenida.js` |
| `#/charla` | Conversación activa (voz, texto, ayudas, tap en palabras) | `js/views/charla.js` |
| `#/temas` | Selector de situación (un café, fin de semana, viaje...) | `js/views/temas.js` |
| `#/palabras` | Libreta de palabras con filtro custom de estados | `js/views/palabras.js` |
| `#/ajustes` | Ajustes (API key, límite con selector custom, privacidad, licencia) | `js/views/ajustes.js` |

## Reglas nativas y gestos (native-pwa)

1. **Gestos nativos:**
   - Menú contextual del sistema desactivado (`contextmenu` preventDefault salvo en `.selectable`).
   - Drag & drop de imágenes e hipervínculos desactivado (`-webkit-touch-callout: none; -webkit-user-drag: none`).
   - Scroll fluido sin trabas en scroll containers (`touch-action: pan-y; overscroll-behavior: contain`).
   - Sin rebotes de página completa (`overscroll-behavior: none`).

2. **Controles customizados:**
   - Sin selects ni numeric spinners nativos de Android (se usan pills segmentadas y steppers custom).
   - Filtro de palabras mediante chips interactivos en CSS puro.

3. **Persistencia y recarga:**
   - Recargar la página (`F5`, swipe-down o cambio de pestaña) conserva el turno, burbujas y situación activa desde `activeSession`.

4. **Service Worker y Caché:**
   - Estrategia: **red-primero**; caché solo cuando se está sin conexión.
   - Versión de caché: `hablame-v1` (se incrementa con cada despliegue).
   - Pre-caché completo de shell, CSS, assets, iconos y módulos.

5. **Licencia:**
   - Se conserva el aviso de Mural (`NOTICE`: Copyright (c) 2026 Hackmamba, MIT) embebido en la aplicación.
