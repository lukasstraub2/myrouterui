
import * as child_process from "child_process";
import { assert, assertNever, immutableDate } from "./util.js";

/** @typedef {"enable_reading" | "override" | "override5" | "lockdown"} NftRequest */
/** @typedef {{exec: NftRequest}} NftRequestMsg */

/** @typedef {"success" | "error"} NftResponse */
/** @typedef {{return: NftResponse}} NftResponseMsg */

/**
 * @param {unknown} obj
 * @returns {obj is NftRequest}
 */
export function isNftRequest(obj) {
    return (
        obj !== null && typeof obj === "string" && 
        (obj === "enable_reading" || obj === "override" || obj === "override5" || obj === "lockdown")
    );
}

/**
 * @param {unknown} obj
 * @returns {obj is NftRequestMsg}
 */
function isNftRequestMsg(obj) {
    return (
        obj !== null && typeof obj === "object" && 
        "exec" in obj && isNftRequest(obj["exec"])
    );
}

/**
 * @param {unknown} obj
 * @returns {obj is NftResponse}
 */
function isNftResponse(obj) {
    return (
        obj !== null && typeof obj === "string" && 
        (obj === "success" || obj === "error")
    );
}

/**
 * @param {unknown} obj
 * @returns {obj is NftResponseMsg}
 */
function isNftResponseMsg(obj) {
    return (
        obj !== null && typeof obj === "object" && 
        "return" in obj && isNftResponse(obj["return"])
    );
}

export class NftChild {
    /**
     * @param {child_process.ChildProcess} child 
     */
    constructor(child) {
        /**
         * @private
         * @type {child_process.ChildProcess} */
        this.child = child;

        /** 
         * @private
         * @type {{request: NftRequestMsg, callback: (err: Error | null, response: NftResponse | null) => void}[]} */
        this.queue = [];
    }

    /**
     * @private
     * @returns {void}
     */
    next() {
        const entry = this.queue.pop();
        if (!entry) {
            return;
        }

        this.child.send(entry.request, (err) => {
            assert(this.child.listenerCount("message") === 0);

            if (err) {
                entry.callback(err, null);
                this.next();
                return;
            }

            let timeout = setTimeout(() => {
                entry.callback(new Error("timeout"), null);
                this.next();
            }, 10000);

            this.child.once("message", (response) => {
                assert(isNftResponseMsg(response));

                clearTimeout(timeout);
                entry.callback(null, response.return);
                this.next();
            });
        });
    }

    /**
     * @public
     * @param {NftRequestMsg} request 
     * @param {(err: Error | null, response: NftResponse | null) => void} callback 
     */
    execute(request, callback) {
        this.queue.push({request: request, callback: callback});

        if (this.queue.length === 1) {
            this.next();
        }
    }
}

/**
 * @param {string} chain
 * @param {string} expr
 */
function do_nft(chain, expr) {
    const ret = child_process.spawnSync("/usr/sbin/nft", [`
add chain inet filter ${chain};
flush chain inet filter ${chain};
insert rule inet filter ${chain} ${expr};
`]);

    if (ret.error || ret.signal || ret.status !== 0) {
        return -1;
    }

    return 0;
}

/**
 * @param {any} message 
 */
function handle_message(message) {
    assert(isNftRequestMsg(message));
    const now = immutableDate(new Date());

    switch (message.exec) {
        case "enable_reading":
            // now + 45 minutes
            var ts = now().setMinutes(now().getMinutes() + 45) / 1000;
            var ret = do_nft("enable_reading_policy", `meta time < ${ts} accept`);
        break;

        case "override":
            // now + 30 minutes
            var ts = now().setMinutes(now().getMinutes() + 30) / 1000;
            var ret = do_nft("override_policy", `meta time < ${ts} accept`);
        break;

        case "override5":
            // now + 5 minutes
            var ts = now().setMinutes(now().getMinutes() + 5) / 1000;
            var ret = do_nft("override_policy", `meta time < ${ts} accept`);
        break;

        case "lockdown":
            // now + 2 hours
            var ts = now().setHours(now().getHours() + 2) / 1000;
            var ret = do_nft("lockdown_policy", `meta time < ${ts} jump mark_reject`);
        break;

        default:
            assertNever(message.exec);
            var ret = -1;
        break;
    }

    /** @type {NftResponseMsg} */
    const response = {return: (ret < 0 ? "error" : "success")};
    assert(process.send);
    process.send(response, undefined, undefined, (err) => {
        if (err) {
            process.exit(0);
        }
    });
}

export function child_main() {
    assert(process.send);
    process.on("disconnect", () => {process.exit(0)});
    process.on("message", (message) => {handle_message(message)});
}