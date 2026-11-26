// SPDX-License-Identifier: GPL-3.0-or-later

// MPRIS player tracking and position sync for the panel indicator.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const MPRIS_NAMESPACE = 'org.mpris.MediaPlayer2';
const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const PLAYERCTLD_BUS_NAME = 'org.mpris.MediaPlayer2.playerctld';
const MPRIS_OBJECT_PATH = '/org/mpris/MediaPlayer2';
const MPRIS_PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const DBUS_NAME = 'org.freedesktop.DBus';
const DBUS_PATH = '/org/freedesktop/DBus';
const DBUS_IFACE = 'org.freedesktop.DBus';
const PROPERTIES_IFACE = 'org.freedesktop.DBus.Properties';

const TICK_INTERVAL_MS = 100;
const VERIFY_DELAY_MS = 900;
const RESYNC_INTERVAL_MS = 5000;
const DRIFT_THRESHOLD_MS = 250;

export class PlayerManager {
    constructor({ onPlaybackStateChanged, onPositionUpdate }) {
        this._onPlaybackStateChanged = onPlaybackStateChanged;
        this._onPositionUpdate = onPositionUpdate;

        this._players = new Map();
        this._activeBusName = null;

        this._dbusCancellable = null;
        this._dbusSignalId = 0;
        this._positionCancellable = null;

        this._playbackStatus = 'Stopped';
        this._playbackRate = 1.0;
        this._positionSynced = false;

        this._basePositionMs = 0;
        this._syncMonotonic = 0;
        this._lastReportedPosMs = 0;
        this._lastReportedMonotonic = 0;

        this._currentTitle = '';
        this._currentArtist = '';
        this._currentLengthUs = 0;

        this._lastStateSignature = '';

        this._timerId = null;
        this._verifyTimerId = null;
        this._resyncTimerId = null;
    }

    start() {
        this._dbusCancellable = new Gio.Cancellable();
        this._initDBus();
    }

    stop() {
        this._stopPlaybackTimers();
        this._cancelPositionRequest();

        if (this._dbusCancellable) {
            this._dbusCancellable.cancel();
            this._dbusCancellable = null;
        }

        if (this._dbusSignalId) {
            Gio.DBus.session.signal_unsubscribe(this._dbusSignalId);
            this._dbusSignalId = 0;
        }

        this._clearAllPlayers();
        this._resetActiveTrackState();

        this._onPlaybackStateChanged = null;
        this._onPositionUpdate = null;
    }

    getPositionMs() {
        return this._getCurrentPositionMs();
    }

    isPositionSynced() {
        return this._positionSynced;
    }

    _emitPositionUpdate(force) {
        if (this._onPositionUpdate)
            this._onPositionUpdate(force);
    }

    _maybeFireStateChanged() {
        if (!this._onPlaybackStateChanged)
            return;

        const sig = `${this._activeBusName}|${this._playbackStatus}|${this._currentTitle}|${this._currentArtist}|${this._currentLengthUs}`;
        if (sig === this._lastStateSignature)
            return;

        this._lastStateSignature = sig;
        this._onPlaybackStateChanged({
            playbackStatus: this._playbackStatus,
            title: this._currentTitle,
            artist: this._currentArtist,
            lengthUs: this._currentLengthUs,
        });
    }

