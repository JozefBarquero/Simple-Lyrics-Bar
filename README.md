# Simple Lyrics Bar

Extensión minimalista para GNOME Shell que muestra la línea de letra sincronizada en tiempo real directamente en la barra superior.

## Características

- Visualización exclusiva del texto de la letra actual.
- Detección automática del reproductor mediante la interfaz MPRIS.
- Obtención de letras sincronizadas mediante la API de LRCLIB.
- Sincronización temporal interna con reloj monótono para evitar saturación de D-Bus.
- Panel de preferencias con Libadwaita para ajustar posición y textos alternativos.
- Código nativo en JavaScript para GNOME (GJS / ESM) sin dependencias adicionales.

## Requisitos

- GNOME Shell 50 o 51.
- Reproductor multimedia con soporte para MPRIS en Linux.

## Versiones de GNOME Testeadas

| Versión de GNOME | Testeada |
| :--- | :--- |
| 51 | Sí |
| 50 | Sí |

## Instalación y empaquetado

### Empaquetado oficial

```bash
gnome-extensions pack \
        --force \
        --extra-source=lib \
        --schema=schemas/org.gnome.shell.extensions.simple-lyrics-bar.gschema.xml \
        --podir=po \
        .
```

### Instalación manual desde el paquete generado
```bash
gnome-extensions install --force simple-lyrics-bar@blunnix.com.shell-extension.zip
gnome-extensions enable simple-lyrics-bar@blunnix.com
```

Opciones disponibles:
- **Posición**: Ubicación del texto en el panel (Izquierdo, Centro o Derecha).
- **Sin reproducción**: Opción para mostrar u ocultar un mensaje cuando no hay música activa.
- **Letra no disponible**: Mensaje a mostrar si la pista no cuenta con letra sincronizada.

## Privacidad

La extensión no recolecta datos personales. Únicamente transmite a LRCLIB el título, artista y duración reportados por el reproductor para solicitar la letra correspondiente.

## Créditos y Licencia

- Letras provistas por el servicio de LRCLIB.
- Distribuido bajo los términos de la Licencia Pública General de GNU v3.0 (GPL-3.0-or-later)
