# MagicJarvis

MagicJarvis es un asistente para partidas físicas de Magic: The Gathering. El juego físico es la fuente de verdad; la aplicación mantiene un estado digital paralelo.

- Empezamos con un único mazo Commander y un jugador local.
- Todas las acciones pasan por un motor central de estado.
- Voz, botones y futuros comandos de texto ejecutarán las mismas `GameAction`.
- No dispersar lógica de reglas de Magic por componentes React.
- Priorizar código simple, tipado estricto y testeable.
- The player declares game decisions. MagicJarvis may infer deterministic consequences, but must never invent player decisions.
