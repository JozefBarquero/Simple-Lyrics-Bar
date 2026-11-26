// SPDX-License-Identifier: GPL-3.0-or-later

// Pure helpers for parsing LRC content and locating the active line.



export function parseLRC(lrc) {
    if (!lrc)
        return [];

    const result = [];
    const tagRe = /\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    const lines = lrc.split('\n');

    for (const line of lines) {
        const timestamps = [];
        let match;
        let lastIndex = 0;

        tagRe.lastIndex = 0;
        while ((match = tagRe.exec(line)) !== null) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            let ms = 0;
            if (match[3] !== undefined) {
                const raw = match[3];
                ms = parseInt(raw, 10);
                if (raw.length === 1)
                    ms *= 100;
                else if (raw.length === 2)
                    ms *= 10;
            }
            timestamps.push((minutes * 60 + seconds) * 1000 + ms);
            lastIndex = tagRe.lastIndex;
        }

        if (timestamps.length === 0)
            continue;

        const text = line.substring(lastIndex).trim();

        for (const time of timestamps)
            result.push({ time, text });
    }

    result.sort((a, b) => {
        if (a.time !== b.time)
            return a.time - b.time;
        if (Boolean(a.text) !== Boolean(b.text))
            return a.text ? 1 : -1;
        return 0;
    });

    return result;
}






export function findActiveLine(lyrics, positionMs) {
    if (lyrics.length === 0)
        return -1;

    let lo = 0;
    let hi = lyrics.length - 1;
    let best = -1;

    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (lyrics[mid].time <= positionMs) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }

    return best;
}
