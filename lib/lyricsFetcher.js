// SPDX-License-Identifier: GPL-3.0-or-later

// Fetches synced lyrics from LRCLIB and reports the parsed result.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import { parseLRC } from './utils.js';

const LRCLIB_BASE = 'https://lrclib.net/api/get';

export class LyricsFetcher {
    constructor(httpSession, textDecoder, onFetchComplete) {
        this._httpSession = httpSession;
        this._textDecoder = textDecoder;
        this._onFetchComplete = onFetchComplete;
        this._cancellable = null;
    }

    fetch(title, artist, lengthUs) {
        if (!this._httpSession || !this._onFetchComplete)
            return;

        if (!title || !artist) {
            this._onFetchComplete([]);
            return;
        }

        this.cancel();

        const cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;

        const durationSec = Math.round(Number(lengthUs) / 1_000_000);

        const params = [
            `track_name=${encodeURIComponent(title)}`,
            `artist_name=${encodeURIComponent(artist)}`,
        ];
        if (durationSec > 0)
            params.push(`duration=${durationSec}`);

        const uri = `${LRCLIB_BASE}?${params.join('&')}`;

        const message = Soup.Message.new('GET', uri);
        if (!message) {
            this._cancellable = null;
            this._onFetchComplete([]);
            return;
        }

        this._httpSession.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (session, res) => {
                if (cancellable.is_cancelled() || this._cancellable !== cancellable)
                    return;

                let bytes = null;
                try {
                    bytes = session.send_and_read_finish(res);
                } catch (e) {
                    this._cancellable = null;

                    if (e instanceof GLib.Error &&
                        e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        return;

                    if (this._onFetchComplete)
                        this._onFetchComplete([]);
                    return;
                }

                this._cancellable = null;

                let lyrics = [];

                if (bytes) {
                    const data = bytes.get_data();
                    if (message.status_code === 200 && data && this._textDecoder) {
                        try {
                            const json = JSON.parse(this._textDecoder.decode(data));
                            if (typeof json?.syncedLyrics === 'string' && json.syncedLyrics)
                                lyrics = parseLRC(json.syncedLyrics);
                        } catch (e) {
                        }
                    }
                }

                if (this._onFetchComplete)
                    this._onFetchComplete(lyrics);
            },
        );
    }

    cancel() {
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }
    }

    destroy() {
        this.cancel();
        this._httpSession = null;
        this._textDecoder = null;
        this._onFetchComplete = null;
    }
}
