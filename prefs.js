// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const POSITION_VALUES = ['left', 'center', 'right'];

const REPO_URL = 'https://github.com/JozefBarquero/Simple-Lyrics-Bar';
const LICENSE_URL = 'https://github.com/JozefBarquero/Simple-Lyrics-Bar/blob/main/LICENSE';
const LRCLIB_URL = 'https://lrclib.net';

export default class SimpleLyricsBarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const settingsSignalIds = [];
        const widgetSignals = [];

        const version = this.metadata['version-name'] ??
            (this.metadata.version !== undefined ? String(this.metadata.version) : '1.0');

        const positionLabels = [
            this.gettext('Left'),
            this.gettext('Center'),
            this.gettext('Right'),
        ];



      
        const generalPage = new Adw.PreferencesPage({
            title: this.gettext('General'),
            icon_name: 'audio-x-generic-symbolic',
        });
        window.add(generalPage);


      
        const positionGroup = new Adw.PreferencesGroup({
            title: this.gettext('Panel Position'),
            description: this.gettext('Location where lyrics are displayed in the top panel.'),
        });
        generalPage.add(positionGroup);

        const positionRow = new Adw.ComboRow({
            title: this.gettext('Position'),
            subtitle: this.gettext('Left, center, or right section of the panel.'),
            model: new Gtk.StringList({ strings: positionLabels }),
        });

        const currentPos = settings.get_string('panel-position');
        positionRow.selected = Math.max(0, POSITION_VALUES.indexOf(currentPos));

        widgetSignals.push({
            obj: positionRow,
            id: positionRow.connect('notify::selected', () => {
                const idx = positionRow.selected;
                if (idx >= 0 && idx < POSITION_VALUES.length)
                    settings.set_string('panel-position', POSITION_VALUES[idx]);
            }),
        });

        settingsSignalIds.push(settings.connect('changed::panel-position', () => {
            const val = settings.get_string('panel-position');
            const idx = POSITION_VALUES.indexOf(val);
            if (idx >= 0 && positionRow.selected !== idx)
                positionRow.selected = idx;
        }));

        positionGroup.add(positionRow);





      

        const idleGroup = new Adw.PreferencesGroup({
            title: this.gettext('Idle State'),
            description: this.gettext('Text displayed when no music is playing.'),
        });
        generalPage.add(idleGroup);

        const showIdleRow = new Adw.SwitchRow({
            title: this.gettext('Show text when idle'),
            subtitle: this.gettext('Display a message when playback is stopped or inactive.'),
        });
        settings.bind('show-idle-text', showIdleRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        idleGroup.add(showIdleRow);

        const idleTextRow = new Adw.EntryRow({
            title: this.gettext('Custom text (leave empty for default)'),
            show_apply_button: true,
            text: settings.get_string('idle-text'),
        });
        widgetSignals.push({
            obj: idleTextRow,
            id: idleTextRow.connect('apply', () => {
                const trimmed = idleTextRow.text.trim();
                if (trimmed) {
                    settings.set_string('idle-text', trimmed);
                } else {
                    settings.reset('idle-text');
                    idleTextRow.text = '';
                }
            }),
        });
        settingsSignalIds.push(settings.connect('changed::idle-text', () => {
            const val = settings.get_string('idle-text');
            if (idleTextRow.text !== val)
                idleTextRow.text = val;
        }));
        const idleSensitiveBinding = showIdleRow.bind_property(
            'active',
            idleTextRow,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE,
        );
        idleGroup.add(idleTextRow);





      
        const noLyricsGroup = new Adw.PreferencesGroup({
            title: this.gettext('No Lyrics Available'),
            description: this.gettext('Text displayed when synced lyrics cannot be found.'),
        });
        generalPage.add(noLyricsGroup);

        const showNoLyricsRow = new Adw.SwitchRow({
            title: this.gettext('Show text when no lyrics'),
            subtitle: this.gettext('Display a message when no synced lyrics are found on LRCLIB.'),
        });
        settings.bind('show-no-lyrics-text', showNoLyricsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        noLyricsGroup.add(showNoLyricsRow);

        const noLyricsTextRow = new Adw.EntryRow({
            title: this.gettext('Custom text (leave empty for default)'),
            show_apply_button: true,
            text: settings.get_string('no-lyrics-text'),
        });
        widgetSignals.push({
            obj: noLyricsTextRow,
            id: noLyricsTextRow.connect('apply', () => {
                const trimmed = noLyricsTextRow.text.trim();
                if (trimmed) {
                    settings.set_string('no-lyrics-text', trimmed);
                } else {
                    settings.reset('no-lyrics-text');
                    noLyricsTextRow.text = '';
                }
            }),
        });
        settingsSignalIds.push(settings.connect('changed::no-lyrics-text', () => {
            const val = settings.get_string('no-lyrics-text');
            if (noLyricsTextRow.text !== val)
                noLyricsTextRow.text = val;
        }));
        const noLyricsSensitiveBinding = showNoLyricsRow.bind_property(
            'active',
            noLyricsTextRow,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE,
        );
        noLyricsGroup.add(noLyricsTextRow);



      
        const aboutPage = new Adw.PreferencesPage({
            title: this.gettext('About'),
            icon_name: 'help-about-symbolic',
        });
        window.add(aboutPage);



      
        const infoGroup = new Adw.PreferencesGroup({
            title: this.gettext('Project Information'),
        });
        aboutPage.add(infoGroup);

        const versionRow = new Adw.ActionRow({
            title: this.gettext('Version'),
            subtitle: version,
        });
        infoGroup.add(versionRow);

        infoGroup.add(this._createLinkRow(
            window,
            widgetSignals,
            this.gettext('Source Code'),
            'github.com/JozefBarquero/Simple-Lyrics-Bar',
            REPO_URL,
        ));

        infoGroup.add(this._createLinkRow(
            window,
            widgetSignals,
            this.gettext('License'),
            this.gettext('GNU General Public License v3.0'),
            LICENSE_URL,
        ));



      
        const attributionGroup = new Adw.PreferencesGroup({
            title: this.gettext('Third-Party Resources'),
            description: this.gettext('External services used by this extension.'),
        });
        aboutPage.add(attributionGroup);

        attributionGroup.add(this._createLinkRow(
            window,
            widgetSignals,
            'LRCLIB',
            this.gettext('Open synced lyrics database. Only track title, artist, and duration are queried without user data collection.'),
            LRCLIB_URL,
        ));



      
        const privacyGroup = new Adw.PreferencesGroup({
            title: this.gettext('Privacy Policy'),
            description: this.gettext('Transparency regarding network and data usage.'),
        });
        aboutPage.add(privacyGroup);

        const privacyRow = new Adw.ActionRow({
            title: this.gettext('No Personal Data Collected'),
            subtitle: this.gettext(
                'This extension does not collect, store, or share any personal data. ' +
                'The only network requests are sent to the public LRCLIB API (lrclib.net) ' +
                'and contain strictly the track name, artist, and duration to fetch lyrics. ' +
                'No cookies, analytics, or tracking services are used.',
            ),
        });
        privacyGroup.add(privacyRow);

        let cleanedUp = false;
        const cleanup = () => {
            if (cleanedUp)
                return;
            cleanedUp = true;

            idleSensitiveBinding.unbind();
            noLyricsSensitiveBinding.unbind();

            Gio.Settings.unbind(showIdleRow, 'active');
            Gio.Settings.unbind(showNoLyricsRow, 'active');

            for (const { obj, id } of widgetSignals)
                obj.disconnect(id);
            widgetSignals.length = 0;

            for (const id of settingsSignalIds)
                settings.disconnect(id);
            settingsSignalIds.length = 0;
        };

        widgetSignals.push({
            obj: window,
            id: window.connect('close-request', () => {
                cleanup();
                return false;
            }),
        });

        widgetSignals.push({
            obj: window,
            id: window.connect('destroy', () => {
                cleanup();
            }),
        });
    }

    _createLinkRow(window, widgetSignals, title, subtitle, uri) {
        const row = new Adw.ActionRow({
            title,
            subtitle,
            activatable: true,
        });
        row.add_suffix(new Gtk.Image({
            icon_name: 'external-link-symbolic',
            valign: Gtk.Align.CENTER,
        }));
        widgetSignals.push({
            obj: row,
            id: row.connect('activated', () => {
                const launcher = new Gtk.UriLauncher({ uri });
                launcher.launch(window, null, (source, res) => {
                    try {
                        source.launch_finish(res);
                    } catch (e) {
                        console.error(`Simple Lyrics Bar: Failed to open URI ${uri}:`, e);
                    }
                });
            }),
        });
        return row;
    }
}
