const INDIA_OFFSET_MS = 330 * 60 * 1000;

const WEEKDAY_PATTERNS: Array<{ key: number; regex: RegExp }> = [
    { key: 0, regex: /\b(sun|sunday)\b/i },
    { key: 1, regex: /\b(mon|monday)\b/i },
    { key: 2, regex: /\b(tue|tues|tuesday)\b/i },
    { key: 3, regex: /\b(wed|wednesday)\b/i },
    { key: 4, regex: /\b(thu|thur|thurs|thursday)\b/i },
    { key: 5, regex: /\b(fri|friday)\b/i },
    { key: 6, regex: /\b(sat|saturday)\b/i },
];

function shiftToIndia(date: Date): Date {
    return new Date(date.getTime() + INDIA_OFFSET_MS);
}

function shiftFromIndia(date: Date): Date {
    return new Date(date.getTime() - INDIA_OFFSET_MS);
}

export function getIndiaDayStart(date: Date = new Date()): Date {
    const shifted = shiftToIndia(date);
    const start = new Date(Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
        0,
        0,
        0,
        0
    ));
    return shiftFromIndia(start);
}

export function getIndiaDayKey(date: Date = new Date()): string {
    const shifted = shiftToIndia(date);
    const month = `${shifted.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${shifted.getUTCDate()}`.padStart(2, '0');
    return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

export function getIndiaWeekday(date: Date = new Date()): number {
    return shiftToIndia(date).getUTCDay();
}

export function buildIndiaDateAtTime(date: Date, hour: number, minute: number): Date {
    const shifted = shiftToIndia(date);
    const value = new Date(Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
        hour,
        minute,
        0,
        0
    ));
    return shiftFromIndia(value);
}

export function formatIndiaTimestamp(date: Date): string {
    return new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
    }).format(date);
}

function inferAllowedWeekdays(timeSlot: string): Set<number> | null {
    const normalized = timeSlot.toLowerCase();

    if (/\b(daily|every day|everyday)\b/i.test(normalized)) {
        return new Set([0, 1, 2, 3, 4, 5, 6]);
    }

    if (/\bweekdays\b/i.test(normalized)) {
        return new Set([1, 2, 3, 4, 5]);
    }

    if (/\bweekends\b/i.test(normalized)) {
        return new Set([0, 6]);
    }

    const weekdays = WEEKDAY_PATTERNS
        .filter(({ regex }) => regex.test(normalized))
        .map(({ key }) => key);

    return weekdays.length > 0 ? new Set(weekdays) : null;
}

export function parseBatchStartTime(timeSlot?: string | null): { hour: number; minute: number; weekdays: Set<number> | null } | null {
    if (!timeSlot) return null;

    const match = timeSlot.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!match) return null;

    let hour = Number(match[1]);
    const minute = Number(match[2] || '0');
    const meridiem = match[3]?.toLowerCase();

    if (Number.isNaN(hour) || Number.isNaN(minute) || hour > 23 || minute > 59) {
        return null;
    }

    if (meridiem) {
        hour = hour % 12;
        if (meridiem === 'pm') hour += 12;
    }

    return {
        hour,
        minute,
        weekdays: inferAllowedWeekdays(timeSlot),
    };
}

export function getScheduledAttendanceSweepTime(timeSlot: string | null | undefined, now: Date = new Date()): Date | null {
    const parsed = parseBatchStartTime(timeSlot);
    if (!parsed) return null;

    if (parsed.weekdays && !parsed.weekdays.has(getIndiaWeekday(now))) {
        return null;
    }

    const scheduled = buildIndiaDateAtTime(now, parsed.hour, parsed.minute);
    return new Date(scheduled.getTime() + 30 * 60 * 1000);
}
