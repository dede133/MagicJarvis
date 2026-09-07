# MagicJarvis

Proyecto personal de un asistente para partidas físicas de Magic: The Gathering,
empezando por un mazo Commander y un jugador local. La idea es registrar acciones
por voz, texto o botones y mantener un estado digital de apoyo. La mesa sigue
siendo la referencia cuando ese estado no coincide con la partida real.

Es un prototipo en desarrollo, no un simulador completo ni un árbitro de reglas.
Este repositorio permite consultar el código y la arquitectura; no ofrece una
demo desplegada.

## Arquitectura

React y Zustand para la interfaz y el estado, TypeScript para el motor y Vitest
para las pruebas. Las entradas terminan en acciones tipadas; las reglas no
dependen de los componentes React.

```text
Voz / texto / botones
        ↓
Resolución del comando → GameAction
        ↓
gameStore / gameEngine → GameState + GameEvent
        ↓
Interfaz e historial de la partida
```

- `src/engine/`, `src/actions/` y `src/events/`: cambios de estado y sus eventos.
- `src/rules/`: turnos, maná, legalidad, combate y resolución implícita.
- `src/abilities/`: definiciones, compilación y ejecución de habilidades.
- `src/commands/` y `src/voice/`: interpretación de entradas y referencias a cartas.
- `src/store/` y `src/components/`: estado compartido, historial, undo e interfaz.
- `scripts/`: herramientas de análisis de cartas y cobertura del motor.

El objetivo es automatizar consecuencias deterministas, no elegir objetivos o
reconstruir información oculta por el jugador. Las interacciones no soportadas
requieren intervención manual. Los límites de reglas están en
[CORE1_LIMITS](src/rules/CORE1_LIMITS.md) y
[CORE2_LIMITS](src/rules/combat/CORE2_LIMITS.md).

## Estado y comprobaciones

Hay implementaciones de turnos, pila, costes, combate, habilidades y comandos de
voz, pero todavía existen regresiones. En la revisión del 7 de septiembre de 2026,
la suite completa tiene **1.040 pruebas correctas y 94 fallidas de 1.134**.
Los fallos incluyen reconocimiento y ambigüedad de comandos, contexto de jugador,
resolución implícita e interacciones de combate. No se han desactivado esas pruebas.

Para reproducir las comprobaciones con Node.js 22:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` devuelve un código de error mientras sigan pendientes esas regresiones.
Compilar no implica que todas las reglas o flujos de voz funcionen correctamente.
En esta revisión pasan tipos, lint y build; este último avisa del tamaño del bundle.
`npm run format:check` todavía detecta diferencias de estilo en archivos no
modificados en esta revisión. El chequeo de tipos cubre `src/` y la configuración
de Vite, no todos los scripts auxiliares.

## Servicios y configuración

La consulta de cartas usa Scryfall. El reconocimiento de voz depende del navegador
y de su servicio de voz; no se garantiza funcionamiento sin conexión.

Los scripts opcionales de análisis incluyen proveedores Gemini y Ollama. Se usan
para estudiar y compilar habilidades, no para delegar las decisiones de la partida
a un modelo. Los comandos `abilities:gemini-*` leen `GEMINI_API_KEY` desde el entorno
o `.env.local`; `.env.example` contiene solo una plantilla. Las llamadas a Gemini
pueden consumir cuota y tener coste. No hacen falta para ejecutar los checks anteriores.

`abilities:runtime-coverage` necesita una caché semántica local en `.magicjarvis/`;
no funciona directamente en un clon limpio. Los archivos de entorno, cachés,
exports temporales y copias de trabajo quedan fuera del seguimiento de Git.
No se deben añadir claves con prefijo `VITE_`: acabarían expuestas al navegador.

Magic: The Gathering pertenece a Wizards of the Coast. Este proyecto personal
no está afiliado a Wizards of the Coast.
