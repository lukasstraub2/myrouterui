
/**
 * @param {any} value
 * @returns {asserts value}
 */
export function assert(value) {
    if (!value) {
        throw new Error("assertion failed");
    }
}

/**
 * @param {never} value
 */
export function assertNever(value) {
    throw new Error("never reached");
}

/**
 * @param {Date | number} date
 * @returns {() => Date}
 */
export function immutableDate(date) {
    return function() {
        return new Date(date.valueOf());
    };
}