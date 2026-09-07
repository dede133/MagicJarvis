# MagicJarvis

MagicJarvis es un asistente para partidas físicas de **Magic: The Gathering**.
La partida física es la fuente de verdad: la aplicación mantiene un estado
digital paralelo y ayuda a registrar, validar y resolver las consecuencias
deterministas de las decisiones del jugador.

El proyecto está pensado para empezar con un mazo Commander, un jugador local
y una interacción principalmente guiada por voz, botones y comandos de texto.
La base está preparada para ampliar el modelo a varios jugadores sin perder la
compatibilidad con el modo local inicial.

## Principios de diseño

- El jugador declara las decisiones del juego. La aplicación no inventa
  objetivos, cartas ocultas, bloqueos ni elecciones ambiguas.
- Todas las acciones pasan por un motor central de estado mediante
  `GameAction`.
- Voz, botones y comandos de texto deben producir las mismas acciones.
- Las reglas de Magic viven en el motor, los tipos y los módulos de reglas, no
  en los componentes React.
- El estado debe ser serializable, tipado y fácil de probar.
- Cuando una interacción física no puede conocerse con seguridad, el sistema
  pide una decisión o la mantiene como asistencia manual.

## Arquitectura resumida

```text
Entrada de voz / botones / texto
              ↓
      parser y command resolver
              ↓
          GameAction
              ↓
       gameEngine / gameStore
              ↓
       GameState + GameEvent
              ↓
  reglas, stack, habilidades, UI y undo
```

Las piezas principales son:

- `src/engine/`: motor central que aplica `GameAction` y produce el siguiente
  `GameState`.
- `src/store/`: store de Zustand, historial y operaciones de undo.
- `src/actions/`: unión tipada de las acciones que puede ejecutar el motor.
- `src/events/`: eventos derivados del cambio de estado.
- `src/rules/`: legalidad, turnos, combate, costes, maná, acciones basadas en
  estado y jugadores.
- `src/abilities/`: definiciones, compilación, validación, runtime y catálogo
  precompilado de habilidades.
- `src/casting/`: costes y opciones de lanzamiento que requieren interacción.
- `src/commands/`: parser de lenguaje natural y resolución de comandos.
- `src/components/`: interfaz React; debe orquestar y mostrar estado, no
  contener reglas de Magic.

## Modelo de estado

`GameState` contiene el estado serializable de la partida: cartas conocidas,
zonas, stack, turno, maná, jugadores, decisiones pendientes, habilidades,
combate, historial y datos de seguimiento de zonas ocultas.

El estado canónico de jugadores vive en `players[]`, con identificadores
estables y `activePlayerId`. Algunos campos legacy como `life`, `manaPool` y
`opponentLife` se conservan como proyección de compatibilidad con el modelo
local y con snapshots existentes.

Las zonas ocultas no se reconstruyen por inferencia. El sistema solo usa cartas
conocidas, contadores declarados o información revelada explícitamente.

## Habilidades y automatización

Las habilidades pueden proceder de definiciones explícitas, compilación
determinista o catálogos precompilados. El runtime solo ejecuta definiciones
validadas y soportadas por el modelo actual.

La automatización distingue entre consecuencias deterministas y decisiones del
jugador. Una carta puede ser `READY`, `PARTIAL` o `MANUAL` según cuánto de su
texto sea ejecutable sin inventar información.

La cobertura actual de Tritones se consulta con:

```bash
npm run abilities:runtime-coverage
```

Los límites detallados del motor están documentados en:

- [`src/rules/CORE1_LIMITS.md`](src/rules/CORE1_LIMITS.md)
- [`src/rules/combat/CORE2_LIMITS.md`](src/rules/combat/CORE2_LIMITS.md)

## Desarrollo

Instalar dependencias y arrancar el entorno:

```bash
npm install
npm run dev
```

Checks principales:

```bash
npm run format:check
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

El formatter del proyecto se ejecuta con:

```bash
npm run format
```

## Decisiones y límites importantes

- El juego físico sigue siendo la autoridad cuando el estado digital y la
  mesa difieren.
- El modo single-player local debe seguir funcionando aunque el modelo interno
  soporte jugadores con IDs estables.
- El motor no debe escoger automáticamente entre varias líneas legales si la
  elección pertenece al jugador.
- El modelo actual prioriza una mesa física asistida y verificable sobre una
  simulación completa de Magic Online.
- Multiplayer completo, APNAP, capas universales, efectos de reemplazo,
  información oculta y ciertas interacciones de combate permanecen limitados o
  asistidos. Las fronteras concretas están en los documentos `CORE*_LIMITS`.

## Estado del proyecto

La aplicación dispone de un motor central de acciones, turnos, stack, costes de
maná, combate, decisiones pendientes, habilidades runtime y una interfaz React.
El trabajo futuro debe extender estas capas manteniendo la misma regla:
**primero una decisión explícita del jugador; después, solo consecuencias que
el motor pueda justificar de forma determinista**.
