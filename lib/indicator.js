// SPDX-License-Identifier: GPL-3.0-or-later

// Panel indicator widget.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';




export const SimpleLyricsIndicator = GObject.registerClass({
    GTypeName: 'SimpleLyricsBarIndicator',
}, class SimpleLyricsIndicator extends PanelMenu.Button {
    constructor(accessibleName, preferencesLabel, idleLabel, onOpenPreferences) {
        super(0.5, accessibleName, false);

        this.name = 'simple-lyrics-bar-indicator';
        this.accessible_name = accessibleName;
        this._idleLabel = idleLabel;

        this._box = new St.BoxLayout({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._box);

        this._label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            text: '',
            style_class: 'simple-lyrics-label',
        });
        this._label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._box.add_child(this._label);

        this._trackItem = new PopupMenu.PopupMenuItem(idleLabel, {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._trackItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._prefsItem = new PopupMenu.PopupMenuItem(preferencesLabel);
        this._prefsActivateId = this._prefsItem.connect('activate', () => {
            onOpenPreferences();
        });
        this._prefsDestroyId = this._prefsItem.connect('destroy', () => {
            this._prefsActivateId = 0;
            this._prefsDestroyId = 0;
            this._prefsItem = null;
        });
        this.menu.addMenuItem(this._prefsItem);
    }

    destroy() {
        if (this._prefsItem) {
            if (this._prefsActivateId) {
                this._prefsItem.disconnect(this._prefsActivateId);
                this._prefsActivateId = 0;
            }
            if (this._prefsDestroyId) {
                this._prefsItem.disconnect(this._prefsDestroyId);
                this._prefsDestroyId = 0;
            }
            this._prefsItem = null;
        }
        this._trackItem = null;
        this._box = null;
        this._label = null;

        super.destroy();
    }



  
    setText(text) {
        if (!this._label)
            return;

        if (text) {
            this._label.text = text;
            this.show();
        } else {
            this._label.text = '';
            this.hide();
        }
    }



  
    setTrackInfo(trackInfo) {
        if (!this._trackItem)
            return;

        this._trackItem.label.text = trackInfo || this._idleLabel;
    }
});
