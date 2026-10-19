# Háblame — Compañero de conversación en inglés

Háblame es un compañero de conversación de inglés para el teléfono, diseñado como **PWA local-first** sin dependencias ni empaquetadores (no bundler).

## Características principales

- **Solo inglés internacional**: El tutor habla únicamente en inglés; el español aparece únicamente debajo como subtítulo explicativo.
- **Pedagogía adaptativa (Niveles 0–5)**: El nivel se adapta en cada turno según el rendimiento y la independencia lingüística.
- **Local-first (IndexedDB `hablame_v1`)**: Tu perfil, vocabulario aprendido, sesiones y ajustes se quedan en tu dispositivo.
- **Privacidad y cifrado**: La clave de Google Gemini API se guarda cifrada mediante `crypto.subtle` (PBKDF2 + AES-GCM 256). Nunca sale de tu teléfono hacia ningún servidor intermediario.
- **Gestos y controles nativos**: Interfaz optimizada para teléfono con steppers y selectores customizados en CSS, prevención de menú de contexto en pulsación prolongada y scroll sin trabas.
- **Offline / PWA**: Service Worker con estrategia red-primero y respaldo offline.

---

## Ejecución local

No requiere `npm`, `node_modules` ni pasos de compilación. Solo necesitas un servidor HTTP estático:

```bash
# Con Python:
python -m http.server 3001

# O con cualquier servidor estático:
npx serve .
```

Abre en tu navegador o teléfono: `http://localhost:3001` (o la IP local de tu máquina en tu red Wi-Fi para probar directamente en el móvil).

> **Nota:** La aplicación no puede ejecutarse abriendo el archivo directamente con `file://`, ya que los módulos ES y el Service Worker requieren un contexto seguro HTTP/HTTPS.

---

## Publicación en GitHub Pages

1. Sube este repositorio a GitHub.
2. En la configuración de tu repositorio (**Settings > Pages**), selecciona la rama `main` y la carpeta raíz `/ (root)`.
3. Tu PWA quedará publicada e instalable directamente en Android (Chrome) e iOS (Safari).

---

## Estructura del proyecto

```text
├── index.html            # Shell principal de la PWA
├── manifest.webmanifest  # Manifiesto de instalación PWA
├── sw.js                 # Service worker red-primero
├── DESIGN.md             # Sistema de diseño, colores y tipografía
├── PRODUCT.md            # Especificaciones y compromisos del producto
├── SISTEMA.md            # Especificaciones técnicas de arquitectura y datos
├── NOTICE                # Aviso de licencia (adaptación de Mural, MIT)
├── assets/               # logo.png (bienvenida) + brand/ (SVG y master del turpial)
├── css/                  # Estilos modulares (tokens, base, components, layout)
├── icons/                # Iconos PWA definitivos (192x192, 512x512)
├── js/                   # Lógica ES Modules
│   ├── db.js             # IndexedDB local-first
│   ├── router.js         # Hash router
│   ├── gemini.js         # Cliente directo de Gemini API
│   ├── pedagogy.js       # Algoritmo de nivel y aprendizaje
│   ├── learning.js       # Detección de lemas y control de inactividad
│   └── views/            # Vistas (bienvenida, charla, temas, palabras, ajustes)
```
