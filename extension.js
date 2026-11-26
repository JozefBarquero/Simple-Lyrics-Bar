// SPDX-License-Identifier: GPL-3.0-or-later

// Simple Lyrics Bar — Shows the current synced lyric line in the top panel using MPRIS and LRCLIB.

import Soup from 'gi://Soup?version=3.0';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { SimpleLyricsIndicator } from './lib/indicator.js';
import { LyricsFetcher } from './lib/lyricsFetcher.js';
import { PlayerManager } from './lib/playerManager.js';
import { findActiveLine } from './lib/utils.js';

const REPO_URL = 'https://github.com/JozefBarquero/Simple-Lyrics-Bar';
const HTTP_TIMEOUT_SEC = 10;

export default class SimpleLyricsBar extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settingsSignalIds = [];

        const version = this.metadata['version-name'] ??
            (this.metadata.version !== undefined ? String(this.metadata.version) : '1.0');

        this._httpSession = new Soup.Session({
            user_agent: `SimpleLyricsBar/${version} (${REPO_URL})`,
            timeout: HTTP_TIMEOUT_SEC,
        });
        this._textDecoder = new TextDecoder('utf-8');

        this._playbackStatus = 'Stopped';
        this._currentTrackTitle = '';
        this._currentTrackArtist = '';
        this._currentLyricsKey = '';
        this._lyrics = [];
        this._lastLineIndex = -1;
        this._hasLyrics = false;
        this._fetchingLyrics = false;

        this._lyricsFetcher = new LyricsFetcher(
            this._httpSession,
            this._textDecoder,
            (lyrics) => this._onLyricsLoaded(lyrics),
        );

        this._playerManager = new PlayerManager({
            onPlaybackStateChanged: (state) => this._onPlaybackStateChanged(state),
            onPositionUpdate: (force) => this._updateActiveLine(force),
        });

        this._createIndicator();
        this._connectSettings();
        this._refreshDisplay();

        this._playerManager.start();
    }

    disable() {
        if (this._playerManager) {
            this._playerManager.stop();
            this._playerManager = null;
        }

        if (this._lyricsFetcher) {
            this._lyricsFetcher.destroy();
            this._lyricsFetcher = null;
        }

        if (this._httpSession) {
            this._httpSession.abort();
            this._httpSession = null;
        }

        this._textDecoder = null;

        this._disconnectSettings();
        this._settings = null;

        this._destroyIndicator();

        this._lyrics = [];
        this._lastLineIndex = -1;
        this._hasLyrics = false;
        this._fetchingLyrics = false;
        this._currentTrackTitle = '';
        this._currentTrackArtist = '';
        this._currentLyricsKey = '';
        this._playbackStatus = 'Stopped';
    }

    _onPlaybackStateChanged(state) {
        this._playbackStatus = state.playbackStatus;
        this._currentTrackTitle = state.title;
        this._currentTrackArtist = state.artist;

        const durationSec = Math.round(state.lengthUs / 1_000_000);
        const lyricsKey = `${state.title}::${state.artist}::${durationSec}`;

        if (lyricsKey !== this._currentLyricsKey) {
            this._currentLyricsKey = lyricsKey;
            this._lyrics = [];
            this._lastLineIndex = -1;
            this._hasLyrics = false;

            if (state.artist) {
                this._fetchingLyrics = true;
                this._refreshDisplay();
                this._lyricsFetcher.fetch(state.title, state.artist, state.lengthUs);
            } else {
                this._lyricsFetcher.cancel();
                this._fetchingLyrics = false;
                this._refreshDisplay();
            }
        } else {
            this._refreshDisplay();
        }
    }

    _onLyricsLoaded(lyrics) {
        this._lyrics = lyrics;
        this._lastLineIndex = -1;
        this._hasLyrics = lyrics.length > 0;
        this._fetchingLyrics = false;
        this._updateActiveLine(true);
    }

    _updateActiveLine(force) {
        if (!this._playerManager ||
            !this._playerManager.isPositionSynced() ||
            this._lyrics.length === 0) {
            if (force)
                this._refreshDisplay();
            return;
        }

        const posMs = this._playerManager.getPositionMs();
        const idx = findActiveLine(this._lyrics, posMs);

        if (idx !== this._lastLineIndex || force) {
            this._lastLineIndex = idx;
            this._refreshDisplay();
        }
    }

    _connectSettings() {
        const watch = (key, callback) => {
            const id = this._settings.connect(`changed::${key}`, callback);
            this._settingsSignalIds.push(id);
        };

        watch('panel-position', () => this._recreateIndicator());
        watch('show-idle-text', () => this._refreshDisplay());
        watch('idle-text', () => this._refreshDisplay());
        watch('show-no-lyrics-text', () => this._refreshDisplay());
        watch('no-lyrics-text', () => this._refreshDisplay());
    }

    _disconnectSettings() {
        for (const id of this._settingsSignalIds)
            this._settings.disconnect(id);

        this._settingsSignalIds = [];
    }

    _createIndicator() {
        this._indicator = new SimpleLyricsIndicator(
            this.gettext('Simple Lyrics Bar'),
            this.gettext('Preferences'),
            this.gettext('No playback'),
            () => this.openPreferences(),
        );
        this._indicator.hide();

        const position = this._settings.get_string('panel-position');
        const panelIndex = position === 'right' ? 0 : 1;
        Main.panel.addToStatusArea(this.uuid, this._indicator, panelIndex, position);
    }

    _destroyIndicator() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _recreateIndicator() {
        this._destroyIndicator();
        this._createIndicator();
        this._refreshDisplay();
    }

    _refreshDisplay() {
        if (!this._indicator || !this._settings)
            return;

        if (this._currentTrackTitle) {
            const trackInfo = this._currentTrackArtist
                ? `${this._currentTrackTitle} — ${this._currentTrackArtist}`
                : this._currentTrackTitle;
            this._indicator.setTrackInfo(trackInfo);
        } else {
            this._indicator.setTrackInfo(null);
        }

        const isPlaying = this._playbackStatus === 'Playing';
        const hasTrack = Boolean(this._currentTrackTitle);

        if (isPlaying && this._hasLyrics && this._lyrics.length > 0) {
            const idx = this._lastLineIndex;
            if (idx >= 0 && idx < this._lyrics.length) {
                const text = this._lyrics[idx].text;
                if (text) {
                    this._indicator.setText(text);
                    return;
                }
            }
            this._indicator.setText(null);
            return;
        }

        if (!isPlaying || !hasTrack) {
            if (this._settings.get_boolean('show-idle-text')) {
                const customIdle = this._settings.get_string('idle-text').trim();
                const idleText = customIdle || this.gettext('No playback');
                this._indicator.setText(idleText);
                return;
            }
            this._indicator.setText(null);
            return;
        }

        if (!this._fetchingLyrics && !this._hasLyrics) {
            if (this._settings.get_boolean('show-no-lyrics-text')) {
                const customNoLyrics = this._settings.get_string('no-lyrics-text').trim();
                const noLyricsText = customNoLyrics || this.gettext('No lyrics available');
                this._indicator.setText(noLyricsText);
                return;
            }
        }

        this._indicator.setText(null);
    }
}
