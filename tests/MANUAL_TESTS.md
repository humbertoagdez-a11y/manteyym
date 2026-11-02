# Pruebas manuales

Lo automatizado (`npm run verify` y `npm run test:e2e`) cubre motor, migraciones, importación,
round-trip de respaldos, registro de dolor, PR, CSV, catálogo, instalación del service worker,
modo offline, el recorrido principal en viewport de celular y accesibilidad (axe).
Esta lista cubre lo que **solo se puede comprobar en un teléfono real**.

## En el teléfono (Android/Chrome y iPhone/Safari)

1. Abre la URL HTTPS publicada, completa el cuestionario e instala la app (Android: menú › Instalar aplicación;
   iPhone: Safari › Compartir › Agregar a inicio). El ícono debe verse nítido y sin bordes blancos.
2. Activa modo avión, abre la app instalada y recorre las cinco pestañas. Abre la demo de varios ejercicios:
   las fotos deben verse sin conexión.
3. Inicia un entrenamiento con la pantalla bloqueada a los 30 s: el Wake Lock debe mantenerla encendida
   (si el navegador lo permite). Completa series con una sola mano: los botones deben alcanzarse con el pulgar.
4. Durante el descanso, minimiza la app: al volver, el cronómetro debe seguir correcto. Revisa vibración y sonido.
5. Registra una molestia en una serie (≤ 4 toques) y "Sin dolor" en Hoy (1 toque). Revisa que el teclado
   del teléfono no tape los botones de las hojas.
6. Sube una foto de progreso con la cámara: debe guardarse reducida (Ajustes muestra el espacio usado).
7. Exporta el respaldo JSON y el CSV y ábrelos (el CSV en una planilla: las tildes deben verse bien).
   Importa el JSON y prueba "Deshacer la restauración".
8. Publica una versión nueva: debe aparecer "Actualización disponible"; aplícala en medio de una sesión y
   comprueba que la sesión sigue.
9. Activa el lector de pantalla (TalkBack / VoiceOver) y recorre Hoy, la hoja de dolor y la sesión.
10. Prueba el tema claro: contraste legible en todas las pantallas (la auditoría automática usa el oscuro).

## Pruebas automatizadas

```sh
npm run verify      # lint + vitest + typecheck + build + check:dist + check:accents
npm run test:e2e    # build + Playwright (Chromium, Pixel 7)
```
