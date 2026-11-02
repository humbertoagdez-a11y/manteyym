# Pruebas manuales

El build se puede verificar con `npm run build`. No se dispone de una sesion de navegador movil real en este entorno; los pasos de instalacion de iOS y Android quedan pendientes de comprobar.

## Recorrido principal

1. Abre la aplicacion por primera vez y completa las diez preguntas del cuestionario, incluidos equipo, prioridades, molestias, exclusiones, unidades y progresion.
2. Confirma que se crea una rutina y que el bloque indica semana 1 de 6.
3. Genera las plantillas cuerpo completo, torso/pierna, PPL, upper/lower, fuerza 5x5 y 30 minutos. Cambia la duracion del bloque a cuatro y ocho semanas.
4. Edita una rutina: cambia nombre, series, repeticiones y descanso; mueve ejercicios arriba/abajo; elimina y anade un movimiento; agrupa un par como superserie y como circuito.
5. Activa una rutina y vuelve a Hoy. Guarda un chequeo de disposicion.
6. Inicia un entrenamiento y registra peso decimal, repeticiones, RIR, RPE, tipo de serie y una nota. Abre la ficha del ejercicio sin salir de la sesion.
7. Completa una serie dos veces rapidamente: debe contar una sola vez. Comprueba el cronometro de descanso, el boton para omitirlo y la vibracion/sonido si el navegador lo permite.
8. Pausa y reanuda la sesion. Recarga la pestaña o vuelve a abrir el navegador; la sesion, el estado de pausa y las series deben recuperarse.
9. Usa el teclado numerico propio, añade una serie, cambia un ejercicio por una alternativa y prueba adaptar la sesion por tiempo, molestia y falta de equipo.
10. Abre la calculadora de discos. Con barra de 20 kg y objetivo 62,5 kg, la calculadora debe sugerir 20 kg + 1,25 kg por lado si esos discos estan configurados.
11. Finaliza con todas las series y vuelve a finalizar con series pendientes. Comprueba las confirmaciones, el resumen, el volumen y el historial con hora de inicio, fin y duracion.
12. Vuelve a entrenar el mismo movimiento con una carga/repeticiones mejores y confirma el aviso de mejor marca. Comprueba que el 1RM se etiqueta como estimado.

## Datos y seguimiento

13. En Progreso, revisa volumen de siete dias, grupos secundarios, estimacion de recuperacion, grafica y calendario.
14. Guarda peso corporal y una medida, un objetivo, cardio, una molestia y una foto. Recarga la app y verifica que siguen en el dispositivo.
15. Comprueba que una molestia de rodilla filtra sentadillas/zancadas al generar un plan y que los ejercicios excluidos no aparecen.
16. Prueba el buscador con y sin acentos y filtros de musculo, equipo y patron.
17. Con conexion, descarga la biblioteca opcional. Interrumpe/reintenta la descarga y abre un ejercicio con imagen. Sin conexion, comprueba el catalogo local y las imagenes que ya visitaste.
18. Activa el tema claro y oscuro, las preferencias de sonido/vibracion y un recordatorio con la app abierta.

## Respaldo y PWA

19. Exporta un respaldo JSON, importa ese archivo y confirma el resumen antes de restaurar.
20. Prueba un archivo corrupto, un JSON sin stores, un perfil con tipos incorrectos y una version futura; no deben reemplazar los datos existentes.
21. Importa con una foto y verifica que la vista local sigue disponible.
22. Comprueba que la copia previa a la restauracion aparece dentro del store meta `pre-import-backup`.
23. Prueba borrar datos: cancela la primera confirmacion, despues cancela la segunda y finalmente confirma ambas para verificar que solo el ultimo flujo restablece el onboarding y el catalogo base.
24. Publica en HTTPS, instala desde el navegador, activa modo avion, navega por las cinco pestañas y vuelve a abrir la PWA.
25. Publica una version nueva y confirma que aparece `Actualizacion disponible`; aplicala durante una sesion para comprobar que la sesion se recupera.
26. En Safari de iPhone, usa Compartir > Anadir a pantalla de inicio. En Chrome de Android, usa Instalar aplicacion. Verifica notch, barra inferior, teclado, permisos y lector de pantalla en cada dispositivo.

## Pruebas de logica

Desde DevTools > Console, con `npm run dev` activo, ejecuta:

```js
await import('/tests/console-tests.js').then((module) => module.runTests())
```

El archivo imprime nueve comprobaciones puras: Epley, discos, aproximaciones, doble progresion, estancamiento, rutina de dos a seis dias, restricciones de lesiones/equipo/exclusiones y volumen efectivo.