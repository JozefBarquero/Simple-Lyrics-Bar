# Simple Lyrics Bar

Minimalist extension for GNOME Shell that displays the synchronized lyric line in real time directly on the top bar.

## Features

- Exclusive display of the current lyric text.
- Automatic player detection via the MPRIS interface.
- Retrieval of synchronized lyrics through the LRCLIB API.
- Internal time synchronization with a monotonic clock to avoid D-Bus saturation.
- Preferences panel with Libadwaita to adjust position and alternative texts.
- Native JavaScript code for GNOME (GJS / ESM) with no additional dependencies.

## Requirements

- GNOME Shell 50 or 51.
- Media player with MPRIS support on Linux.

## Tested GNOME Versions

| GNOME Version | Tested |
| :--- | :--- |
| 51 | Yes |
| 50 | Yes |

## Installation and Packaging

### Official packaging

    gnome-extensions pack \
            --force \
            --extra-source=lib \
            --schema=schemas/org.gnome.shell.extensions.simple-lyrics-bar.gschema.xml \
            --podir=po \
            .

### Manual installation from the generated package

    gnome-extensions install --force simple-lyrics-bar@blunnix.com.shell-extension.zip
    gnome-extensions enable simple-lyrics-bar@blunnix.com

Available options:
- **Position**: Location of the text on the panel (Left, Center, or Right).
- **No playback**: Option to show or hide a message when there is no active music.
- **Lyrics unavailable**: Message to display if the track does not have synchronized lyrics.

## Privacy

The extension does not collect personal data. It only transmits the title, artist, and duration reported by the player to LRCLIB in order to request the corresponding lyrics.

## Credits and License

- Lyrics provided by the LRCLIB service.
- Distributed under the terms of the GNU General Public License v3.0 (GPL-3.0-or-later).