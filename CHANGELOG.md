# Cambios

## 1.1.0

- PWA instalable de verdad: faltaban los íconos PNG y el service worker no se instalaba (sin offline).
- Service worker con versión por build, assets opcionales tolerantes a errores, imágenes con CORS y
  actualización controlada por el usuario.
- Esquema de datos v2 con migraciones; los respaldos v1 se siguen pudiendo importar.
- Registro de dolor append-only con "sin dolor" explícito, contexto de sesión/ejercicio/serie, alertas
  de seguridad y pantalla propia.
- Historial completo y editable (con bitácora y deshacer), PR derivados, CSV, medidas ampliadas,
  comparación de fotos antes/después.
- Demos animadas y contenido técnico propio para los ejercicios base; funcionan sin conexión.
- Tildes y ñ en toda la interfaz; accesibilidad revisada con axe; tamaños de texto mínimos de 12 px.
- Pruebas: Vitest (37) y Playwright (5) en CI.

## 1.0.0

- Versión inicial generada: cuestionario, rutinas, sesión, progreso, respaldo JSON y PWA.