    _initDBus() {
        this._dbusSignalId = Gio.DBus.session.signal_subscribe(
            DBUS_NAME,
            DBUS_IFACE,
            'NameOwnerChanged',
            DBUS_PATH,
            MPRIS_NAMESPACE,
            Gio.DBusSignalFlags.MATCH_ARG0_NAMESPACE,
            (_conn, _sender, _path, _iface, _signal, params) => {
                const [name, oldOwner, newOwner] = params.deep_unpack();

                if (!name.startsWith(MPRIS_PREFIX))
                    return;

                if (oldOwner && !newOwner) {
                    this._removePlayer(name);
                } else if (newOwner && !oldOwner) {
                    this._addPlayer(name);
                } else if (oldOwner && newOwner) {
                    this._removePlayer(name);
                    this._addPlayer(name);
                }
            },
        );

        const cancellable = this._dbusCancellable;
        Gio.DBus.session.call(
            DBUS_NAME,
            DBUS_PATH,
            DBUS_IFACE,
            'ListNames',
            null,
            GLib.VariantType.new('(as)'),
            Gio.DBusCallFlags.NONE,
            -1,
            cancellable,
            (conn, res) => {
                try {
                    const result = conn.call_finish(res);
                    if (cancellable.is_cancelled() || this._dbusCancellable !== cancellable)
                        return;

                    const names = result.deep_unpack()[0].filter(
                        name => name.startsWith(MPRIS_PREFIX),
                    );
                    const nonProxyNames = names.filter(name => name !== PLAYERCTLD_BUS_NAME);
                    const candidates = nonProxyNames.length > 0 ? nonProxyNames : names;

                    for (const busName of candidates)
                        this._addPlayer(busName);
                } catch (e) {
                    if (!(e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)))
                        console.error('Simple Lyrics Bar: Failed to list D-Bus names:', e);
                }
            },
        );
    }

    _addPlayer(busName) {
        if (this._players.has(busName))
            return;

        if (busName === PLAYERCTLD_BUS_NAME && this._players.size > 0)
            return;

        if (busName !== PLAYERCTLD_BUS_NAME && this._players.has(PLAYERCTLD_BUS_NAME))
            this._removePlayer(PLAYERCTLD_BUS_NAME);

        const cancellable = new Gio.Cancellable();
        const entry = {
            busName,
            cancellable,
            proxy: null,
            propsSignalId: 0,
            seekedSignalId: 0,
        };
        this._players.set(busName, entry);

        const proxy = new Gio.DBusProxy({
            g_connection: Gio.DBus.session,
            g_name: busName,
            g_object_path: MPRIS_OBJECT_PATH,
            g_interface_name: MPRIS_PLAYER_IFACE,
        });

        proxy.init_async(GLib.PRIORITY_DEFAULT, cancellable, (source, res) => {
            try {
                source.init_finish(res);
            } catch (e) {
                if (this._players.get(busName) === entry)
                    this._players.delete(busName);

                if (!(e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)))
                    console.error(`Simple Lyrics Bar: Failed to connect to ${busName}:`, e);
                return;
            }

            if (cancellable.is_cancelled() || this._players.get(busName) !== entry)
                return;

            entry.proxy = source;
            entry.propsSignalId = source.connect(
                'g-properties-changed',
                (_proxy, changed) => this._onPlayerPropertiesChanged(busName, changed),
            );
            entry.seekedSignalId = Gio.DBus.session.signal_subscribe(
                source.g_name,
                MPRIS_PLAYER_IFACE,
                'Seeked',
                MPRIS_OBJECT_PATH,
                null,
                Gio.DBusSignalFlags.NONE,
                (_conn, _sender, _path, _iface, _signal, params) => {
                    this._onPlayerSeeked(busName, params);
                },
            );

            const status = this._getPlayerStatus(entry);
            this._selectActivePlayer(status === 'Playing' ? busName : null);
        });
    }

    _removePlayer(busName) {
        const entry = this._players.get(busName);
        if (!entry)
            return;

        this._players.delete(busName);
        this._disposePlayerEntry(entry);

        if (this._activeBusName === busName) {
            this._activeBusName = null;
            this._resetActiveTrackState();
            this._selectActivePlayer(null);
        }
    }

    _clearAllPlayers() {
        for (const entry of this._players.values())
            this._disposePlayerEntry(entry);

        this._players.clear();
        this._activeBusName = null;
    }

    _disposePlayerEntry(entry) {
        if (entry.cancellable) {
            entry.cancellable.cancel();
            entry.cancellable = null;
        }

        if (entry.seekedSignalId) {
            Gio.DBus.session.signal_unsubscribe(entry.seekedSignalId);
            entry.seekedSignalId = 0;
        }

        if (entry.proxy && entry.propsSignalId) {
            entry.proxy.disconnect(entry.propsSignalId);
            entry.propsSignalId = 0;
        }

        entry.proxy = null;
    }

    _getPlayerStatus(entry) {
        const statusVariant = entry.proxy.get_cached_property('PlaybackStatus');
        const rawStatus = statusVariant ? statusVariant.unpack() : 'Stopped';
        return typeof rawStatus === 'string' ? rawStatus : 'Stopped';
    }

    _getActiveProxy() {
        if (!this._activeBusName)
            return null;

        const entry = this._players.get(this._activeBusName);
        return entry ? entry.proxy : null;
    }

    _selectActivePlayer(preferredBusName = null) {
        let chosenBusName = null;

        if (preferredBusName) {
            const preferredEntry = this._players.get(preferredBusName);
            if (preferredEntry && preferredEntry.proxy &&
                this._getPlayerStatus(preferredEntry) === 'Playing')
                chosenBusName = preferredBusName;
        }

        if (!chosenBusName && this._activeBusName) {
            const currentEntry = this._players.get(this._activeBusName);
            if (currentEntry && currentEntry.proxy &&
                this._getPlayerStatus(currentEntry) === 'Playing')
                chosenBusName = this._activeBusName;
        }

        if (!chosenBusName) {
            for (const [busName, entry] of this._players) {
                if (entry.proxy && this._getPlayerStatus(entry) === 'Playing') {
                    chosenBusName = busName;
                    break;
                }
            }
        }

        if (!chosenBusName) {
            if (this._activeBusName) {
                const activeEntry = this._players.get(this._activeBusName);
                if (activeEntry && activeEntry.proxy)
                    chosenBusName = this._activeBusName;
            }
            if (!chosenBusName) {
                for (const [busName, entry] of this._players) {
                    if (entry.proxy) {
                        chosenBusName = busName;
                        break;
                    }
                }
            }
        }

        if (chosenBusName !== this._activeBusName) {
            this._resetActiveTrackState();
            this._activeBusName = chosenBusName;
        }

        if (this._activeBusName)
            this._readActivePlayerState();
        else
            this._onNoTrack();
    }

    _resetActiveTrackState() {
        this._stopPlaybackTimers();
        this._cancelPositionRequest();

        this._playbackStatus = 'Stopped';
        this._playbackRate = 1.0;
        this._positionSynced = false;

        this._basePositionMs = 0;
        this._syncMonotonic = 0;
        this._lastReportedPosMs = 0;
        this._lastReportedMonotonic = 0;

        this._currentTitle = '';
        this._currentArtist = '';
        this._currentLengthUs = 0;
    }

    _onPlayerSeeked(busName, params) {
        if (busName !== this._activeBusName || !this._getActiveProxy() || !params)
            return;

        const unpacked = params.deep_unpack();
        if (!Array.isArray(unpacked) || unpacked.length === 0)
            return;

        const posMs = Number(unpacked[0]) / 1000;
        if (!Number.isFinite(posMs) || posMs < 0)
            return;

        const nowMono = GLib.get_monotonic_time();

        this._basePositionMs = posMs;
        this._syncMonotonic = nowMono;
        this._lastReportedPosMs = posMs;
        this._lastReportedMonotonic = nowMono;
        this._positionSynced = true;

        this._emitPositionUpdate(true);
    }

    _onPlayerPropertiesChanged(busName, changed) {
        const entry = this._players.get(busName);
        if (!entry || !entry.proxy)
            return;

        const dict = changed.deep_unpack();

        if ('PlaybackStatus' in dict) {
            const newStatus = this._getPlayerStatus(entry);
            if (newStatus === 'Playing' && this._activeBusName !== busName) {
                this._selectActivePlayer(busName);
                return;
            }
            if (newStatus !== 'Playing' && this._activeBusName === busName) {
                this._selectActivePlayer(null);
                return;
            }
        }

        if (busName !== this._activeBusName)
            return;

        if ('Rate' in dict && this._positionSynced && this._playbackStatus === 'Playing') {
            const nowMono = GLib.get_monotonic_time();
            this._basePositionMs = this._getCurrentPositionMs(nowMono);
            this._syncMonotonic = nowMono;
        }

        if ('PlaybackStatus' in dict || 'Metadata' in dict || 'Rate' in dict)
            this._readActivePlayerState();
    }

    _readActivePlayerState() {
        const proxy = this._getActiveProxy();
        if (!proxy) {
            this._onNoTrack();
            return;
        }

        const statusVariant = proxy.get_cached_property('PlaybackStatus');
        const rawStatus = statusVariant ? statusVariant.unpack() : 'Stopped';
        this._playbackStatus = typeof rawStatus === 'string' ? rawStatus : 'Stopped';

        const rateVariant = proxy.get_cached_property('Rate');
        const parsedRate = rateVariant ? Number(rateVariant.unpack()) : 1.0;
        this._playbackRate = Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 1.0;

        const metaVariant = proxy.get_cached_property('Metadata');
        if (!metaVariant) {
            this._onNoTrack();
            return;
        }

        const meta = metaVariant.deep_unpack();

        const titleV = meta['xesam:title'];
        const artistV = meta['xesam:artist'];
        const lengthV = meta['mpris:length'];

        const title = titleV ? titleV.deep_unpack() : '';
        if (typeof title !== 'string' || !title.trim()) {
            this._onNoTrack();
            return;
        }

        let artist = '';
        if (artistV) {
            const a = artistV.deep_unpack();
            if (Array.isArray(a))
                artist = typeof a[0] === 'string' ? a[0].trim() : '';
            else if (typeof a === 'string')
                artist = a.trim();
        }

        const rawLength = lengthV ? Number(lengthV.deep_unpack()) : 0;
        const lengthUs = Number.isFinite(rawLength) && rawLength > 0 ? rawLength : 0;

        this._currentTitle = title.trim();
        this._currentArtist = artist;
        this._currentLengthUs = lengthUs;

        this._maybeFireStateChanged();

        this._syncPosition(false);

        if (this._playbackStatus === 'Playing')
            this._startPlaybackTimers();
        else
            this._stopPlaybackTimers();
    }

    _onNoTrack() {
        this._stopPlaybackTimers();
        this._cancelPositionRequest();
        this._resetActiveTrackState();
        this._maybeFireStateChanged();
    }

    _syncPosition(isVerification = false) {
        const proxy = this._getActiveProxy();
        const activeBusName = this._activeBusName;
        if (!proxy || !activeBusName)
            return;

        this._cancelPositionRequest();

        const posCancellable = new Gio.Cancellable();
        this._positionCancellable = posCancellable;

        Gio.DBus.session.call(
            proxy.g_name,
            MPRIS_OBJECT_PATH,
            PROPERTIES_IFACE,
            'Get',
            new GLib.Variant('(ss)', [MPRIS_PLAYER_IFACE, 'Position']),
            GLib.VariantType.new('(v)'),
            Gio.DBusCallFlags.NONE,
            -1,
            posCancellable,
            (conn, res) => {
                try {
                    const reply = conn.call_finish(res);
                    if (posCancellable.is_cancelled() ||
                        this._positionCancellable !== posCancellable ||
                        this._activeBusName !== activeBusName ||
                        !this._getActiveProxy())
                        return;

                    this._positionCancellable = null;

                    const posUs = reply.deep_unpack()[0].deep_unpack();
                    const posMs = Number(posUs) / 1000;
                    if (!Number.isFinite(posMs) || posMs < 0) {
                        if (!isVerification || !this._positionSynced) {
                            const nowMono = GLib.get_monotonic_time();
                            this._basePositionMs = 0;
                            this._syncMonotonic = nowMono;
                            this._lastReportedPosMs = 0;
                            this._lastReportedMonotonic = nowMono;
                            this._positionSynced = true;
                            this._emitPositionUpdate(true);
                        }
                        return;
                    }

                    const nowMono = GLib.get_monotonic_time();

                    if (!isVerification || !this._positionSynced) {
                        this._basePositionMs = posMs;
                        this._syncMonotonic = nowMono;
                        this._lastReportedPosMs = posMs;
                        this._lastReportedMonotonic = nowMono;
                        this._positionSynced = true;
                    } else {
                        const wallElapsedMs = (nowMono - this._lastReportedMonotonic) / 1000;
                        const reportedAdvanceMs = posMs - this._lastReportedPosMs;

                        this._lastReportedPosMs = posMs;
                        this._lastReportedMonotonic = nowMono;

                        if (this._playbackStatus === 'Playing' &&
                            wallElapsedMs >= 400 &&
                            Math.abs(reportedAdvanceMs) < 50)
                            return;

                        const estimatedMs = this._getCurrentPositionMs(nowMono);
                        if (Math.abs(posMs - estimatedMs) > DRIFT_THRESHOLD_MS) {
                            this._basePositionMs = posMs;
                            this._syncMonotonic = nowMono;
                        }
                    }

                    this._emitPositionUpdate(true);
                } catch (e) {
                    if (posCancellable.is_cancelled() ||
                        (e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)))
                        return;

                    if (this._positionCancellable === posCancellable)
                        this._positionCancellable = null;

                    if (this._activeBusName === activeBusName &&
                        (!isVerification || !this._positionSynced)) {
                        const nowMono = GLib.get_monotonic_time();
                        this._basePositionMs = 0;
                        this._syncMonotonic = nowMono;
                        this._lastReportedPosMs = 0;
                        this._lastReportedMonotonic = nowMono;
                        this._positionSynced = true;
                        this._emitPositionUpdate(true);
                    }
                }
            },
        );
    }

    _cancelPositionRequest() {
        if (this._positionCancellable) {
            this._positionCancellable.cancel();
            this._positionCancellable = null;
        }
    }

    _getCurrentPositionMs(nowMono = GLib.get_monotonic_time()) {
        if (!this._positionSynced)
            return 0;

        if (this._playbackStatus !== 'Playing')
            return this._basePositionMs;

        const elapsedMs = (nowMono - this._syncMonotonic) / 1000;
        return Math.max(0, this._basePositionMs + elapsedMs * this._playbackRate);
    }

    _startPlaybackTimers() {
        this._stopPlaybackTimers();

        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_INTERVAL_MS, () => {
            this._emitPositionUpdate(false);
            return GLib.SOURCE_CONTINUE;
        });

        this._verifyTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, VERIFY_DELAY_MS, () => {
            this._verifyTimerId = null;
            if (this._playbackStatus === 'Playing')
                this._syncPosition(true);
            return GLib.SOURCE_REMOVE;
        });

        this._resyncTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RESYNC_INTERVAL_MS, () => {
            if (this._playbackStatus === 'Playing')
                this._syncPosition(true);
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopPlaybackTimers() {
        if (this._timerId !== null) {
            GLib.Source.remove(this._timerId);
            this._timerId = null;
        }
        if (this._verifyTimerId !== null) {
            GLib.Source.remove(this._verifyTimerId);
            this._verifyTimerId = null;
        }
        if (this._resyncTimerId !== null) {
            GLib.Source.remove(this._resyncTimerId);
            this._resyncTimerId = null;
        }
    }
}
